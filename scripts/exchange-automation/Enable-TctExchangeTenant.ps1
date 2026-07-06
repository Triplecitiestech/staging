<#
.SYNOPSIS
    Per-customer-tenant enablement for TCT Exchange Automation: admin consent,
    Exchange service principal + scoped role group, verification, and platform
    registration.

.DESCRIPTION
    Run once per customer tenant (PowerShell 7). You need:
      - a Global Administrator in the CUSTOMER tenant to grant consent (step 1)
      - an Exchange admin session in the customer tenant (steps 2-4; GDAP or
        customer GA credentials)
      - the platform MIGRATION_SECRET (step 5-6; prompted, never logged)

    Scoping decision: the app's service principal is made a member of a custom
    role group holding ONLY the 'Mail Recipients' management role — the
    documented least-privilege alternative (app-only-auth Option 2) to the
    Exchange Administrator directory role. Step 4 VERIFIES that every cmdlet
    the runbook uses is actually granted by that role in this tenant and warns
    if Microsoft has moved one.

    Full sequence + pilot checklist: docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md

.EXAMPLE
    pwsh ./Enable-TctExchangeTenant.ps1 `
        -AppId 11111111-2222-3333-4444-555555555555 `
        -CustomerTenantId 99999999-8888-7777-6666-555555555555 `
        -OrganizationDomain contoso.onmicrosoft.com `
        -CompanySlug contoso `
        -PlatformBaseUrl https://www.triplecitiestech.com `
        -EnabledBy kurtis@triplecitiestech.com
#>

#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AppId,
    [Parameter(Mandatory = $true)][string]$CustomerTenantId,
    [Parameter(Mandatory = $true)][ValidatePattern('\.onmicrosoft\.com$')][string]$OrganizationDomain,
    [Parameter(Mandatory = $true)][string]$CompanySlug,
    [Parameter(Mandatory = $true)][string]$PlatformBaseUrl,
    [Parameter(Mandatory = $true)][string]$EnabledBy,
    [string]$RoleGroupName = 'TCT Exchange Automation'
)

$ErrorActionPreference = 'Stop'
foreach ($module in @('ExchangeOnlineManagement', 'Microsoft.Graph.Applications')) {
    if (-not (Get-Module -ListAvailable -Name $module)) {
        throw "Module $module is required. Install it first: Install-Module $module -Scope CurrentUser"
    }
}
$PlatformBaseUrl = $PlatformBaseUrl.TrimEnd('/')

# ---------------------------------------------------------------------------
# 1. Admin consent in the customer tenant
# ---------------------------------------------------------------------------
$consentUrl = "https://login.microsoftonline.com/$CustomerTenantId/adminconsent?client_id=$AppId&scope=https://outlook.office365.com/.default"
Write-Host '== 1/6 Admin consent' -ForegroundColor Cyan
Write-Host 'A Global Administrator of the CUSTOMER tenant must open this URL and accept:'
Write-Host "  $consentUrl" -ForegroundColor Yellow
Read-Host 'Press Enter AFTER consent has been granted (Ctrl+C to abort)'

# ---------------------------------------------------------------------------
# 2. Find the app's service principal in the customer tenant
# ---------------------------------------------------------------------------
Write-Host '== 2/6 Locating the consented service principal (sign in to the CUSTOMER tenant)' -ForegroundColor Cyan
Connect-MgGraph -TenantId $CustomerTenantId -Scopes 'Application.Read.All' -NoWelcome
$servicePrincipal = $null
for ($i = 0; $i -lt 6; $i++) {
    $servicePrincipal = Get-MgServicePrincipal -Filter "appId eq '$AppId'" -ErrorAction SilentlyContinue
    if ($servicePrincipal) { break }
    Write-Host '   Not visible yet (consent propagation) — waiting 10s...'
    Start-Sleep -Seconds 10
}
if (-not $servicePrincipal) {
    throw "Service principal for app $AppId not found in tenant $CustomerTenantId. Was consent actually granted?"
}
Write-Host "   Found: ObjectId $($servicePrincipal.Id)"

# ---------------------------------------------------------------------------
# 3. Exchange service principal + scoped role group
# ---------------------------------------------------------------------------
Write-Host '== 3/6 Exchange RBAC (sign in as an Exchange admin of the CUSTOMER tenant)' -ForegroundColor Cyan
Connect-ExchangeOnline -Organization $OrganizationDomain -ShowBanner:$false

$exoServicePrincipal = Get-ServicePrincipal -Identity $AppId -ErrorAction SilentlyContinue
if (-not $exoServicePrincipal) {
    $exoServicePrincipal = New-ServicePrincipal -AppId $AppId -ObjectId $servicePrincipal.Id -DisplayName 'TCT Exchange Automation'
    Write-Host '   Created Exchange service principal pointer.'
} else {
    Write-Host '   Exchange service principal already exists (idempotent re-run).'
}

$roleGroup = Get-RoleGroup -Identity $RoleGroupName -ErrorAction SilentlyContinue
if (-not $roleGroup) {
    $roleGroup = New-RoleGroup -Name $RoleGroupName -Roles 'Mail Recipients' `
        -Description 'TCT Exchange Automation runner — scoped to recipient management only (mailbox conversion, delegation, forwarding). Managed by Triple Cities Tech.'
    Write-Host "   Created role group '$RoleGroupName' with the 'Mail Recipients' role."
} else {
    Write-Host "   Role group '$RoleGroupName' already exists (idempotent re-run)."
}

$members = @(Get-RoleGroupMember -Identity $RoleGroupName -ErrorAction SilentlyContinue)
if ($members.Name -notcontains $exoServicePrincipal.Name) {
    Add-RoleGroupMember -Identity $RoleGroupName -Member $exoServicePrincipal.Identity
    Write-Host '   Added the service principal to the role group.'
} else {
    Write-Host '   Service principal is already a member.'
}

# ---------------------------------------------------------------------------
# 4. VERIFY the role actually grants every cmdlet the runbook uses
# ---------------------------------------------------------------------------
Write-Host '== 4/6 Verifying cmdlet coverage of the Mail Recipients role in THIS tenant' -ForegroundColor Cyan
$requiredCmdlets = @(
    'Get-Mailbox', 'Set-Mailbox', 'Get-MailboxStatistics',
    'Add-MailboxPermission', 'Get-MailboxPermission',
    'Add-RecipientPermission', 'Get-RecipientPermission', 'Get-Recipient'
)
$missing = @()
foreach ($cmdlet in $requiredCmdlets) {
    $grantingRoles = @(Get-ManagementRole -Cmdlet $cmdlet -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    if ($grantingRoles -contains 'Mail Recipients') {
        Write-Host "   [OK] $cmdlet"
    } else {
        Write-Host "   [MISSING] $cmdlet — granted by: $($grantingRoles -join ', ')" -ForegroundColor Red
        $missing += $cmdlet
    }
}
if ($missing.Count -gt 0) {
    throw "The 'Mail Recipients' role does not cover: $($missing -join ', '). Add the listed granting role(s) to the '$RoleGroupName' role group (Set-RoleGroup/New-ManagementRoleAssignment) before enabling this tenant — do NOT fall back to Exchange Administrator without a reason."
}
Write-Host '   All required cmdlets are covered by Mail Recipients.' -ForegroundColor Green
Write-Host '   NOTE: role-group changes can take up to ~2 hours to apply to app tokens (RBAC cache).'

# ---------------------------------------------------------------------------
# 5. Register the tenant with the platform
# ---------------------------------------------------------------------------
Write-Host '== 5/6 Registering with the platform' -ForegroundColor Cyan
$secureSecret = Read-Host -Prompt 'Platform MIGRATION_SECRET' -AsSecureString
$plainSecret = [System.Net.NetworkCredential]::new('', $secureSecret).Password
$headers = @{ Authorization = "Bearer $plainSecret" }

$registration = Invoke-RestMethod -Uri "$PlatformBaseUrl/api/hr/exchange-tenants" -Method Post -Headers $headers `
    -ContentType 'application/json' -TimeoutSec 30 -Body (@{
        companySlug        = $CompanySlug
        tenantId           = $CustomerTenantId
        organizationDomain = $OrganizationDomain
        enabled            = $true
        enabledBy          = $EnabledBy
    } | ConvertTo-Json)
Write-Host "   Registered + enabled: $($registration.tenant.companySlug) -> $($registration.tenant.organizationDomain)"

# ---------------------------------------------------------------------------
# 6. End-to-end probe through the real runner
# ---------------------------------------------------------------------------
Write-Host '== 6/6 Dispatching a read-only probe through Azure Automation' -ForegroundColor Cyan
$probe = Invoke-RestMethod -Uri "$PlatformBaseUrl/api/hr/exchange-tenants?action=probe" -Method Post -Headers $headers `
    -ContentType 'application/json' -TimeoutSec 30 -Body (@{ companySlug = $CompanySlug } | ConvertTo-Json)
Write-Host "   Probe job dispatched: $($probe.jobId)"
Write-Host '   Waiting for the result (checks every 30s, up to 10 minutes)...'

$probeResult = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 30
    $tenants = Invoke-RestMethod -Uri "$PlatformBaseUrl/api/hr/exchange-tenants" -Method Get -Headers $headers -TimeoutSec 30
    $tenant = $tenants.tenants | Where-Object { $_.companySlug -eq $CompanySlug }
    if ($tenant -and $tenant.lastProbeAt) { $probeResult = $tenant.lastProbeResult; break }
}

if ($probeResult -and $probeResult.probeOk) {
    Write-Host "TENANT ENABLED AND VERIFIED — probe connected to '$($probeResult.organizationName)'." -ForegroundColor Green
    Write-Host 'Run the pilot checklist in docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md before relying on it for real offboardings.'
} elseif ($probeResult) {
    Write-Warning "Probe FAILED: $($probeResult.error). Common causes: RBAC cache (wait up to 2h and re-probe), consent not granted, wrong OrganizationDomain. The tenant stays registered; re-probe with: Invoke-RestMethod -Uri '$PlatformBaseUrl/api/hr/exchange-tenants?action=probe' -Method Post -Headers @{Authorization='Bearer <MIGRATION_SECRET>'} -ContentType 'application/json' -Body '{`"companySlug`":`"$CompanySlug`"}'"
} else {
    Write-Warning 'No probe result arrived within 10 minutes — check the Azure Automation job log and the platform reconcile cron, then re-probe.'
}
