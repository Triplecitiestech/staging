import { DiscoveryInput } from "./types";
import { appConfig } from "./config";

export function defaultInput(): DiscoveryInput {
  const t = appConfig.frontlineServiceToggles as { id: string; default: boolean }[];
  const toggles: any = {};
  for (const x of t) toggles[x.id] = x.default;
  return {
    company: {
      name: "", industry: "Professional Services",
      locations: 1, domains: 1, tenants: 1,
      compliance: ["None"], securityPriority: false,
    },
    users: { standard: 10, frontline: 0, sharedMailboxes: 0, frontlineToggles: toggles },
    devices: { windowsPCs: 12, pcsToBackup: 0 },
    servers: [],
    internalIT: {
      hasInternalIT: false, itStaffCount: 0,
      comanagedAccess: false, autotaskAccess: false, documentationAccess: false,
      escalationSupport: false, afterHoursSupport: false,
    },
    licensing: { provider: "Triple Cities Tech resells licensing", currentLicense: "Business Premium" },
    backup: { onPremEnabled: false, deployment: "SIRIS Virtual", protectedTB: 0, retention: "1-year", azureRetention: "1-year", entraEnabled: false },
    oneTime: { cost: 0, price: 0 },
    currentSpend: { enabled: false, rmm: 0, endpointSecurity: 0, backup: 0, networkMonitoring: 0, emailM365: 0, otherTools: 0, internalITLabor: 0 },
  };
}

export function newServer(idx: number) {
  return {
    id: `srv-${idx}-${Date.now()}`,
    type: "Physical",
    backupRequired: true,
    retention: "1 year",
    os: "Windows Server",
    provisionedTB: 0,
  };
}
