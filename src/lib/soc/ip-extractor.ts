/**
 * Extract IP addresses from ticket text (title + description).
 *
 * Handles IPv4 addresses commonly found in security alert tickets.
 * Filters out private/reserved ranges that are unlikely to be useful for
 * technician verification (e.g., 127.0.0.1, 10.x.x.x).
 */

// IPv4 pattern — matches standard dotted-quad notation
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

// IPv6 pattern — matches full and ::-compressed forms. SaaS Alerts identity
// events (e.g. M365 logins over Verizon Business IPv6) carry IPv6 source IPs
// that the IPv4 regex silently dropped, so the geolocation/source never reached
// the analyst. Authoritative IP still comes from the SaaS event `ip` field; this
// is a fallback for IPs embedded in the ticket body.
const IPV6_REGEX = /(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?::[0-9A-Fa-f]{1,4}){1,6}/g;

// Non-routable IPv6 prefixes we exclude (loopback, unspecified, link-local, unique-local).
function isNonRoutableIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:')) return true;        // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique-local fc00::/7
  return false;
}

// Reserved/private ranges to exclude from public IP extraction
const PRIVATE_RANGES = [
  /^10\./,         // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,   // 192.168.0.0/16
  /^127\./,        // loopback
  /^0\./,          // current network
  /^169\.254\./,   // link-local
  /^224\./,        // multicast
  /^255\./,        // broadcast
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some(re => re.test(ip));
}

/**
 * Extract all IPv4 addresses from text.
 * Returns unique addresses, public IPs first.
 */
export function extractIps(text: string): { allIps: string[]; publicIps: string[]; privateIps: string[] } {
  const matches = text.match(IPV4_REGEX) || [];
  const unique = Array.from(new Set(matches));
  const publicIps = unique.filter(ip => !isPrivateIp(ip));
  const privateIps = unique.filter(ip => isPrivateIp(ip));
  return { allIps: unique, publicIps, privateIps };
}

/**
 * Extract routable IPv6 addresses from text (loopback/link-local/unique-local excluded).
 * Kept separate from extractIps so the IPv4-only device-verification path is unaffected.
 */
export function extractIpv6(text: string): string[] {
  const matches = text.match(IPV6_REGEX) || [];
  const routable = matches
    .map(ip => ip.toLowerCase())
    // Require at least two colons so we don't catch stray "12:34"-style fragments.
    .filter(ip => (ip.match(/:/g) || []).length >= 2 && !isNonRoutableIpv6(ip));
  return Array.from(new Set(routable));
}

/**
 * Extract every routable address (IPv4 public + IPv6) from text.
 * Used for geolocation/source context where IPv6 matters; device verification
 * still uses extractPrimaryIp (IPv4) since Datto RMM keys on IPv4 ext IPs.
 */
export function extractAllAddresses(text: string): { ipv4: string[]; ipv6: string[] } {
  return { ipv4: extractIps(text).publicIps, ipv6: extractIpv6(text) };
}

/**
 * Extract the most relevant public IP from a ticket's title + description.
 * Returns the first public IPv4 found, or null.
 */
export function extractPrimaryIp(title: string, description: string | null): string | null {
  const combined = `${title}\n${description || ''}`;
  const { publicIps } = extractIps(combined);
  return publicIps[0] || null;
}
