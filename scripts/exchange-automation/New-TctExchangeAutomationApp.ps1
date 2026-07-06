<#
.SYNOPSIS
    One-time TCT-side setup: creates the "TCT Exchange Automation" multi-tenant
    Entra app registration with the Exchange.ManageAsApp application permission
    and a certificate credential.

.DESCRIPTION
    Run ONCE in the TCT tenant by an operator who can create app registrations
    (PowerShell 7, Windows — certificate generation uses the machine cert
    store). Produces:
      - a self-signed certificate (.cer public / .pfx private, password set here)
      - the app registration (multi-tenant) with Exchange.ManageAsApp configured
      - the per-customer admin-consent URL template

    After this script: upload the .pfx to the Azure Automation account as the
    certificate asset 'TctExchangeAutomation', and grant admin consent in each
    customer tenant via Enable-TctExchangeTenant.ps1.
    Full sequence: docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md

.EXAMPLE
    pwsh ./New-TctExchangeAutomationApp.ps1 -OutputFolder C:\Secure\ExoAutomation
#>

#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputFolder,

    [string]$AppDisplayName = 'TCT Exchange Automation',

    [int]$CertificateValidYears = 2
)

$ErrorActionPreference = 'Stop'

if (-not $IsWindows) {
    throw 'Run this on Windows: certificate generation uses New-SelfSignedCertificate (CSP provider — CNG certificates are not supported for Exchange app-only auth).'
}
foreach ($module in @('Microsoft.Graph.Applications')) {
    if (-not (Get-Module -ListAvailable -Name $module)) {
        throw "Module $module is required. Install it first: Install-Module $module -Scope CurrentUser"
    }
}
New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null

# ---------------------------------------------------------------------------
# 1. Certificate (CSP key provider — required; CNG is NOT supported)
# ---------------------------------------------------------------------------
Write-Host "== 1/4 Creating self-signed certificate ($CertificateValidYears years)" -ForegroundColor Cyan
$certificate = New-SelfSignedCertificate `
    -DnsName 'exchange-automation.triplecitiestech.com' `
    -CertStoreLocation 'cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears($CertificateValidYears) `
    -KeySpec KeyExchange `
    -FriendlyName $AppDisplayName

$pfxPassword = Read-Host -Prompt 'Choose a password for the exported .pfx (needed once, when uploading to Azure Automation)' -AsSecureString
$cerPath = Join-Path $OutputFolder 'TctExchangeAutomation.cer'
$pfxPath = Join-Path $OutputFolder 'TctExchangeAutomation.pfx'
$certificate | Export-Certificate -FilePath $cerPath -Force | Out-Null
$certificate | Export-PfxCertificate -FilePath $pfxPath -Password $pfxPassword -Force | Out-Null
Write-Host "   Public cert: $cerPath"
Write-Host "   Private key: $pfxPath  (upload to Azure Automation, then DELETE this file)"
Write-Host "   Thumbprint : $($certificate.Thumbprint)"
Write-Host "   Expires    : $($certificate.NotAfter.ToString('yyyy-MM-dd')) — diary the rotation!"

# ---------------------------------------------------------------------------
# 2. App registration (multi-tenant) + Exchange.ManageAsApp
# ---------------------------------------------------------------------------
Write-Host '== 2/4 Creating the app registration (sign in with a TCT admin able to create apps)' -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Application.ReadWrite.All' -NoWelcome

# Office 365 Exchange Online resource / Exchange.ManageAsApp application role —
# ids are fixed, documented values (learn.microsoft.com app-only-auth-powershell-v2)
$requiredResourceAccess = @(
    @{
        ResourceAppId  = '00000002-0000-0ff1-ce00-000000000000'
        ResourceAccess = @(@{ Id = 'dc50a0fb-09a3-484d-be87-e023b12c6440'; Type = 'Role' })
    }
)

$existing = Get-MgApplication -Filter "displayName eq '$AppDisplayName'" -ErrorAction SilentlyContinue
if ($existing) {
    throw "An application named '$AppDisplayName' already exists (AppId $($existing.AppId)). Refusing to create a duplicate — investigate first."
}

$app = New-MgApplication `
    -DisplayName $AppDisplayName `
    -SignInAudience 'AzureADMultipleOrgs' `
    -RequiredResourceAccess $requiredResourceAccess `
    -Notes 'Executes Exchange Online offboarding operations (mailbox conversion, delegation, forwarding) for the TCT platform via Azure Automation. Certificate auth only. Scoped per customer tenant to a custom role group with the Mail Recipients role.'

Write-Host "   AppId (client id): $($app.AppId)"

# ---------------------------------------------------------------------------
# 3. Attach the certificate + create the TCT-tenant service principal
# ---------------------------------------------------------------------------
Write-Host '== 3/4 Attaching certificate to the app' -ForegroundColor Cyan
Update-MgApplication -ApplicationId $app.Id -KeyCredentials @(
    @{
        Type        = 'AsymmetricX509Cert'
        Usage       = 'Verify'
        Key         = $certificate.RawData
        DisplayName = "TctExchangeAutomation $($certificate.NotAfter.ToString('yyyy-MM-dd'))"
    }
)
New-MgServicePrincipal -AppId $app.AppId | Out-Null

# ---------------------------------------------------------------------------
# 4. Output the operator hand-off
# ---------------------------------------------------------------------------
Write-Host '== 4/4 Done. Record these values:' -ForegroundColor Green
[pscustomobject]@{
    AppId                 = $app.AppId
    CertificateThumbprint = $certificate.Thumbprint
    CertificateExpires    = $certificate.NotAfter.ToString('yyyy-MM-dd')
    PfxPath               = $pfxPath
    ConsentUrlTemplate    = "https://login.microsoftonline.com/<CUSTOMER-TENANT-ID>/adminconsent?client_id=$($app.AppId)&scope=https://outlook.office365.com/.default"
} | Format-List

Write-Host @"
NEXT STEPS (docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md has the full numbered list):
 1. Upload $pfxPath to the Azure Automation account as certificate asset 'TctExchangeAutomation', then delete the .pfx.
 2. Create Automation variable 'TctExoAppId' = $($app.AppId) (not encrypted).
 3. For each customer tenant, run Enable-TctExchangeTenant.ps1.
"@ -ForegroundColor Yellow
