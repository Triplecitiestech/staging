/**
 * Shared API/system user filtering utility.
 * Centralized so every reporting service uses the same patterns.
 */

/** Patterns that identify API, system, integration, or bot accounts */
const API_USER_PATTERNS = [
  /\bapi\b/i, /\badministrator\b/i, /\bdashboard user\b/i, /\bsystem\b/i,
  /\bintegration\b/i, /\bservice account\b/i, /\bautomation\b/i,
  /\bdatto\b/i, /\bedr\b/i, /\brmm\b/i, /\bmonitor/i, /\bagent\b/i,
  /\bbackup\b/i, /\bsync\b/i, /\bwebhook\b/i, /\bcron\b/i,
];

/**
 * Check if a resource looks like an API/system user (not a real technician).
 * Inactive users are also filtered out.
 */
export function isApiOrSystemUser(resource: {
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
}): boolean {
  if (!resource.isActive) return true;
  const fullName = `${resource.firstName} ${resource.lastName}`.trim();
  return API_USER_PATTERNS.some(p => p.test(fullName) || p.test(resource.email));
}

/**
 * Filter a list of resources to only real, active technicians.
 */
export function filterRealTechnicians<T extends {
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
}>(resources: T[]): T[] {
  return resources.filter(r => !isApiOrSystemUser(r));
}
