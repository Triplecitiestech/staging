import {
  DiscoveryInput, PackageQuote, LineItem, UnitKey,
} from "./types";
import {
  pricingConfig, servicesConfig, packagesConfig, appConfig,
  getServices, getPackages, licenseRank,
} from "./config";

const MONTHS = appConfig.annualMonths ?? 12;

export function totalDevices(input: DiscoveryInput): number {
  return input.devices.windowsPCs || 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Category of a service id (for revenue-by-category allocation).
const serviceCategoryById: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const s of getServices()) map[s.id] = s.category;
  return map;
})();

// Services included for a package, grouped by billing unit.
function includedServicesByUnit(packageId: string): Record<string, { id: string; category: string }[]> {
  const out: Record<string, { id: string; category: string }[]> = {};
  for (const s of getServices()) {
    if (s.include?.[packageId]) {
      (out[s.unit] = out[s.unit] || []).push({ id: s.id, category: s.category });
    }
  }
  return out;
}

function makeLine(
  key: string, label: string, unit: UnitKey, quantity: number,
  unitCost: number, unitPrice: number,
  opts: { category?: string; isM365?: boolean; internalOnly?: boolean } = {}
): LineItem {
  const cost = round2(quantity * unitCost);
  const price = round2(quantity * unitPrice);
  const margin = round2(price - cost);
  return {
    key, label, unit, quantity, unitCost, unitPrice,
    cost, price, margin,
    marginPct: price > 0 ? margin / price : 0,
    category: opts.category,
    isM365: opts.isM365,
    internalOnly: opts.internalOnly,
  };
}

export function buildQuote(input: DiscoveryInput, packageId: string): PackageQuote {
  const pkgDef = getPackages().find((p) => p.id === packageId)!;
  const pp = pricingConfig.packages[packageId] || {};
  const lineItems: LineItem[] = [];

  const devices = totalDevices(input);
  const stdUsers = input.users.standard || 0;
  const flUsers = input.users.frontline || 0;
  const sites = input.company.locations || 0;
  const domains = input.company.domains || 0;
  const servers = input.servers || [];
  const inclByUnit = includedServicesByUnit(packageId);
  const warnings: string[] = [];
  let backupHardwareCost = 0, backupHardwarePrice = 0;

  // ---- Per Standard User (managed, M365 excluded) ----
  if (pp.perUser && stdUsers > 0) {
    lineItems.push(makeLine("user", "Standard Users", "perUser", stdUsers, pp.perUser.cost, pp.perUser.price, { category: "user" }));
  }

  // ---- Entra ID backup (optional, per standard user) ----
  const entra = pricingConfig.entraBackup;
  if (entra && input.backup && input.backup.entraEnabled && stdUsers > 0) {
    lineItems.push(makeLine("entra", entra.label, "perUser", stdUsers, entra.cost, round2(entra.cost * (entra.sellMultiplier || 2)), { category: "backup" }));
  }

  // ---- Shared mailboxes ----
  const sm = pricingConfig.sharedMailbox;
  if (sm && (input.users.sharedMailboxes || 0) > 0) {
    lineItems.push(makeLine("sharedMailbox", sm.label, "perUser", input.users.sharedMailboxes, sm.cost, sm.price, { category: "user" }));
  }

  // ---- Frontline Users (reduced stack, component toggles) ----
  if (flUsers > 0) {
    const comps = pricingConfig.frontline.components;
    const t = input.users.frontlineToggles;
    let flCost = 0, flPrice = 0;
    const enabled: string[] = [];
    for (const [cid, comp] of Object.entries<any>(comps)) {
      const always = comp.always === true;
      const toggled = (t as any)[cid] === true;
      if (always || toggled) {
        // m365License/email handled in M365 section, not managed margin
        if (cid === "m365License" || cid === "email") continue;
        flCost += comp.cost || 0;
        flPrice += comp.price || 0;
        enabled.push(comp.label);
      }
    }
    if (flPrice > 0 || flCost > 0) {
      lineItems.push(makeLine("frontline", `Frontline Users (${enabled.length} services)`, "perFrontlineUser", flUsers, round2(flCost), round2(flPrice), { category: "user" }));
    }
  }

  // ---- Per Device ----
  if (pp.perDevice && devices > 0) {
    lineItems.push(makeLine("device", "Windows PCs", "perDevice", devices, pp.perDevice.cost, pp.perDevice.price, { category: "device" }));
  }

  // ---- Workstation endpoint backup ----
  const eb = pricingConfig.endpointBackup;
  if (eb && (input.devices.pcsToBackup || 0) > 0) {
    lineItems.push(makeLine("endpointBackup", eb.label, "perDevice", input.devices.pcsToBackup, eb.cost, eb.price, { category: "backup" }));
  }

  // ---- Per Server (base monitoring) ----
  if (pp.perServer && servers.length > 0) {
    lineItems.push(makeLine("server", "Servers (base monitoring)", "perServer", servers.length, pp.perServer.cost, pp.perServer.price, { category: "device" }));
  }

  // ---- Server backup scoping ----
  // Datto SIRIS BCDR (configured below) is IMAGE-BASED backup WITH cloud DR, so the per-server
  // "Disaster Recovery" and "Image-Level" toggles are SCOPING flags (default on) that are
  // included in the SIRIS / Azure backup line — they are NOT billed as separate add-ons, to
  // avoid double-counting. (Legacy serverAddOns.dr / imageBackup / retentionUpcharge remain in
  // pricing.json for reference only and are no longer auto-billed.)
  const isAzure = (s: typeof servers[number]) => s.type === "Azure VM";

  // ---- Azure VM cloud backup: banded by COMBINED provisioned TB (per bucket, NOT per VM) ----
  const az = pricingConfig.azureBackup;
  const azureVMs = servers.filter((s) => isAzure(s) && s.backupRequired);
  if (az && azureVMs.length > 0) {
    const totalTB = round2(azureVMs.reduce((a, s) => a + (s.provisionedTB || 0), 0));
    const cap = az.perDeviceCapacityTB || 6;
    const maxVMs = az.perDeviceMaxVMs || 7;
    const bands = az.bands as Record<string, any>[];
    const topBand = bands[bands.length - 1];
    const band = bands.find((b) => totalTB <= b.uptoTB) || topBand;
    const azRet = (input.backup && input.backup.azureRetention) || az.retentionDefault || "1-year";
    const azCost = band[azRet] ?? band["1-year"];
    const azPrice = round2(azCost * (az.sellMultiplier || 2));
    lineItems.push({
      key: "azure_backup",
      label: `Azure VM Cloud Backup (${band.label}, ${azRet}; ${totalTB} TB / ${azureVMs.length} VM${azureVMs.length === 1 ? "" : "s"})`,
      unit: "perServer", quantity: 1,
      unitCost: azCost, unitPrice: azPrice,
      cost: round2(azCost), price: azPrice,
      margin: round2(azPrice - azCost), marginPct: azPrice > 0 ? (azPrice - azCost) / azPrice : 0,
      category: "backup",
    });
    if (totalTB > topBand.uptoTB) {
      warnings.push(`Azure backup: ${totalTB} TB provisioned exceeds the largest defined band (${topBand.label}). Pricing above ${topBand.uptoTB} TB is not defined — confirm. Showing the ${topBand.label} band as a placeholder.`);
    }
    const devices = Math.ceil(Math.max(totalTB / cap, azureVMs.length / maxVMs));
    if (devices > 1) {
      warnings.push(`Azure backup: ${totalTB} TB across ${azureVMs.length} VMs exceeds one cloud device (limit ${cap} TB / ${maxVMs} VMs). Roughly ${devices} cloud devices would be needed for performance/load-balancing — confirm whether this changes the price.`);
    }
  }

  // ---- Per Site ----
  if (pp.perSite && sites > 0) {
    lineItems.push(makeLine("site", "Sites / Locations", "perSite", sites, pp.perSite.cost, pp.perSite.price, { category: "platform" }));
  }

  // ---- Co-Managed seats / tool access (internal IT) ----
  // TCT Ally (comanaged package): the per-internal-IT admin seat is core to the model.
  // Fully-managed packages: an optional "Co-Managed Tool Access" line appears when the
  // client has internal IT that wants access to TCT's tools / PSA / documentation.
  // This is how "included-support co-managed" is expressed: a managed package + this line.
  const cmAccess = pkgDef.comanaged ? pp.perComanagedAdmin : pricingConfig.comanagedToolAccess;
  const accessWanted = pkgDef.comanaged
    ? !!pp.perComanagedAdmin
    : !!(pricingConfig.comanagedToolAccess && input.internalIT.hasInternalIT && input.internalIT.comanagedAccess);
  if (cmAccess && accessWanted) {
    const admins = Math.max(input.internalIT.itStaffCount || 0, input.internalIT.comanagedAccess ? 1 : 0);
    if (admins > 0) {
      const label = pkgDef.comanaged ? "Co-Managed Admin Access" : (cmAccess.label || "Co-Managed Tool Access (internal IT staff)");
      lineItems.push(makeLine("comanagedAccess", label, "perComanagedAdmin", admins, cmAccess.cost, cmAccess.price, { category: "platform" }));
    }
  }

  // ---- Datto SIRIS on-prem BCDR backup (by protected TB, retention, term) ----
  const db = pricingConfig.dattoBackup;
  const bk = input.backup;
  if (db && bk && bk.onPremEnabled && (bk.protectedTB || 0) > 0) {
    const depKey = /appliance/i.test(bk.deployment || "") ? "appliance" : /endpoint backup|cloud/i.test(bk.deployment || "") ? "cloudDR" : "virtual";
    const dep = db.deployments[depKey];
    const ret = bk.retention || db.retentionDefault || "1-year";
    const mult = db.sellMultiplier || 2;
    if (depKey === "cloudDR") {
      const gbu = dep.gbPerUnit || 500;
      const units = Math.max(1, Math.ceil((bk.protectedTB * 1000) / gbu));
      const rate = (dep.rates as Record<string, number>)[ret] ?? (dep.rates as Record<string, number>)["1-year"];
      const svcCost = round2(units * rate);
      lineItems.push(makeLine("siris", `On-Prem BCDR — Endpoint Backup w/ DR (cloud, ${bk.protectedTB} TB used, ${ret})`, "perServer", 1, svcCost, round2(svcCost * mult), { category: "backup" }));
    } else {
      const models = dep.models as { model: string; tb: number; hardwareMSRP: number; svc: Record<string, number> }[];
      const model = models.find((m) => m.tb >= bk.protectedTB) || models[models.length - 1];
      const svcCost = model.svc[ret] ?? model.svc["1-year"];
      lineItems.push(makeLine("siris", `On-Prem BCDR — ${depKey === "appliance" ? "SIRIS " + model.model : "SIRIS Virtual"} ${model.tb}TB (${ret} retention)`, "perServer", 1, svcCost, round2(svcCost * mult), { category: "backup" }));
      if (bk.protectedTB > model.tb) {
        warnings.push(`On-prem backup: ${bk.protectedTB} TB exceeds the largest single ${depKey} model (${model.model}, ${model.tb} TB). Confirm sizing / multiple appliances.`);
      }
      if (depKey === "appliance" && model.hardwareMSRP) {
        backupHardwareCost = model.hardwareMSRP;
        backupHardwarePrice = round2(model.hardwareMSRP * (db.hardwareSellMultiplier || 1));
      }
    }
  }

  // ---- Backup method sanity check ----
  const anyBackupNeeded = servers.some((s) => s.backupRequired);
  const hasOnPremBackup = !!(bk && bk.onPremEnabled && (bk.protectedTB || 0) > 0);
  const hasAzureBackup = azureVMs.length > 0;
  if (anyBackupNeeded && !hasOnPremBackup && !hasAzureBackup) {
    warnings.push("One or more servers are marked for backup, but no backup method is configured. Enable on-prem BCDR (Datto SIRIS) above, or add Azure VMs with cloud backup.");
  }

  // ---- Business Line (per-company 'cost to play'); price = max(floor, multiplier x cost) ----
  const bl = pricingConfig.businessLine;
  if (bl && (bl.includeIn || []).includes(packageId)) {
    const perCompany = (bl.perCompanyComponents || []).reduce((a: number, c: any) => a + (c.cost || 0), 0);
    const perDomainSum = (bl.perDomainComponents || []).reduce((a: number, c: any) => a + (c.cost || 0), 0);
    const companyCost = round2(perCompany + perDomainSum * domains);
    const blPrice = Math.max(bl.floor || 0, round2((bl.multiplier || 1) * companyCost));
    lineItems.push({
      key: "businessLine",
      label: `TCT Business Line (cost-to-play${domains ? `, ${domains} domain${domains === 1 ? "" : "s"}` : ""})`,
      unit: "perTenant", quantity: 1, unitCost: companyCost, unitPrice: blPrice,
      cost: companyCost, price: blPrice, margin: round2(blPrice - companyCost),
      marginPct: blPrice > 0 ? (blPrice - companyCost) / blPrice : 0, category: "platform",
    });
  }

  // ---- TCT Ally: billable-labor rate note (informational; excluded from monthly totals) ----
  if (pkgDef.comanaged && pp.hourlyLabor && pp.hourlyLabor.rate) {
    lineItems.push({
      key: "allyLabor",
      label: pp.hourlyLabor.label || "Billable labor (not included in monthly)",
      unit: "service", quantity: 0,
      unitCost: 0, unitPrice: pp.hourlyLabor.rate,
      cost: 0, price: 0, margin: 0, marginPct: 0,
      category: "strategy",
      informational: true,
    });
  }

  // ---- Managed totals (exclude M365, one-time, and informational notes) ----
  const managed = lineItems.filter((l) => !l.isM365 && !l.informational);
  const monthlyCost = round2(managed.reduce((a, l) => a + l.cost, 0));
  const monthlyPrice = round2(managed.reduce((a, l) => a + l.price, 0));
  const monthlyMargin = round2(monthlyPrice - monthlyCost);

  // ---- Microsoft 365 (separate, excluded from margin) ----
  const resell = input.licensing.provider === "Triple Cities Tech resells licensing";
  let m365Cost = 0, m365Price = 0;
  const reqLicense = pkgDef.licenseRequirement;
  const licDef = pricingConfig.m365Licenses[reqLicense] || pricingConfig.m365Licenses[input.licensing.currentLicense];
  if (resell && licDef) {
    // Resell the required license for standard users; frontline get F3 if toggled
    m365Cost += stdUsers * (licDef.cost || 0);
    m365Price += stdUsers * (licDef.price || 0);
    if (flUsers > 0 && input.users.frontlineToggles.m365License) {
      const f3 = pricingConfig.m365Licenses["Frontline (F3)"];
      m365Cost += flUsers * (f3?.cost || 0);
      m365Price += flUsers * (f3?.price || 0);
    }
  }

  // ---- One-time ----
  const oneTimeCost = round2((input.oneTime?.cost || 0) + backupHardwareCost);
  const oneTimePrice = round2((input.oneTime?.price || 0) + backupHardwarePrice);

  // ---- Revenue by bucket ----
  const revenueByBucket: Record<string, number> = {};
  for (const l of managed) {
    revenueByBucket[l.unit] = round2((revenueByBucket[l.unit] || 0) + l.price);
  }

  // ---- Revenue by category (allocate each bucket's revenue across its included services by category) ----
  const revenueByCategory: Record<string, number> = {};
  for (const l of managed) {
    // direct-tagged categories (server add-ons, domain) attribute fully
    if (["srv_backup", "srv_dr", "srv_image", "srv_retention"].includes(l.key)) {
      revenueByCategory["backup"] = round2((revenueByCategory["backup"] || 0) + l.price);
      continue;
    }
    if (l.key === "domain") {
      revenueByCategory["security"] = round2((revenueByCategory["security"] || 0) + l.price);
      continue;
    }
    const svcs = inclByUnit[l.unit] || [];
    if (svcs.length === 0) {
      revenueByCategory[l.category || "platform"] = round2((revenueByCategory[l.category || "platform"] || 0) + l.price);
      continue;
    }
    const share = l.price / svcs.length;
    for (const s of svcs) {
      revenueByCategory[s.category] = round2((revenueByCategory[s.category] || 0) + share);
    }
  }

  // ---- Licensing check ----
  const currentRank = licenseRank(input.licensing.currentLicense);
  const reqRank = licenseRank(reqLicense);
  const meets = currentRank >= reqRank || input.licensing.currentLicense === "Other / None" ? currentRank >= reqRank : currentRank >= reqRank;
  const meetsLicenseRequirement = currentRank >= reqRank && reqRank > 0;
  const licenseGapMessage = !meetsLicenseRequirement
    ? `${reqLicense} Required — current license (${input.licensing.currentLicense || "unknown"}) does not meet the minimum for ${pkgDef.name}.`
    : null;

  // ---- Service inclusion lists (external names) ----
  const allServices = getServices();
  const includedServices = allServices.filter((s) => s.include?.[packageId]).map((s) => s.externalName);
  const missingServices = allServices.filter((s) => !s.include?.[packageId]).map((s) => s.externalName);

  return {
    packageId,
    packageName: pkgDef.name,
    lineItems,
    monthlyCost, monthlyPrice, monthlyMargin,
    marginPct: monthlyPrice > 0 ? monthlyMargin / monthlyPrice : 0,
    annualCost: round2(monthlyCost * MONTHS),
    annualPrice: round2(monthlyPrice * MONTHS),
    annualMargin: round2(monthlyMargin * MONTHS),
    m365MonthlyCost: round2(m365Cost),
    m365MonthlyPrice: round2(m365Price),
    m365Resold: resell,
    oneTimeCost, oneTimePrice,
    revenueByBucket,
    revenueByCategory,
    licenseRequirement: reqLicense,
    meetsLicenseRequirement,
    licenseGapMessage,
    includedServices,
    missingServices,
    warnings,
  };
}

export function buildAllQuotes(input: DiscoveryInput): PackageQuote[] {
  return getPackages().map((p) => buildQuote(input, p.id));
}

// Sum of the prospect's current/competing IT spend (for the cost-comparison view).
export function currentSpendTotals(input: DiscoveryInput): { tools: number; labor: number; total: number } {
  const cs = input.currentSpend;
  if (!cs) return { tools: 0, labor: 0, total: 0 };
  const tools = round2(
    (cs.rmm || 0) + (cs.endpointSecurity || 0) + (cs.backup || 0) +
    (cs.networkMonitoring || 0) + (cs.emailM365 || 0) + (cs.otherTools || 0)
  );
  const labor = round2(cs.internalITLabor || 0);
  return { tools, labor, total: round2(tools + labor) };
}
