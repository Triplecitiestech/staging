"use client";
import React, { useState } from "react";
import { DiscoveryInput, ServerEntry } from "@/lib/sales-calculator/types";
import { appConfig } from "@/lib/sales-calculator/config";
import { newServer } from "@/lib/sales-calculator/defaults";
import { Card, NumberField, DecimalField, TextField, SelectField, Toggle, Button } from "./ui";
import { Building2, Users, HardDrive, Server, UserCog, KeyRound, Trash2, Plus, ChevronLeft, ChevronRight, Check } from "lucide-react";
import clsx from "clsx";

export function Discovery({ input, set, onFinish }:
  { input: DiscoveryInput; set: (next: DiscoveryInput) => void; onFinish?: () => void }) {
  const o = appConfig.options;
  const [step, setStep] = useState(0);

  function patch(p: Partial<DiscoveryInput>) { set({ ...input, ...p }); }
  function patchCompany(p: Partial<DiscoveryInput["company"]>) { set({ ...input, company: { ...input.company, ...p } }); }
  function patchUsers(p: Partial<DiscoveryInput["users"]>) { set({ ...input, users: { ...input.users, ...p } }); }
  function patchDevices(p: Partial<DiscoveryInput["devices"]>) { set({ ...input, devices: { ...input.devices, ...p } }); }
  function patchIT(p: Partial<DiscoveryInput["internalIT"]>) { set({ ...input, internalIT: { ...input.internalIT, ...p } }); }
  function patchLic(p: Partial<DiscoveryInput["licensing"]>) { set({ ...input, licensing: { ...input.licensing, ...p } }); }
  function patchOneTime(p: Partial<DiscoveryInput["oneTime"]>) { set({ ...input, oneTime: { ...input.oneTime, ...p } }); }
  function patchBackup(p: Partial<DiscoveryInput["backup"]>) { set({ ...input, backup: { ...input.backup, ...p } }); }
  function patchCurrentSpend(p: Partial<DiscoveryInput["currentSpend"]>) { set({ ...input, currentSpend: { ...input.currentSpend, ...p } }); }

  function toggleCompliance(c: string) {
    let list = [...input.company.compliance];
    if (c === "None") { list = ["None"]; }
    else {
      list = list.filter((x) => x !== "None");
      list = list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
      if (list.length === 0) list = ["None"];
    }
    patchCompany({ compliance: list });
  }

  function addServer() { patch({ servers: [...input.servers, newServer(input.servers.length + 1)] }); }
  function updateServer(id: string, p: Partial<ServerEntry>) {
    patch({ servers: input.servers.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  }
  function removeServer(id: string) { patch({ servers: input.servers.filter((s) => s.id !== id) }); }

  // ---------- section renderers ----------
  const company = (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="Company Name" value={input.company.name} onChange={(v) => patchCompany({ name: v })} placeholder="Acme Manufacturing" />
        <SelectField label="Industry" value={input.company.industry} options={o.industries} onChange={(v) => patchCompany({ industry: v })} />
        <NumberField label="Number of Locations" value={input.company.locations} onChange={(v) => patchCompany({ locations: v })} min={1} />
        <NumberField label="Number of Domains" value={input.company.domains} onChange={(v) => patchCompany({ domains: v })} />
        <NumberField label="Microsoft 365 Tenants" value={input.company.tenants} onChange={(v) => patchCompany({ tenants: v })} />
      </div>
      <div className="mt-4 rounded-[12px] bg-bgdeep/50 px-3 py-2">
        <Toggle label="Security / compliance is a key driver" checked={input.company.securityPriority} onChange={(b) => patchCompany({ securityPriority: b })} />
      </div>
      <div className="mt-4">
        <span className="block text-sm font-medium text-body2 mb-2">Compliance Requirements</span>
        <div className="flex flex-wrap gap-2">
          {o.compliance.map((c: string) => {
            const active = input.company.compliance.includes(c);
            return (
              <button key={c} type="button" onClick={() => toggleCompliance(c)}
                className={"rounded-full px-3 py-1 text-sm border transition-colors " + (active ? "bg-accent text-white border-accent" : "bg-white/5 text-body2 border-line hover:bg-white/10")}>
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  const users = (
    <>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
        <NumberField label="Standard Users" hint="Full productivity and security stack." value={input.users.standard} onChange={(v) => patchUsers({ standard: v })} />
        <NumberField label="Frontline Users" hint="Shop-floor / deskless. Reduced licensing and services." value={input.users.frontline} onChange={(v) => patchUsers({ frontline: v })} />
        <NumberField label="Shared Mailboxes" hint="Billed at $5/mo each." value={input.users.sharedMailboxes} onChange={(v) => patchUsers({ sharedMailboxes: v })} />
      </div>
      <div className="mt-4 rounded-[12px] bg-bgdeep/50 px-3 py-2">
        <Toggle label="Back up Microsoft Entra ID? ($1.50/user)" checked={input.backup.entraEnabled} onChange={(b) => patchBackup({ entraEnabled: b })} />
      </div>
      {input.users.frontline > 0 && (
        <div className="mt-4 rounded-[12px] bg-bgdeep/50 p-4">
          <div className="text-sm font-medium text-body2 mb-1">Frontline User Requirements</div>
            <p className="text-xs text-faint mb-2">Frontline = deskless / no email. Anyone who needs email is a Standard User. (Preliminary — refine when you onboard frontline clients.)</p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
            {appConfig.frontlineServiceToggles.map((t: any) => (
              <Toggle key={t.id} label={t.label}
                checked={(input.users.frontlineToggles as any)[t.id]}
                onChange={(b) => patchUsers({ frontlineToggles: { ...input.users.frontlineToggles, [t.id]: b } })} />
            ))}
          </div>
        </div>
      )}
    </>
  );

  const devices = (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <NumberField label="Windows PCs" hint="Workstations + laptops (Windows)." value={input.devices.windowsPCs} onChange={(v) => patchDevices({ windowsPCs: v })} />
        <NumberField label="PCs to back up" hint="Optional — workstation Endpoint Backup ($100/PC)." value={input.devices.pcsToBackup} onChange={(v) => patchDevices({ pcsToBackup: v })} />
      </div>
      <p className="mt-3 text-xs text-faint">We currently price Windows PCs and servers. Macs, shared devices and kiosks aren't quoted today.</p>
    </>
  );

  const azureCount = input.servers.filter((s) => s.type === "Azure VM").length;
  const servers = (
    <>
      {/* On-prem BCDR */}
      <div className="rounded-[12px] bg-bgdeep/50 p-4 mb-4">
        <Toggle label="On-prem BCDR backup (Datto SIRIS)?" checked={input.backup.onPremEnabled} onChange={(b) => patchBackup({ onPremEnabled: b })} />
        {input.backup.onPremEnabled && (
          <div className="grid sm:grid-cols-3 gap-4 mt-3 items-start">
            <DecimalField label="Protected data (TB)" suffix="TB" step={1} value={input.backup.protectedTB} onChange={(v) => patchBackup({ protectedTB: v })} hint="Total across protected servers; picks the SIRIS model." />
            <SelectField label="Deployment" value={input.backup.deployment} options={["SIRIS Virtual", "SIRIS Appliance", "Endpoint Backup w/ DR (cloud, per 500GB)"]} onChange={(v) => patchBackup({ deployment: v })} hint="Virtual = all-virtual; Appliance = physical (adds hardware); Cloud = per 500GB." />
            <SelectField label="Cloud retention" value={input.backup.retention} options={["1-year", "7-year", "Infinite"]} onChange={(v) => patchBackup({ retention: v })} hint="Default 1yr; longer for compliance." />
          </div>
        )}
      </div>

      {/* Servers / VMs */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted">Add each server / VM in scope. SIRIS/ALTO backups include DR + image-level restore (sold at 2× the service cost).</p>
        <Button variant="outline" onClick={addServer}><Plus size={14} className="inline -mt-0.5 mr-1" />Add Server</Button>
      </div>
      {input.servers.length === 0 && <p className="text-sm text-faint">No servers added. Click "Add Server" for each server in scope.</p>}
      <div className="space-y-3">
        {input.servers.map((s, i) => {
          const azure = s.type === "Azure VM";
          return (
            <div key={s.id} className="rounded-[12px] border border-line p-4 bg-bgdeep/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-ink">Server {i + 1}{azure ? " · Azure VM" : ""}</span>
                <button onClick={() => removeServer(s.id)} className="text-danger hover:opacity-70"><Trash2 size={16} /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 items-start">
                <SelectField label="Type" hint="Physical, virtual, or cloud." value={s.type} options={o.serverTypes} onChange={(v) => updateServer(s.id, { type: v })} />
                <SelectField label="Operating System" value={s.os} options={o.osOptions} onChange={(v) => updateServer(s.id, { os: v })} />
                {azure && (
                  <DecimalField label="Provisioned Disk" suffix="TB" step={0.1} value={s.provisionedTB}
                    onChange={(v) => updateServer(s.id, { provisionedTB: v })}
                    hint="Azure backup is billed on provisioned space, pooled across all Azure VMs." />
                )}
              </div>
              <div className="mt-3">
                <Toggle label={azure ? "Cloud Backup Required?" : "Backup Required?"} checked={s.backupRequired} onChange={(b) => updateServer(s.id, { backupRequired: b })} />
                <p className="text-xs text-faint mt-1">Disaster recovery and image-level restore are included with every SIRIS/ALTO backup — no add-on needed.</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Azure pooled retention — only when Azure VMs are present */}
      {azureCount > 0 && (
        <div className="rounded-[12px] bg-bgdeep/50 p-4 mt-4">
          <SelectField label="Azure VM cloud backup retention" value={input.backup.azureRetention} options={["1-year", "7-year", "Infinite"]} onChange={(v) => patchBackup({ azureRetention: v })} hint="Applies to all Azure VMs (billed on pooled provisioned TB)." />
        </div>
      )}
    </>
  );

  const internalIT = (
    <div className="space-y-3">
      <Toggle label="Customer has internal IT staff" checked={input.internalIT.hasInternalIT} onChange={(b) => patchIT({ hasInternalIT: b })} />
      {input.internalIT.hasInternalIT && (
        <div className="max-w-[220px]">
          <NumberField label="Number of IT staff" value={input.internalIT.itStaffCount} onChange={(v) => patchIT({ itStaffCount: v })} />
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0.5 pt-1">
        <Toggle label="Co-Managed access" checked={input.internalIT.comanagedAccess} onChange={(b) => patchIT({ comanagedAccess: b })} />
        <Toggle label="Autotask (PSA) access" checked={input.internalIT.autotaskAccess} onChange={(b) => patchIT({ autotaskAccess: b })} />
        <Toggle label="Documentation (IT Glue) access" checked={input.internalIT.documentationAccess} onChange={(b) => patchIT({ documentationAccess: b })} />
        <Toggle label="Escalation support" checked={input.internalIT.escalationSupport} onChange={(b) => patchIT({ escalationSupport: b })} />
        <Toggle label="After-hours support" checked={input.internalIT.afterHoursSupport} onChange={(b) => patchIT({ afterHoursSupport: b })} />
      </div>
    </div>
  );

  const licensing = (
    <>
      <div className="grid sm:grid-cols-2 gap-4 items-end">
        <SelectField label="Who provides licensing?" value={input.licensing.provider} options={o.licenseProviders} onChange={(v) => patchLic({ provider: v })} />
        <SelectField label="Current Microsoft License" value={input.licensing.currentLicense} options={o.m365Licenses} onChange={(v) => patchLic({ currentLicense: v })} />
      </div>
      <p className="text-xs text-faint mt-2">Licensing is a separate line item — never included in managed-services margin.</p>

      <div className="mt-5 rounded-[12px] bg-bgdeep/50 p-4">
        <div className="text-sm font-semibold text-ink">One-Time Onboarding</div>
        <p className="text-xs text-faint mt-0.5 mb-3">Set by you — a one-time charge to onboard our services. Added to the quote as a one-time item (not recurring) and unrelated to Microsoft licensing.</p>
        <div className="grid sm:grid-cols-2 gap-4 items-start">
          <DecimalField label="Onboarding charge ($)" step={25} value={input.oneTime.price} onChange={(v) => patchOneTime({ price: v })} hint="One-time, billed to the customer." />
          <DecimalField label="Our onboarding cost ($)" step={25} value={input.oneTime.cost} onChange={(v) => patchOneTime({ cost: v })} hint="Optional — used for margin." />
        </div>
      </div>

      <div className="mt-5 rounded-[12px] bg-bgdeep/50 p-4">
        <Toggle label="Capture current IT spend (for a cost comparison)" checked={input.currentSpend.enabled} onChange={(b) => patchCurrentSpend({ enabled: b })} />
        {input.currentSpend.enabled && (
          <>
            <p className="text-xs text-faint mt-1 mb-3">Optional — what they pay today for tools we'd replace, plus internal IT labor. Drives the "Current vs TCT" comparison. Leave anything unknown at 0.</p>
            <div className="grid sm:grid-cols-2 gap-4 items-start">
              <DecimalField label="RMM / monitoring ($/mo)" step={10} value={input.currentSpend.rmm} onChange={(v) => patchCurrentSpend({ rmm: v })} />
              <DecimalField label="Antivirus / EDR ($/mo)" step={10} value={input.currentSpend.endpointSecurity} onChange={(v) => patchCurrentSpend({ endpointSecurity: v })} />
              <DecimalField label="Backup / BCDR ($/mo)" step={10} value={input.currentSpend.backup} onChange={(v) => patchCurrentSpend({ backup: v })} />
              <DecimalField label="Network monitoring ($/mo)" step={10} value={input.currentSpend.networkMonitoring} onChange={(v) => patchCurrentSpend({ networkMonitoring: v })} />
              <DecimalField label="Email / Microsoft 365 ($/mo)" step={10} value={input.currentSpend.emailM365} onChange={(v) => patchCurrentSpend({ emailM365: v })} />
              <DecimalField label="Other security / tools ($/mo)" step={10} value={input.currentSpend.otherTools} onChange={(v) => patchCurrentSpend({ otherTools: v })} />
              <DecimalField label="Internal IT labor ($/mo)" step={100} value={input.currentSpend.internalITLabor} onChange={(v) => patchCurrentSpend({ internalITLabor: v })} hint="Salary portion, or hourly rate × hours." />
            </div>
          </>
        )}
      </div>
    </>
  );

  const steps = [
    { title: "Company", subtitle: "Company profile & compliance.", icon: Building2, node: company },
    { title: "Users", subtitle: "Standard and frontline users.", icon: Users, node: users },
    { title: "Devices", subtitle: "Endpoints in scope.", icon: HardDrive, node: devices },
    { title: "Servers", subtitle: "Servers, backup & Azure VMs.", icon: Server, node: servers },
    { title: "Internal IT", subtitle: "Drives the Co-Managed recommendation.", icon: UserCog, node: internalIT },
    { title: "Licensing & Onboarding", subtitle: "Microsoft 365 and one-time onboarding.", icon: KeyRound, node: licensing },
  ];

  const Active = steps[step];
  const ActiveIcon = Active.icon;
  const isLast = step === steps.length - 1;

  return (
    <Card className="!p-0 overflow-hidden">
      {/* Stepper rail */}
      <div className="px-5 pt-5">
        <div className="flex items-center">
          {steps.map((st, i) => {
            const done = i < step, active = i === step;
            return (
              <React.Fragment key={st.title}>
                <button type="button" onClick={() => setStep(i)} title={st.title}
                  className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    active ? "bg-accent text-white shadow-glow" : done ? "bg-accent/20 text-accent ring-1 ring-accent/40" : "bg-white/5 text-faint ring-1 ring-white/10")}>
                  {done ? <Check size={14} /> : i + 1}
                </button>
                {i < steps.length - 1 && <div className={clsx("h-px flex-1 mx-1.5", i < step ? "bg-accent/50" : "bg-line")} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Active step header */}
      <div className="px-5 pt-4 flex items-center gap-3">
        <div className="rounded-[10px] bg-accent/15 p-2"><ActiveIcon className="text-accent" size={18} /></div>
        <div>
          <div className="eyebrow">Step {step + 1} of {steps.length}</div>
          <h2 className="text-base font-bold text-ink tracking-tight leading-tight">{Active.title}</h2>
        </div>
      </div>
      <p className="px-5 mt-1 text-sm text-muted">{Active.subtitle}</p>

      {/* Active step body */}
      <div className="px-5 py-5">{Active.node}</div>

      {/* Nav */}
      <div className="flex items-center justify-between border-t border-line px-5 py-3 bg-bgdeep/40">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronLeft size={15} className="inline -mt-0.5" /> Back
        </Button>
        {isLast ? (
          <Button variant="primary" onClick={() => onFinish && onFinish()}>
            View Recommendation <ChevronRight size={15} className="inline -mt-0.5" />
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
            Next <ChevronRight size={15} className="inline -mt-0.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}
