<#
.SYNOPSIS
    Enable a customer tenant for TCT Exchange Online automation.

.DESCRIPTION
    Per-tenant enablement for the TCT Exchange Automation app (app-only /
    certificate auth per Microsoft Learn "App-only authentication in Exchange
    Online PowerShell"). For each customer tenant this performs:

      1. Prints the admin-consent URL for the multitenant app (an admin in
         the CUSTOMER tenant must open it and accept).
      2. Assigns the Entra directory role (default: Exchange Recipient
         Administrator — least privilege sufficient for Set-Mailbox /
         Add-MailboxPermission / Add-RecipientPermission) to the app's
         service principal IN THE CUSTOMER TENANT.
      3. Optionally verifies by connecting to Exchange Online app-only and
         reading the organization config.

    Run in PowerShell 7.x. Requires the Microsoft.Graph.Identity.Governance,
    Microsoft.Graph.Applications modules, and (for -Verify) the
    ExchangeOnlineManagement module + the app certificate in the current
    user certificate store.

.PARAMETER CustomerTenantId
    The customer tenant's directory (tenant) ID.

.PARAMETER AppId
    Application (client) ID of the TCT Exchange Automation app registration.

.PARAMETER RoleDisplayName
    Entra directory role to assign to the service principal in the customer
    tenant. Default: 'Exchange Recipient Administrator'.

.PARAMETER Organization
    The customer's primary *.onmicrosoft.com domain — only needed with -Verify.

.PARAMETER CertificateThumbprint
    Thumbprint of the app certificate in the current user store — only needed
    with -Verify.

.PARAMETER Verify
    After role assignment, test an app-only Exchange Online connection.

.EXAMPLE
    ./Enable-TenantExoAutomation.ps1 -CustomerTenantId 11111111-2222-3333-4444-555555555555 -AppId 66666666-7777-8888-9999-000000000000

.EXAMPLE
    ./Enable-TenantExoAutomation.ps1 -CustomerTenantId ... -AppId ... -Verify -Organization contoso.onmicrosoft.com -CertificateThumbprint ABC123...
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $CustomerTenantId,
    [Parameter(Mandatory)] [string] $AppId,
    [string] $RoleDisplayName = 'Exchange Recipient Administrator',
    [string] $Organization,
    [string] $CertificateThumbprint,
    [switch] $Verify
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Step 1: admin consent URL (customer admin must open this and accept)
# ---------------------------------------------------------------------------
$consentUrl = "https://login.microsoftonline.com/$CustomerTenantId/adminconsent?client_id=$AppId&scope=https://outlook.office365.com/.default"
Write-Host ''
Write-Host '=== STEP 1: Admin consent (customer tenant) ===' -ForegroundColor Cyan
Write-Host 'Have an admin of the CUSTOMER tenant open and accept:'
Write-Host "  $consentUrl" -ForegroundColor Yellow
Write-Host ''
$answer = Read-Host 'Has admin consent been granted in the customer tenant? (y/N)'
if ($answer -notin @('y', 'Y', 'yes')) {
    Write-Host 'Stopping — re-run this script after consent is granted.' -ForegroundColor Yellow
    return
}

# ---------------------------------------------------------------------------
# Step 2: assign the directory role to the service principal in the tenant
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host "=== STEP 2: Assign '$RoleDisplayName' to the service principal ===" -ForegroundColor Cyan
Import-Module Microsoft.Graph.Applications -ErrorAction Stop
Import-Module Microsoft.Graph.Identity.Governance -ErrorAction Stop

Connect-MgGraph -TenantId $CustomerTenantId -Scopes 'RoleManagement.ReadWrite.Directory', 'Application.Read.All' -NoWelcome

$servicePrincipal = Get-MgServicePrincipal -Filter "appId eq '$AppId'"
if (-not $servicePrincipal) {
    throw "Service principal for app $AppId not found in tenant $CustomerTenantId — admin consent has not completed. Grant consent first."
}
Write-Host "Service principal found: $($servicePrincipal.DisplayName) ($($servicePrincipal.Id))"

# Resolve the role definition at runtime by display name — do not hardcode GUIDs
$roleDefinition = Get-MgRoleManagementDirectoryRoleDefinition -Filter "displayName eq '$RoleDisplayName'"
if (-not $roleDefinition) {
    throw "Directory role '$RoleDisplayName' not found in tenant $CustomerTenantId."
}

$existing = Get-MgRoleManagementDirectoryRoleAssignment -Filter "principalId eq '$($servicePrincipal.Id)' and roleDefinitionId eq '$($roleDefinition.Id)'" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Role assignment already exists — nothing to do." -ForegroundColor Green
}
else {
    New-MgRoleManagementDirectoryRoleAssignment -PrincipalId $servicePrincipal.Id `
        -RoleDefinitionId $roleDefinition.Id -DirectoryScopeId '/' | Out-Null
    Write-Host "Assigned '$RoleDisplayName' to the service principal." -ForegroundColor Green
}
Disconnect-MgGraph | Out-Null

# ---------------------------------------------------------------------------
# Step 3 (optional): verify an app-only Exchange Online connection
# ---------------------------------------------------------------------------
if ($Verify) {
    if (-not $Organization -or -not $CertificateThumbprint) {
        throw '-Verify requires -Organization (<tenant>.onmicrosoft.com) and -CertificateThumbprint.'
    }
    Write-Host ''
    Write-Host '=== STEP 3: Verify app-only Exchange Online connection ===' -ForegroundColor Cyan
    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    try {
        Connect-ExchangeOnline -CertificateThumbprint $CertificateThumbprint -AppId $AppId `
            -Organization $Organization -ShowBanner:$false
        $orgConfig = Get-OrganizationConfig
        Write-Host "Connected app-only to '$($orgConfig.DisplayName)' — tenant is enabled." -ForegroundColor Green
    }
    finally {
        Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
    }
}

Write-Host ''
Write-Host 'DONE. Remember to add the company slug to EXO_ENABLED_TENANTS in Vercel to activate the automation for this tenant.' -ForegroundColor Cyan
