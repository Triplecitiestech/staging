import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import CopyButton from '@/components/admin/documents/CopyButton'
import Countdown from '@/components/admin/documents/Countdown'
import PhaseNav, { type PhaseStep } from '@/components/admin/documents/PhaseNav'

/**
 * Presentational body of the Secure Boot 2023 remediation playbook.
 *
 * Rendered by BOTH the locked admin page (/admin/documents/secure-boot-playbook)
 * and the token-gated public page (/documents/secure-boot-playbook) so the two
 * copies share a single source of truth and can never drift. This component does
 * NO auth — each route owns its own gate. `publicView` only swaps the staff-only
 * navigation chrome (the "Documents" links, which point into /admin); the
 * document content itself is identical. `shareControl` lets the admin page drop
 * its "Share" button into the header.
 */
const TARGET_DATE = '2026-06-10T00:00:00'

const PHASES: PhaseStep[] = [
  { id: 'phase-0', node: '0', label: 'Prerequisites', sub: 'BitLocker · CA' },
  { id: 'phase-1', node: '1', label: 'Detect & Ticket', sub: 'classify · notify' },
  { id: 'phase-3', node: '3', label: 'Remediate SW', sub: 'eligible · bulk' },
  { id: 'phase-4', node: '4', label: 'Firmware', sub: 'manual · per device' },
  { id: 'phase-5', node: '5', label: 'Verify & Close', sub: 'bill · done' },
]

// ---- PowerShell sources (verbatim, the authoritative scripts) ---------------

const ONELINER = `([System.Text.Encoding]::ASCII.GetString(
   (Get-SecureBootUEFI db).bytes) -match "Windows UEFI CA 2023")
# True  = 2023 CA present in the active DB (good)
# False = not yet enrolled`

const DETECT = `<#
.SYNOPSIS
    TCT - Secure Boot 2023 CA Detection / Monitor [WIN]
.DESCRIPTION
    READ-ONLY. Resolves every Windows endpoint to a single Secure Boot status
    bucket, writes it to Datto RMM UDF 10, and exits with a code suitable for a
    monitor (0 = healthy, 1 = needs attention) so the fleet can be filtered and
    alerted on.

    Buckets:
      UPDATED        2023 CA present in live DB AND servicing status Updated
      IN-PROGRESS    Enrollment staged / pending reboot (transient)
      ELIGIBLE       Secure Boot on, no 2023 CA, no error - safe to remediate
      NEEDS-FIRMWARE Error key / Event 1795 / stuck KEK - OEM BIOS first
      NOT-CAPABLE    Servicing pipeline absent (unsupported/old build)
      NO-SECUREBOOT  Secure Boot disabled or legacy BIOS - out of scope

    No changes are made to the device. UEFI variables and registry are read only.

.NOTES
    Original work by Triple Cities Tech. Not derived from any ComStore script.
    Category: Scripts (PowerShell). Run as a recurring monitor (e.g. weekly).
    Set the UDF number below if you use something other than UDF 10.
#>

$ErrorActionPreference = 'SilentlyContinue'

# ---- Config -----------------------------------------------------------------
$UdfNumber   = 10                                   # Datto device UDF to write
$Servicing   = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\Servicing'
$SecureBoot  = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot'
$UdfRegPath  = 'HKLM:\\SOFTWARE\\CentraStage'         # Datto reads Custom# values here
$UdfValue    = "Custom$UdfNumber"

function Write-Udf([string]$Text) {
    try {
        if (!(Test-Path $UdfRegPath)) { New-Item -Path $UdfRegPath -Force | Out-Null }
        New-ItemProperty -Path $UdfRegPath -Name $UdfValue -Value $Text -PropertyType String -Force | Out-Null
    } catch { }
}

function Finish([string]$Bucket, [string]$Detail, [int]$Code) {
    Write-Host '<-Start Result->'
    Write-Host "STATUS=$Bucket"
    Write-Host '<-End Result->'
    Write-Host "Detail: $Detail"
    Write-Udf "$Bucket | $(Get-Date -Format 'yyyy-MM-dd') | $Detail"
    exit $Code
}

Write-Host '<-Start Diagnostic->'
Write-Host 'TCT Secure Boot 2023 CA Detection'
Write-Host '====================================='

# ---- 1. Is Secure Boot enabled at all? --------------------------------------
$sbOn = $false
try { $sbOn = Confirm-SecureBootUEFI } catch { $sbOn = $false }
if (-not $sbOn) {
    Write-Host '! Secure Boot is disabled or device uses legacy BIOS.'
    Write-Host '<-End Diagnostic->'
    Finish 'NO-SECUREBOOT' 'SecureBoot disabled or legacy BIOS' 1
}
Write-Host '- Secure Boot: ENABLED'

# ---- 2. Ground truth: is Windows UEFI CA 2023 in the live DB? ---------------
$has2023DB = $false
try {
    $db = Get-SecureBootUEFI -Name db
    if ($db.Bytes) {
        $dbText = [System.Text.Encoding]::ASCII.GetString($db.Bytes)
        $has2023DB = $dbText -match 'Windows UEFI CA 2023'
    }
} catch { }
Write-Host "- 2023 CA present in live DB: $has2023DB"

# ---- 3. Servicing registry state --------------------------------------------
$status   = (Get-ItemProperty -Path $Servicing -Name 'UEFICA2023Status').UEFICA2023Status
$errKey   = (Get-ItemProperty -Path $Servicing -Name 'UEFICA2023Error').UEFICA2023Error
$capable  = (Get-ItemProperty -Path $Servicing -Name 'WindowsUEFICA2023Capable').WindowsUEFICA2023Capable
$avail    = (Get-ItemProperty -Path $SecureBoot -Name 'AvailableUpdates').AvailableUpdates
Write-Host "- UEFICA2023Status: $status"
Write-Host "- WindowsUEFICA2023Capable: $capable"
Write-Host ("- AvailableUpdates: 0x{0:X4}" -f [int]$avail)
if ($null -ne $errKey) { Write-Host "- UEFICA2023Error: $errKey" }

# ---- 4. Does the servicing pipeline even exist on this build? ---------------
$task = Get-ScheduledTask -TaskName 'Secure-Boot-Update' -TaskPath '\\Microsoft\\Windows\\PI\\' -ErrorAction SilentlyContinue
$hasPipeline = [bool]$task
Write-Host "- Secure-Boot-Update task present: $hasPipeline"

# ---- 5. Recent firmware-rejection events ------------------------------------
$evt1795 = Get-WinEvent -FilterHashtable @{LogName='System';Id=1795} -MaxEvents 1 -ErrorAction SilentlyContinue
$evt1801 = Get-WinEvent -FilterHashtable @{LogName='System';Id=1801} -MaxEvents 1 -ErrorAction SilentlyContinue
if ($evt1795) { Write-Host '- Event 1795 (firmware access-denied on KEK) FOUND' }

Write-Host '<-End Diagnostic->'

# ---- 6. Decide the bucket ---------------------------------------------------
$availInt    = [int]$avail
$staging     = ($availInt -band 0x0100) -ne 0 -or $status -eq 'InProgress'
$realError   = ($null -ne $errKey -and $errKey -ne 0 -and -not $staging) -or [bool]$evt1795

$availHex = '0x{0:X4}' -f $availInt
$detail   = "DB2023=$has2023DB; Status=$status; Capable=$capable; Avail=$availHex; Err=$errKey"

if ($has2023DB -and ($status -eq 'Updated' -or $capable -eq 2)) {
    Finish 'UPDATED'        $detail 0
} elseif ($staging) {
    Finish 'IN-PROGRESS'    $detail 0
} elseif ($realError) {
    Finish 'NEEDS-FIRMWARE' $detail 1
} elseif (-not $hasPipeline) {
    Finish 'NOT-CAPABLE'    $detail 1
} else {
    Finish 'ELIGIBLE'       $detail 1
}`

const REMEDIATE = `<#
.SYNOPSIS
    TCT - Secure Boot 2023 CA Remediation [WIN]
.DESCRIPTION
    Enables the Secure Boot 2023 certificate deployment on ELIGIBLE devices by
    setting AvailableUpdates = 0x5944 and kicking the servicing scheduled task.

    Built to be safe to run fleet-wide and to re-run without hard-failing:
      - Refuses to act if Secure Boot is off.
      - Skips devices already Updated (idempotent, exits success).
      - Skips devices that are mid-flight (staged / pending reboot).
      - Refuses devices that are firmware-blocked (Event 1795 / persistent error)
        unless usrForce is set, so it won't bash its head against a BIOS issue.
      - Bails cleanly if the servicing pipeline (scheduled task) doesn't exist.

    Sets the trigger and starts the task; Windows then stages over reboots. This
    script does NOT reboot the device.

    Variables:
      usrForce / Boolean  - if true, set the trigger even on firmware-blocked
                            devices (use only after applying OEM firmware).

.NOTES
    Original work by Triple Cities Tech. Modeled on Microsoft's documented
    0x5944 mechanism, hardened for unattended RMM use.
    Category: Scripts (PowerShell). Pair with the Detection monitor (UDF 10).
#>

$ErrorActionPreference = 'SilentlyContinue'

$Servicing  = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\Servicing'
$SecureBoot = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot'
$Desired    = 0x5944
$TaskName   = 'Secure-Boot-Update'
$TaskPath   = '\\Microsoft\\Windows\\PI\\'
$Force      = ($env:usrForce -eq 'true')

function Fail([string]$Msg) { Write-Host "ERROR: $Msg"; exit 1 }
function Done([string]$Msg) { Write-Host "OK: $Msg";    exit 0 }

Write-Host 'TCT Secure Boot 2023 CA Remediation'
Write-Host '====================================='

# 1. Secure Boot must be on
$sbOn = $false
try { $sbOn = Confirm-SecureBootUEFI } catch { $sbOn = $false }
if (-not $sbOn) { Fail 'Secure Boot disabled or legacy BIOS - nothing to do.' }

# 2. Already updated?
$has2023 = $false
try {
    $db = Get-SecureBootUEFI -Name db
    if ($db.Bytes) { $has2023 = [System.Text.Encoding]::ASCII.GetString($db.Bytes) -match 'Windows UEFI CA 2023' }
} catch { }
$status  = (Get-ItemProperty -Path $Servicing -Name 'UEFICA2023Status').UEFICA2023Status
$capable = (Get-ItemProperty -Path $Servicing -Name 'WindowsUEFICA2023Capable').WindowsUEFICA2023Capable
if ($has2023 -and ($status -eq 'Updated' -or $capable -eq 2)) {
    Done 'Device already has the 2023 CA. No action taken.'
}

# 3. Mid-flight? Leave it alone.
$avail   = [int](Get-ItemProperty -Path $SecureBoot -Name 'AvailableUpdates').AvailableUpdates
$staging = ($avail -band 0x0100) -ne 0 -or $status -eq 'InProgress'
if ($staging) {
    Done ("Enrollment already in progress (AvailableUpdates=0x{0:X4}). Reboot to complete." -f $avail)
}

# 4. Firmware-blocked? Don't fight it (unless forced post-firmware).
$errKey  = (Get-ItemProperty -Path $Servicing -Name 'UEFICA2023Error').UEFICA2023Error
$evt1795 = Get-WinEvent -FilterHashtable @{LogName='System';Id=1795} -MaxEvents 1 -ErrorAction SilentlyContinue
if ((($null -ne $errKey -and $errKey -ne 0) -or $evt1795) -and -not $Force) {
    Fail 'Device appears firmware-blocked (Event 1795 / error key). Apply OEM BIOS update, then re-run with usrForce=true.'
}

# 5. Servicing pipeline present?
$task = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue
if (-not $task) {
    Fail 'Secure-Boot-Update scheduled task not found. Build is unsupported or not patched high enough; no registry change can summon it.'
}

# 6. Set the trigger and kick the task
try {
    New-Item -Path $SecureBoot -Force | Out-Null
    New-ItemProperty -Path $SecureBoot -Name 'AvailableUpdates' -Value $Desired -PropertyType DWord -Force | Out-Null
} catch { Fail "Failed to set AvailableUpdates: $_" }

$verify = [int](Get-ItemProperty -Path $SecureBoot -Name 'AvailableUpdates').AvailableUpdates
if ($verify -ne $Desired) { Fail ("Verification failed: AvailableUpdates=0x{0:X4}, expected 0x5944." -f $verify) }

try { Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath } catch { }

Done 'AvailableUpdates set to 0x5944 and servicing task started. Enrollment will stage over one or more reboots.'`

// ---- Ticket template copy text ----------------------------------------------

const TMPL_MANAGED = `Hi [POC name],

We're proactively handling a security update across your Windows devices. Microsoft is retiring a set of older Secure Boot certificates (the protection that stops malware from loading before Windows starts) and replacing them with updated ones; the older ones begin expiring June 24, 2026. We're getting ahead of it.

Impact: we've identified [X] of your machines that need this update (listed on this ticket). This is covered under your managed agreement — no cost to you. Each machine needs one or more restarts over about 48 hours to finish; users should save work when prompted.

One question for you: for any machines that need hands-on work (manual updates, restarts), would you prefer we work directly with the affected end users, or coordinate everything through you? Let us know your preference and we'll follow it.

Please note (older machines only): a few older machines may need a manufacturer firmware (BIOS) update first. We do these remotely, but in the rare case a firmware update fails, it can prevent the machine from booting — if that happens we'd schedule a technician to come on-site to recover it. We'll flag any such machines before we touch them.

We'll confirm once everything's verified. — TCT`

const TMPL_UNMANAGED = `Hi [POC name],

We need to flag a dated security item on your Windows machines. Microsoft is expiring the 2011-era Secure Boot certificates beginning June 24, 2026. Machines not updated to the new 2023 certificates before then stop receiving validated boot-security updates — weakening protection against malware that loads before Windows starts, and potentially affecting their ability to access company resources.

Impact: we found [X] machines that need this update (listed on this ticket). Because your account is time-and-materials, this is billable work and we need your approval before we begin.

Cost: $145/hour, our standard rate. Most machines take roughly 1 to 1.5 hours; some older machines take longer, especially if they need a manufacturer firmware update first. We bill the actual time per machine. For [X] machines the rough estimate is [range].

Communication preference: for machines needing hands-on work (manual updates, restarts), would you prefer we work directly with the affected end users, or coordinate everything through you?

What to be aware of:
- Each machine needs one or more restarts over about 48 hours; users should save work when prompted.
- The change can prompt a machine for its BitLocker recovery key on restart. We confirm the key is documented before starting, but a machine could pause at a recovery screen until the key is entered.
- If a machine can't complete the update, it could be flagged out-of-policy and temporarily lose access to email and Microsoft 365 until we resolve it.
- Firmware disclaimer: older machines may need a manufacturer BIOS update first. We do this remotely, but if a firmware update fails it can prevent the machine from booting — in which case we'd have to schedule a technician on-site to recover it (additional time, billed at the same rate). There's no way around this risk on firmware-dependent machines; we'll identify them before we touch them.

Reply to approve and we'll schedule to minimize disruption. Given the June 2026 deadline, starting in the next couple of weeks keeps this comfortably ahead of schedule. — TCT`

const TMPL_ENDUSER = `Hi everyone,

Over the next few days your computer will apply a Microsoft security update to its startup protection. When you see a restart prompt, please save your work and restart as soon as it's convenient — it may take more than one restart to finish. Nothing else changes and your files aren't affected. Questions? Reach out to the TCT helpdesk. Thanks!`

// ---- Small presentational helpers -------------------------------------------

function SecHead({
  num,
  kicker,
  children,
  desc,
}: {
  num: string
  kicker: string
  children: React.ReactNode
  desc?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex items-start gap-4">
      <div className="flex-none rounded-lg border-2 border-cyan-400/30 px-3 py-2 text-2xl font-black leading-none text-cyan-500 tabular-nums">
        {num}
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">
          {kicker}
        </div>
        <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{children}</h2>
        {desc && <p className="mt-2 max-w-2xl text-lg text-slate-300">{desc}</p>}
      </div>
    </div>
  )
}

function Sub({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 mt-8 text-xl font-bold tracking-tight text-white">
      {n && <span className="mr-2 text-cyan-400 tabular-nums">{n}</span>}
      {children}
    </h3>
  )
}

function CheckList({ children }: { children: React.ReactNode }) {
  return <ul className="mb-2 list-none p-0">{children}</ul>
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative border-b border-white/10 py-3 pl-9 text-base leading-relaxed text-slate-300 last:border-b-0">
      <span className="absolute left-1 top-[18px] h-4 w-4 rounded-[5px] border-2 border-cyan-400/30 bg-cyan-400/10" />
      {children}
    </li>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[0.9em] text-cyan-300">{children}</code>
}

function Callout({
  icon,
  variant = 'cyan',
  children,
}: {
  icon: string
  variant?: 'cyan' | 'warn'
  children: React.ReactNode
}) {
  const box =
    variant === 'warn'
      ? 'border-rose-400/35 bg-rose-400/[0.07]'
      : 'border-cyan-400/30 bg-cyan-400/[0.06]'
  const badge =
    variant === 'warn'
      ? 'bg-gradient-to-br from-rose-400 to-rose-500 text-[#2a0810]'
      : 'bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#04222a]'
  return (
    <div className={`my-6 flex gap-4 rounded-xl border p-5 ${box}`}>
      <div
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg text-base font-black ${badge}`}
      >
        {icon}
      </div>
      <div className="text-sm leading-relaxed text-slate-300">{children}</div>
    </div>
  )
}

function CodeBlock({ title, meta, code }: { title: string; meta: string; code: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/15 bg-[#0a0e14]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <span className="font-mono text-xs font-semibold tracking-wide text-cyan-300">
          {title}
          <span className="ml-2.5 font-normal text-slate-500">{meta}</span>
        </span>
        <CopyButton text={code} variant="dark" />
      </div>
      <pre className="overflow-x-auto p-[18px] text-[13px] leading-relaxed">
        <code className="block font-mono text-[#c8d3e0]">{code}</code>
      </pre>
    </div>
  )
}

const LEGEND = [
  { name: 'UPDATED', color: 'text-emerald-400', dot: 'bg-emerald-400', bar: 'border-t-emerald-400', mean: 'Done — 2023 CA enrolled', doText: 'Nothing. Document as complete.', hot: false },
  { name: 'IN-PROGRESS', color: 'text-cyan-300', dot: 'bg-cyan-300', bar: 'border-t-cyan-300', mean: 'Staged, pending reboot', doText: 'Ensure it reboots within ~48h. Re-check.', hot: false },
  { name: 'ELIGIBLE', color: 'text-cyan-400', dot: 'bg-cyan-400', bar: 'border-t-cyan-400', mean: 'Ready for software remediation', doText: 'Run the Remediation component (Phase 3). This is the main work queue.', hot: true },
  { name: 'NEEDS-FIRMWARE', color: 'text-rose-400', dot: 'bg-rose-400', bar: 'border-t-rose-400', mean: 'Blocked until BIOS updated', doText: 'Manual firmware work, per device (Phase 4).', hot: false },
  { name: 'NOT-CAPABLE', color: 'text-slate-400', dot: 'bg-slate-400', bar: 'border-t-slate-400', mean: 'OS too old / unpatched', doText: 'Patch to supported build; if EOL, flag for replacement.', hot: false },
  { name: 'NO-SECUREBOOT', color: 'text-slate-500', dot: 'bg-slate-500', bar: 'border-t-slate-500', mean: 'Secure Boot off / legacy BIOS', doText: 'Flag for review (Ben decides).', hot: false },
]

export default function SecureBootPlaybook({
  publicView = false,
  shareControl,
}: {
  publicView?: boolean
  shareControl?: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-black text-slate-300">
      {/* Document top bar */}
      <header className="sticky top-0 z-50 flex h-16 items-center border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Image src="/logo/tctlogo.webp" alt="Triple Cities Tech" width={36} height={36} className="h-8 w-8 object-contain" />
          <div className="flex items-center gap-4">
            {!publicView && (
              <Link
                href="/admin/documents"
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300"
              >
                <ArrowLeft size={13} /> Documents
              </Link>
            )}
            {shareControl}
            <span className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 sm:inline">
              Project Playbook · v4.0 · P1
            </span>
            <Countdown targetDate={TARGET_DATE} labelSuffix="to June 10" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: "url('/herobg.webp')" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-black" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-[0.16em] text-cyan-400">
            Project Playbook
            <span className="rounded-full border border-cyan-400/30 px-2.5 py-0.5 text-xs tracking-[0.1em] text-cyan-300">
              P1 Priority
            </span>
          </div>
          <h1 className="mb-5 text-4xl font-black leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-[4.6rem]">
            Secure Boot 2023
            <br />
            Certificate <span className="text-cyan-400">Remediation</span>
          </h1>
          <p className="mb-9 max-w-[40ch] text-lg font-medium leading-snug text-white/90 sm:text-xl">
            A step-by-step operational process for the whole team — detect, classify, get approval,
            remediate, verify — ahead of the 2011 certificate expiration.
          </p>

          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {[
              { k: 'Internal hard target', v: 'June 10, 2026', sub: 'two weeks before Microsoft', accent: true },
              { k: 'Microsoft expiration', v: 'June 24, 2026', sub: 'KEK CA 2011' },
              { k: 'Remediation path', v: 'Datto RMM', sub: 'firmware handled manually' },
              { k: 'Working principle', v: 'One company at a time', sub: 'start to finish' },
            ].map((f) => (
              <div
                key={f.k}
                className="rounded-2xl border border-white/20 bg-gradient-to-br from-slate-800/55 to-black/50 p-4 backdrop-blur-sm"
              >
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{f.k}</div>
                <div className={`text-lg font-bold leading-tight ${f.accent ? 'text-cyan-400' : 'text-white'}`}>{f.v}</div>
                <div className="mt-1 text-xs text-slate-500">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* HOW TO USE */}
        <section className="border-b border-white/10 py-16">
          <SecHead
            num="▸"
            kicker="Start here"
            desc={
              <>
                This is the working process for an active P1 project. Everyone follows it. Read your
                role in Section&nbsp;2 first, then follow the linear phases in order.
              </>
            }
          >
            How to Use This <span className="text-cyan-400">Playbook</span>
          </SecHead>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { n: 'RULE 01', t: 'P1, but behind live SLA work', p: 'Do your SLA tickets and anything critical first. This is what you work on after that — every day, until the fleet is clean.' },
              { n: 'RULE 02', t: 'One company at a time', p: 'Work a single company start-to-finish before moving to the next. Stay in one customer tenant instead of bouncing between tenants all day.' },
              { n: 'RULE 03', t: 'Detailed Autotask notes on everything', p: 'The moment you start a device, log what you did and where you stopped in your time entry — detailed enough for the other tech to resume cold. The relay only works if the notes are good.' },
              { n: 'RULE 04', t: 'One ticket per company', p: 'Ten impacted machines at one company = one ticket listing ten machines, not ten tickets.' },
              { n: 'RULE 05', t: 'When in doubt, escalate to Ben', p: 'Ben owns the project and makes the call on anything ambiguous.' },
            ].map((r) => (
              <div key={r.n} className="rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:border-cyan-400/30">
                <div className="mb-2.5 text-sm font-black tracking-[0.1em] text-cyan-400">{r.n}</div>
                <h4 className="mb-2 text-lg font-bold text-white">{r.t}</h4>
                <p className="text-sm leading-relaxed text-slate-400">{r.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 1. WHY */}
        <section className="border-b border-white/10 py-16">
          <SecHead num="01" kicker="The stakes">
            Why This Matters &amp; <span className="text-cyan-400">The Deadline</span>
          </SecHead>
          <div className="max-w-[760px]">
            <p className="mb-4 leading-relaxed">
              Microsoft is retiring the 2011-era Secure Boot certificates that almost every Windows
              device has trusted since it was built. A device that hasn&apos;t received the new 2023
              certificates keeps booting and working, but it stops getting validated boot-security
              updates — so its protection against pre-startup malware (the BlackLotus class of attack)
              degrades, and it falls out of compliance for anything that depends on a trusted boot
              chain. <strong className="font-bold text-white">Our job is to get every managed Windows
              device onto the 2023 certificates before the deadline.</strong>
            </p>
            <Sub n="1.1">The dates that matter</Sub>
            <p className="mb-4 leading-relaxed">
              The first relevant 2011 certificate to expire is the Microsoft Corporation KEK CA 2011
              on <strong className="font-bold text-white">June 24, 2026</strong> (the Microsoft UEFI
              CA 2011 follows on June 27; the Windows Production PCA 2011 expires later, in October
              2026). For our purposes the operative Microsoft deadline is June 24, 2026.
            </p>
            <p className="leading-relaxed">
              Our internal hard target is <strong className="font-bold text-white">June 10, 2026</strong>{' '}
              — two weeks before Microsoft&apos;s date. TCT runs a 14-day patching window (we hold
              Windows updates about two weeks after release to avoid shipping Microsoft&apos;s bugs to
              clients). To have every device safely updated and through a normal patch/reboot cycle
              before June 24, our internal cutoff is two weeks earlier. Treat June 10 as the date this
              must be done by.
            </p>
          </div>
          <Callout icon="!">
            <b className="text-cyan-300">Internal cutoff: June 10, 2026.</b> Microsoft&apos;s KEK CA
            2011 expires June 24 — but our 14-day patching window means every device must be updated
            and through a reboot cycle two weeks earlier.
          </Callout>
        </section>

        {/* 2. ROLES */}
        <section className="border-b border-white/10 py-16">
          <SecHead num="02" kicker="Who does what" desc="Find your role. These are your responsibilities for the duration of this project.">
            Roles &amp; <span className="text-cyan-400">Responsibilities</span>
          </SecHead>

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              { initial: 'B', alt: false, name: 'Ben', shift: 'Project Lead · 11 AM–8 PM ET', items: [
                'Owns the project end-to-end; single point of accountability.',
                'Pilots the tools first — tests Detection & Remediation on representative machines before any fleet-wide rollout.',
                'Reviews the Detection dashboard (UDF 10) and creates ONE Autotask ticket per impacted company.',
                'Determines Managed vs Unmanaged before creating the ticket (asks Rio if unclear) — this decides the template.',
                "Creates the ticket assigned to the company's POC; Autotask emails them automatically, so ticket creation is the notification.",
                'Decides the action path per device and handles or assigns the manual firmware work.',
                'Confirms each company ticket is fully verified before it is closed.',
              ]},
              { initial: 'G', alt: true, name: 'Ghenel', shift: 'Technician · 8 AM–~noon ET', items: [
                "Resumes any device Ben left in progress, picking up from Ben's time-entry notes.",
                'Runs remediation on Eligible devices, schedules reboots, verifies results, leaves the same detailed notes for Ben.',
                'Escalates anything unclear to Ben.',
              ]},
              { initial: 'R', alt: true, name: 'Rio', shift: 'Billing / Approval Tracking', items: [
                "Confirms contract status (Managed vs Unmanaged) when Ben can't determine it.",
                'Added as secondary resource on unmanaged tickets (Billing & Accounting queue, Escalated to Level 2) so approval/billing is on his radar.',
                "Relies on Autotask's automatic Customer Note Added status change as the approval record — no manual log needed.",
                'Handles billing once the work is approved and complete.',
              ]},
            ].map((role) => (
              <div key={role.name} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="mb-4 flex items-center gap-3.5">
                  <div
                    className={`flex h-12 w-12 flex-none items-center justify-center rounded-full text-lg font-black ${
                      role.alt
                        ? 'border border-cyan-400/30 bg-gradient-to-br from-slate-700 to-slate-800 text-cyan-300'
                        : 'bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#04222a] shadow-lg shadow-cyan-500/20'
                    }`}
                  >
                    {role.initial}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">{role.name}</h4>
                    <div className="text-sm font-medium text-cyan-400">{role.shift}</div>
                  </div>
                </div>
                <ul className="list-none p-0">
                  {role.items.map((it, idx) => (
                    <li key={idx} className="relative border-t border-white/10 py-2 pl-5 text-sm leading-snug text-slate-300 first:border-t-0">
                      <span className="absolute left-0.5 top-[14px] h-1.5 w-1.5 rounded-full bg-cyan-500" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-slate-800/50 to-black/55 p-7 shadow-lg">
            <h3 className="mb-3 text-xl font-bold text-white">
              The shift relay{' '}
              <span className="text-sm font-normal text-slate-400">— how Ghenel and Ben hand off</span>
            </h3>
            <p className="leading-relaxed text-slate-300">
              Ghenel works 8 AM to about noon; Ben works 11 AM to 8 PM. The only live overlap is
              roughly 11 AM–noon, so the real-time handoff is Ghenel&nbsp;→&nbsp;Ben (there is no
              Ben&nbsp;→&nbsp;Ghenel handoff overnight). In practice this is a non-issue as long as
              both keep proper time entries: because every device&apos;s state is documented on the
              ticket, <strong className="font-bold text-white">either tech can pick up exactly where
              the other stopped, regardless of shift.</strong>
            </p>
          </div>

          <Sub>Any technician — the non-negotiables</Sub>
          <CheckList>
            <Li><strong className="font-bold text-white">Notes first, always.</strong> Before moving on from a device, log what you did, its current state, and the next step in your time entry on the company ticket.</Li>
            <Li><strong className="font-bold text-white">Do the BitLocker check before touching a device</strong> (Phase 0). Confirm via the device&apos;s UDF in Datto RMM — see Phase 0.</Li>
            <Li><strong className="font-bold text-white">Stay on one company at a time</strong>, in one tenant, until that company is done.</Li>
          </CheckList>
        </section>

        {/* 3. TECHNICAL BACKGROUND */}
        <section className="border-b border-white/10 py-16">
          <SecHead num="03" kicker="For the techs" desc="You don't need to be a UEFI expert, but understanding the mechanism makes the steps make sense.">
            Technical <span className="text-cyan-400">Background</span>
          </SecHead>
          <div className="max-w-[760px]">
            <Sub n="3.1">What we&apos;re changing</Sub>
            <p className="leading-relaxed">
              We enroll the 2023 Secure Boot certificates into each device&apos;s UEFI: the Windows
              UEFI CA 2023 and Option ROM CA 2023 (in the DB), the Microsoft KEK 2023 (the key that
              authorizes future DB/DBX updates), the third-party UEFI CA 2023, and the 2023-signed
              boot manager. <strong className="font-bold text-white">Secure Boot stays ENABLED
              throughout</strong> — we&apos;re swapping certificates, not turning anything off.
            </p>
            <Sub n="3.2">How the update happens</Sub>
          </div>
          <CheckList>
            <Li>We set <Mono>AvailableUpdates = 0x5944</Mono> under <Mono>HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot</Mono>.</Li>
            <Li>The scheduled task <Mono>\Microsoft\Windows\PI\Secure-Boot-Update</Mono> (every 12h and at startup) reads it and stages the certificates.</Li>
            <Li>That value is transient: <Mono>0x5944 → 0x4100</Mono> (staged, pending reboot) <Mono>→ 0x4000</Mono> (done). It&apos;s a progress indicator, not a success flag.</Li>
            <Li>Real success = <Mono>UEFICA2023Status = Updated</Mono> and the 2023 CA present in the live DB. Our tools key off those.</Li>
            <Li>Takes one or more reboots over ~48 hours. No reimage, no data risk from the cert update itself.</Li>
          </CheckList>
          <Callout icon="⚑" variant="warn">
            <b className="text-rose-400">The firmware reality — read this.</b> Most devices need NO
            firmware update; the certificates get injected in software by the mechanism above. But a
            minority — older hardware (generally pre-2018/2019), devices the OEM says need a BIOS
            update first, or anything throwing Event 1795 — won&apos;t accept the certificates until
            firmware is updated. Because our customers run scattered, non-uniform hardware, we do{' '}
            <b className="text-rose-400">NOT</b> automate firmware updates. Unattended BIOS flashing
            across mismatched hardware is fragile and risky. Those devices are handled MANUALLY, one
            at a time. Detection isolates exactly which devices need it so the firmware list stays
            small.
          </Callout>
        </section>

        {/* 4. TOOLS + LEGEND */}
        <section className="border-b border-white/10 py-16">
          <SecHead num="04" kicker="The toolkit" desc="Two TCT-built Datto RMM components do everything. (We are not using any ComStore Secure Boot component — these two plus a one-line manual check cover the whole job.)">
            The Tools <span className="text-cyan-400">You&apos;ll Use</span>
          </SecHead>

          <div className="mb-4 overflow-hidden rounded-xl border border-white/20">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-[38%] border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-cyan-300">Component</th>
                  <th className="border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-cyan-300">What it&apos;s for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-b border-white/10 px-4 py-3 align-top"><span className="font-mono text-[0.9em] text-cyan-300">TCT – Secure Boot 2023 Detection [WIN]</span></td>
                  <td className="border-b border-white/10 px-4 py-3 align-top leading-snug text-slate-300">Read-only fleet monitor. Buckets every device, writes its status to UDF 10, alerts on at-risk devices. Drives the whole project.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 align-top"><span className="font-mono text-[0.9em] text-cyan-300">TCT – Secure Boot 2023 Remediation [WIN]</span></td>
                  <td className="px-4 py-3 align-top leading-snug text-slate-300">Enrolls the 2023 certs on Eligible devices. Safe to run and re-run — skips done / in-progress / firmware-blocked devices automatically.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <Sub n="4.1">Reading UDF 10 — the status legend</Sub>
          <p className="mb-5 max-w-[760px] leading-relaxed">
            The Detection component writes a status word directly into UDF 10 on each device. When you
            look at a device in Datto RMM, UDF 10 will literally read one of the values below —
            that&apos;s how you know what to do with it. This is the legend.
          </p>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {LEGEND.map((l) => (
              <div
                key={l.name}
                className={`rounded-xl border bg-white/5 p-4 border-t-[3px] ${l.bar} ${
                  l.hot ? 'border-cyan-400/30 shadow-lg shadow-cyan-500/20' : 'border-white/10'
                }`}
              >
                <div className={`mb-2 flex items-center gap-2.5 font-mono text-sm font-bold ${l.color}`}>
                  <span className={`h-2.5 w-2.5 flex-none rounded-[3px] ${l.dot}`} />
                  {l.name}
                </div>
                <div className="mb-1 text-sm font-semibold text-white">{l.mean}</div>
                <div className="text-xs leading-relaxed text-slate-400">{l.doText}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* PHASE PIPELINE STICKY NAV */}
      <PhaseNav steps={PHASES} />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* PHASE 0 */}
        <PhaseSection id="phase-0" n="0" title={<>Prerequisites <span className="text-cyan-400">— before touching ANY device</span></>}>
          <p className="mb-6 max-w-[64ch] text-lg text-slate-300">
            Two safety gates protect us from the two ways this project can hurt a customer: a{' '}
            <strong className="font-bold text-white">BitLocker lockout</strong> and a{' '}
            <strong className="font-bold text-white">Conditional Access lockout</strong>. Both are
            preventable.
          </p>
          <Sub n="5.1">BitLocker — confirm the key is documented</Sub>
          <p className="mb-3 max-w-[760px] leading-relaxed">
            Firmware changes (and occasionally the cert enrollment itself) can trigger a BitLocker
            recovery prompt on the next boot. If the user can&apos;t produce the recovery key, that
            machine is stuck at a recovery screen and effectively offline. Not every machine can run
            BitLocker — some lack a TPM — and that&apos;s fine; there&apos;s simply no key to worry
            about on those.
          </p>
          <CheckList>
            <Li>Refer to the <strong className="font-bold text-white">BitLocker process documentation in IT Glue</strong> for the current standard.</Li>
            <Li>Check whether BitLocker is enabled on the device. A daily TCT script automatically documents BitLocker recovery keys into the device UDF for every BitLocker-capable machine.</Li>
            <Li>Confirm the key is documented by checking that specific device&apos;s UDF in Datto RMM — <strong className="font-bold text-white">not Entra ID</strong>. The daily script keeps it current there. If a capable device&apos;s key is NOT documented, stop and resolve that before doing anything else to the device.</Li>
            <Li>If the device can&apos;t have BitLocker (no TPM, etc.), there&apos;s no key to confirm — proceed.</Li>
            <Li>For any device getting a firmware update, <strong className="font-bold text-white">suspend BitLocker for two restart cycles</strong> around the BIOS flash.</Li>
          </CheckList>
          <Sub n="5.2">Conditional Access — check the CUSTOMER&apos;S tenant</Sub>
          <p className="mb-3 max-w-[760px] leading-relaxed">
            A Conditional Access policy blocks resource access when a device is marked non-compliant.
            Because we work one company at a time, you check this once per customer, in their tenant,
            at the start of that company&apos;s work.
          </p>
          <CheckList>
            <Li>Check the <strong className="font-bold text-white">CUSTOMER&apos;S tenant</strong> (not TCT&apos;s) for any Intune compliance policy that keys on boot integrity / Secure Boot state. (Secure Boot stays ENABLED throughout, so an &apos;enabled&apos; check is fine — the concern is any rule tied to the 2023-CA state specifically.)</Li>
            <Li>If such a rule exists, set it to report-only or exclude the remediation devices for the project window so an un-remediated or mid-flight device can&apos;t flip non-compliant and get blocked from email / M365.</Li>
            <Li>Downstream risk to know: a device stuck at BitLocker recovery eventually misses its Intune check-in, can flip non-compliant, and then Conditional Access blocks it. The BitLocker gate (5.1) is the main defense; this check is the backstop.</Li>
          </CheckList>
        </PhaseSection>

        {/* PHASE 1 */}
        <PhaseSection id="phase-1" n="1" title={<>Detect, Classify &amp; <span className="text-cyan-400">Create the Ticket</span></>}>
          <Sub n="6.1">Pilot and deploy detection <span className="text-sm font-normal text-slate-400">(Ben, one-time setup)</span></Sub>
          <CheckList>
            <Li>Build the Detection component (Automation &gt; Components &gt; Create Component; category Scripts, PowerShell; script in the Reference section). Name it <span className="font-mono text-[0.9em] text-cyan-300">TCT - Secure Boot 2023 Detection [WIN]</span>.</Li>
            <Li>Pilot it: run on a small set of representative machines and confirm the result lands correctly in UDF 10 before any fleet-wide deployment.</Li>
            <Li>Create a monitoring policy across all Windows sites that runs it weekly and alerts when it exits non-zero. Add UDF 10 as a Devices column and a saved filter per status; the ELIGIBLE filter is the main work queue.</Li>
          </CheckList>
          <Sub n="6.2">Classify the company FIRST <span className="text-sm font-normal text-slate-400">(Ben)</span></Sub>
          <p className="mb-3 max-w-[760px] leading-relaxed">
            Determine Managed vs Unmanaged before creating the ticket — it decides which template you
            use. Ask Rio if contract status is unclear.
          </p>
          <CheckList>
            <Li><strong className="font-bold text-white">Managed</strong> (covered under agreement): use the Managed template. Informational, no pricing, no approval gate.</Li>
            <Li><strong className="font-bold text-white">Unmanaged</strong> (time-and-materials): use the Unmanaged template. Pricing is stated upfront and the customer must approve before work starts.</Li>
          </CheckList>
          <Sub n="6.3">Create ONE ticket per company <span className="text-sm font-normal text-slate-400">(Ben)</span></Sub>
          <CheckList>
            <Li>One ticket per company, listing every impacted machine and its status bucket. Never per-device tickets.</Li>
            <Li>Assign the ticket to the company&apos;s primary point of contact. Autotask&apos;s workflow automatically emails the POC on creation — so <strong className="font-bold text-white">creating the ticket IS the customer notification.</strong></Li>
            <Li>Use the correct template (Managed or Unmanaged) from the Ticket Templates section. The Unmanaged template states pricing upfront so we never get a yes and then surprise them with cost.</Li>
            <Li>For unmanaged: also set the queue to Billing &amp; Accounting, status Escalated to Level 2, and add Rio as secondary resource so billing/approval is tracked.</Li>
            <Li>Whatever the customer replies in Autotask flips the ticket to Customer Note Added — that&apos;s the approval/comms record. Techs then work it.</Li>
          </CheckList>
          <Callout icon="✉">
            Ready-to-send ticket and approval copy lives in{' '}
            <a className="border-b border-cyan-400/35 text-cyan-400 hover:text-cyan-300" href="#templates">Ticket Templates</a>{' '}
            below — Managed, Unmanaged, and the end-user restart notice.
          </Callout>
        </PhaseSection>

        {/* PHASE 3 */}
        <PhaseSection id="phase-3" n="3" title={<>Remediate <span className="text-cyan-400">— Software Path</span></>}>
          <p className="mb-6 max-w-[64ch] text-lg text-slate-300">
            The bulk path, largely automated — for any{' '}
            <strong className="font-bold text-white">ELIGIBLE</strong> device (and approved, if
            unmanaged).
          </p>
          <CheckList>
            <Li>Confirm Phase 0 for the device (BitLocker key documented in its UDF, or device not BitLocker-capable). If not, fix that first.</Li>
            <Li>Run the TCT Remediation component against the device or the ELIGIBLE group, in waves by site. It sets <Mono>AvailableUpdates = 0x5944</Mono> and starts the servicing task.</Li>
            <Li>Ensure the device reboots within ~48 hours (normal cadence is fine; may take more than one restart).</Li>
            <Li>Leave a detailed note: which machines you pushed, when, pending reboot. The next shift watches for them to flip to UPDATED.</Li>
            <Li>Safe to re-run — it skips done / in-progress devices and refuses firmware-blocked ones, so a second run won&apos;t cause harm.</Li>
          </CheckList>
          <div className="mt-5 border-l-2 border-slate-700 py-1 pl-4 text-sm text-slate-400">
            <b className="text-white">What it will NOT do:</b> reboot the machine for you, or fight a
            firmware-blocked device. If it reports firmware-blocked, that device moves to the manual
            firmware path (Phase 4) — don&apos;t force it from the software side.
          </div>
        </PhaseSection>

        {/* PHASE 4 */}
        <PhaseSection id="phase-4" n="4" title={<>Remediate <span className="text-cyan-400">— Manual Firmware Path</span></>}>
          <p className="mb-6 max-w-[64ch] text-lg text-slate-300">
            Deliberately manual and per-device. We don&apos;t automate firmware because customer
            hardware is non-uniform — different makes, models, and BIOS versions — and unattended BIOS
            flashing across mismatched hardware is fragile and risky. Each{' '}
            <strong className="font-bold text-white">NEEDS-FIRMWARE</strong> machine is handled by
            hand, on a schedule.
          </p>
          <CheckList>
            <Li>Confirm BitLocker key is documented (its UDF) and <strong className="font-bold text-white">SUSPEND BitLocker for two restart cycles</strong> on this device. This is the highest-risk step — do not skip it.</Li>
            <Li>Identify exact make/model and current BIOS version from RMM inventory.</Li>
            <Li>Pull the latest BIOS/UEFI from the OEM for that model; confirm release notes mention Secure Boot 2023 certs or enrollment fixes.</Li>
            <Li>Schedule with the user per the company&apos;s stated comms preference. Apply the firmware update remotely.</Li>
            <Li>After firmware, run the Remediation component with <Mono>usrForce=true</Mono> on that device, then ensure it reboots.</Li>
            <Li>Verify it flips to UPDATED. Re-enable BitLocker if it didn&apos;t auto-resume.</Li>
            <Li>If a firmware update FAILS and the machine won&apos;t boot: this is the disclosed risk — schedule a technician on-site to recover it. Note it on the ticket and tell Ben.</Li>
            <Li>If Event 1795 persists on current firmware, log it with the OEM and hold; note on ticket, tell Ben.</Li>
          </CheckList>
        </PhaseSection>

        {/* PHASE 5 */}
        <PhaseSection id="phase-5" n="5" title={<>Verify <span className="text-cyan-400">&amp; Close</span></>}>
          <CheckList>
            <Li>Re-run Detection (or wait for the weekly monitor) and confirm each machine on the ticket reads <strong className="font-bold text-white">UPDATED</strong> in UDF 10.</Li>
            <Li>For a single-device sanity check, use the one-liner in the Reference section.</Li>
            <Li>Update the company ticket: mark each machine done; note any held cases (e.g. firmware pending, EOL flagged).</Li>
            <Li>Close the company ticket only when every machine is UPDATED or has a documented reason it can&apos;t be.</Li>
            <Li>For unmanaged, the approved actual time gets billed at $145/hr. Send the customer a brief completion note.</Li>
          </CheckList>
        </PhaseSection>

        {/* TICKET TEMPLATES */}
        <section id="templates" className="scroll-mt-24 border-b border-white/10 py-16">
          <SecHead num="07" kicker="Ben uses these" desc="Both templates spell out the impact, ask the POC their communication preference, and (where firmware machines are involved) include the firmware disclaimer. The unmanaged template adds pricing and an approval ask.">
            Ticket <span className="text-cyan-400">Templates</span>
          </SecHead>

          {/* Managed */}
          <TemplateCard
            accent="managed"
            type="7.1 · Managed company — ticket / notification"
            subject={<>Secure Boot security update — <Ph>[Company]</Ph> devices (covered under your agreement)</>}
            copyText={TMPL_MANAGED}
          >
            <p>Hi <Ph>[POC name]</Ph>,</p>
            <p>We&apos;re proactively handling a security update across your Windows devices. Microsoft is retiring a set of older Secure Boot certificates (the protection that stops malware from loading before Windows starts) and replacing them with updated ones; the older ones begin expiring June 24, 2026. We&apos;re getting ahead of it.</p>
            <p><strong>Impact:</strong> we&apos;ve identified <Ph>[X]</Ph> of your machines that need this update (listed on this ticket). This is covered under your managed agreement — no cost to you. Each machine needs one or more restarts over about 48 hours to finish; users should save work when prompted.</p>
            <p><strong>One question for you:</strong> for any machines that need hands-on work (manual updates, restarts), would you prefer we work directly with the affected end users, or coordinate everything through you? Let us know your preference and we&apos;ll follow it.</p>
            <p><strong>Please note (older machines only):</strong> a few older machines may need a manufacturer firmware (BIOS) update first. We do these remotely, but in the rare case a firmware update fails, it can prevent the machine from booting — if that happens we&apos;d schedule a technician to come on-site to recover it. We&apos;ll flag any such machines before we touch them.</p>
            <p>We&apos;ll confirm once everything&apos;s verified. — TCT</p>
          </TemplateCard>

          {/* Unmanaged */}
          <TemplateCard
            accent="unmanaged"
            type="7.2 · Unmanaged company — ticket / approval request"
            subject={<>Action needed — Secure Boot certificate update for <Ph>[Company]</Ph> (approval required)</>}
            copyText={TMPL_UNMANAGED}
          >
            <p>Hi <Ph>[POC name]</Ph>,</p>
            <p>We need to flag a dated security item on your Windows machines. Microsoft is expiring the 2011-era Secure Boot certificates beginning June 24, 2026. Machines not updated to the new 2023 certificates before then stop receiving validated boot-security updates — weakening protection against malware that loads before Windows starts, and potentially affecting their ability to access company resources.</p>
            <p><strong>Impact:</strong> we found <Ph>[X]</Ph> machines that need this update (listed on this ticket). Because your account is time-and-materials, this is billable work and we need your approval before we begin.</p>
            <p><strong>Cost:</strong> $145/hour, our standard rate. Most machines take roughly 1 to 1.5 hours; some older machines take longer, especially if they need a manufacturer firmware update first. We bill the actual time per machine. For <Ph>[X]</Ph> machines the rough estimate is <Ph>[range]</Ph>.</p>
            <p><strong>Communication preference:</strong> for machines needing hands-on work (manual updates, restarts), would you prefer we work directly with the affected end users, or coordinate everything through you?</p>
            <p><strong>What to be aware of:</strong></p>
            <ul className="my-2 list-none space-y-0 pl-0">
              <TemplLi>Each machine needs one or more restarts over about 48 hours; users should save work when prompted.</TemplLi>
              <TemplLi>The change can prompt a machine for its BitLocker recovery key on restart. We confirm the key is documented before starting, but a machine could pause at a recovery screen until the key is entered.</TemplLi>
              <TemplLi>If a machine can&apos;t complete the update, it could be flagged out-of-policy and temporarily lose access to email and Microsoft 365 until we resolve it.</TemplLi>
              <TemplLi><strong>Firmware disclaimer:</strong> older machines may need a manufacturer BIOS update first. We do this remotely, but if a firmware update fails it can prevent the machine from booting — in which case we&apos;d have to schedule a technician on-site to recover it (additional time, billed at the same rate). There&apos;s no way around this risk on firmware-dependent machines; we&apos;ll identify them before we touch them.</TemplLi>
            </ul>
            <p>Reply to approve and we&apos;ll schedule to minimize disruption. Given the June 2026 deadline, starting in the next couple of weeks keeps this comfortably ahead of schedule. — TCT</p>
          </TemplateCard>

          {/* End user */}
          <TemplateCard
            accent="enduser"
            type="7.3 · End-user — restart notice (if working with users directly)"
            subject={<>Scheduled security update — please restart when prompted</>}
            copyText={TMPL_ENDUSER}
            last
          >
            <p>Hi everyone,</p>
            <p>Over the next few days your computer will apply a Microsoft security update to its startup protection. When you see a restart prompt, please save your work and restart as soon as it&apos;s convenient — it may take more than one restart to finish. Nothing else changes and your files aren&apos;t affected. Questions? Reach out to the TCT helpdesk. Thanks!</p>
          </TemplateCard>
        </section>

        {/* REFERENCE — COMPONENTS */}
        <section className="border-b border-white/10 py-16">
          <SecHead num="11" kicker="Reference" desc="The authoritative scripts the tools key off. Build these as Datto RMM components — category Scripts, PowerShell.">
            The <span className="text-cyan-400">Components</span>
          </SecHead>
          <Sub n="11.1">Manual single-device check</Sub>
          <p className="mb-2 max-w-[760px] leading-relaxed">The authoritative one-liner (what the tools key off):</p>
          <CodeBlock title="PowerShell" meta="one-liner · run on the device" code={ONELINER} />
          <Sub n="11.2">Detection / Monitor component</Sub>
          <p className="mb-2 max-w-[760px] leading-relaxed">Category Scripts, PowerShell. Run as a weekly monitor across all Windows sites. Writes the status word to UDF 10. Read-only.</p>
          <CodeBlock title="TCT-SecureBoot2023-Detection.ps1" meta="read-only · exit 0 healthy / 1 attention" code={DETECT} />
          <Sub n="11.3">Remediation component</Sub>
          <p className="mb-2 max-w-[760px] leading-relaxed">Category Scripts, PowerShell. Add one variable: <Mono>usrForce</Mono> (Boolean, default false) — set true only for the post-firmware retry. Safe to run and re-run.</p>
          <CodeBlock title="TCT-SecureBoot2023-Remediation.ps1" meta="idempotent · var: usrForce (bool)" code={REMEDIATE} />
        </section>

        {/* TROUBLESHOOTING */}
        <section className="border-b border-white/10 py-16">
          <SecHead num="12" kicker="When something's off">
            Troubleshooting <span className="text-cyan-400">Reference</span>
          </SecHead>
          <div className="overflow-x-auto rounded-xl border border-white/20">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-[26%] border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-cyan-300">What you see</th>
                  <th className="w-[34%] border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-cyan-300">What it means</th>
                  <th className="border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-cyan-300">What to do</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-b [&_td]:border-white/10 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_td]:leading-snug [&_td]:text-slate-300 [&_tr:last-child_td]:border-b-0">
                <tr><td><Mono>UEFICA2023Error</Mono> present, nothing in-flight</td><td>Real enrollment error</td><td>Treat as Needs-Firmware. OEM BIOS update, then retry with <Mono>usrForce=true</Mono>.</td></tr>
                <tr><td><Mono>AvailableUpdates</Mono> stuck at <Mono>0x4104</Mono></td><td>Stuck on the KEK 2023 step</td><td>Firmware update almost certainly needed. Needs-Firmware path.</td></tr>
                <tr><td>Event <Mono>1795</Mono></td><td>Firmware refused the KEK write</td><td>Needs-Firmware. BIOS update for that model first.</td></tr>
                <tr><td>Transient error while staging (<Mono>0x4100</Mono>)</td><td>Boot manager staged, pending reboot — NOT a failure</td><td>Just reboot. Don&apos;t re-run remediation. Detection shows In-Progress.</td></tr>
                <tr><td>Status <Mono>NotStarted</Mono> on a newer PC</td><td>Shipped with 2023 certs; registry lags reality</td><td>Trust the live DB check; Detection shows Updated if the cert is present.</td></tr>
                <tr><td><Mono>Secure-Boot-Update</Mono> task missing</td><td>OS too old / unpatched for the servicing pipeline</td><td>Not-Capable. Patch to supported build, or flag EOL.</td></tr>
                <tr><td>BitLocker recovery prompt after restart</td><td>Firmware change invalidated the seal</td><td>Enter the key from the device UDF. This is why Phase 0 is mandatory.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ONE SCREEN */}
        <section className="py-16">
          <SecHead num="13" kicker="TL;DR">
            The Whole Process <span className="text-cyan-400">on One Screen</span>
          </SecHead>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { b: 'Phase 0', t: 'Gate', p: "BitLocker key documented (check device UDF; refer to IT Glue process); check the CUSTOMER'S tenant for Conditional Access. One company at a time.", always: false },
              { b: 'Phase 1', t: 'Detect & ticket', p: 'Ben pilots & deploys Detection → buckets to UDF 10 → classify Managed/Unmanaged → create ONE ticket per company, assigned to the POC (auto-notifies them), pricing upfront for unmanaged.', always: false },
              { b: 'Approval', t: 'Unmanaged', p: 'Unmanaged ticket = Billing & Accounting queue, Escalated to L2, Rio secondary. Customer reply → Customer Note Added = approved.', always: false },
              { b: 'Phase 3', t: 'Software', p: 'Software remediation on Eligible devices (component + reboot). Bulk, automated.', always: false },
              { b: 'Phase 4', t: 'Firmware', p: 'Manual firmware on Needs-Firmware devices. Per device: suspend BitLocker, BIOS update, force-retry. On-site if a flash fails.', always: false },
              { b: 'Phase 5', t: 'Verify', p: 'Verify UPDATED, update & close ticket, bill actual time (unmanaged).', always: false },
              { b: 'Always', t: 'The relay', p: 'Detailed time-entry notes on every device so the Ghenel/Ben relay never makes the customer wait. Internal target: June 10, 2026.', always: true },
            ].map((item) => (
              <div
                key={item.b}
                className={`rounded-xl border p-5 ${
                  item.always ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="mb-2 flex items-center gap-2.5 text-base font-bold text-white">
                  <span className="rounded-md bg-gradient-to-r from-cyan-400 to-cyan-600 px-2 py-0.5 text-xs font-black tracking-wide text-[#04222a]">{item.b}</span>
                  {item.t}
                </div>
                <p className="text-sm leading-relaxed text-slate-400">{item.p}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black py-12 text-center">
        <Image src="/logo/tctlogo.webp" alt="Triple Cities Tech" width={30} height={30} className="mx-auto mb-4 h-8 w-8 object-contain opacity-90" />
        <p className="text-sm text-slate-500">
          End of playbook — <span className="font-semibold text-cyan-400">Triple Cities Tech</span> ·
          v4.0 · Technology solutions built for business.
          {!publicView && (
            <>
              {' · '}
              <Link href="/admin/documents" className="text-slate-500 hover:text-cyan-300">← Back to Documents</Link>
            </>
          )}
        </p>
      </footer>
    </div>
  )
}

// ---- Phase + template helpers (server components) ---------------------------

function PhaseSection({
  id,
  n,
  title,
  children,
}: {
  id: string
  n: string
  title: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-white/10 py-16">
      <div className="mb-4 flex items-center gap-5">
        <div className="flex h-[74px] w-[74px] flex-none flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-[#04222a] shadow-lg shadow-cyan-500/20">
          <span className="text-xs font-bold uppercase tracking-wide opacity-80">Phase</span>
          <span className="text-3xl font-black leading-none">{n}</span>
        </div>
        <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Ph({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-cyan-500/15 px-1.5 font-mono text-[0.92em] font-semibold text-cyan-800">
      {children}
    </span>
  )
}

function TemplLi({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative border-b border-slate-100 py-1.5 pl-6">
      <span className="absolute left-1 top-[13px] h-1.5 w-1.5 rounded-full bg-cyan-500" />
      {children}
    </li>
  )
}

function TemplateCard({
  accent,
  type,
  subject,
  copyText,
  children,
  last = false,
}: {
  accent: 'managed' | 'unmanaged' | 'enduser'
  type: string
  subject: React.ReactNode
  copyText: string
  children: React.ReactNode
  last?: boolean
}) {
  const head =
    accent === 'managed'
      ? 'bg-gradient-to-r from-cyan-50 to-white'
      : accent === 'unmanaged'
        ? 'bg-gradient-to-r from-rose-50 to-white'
        : 'bg-gradient-to-r from-slate-100 to-white'
  const typeColor =
    accent === 'managed' ? 'text-cyan-700' : accent === 'unmanaged' ? 'text-rose-500' : 'text-slate-600'

  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 shadow-2xl ${last ? '' : 'mb-6'}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 ${head}`}>
        <div>
          <div className={`text-xs font-bold uppercase tracking-[0.1em] ${typeColor}`}>{type}</div>
          <div className="mt-1 text-base font-bold text-slate-900">{subject}</div>
        </div>
        <CopyButton text={copyText} variant="light" />
      </div>
      <div className="space-y-3 px-6 py-5 text-sm leading-relaxed text-slate-700 [&_strong]:font-bold [&_strong]:text-slate-900">
        {children}
      </div>
    </div>
  )
}
