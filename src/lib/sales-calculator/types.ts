// Core domain types for the TCT Sales Calculator.

export type UnitKey =
  | "perUser"
  | "perFrontlineUser"
  | "perDevice"
  | "perServer"
  | "perSite"
  | "perDomain"
  | "perTenant"
  | "perComanagedAdmin"
  | "service";

export type FrontlineToggles = Record<string, boolean>;

export interface ServerEntry {
  id: string;
  type: string;
  backupRequired: boolean;
  retention: string;
  os: string;
  provisionedTB: number;
}

export interface InternalIT {
  hasInternalIT: boolean;
  itStaffCount: number;
  comanagedAccess: boolean;
  autotaskAccess: boolean;
  documentationAccess: boolean;
  escalationSupport: boolean;
  afterHoursSupport: boolean;
}

export interface DiscoveryInput {
  company: {
    name: string;
    industry: string;
    locations: number;
    domains: number;
    tenants: number;
    compliance: string[];
    securityPriority: boolean;
  };
  users: {
    standard: number;
    frontline: number;
    sharedMailboxes: number;
    frontlineToggles: FrontlineToggles;
  };
  devices: {
    windowsPCs: number;   // Windows workstations + laptops (only Windows PCs are priced)
    pcsToBackup: number;  // optional: # of PCs to back up (Endpoint Backup)
  };
  servers: ServerEntry[];
  internalIT: InternalIT;
  licensing: {
    provider: string;        // "Customer purchases directly" | "Triple Cities Tech resells licensing"
    currentLicense: string;  // e.g. "Business Standard"
  };
  backup: {
    onPremEnabled: boolean;
    deployment: string;   // "SIRIS Virtual" | "SIRIS Appliance" | "Endpoint Backup w/ DR (cloud, per 500GB)"
    protectedTB: number;
    retention: string;    // "1-year" | "7-year" | "Infinite"
    azureRetention: string;
    entraEnabled: boolean;
  };
  oneTime: { cost: number; price: number };
  currentSpend: {
    enabled: boolean;
    rmm: number;             // existing RMM / monitoring $/mo
    endpointSecurity: number; // existing AV / EDR $/mo
    backup: number;          // existing backup / BCDR $/mo
    networkMonitoring: number;
    emailM365: number;       // existing email / Microsoft 365 $/mo
    otherTools: number;      // other security / tools $/mo
    internalITLabor: number; // internal IT burden $/mo (rate x hours, or salary portion)
  };
}

export interface Money {
  cost: number;
  price: number;
}

export interface LineItem {
  key: string;
  label: string;
  unit: UnitKey;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  cost: number;      // quantity * unitCost (monthly)
  price: number;     // quantity * unitPrice (monthly)
  margin: number;    // price - cost
  marginPct: number; // margin / price
  category?: string;
  isM365?: boolean;
  internalOnly?: boolean;
  informational?: boolean; // shown as a note (e.g. hourly labor rate); excluded from monthly totals
}

export interface PackageQuote {
  packageId: string;
  packageName: string;
  lineItems: LineItem[];
  // Managed services totals (M365 excluded)
  monthlyCost: number;
  monthlyPrice: number;
  monthlyMargin: number;
  marginPct: number;
  annualCost: number;
  annualPrice: number;
  annualMargin: number;
  // Microsoft 365 (separate, excluded from margin)
  m365MonthlyCost: number;
  m365MonthlyPrice: number;
  m365Resold: boolean;
  m365LineItems: LineItem[];   // per-license M365 lines (license, seats, MSRP/seat, total)
  // One-time
  oneTimeCost: number;
  oneTimePrice: number;
  // Breakdowns
  revenueByBucket: Record<string, number>;
  revenueByCategory: Record<string, number>;
  // Licensing
  licenseRequirement: string;
  meetsLicenseRequirement: boolean;
  licenseGapMessage: string | null;
  // Service inclusion (for comparison)
  includedServices: string[];   // externalNames
  billableServices: string[];   // externalNames available but billed hourly (T&M)
  missingServices: string[];    // externalNames not in this package
  // Capacity / pricing warnings (e.g. Azure backup over a cloud-device limit)
  warnings: string[];
}

export interface RecommendationResult {
  recommendedPackageId: string;
  recommendedPackageName: string;
  scores: Record<string, number>;
  rationale: string[];
  runnerUpId: string | null;
}
