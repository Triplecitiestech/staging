/**
 * Extract IP addresses from ticket text (title + description).
 *
 * Handles IPv4 addresses commonly found in security alert tickets.
 * Filters out private/reserved ranges that are unlikely to be useful for
 * technician verification (e.g., 127.0.0.1, 10.x.x.x).
 */

// IPv4 pattern — matches standard dotted-quad notation
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

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
 * Extract the most relevant public IP from a ticket's title + description.
 * Returns the first public IP found, or null.
 */
export function extractPrimaryIp(title: string, description: string | null): string | null {
  const combined = `${title}\n${description || ''}`;
  const { publicIps } = extractIps(combined);
  return publicIps[0] || null;
}
