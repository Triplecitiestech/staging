<#
.SYNOPSIS
    TCT Exchange Online offboarding job runner — Azure Automation runbook.

.DESCRIPTION
    Executes the Exchange Online operations that Microsoft Graph cannot:
    converting a user mailbox to a shared mailbox and granting Full Access /
    Send As to delegates. Triggered by an Azure Automation webhook from the
    TCT platform (src/lib/exchange-online.ts), verifies the OBSERVED state
    after acting, and reports the result to the platform callback endpoint
    signed with the per-job HMAC token.

    Runtime: PowerShell 7.2 (Azure Automation runtime environment) with the
    ExchangeOnlineManagement module (v3.2+) imported into the environment.

    Webhook payload (JSON body):
      {
        "jobId":         "<uuid>",
        "action":        "convert_shared_mailbox",
        "organization":  "<tenant>.onmicrosoft.com",
        "mailbox":       "user@customer.com",
        "delegates":     ["manager@customer.com"],
        "sendAs":        true,
        "callbackUrl":   "https://www.triplecitiestech.com/api/webhooks/exo-jobs",
        "callbackToken": "<per-job secret>"
      }

    Automation assets required (see docs/reference/EXO_AUTOMATION.md):
      - Certificate asset  'TCT-EXO-Automation'  (the app's auth certificate, with private key)
      - Variable asset     'TctExoAppId'         (application/client ID of the TCT Exchange Automation app)

.NOTES
    App-only auth per Microsoft Learn "App-only authentication in Exchange
    Online PowerShell": multitenant app + Office 365 Exchange Online >
    Exchange.ManageAsApp permission, admin-consented in each customer tenant,
    with an Exchange role (Exchange Recipient Administrator, or a custom role
    group) assigned to the app's service principal in that tenant.
#>
param(
    [Parameter(Mandatory = $false)]
    [object] $WebhookData
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Callback helper — HMAC-SHA256 signature keyed by the per-job token
# ---------------------------------------------------------------------------
function Send-JobCallback {
    param(
        [Parameter(Mandatory)] [string] $CallbackUrl,
        [Parameter(Mandatory)] [string] $CallbackToken,
        [Parameter(Mandatory)] [hashtable] $Payload
    )
    $body = $Payload | ConvertTo-Json -Depth 6 -Compress
    $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($CallbackToken))
    try {
        $hashBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($body))
    }
    finally {
        $hmac.Dispose()
    }
    $signature = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })

    $delays = @(2, 4, 8)
    for ($attempt = 0; $attempt -le $delays.Count; $attempt++) {
        try {
            Invoke-RestMethod -Uri $CallbackUrl -Method Post -Body $body `
                -ContentType 'application/json' `
                -Headers @{ 'x-exo-signature' = $signature } `
                -TimeoutSec 30 | Out-Null
            Write-Output "Callback delivered (attempt $($attempt + 1))."
            return
        }
        catch {
            Write-Warning "Callback attempt $($attempt + 1) failed: $($_.Exception.Message)"
            if ($attempt -lt $delays.Count) { Start-Sleep -Seconds $delays[$attempt] }
        }
    }
    # Callback delivery failed — the platform will surface the job as still
    # pending; the ticket carries the QUEUED note so a human follows up.
    Write-Error 'Callback delivery failed after all retries.' -ErrorAction Continue
}

# ---------------------------------------------------------------------------
# Parse and validate the webhook payload
# ---------------------------------------------------------------------------
if (-not $WebhookData) {
    throw 'This runbook must be started from its webhook (no WebhookData received).'
}
$requestBody = if ($WebhookData -is [string]) { ($WebhookData | ConvertFrom-Json).RequestBody } else { $WebhookData.RequestBody }
if (-not $requestBody) { throw 'Webhook payload has no RequestBody.' }
$job = $requestBody | ConvertFrom-Json

foreach ($required in @('jobId', 'action', 'organization', 'mailbox', 'callbackUrl', 'callbackToken')) {
    if (-not $job.$required) { throw "Webhook payload is missing required field '$required'." }
}
if ($job.action -ne 'convert_shared_mailbox') {
    throw "Unsupported action '$($job.action)'."
}
$delegates = @($job.delegates | Where-Object { $_ })
$grantSendAs = [bool]$job.sendAs

Write-Output "Job $($job.jobId): convert $($job.mailbox) to shared in $($job.organization); delegates: $($delegates -join ', '); sendAs=$grantSendAs"

$warnings = [System.Collections.Generic.List[string]]::new()
$connected = $false

try {
    # -----------------------------------------------------------------------
    # Connect — app-only certificate auth
    # -----------------------------------------------------------------------
    $certificate = Get-AutomationCertificate -Name 'TCT-EXO-Automation'
    if (-not $certificate) { throw "Automation certificate asset 'TCT-EXO-Automation' not found." }
    $appId = Get-AutomationVariable -Name 'TctExoAppId'
    if (-not $appId) { throw "Automation variable asset 'TctExoAppId' not found." }

    Connect-ExchangeOnline -Certificate $certificate -AppId $appId `
        -Organization $job.organization -ShowBanner:$false -SkipLoadingCmdletHelp
    $connected = $true

    # -----------------------------------------------------------------------
    # Pre-checks
    # -----------------------------------------------------------------------
    $mailbox = Get-Mailbox -Identity $job.mailbox
    $stats = Get-MailboxStatistics -Identity $job.mailbox
    $sizeGb = 0.0
    if ($stats.TotalItemSize -and $stats.TotalItemSize.Value) {
        $sizeGb = [math]::Round($stats.TotalItemSize.Value.ToBytes() / 1GB, 2)
    }
    if ($sizeGb -gt 50) {
        $warnings.Add("Mailbox is $sizeGb GB (> 50 GB) — a license must REMAIN assigned to the shared mailbox or reduce its size first.")
    }
    if ($mailbox.LitigationHoldEnabled) {
        $warnings.Add('Litigation hold is enabled — the shared mailbox must keep an Exchange Online Plan 2 (or Plan 1 + Archiving) license.')
    }

    # -----------------------------------------------------------------------
    # Convert (idempotent) and verify OBSERVED state
    # -----------------------------------------------------------------------
    if ($mailbox.RecipientTypeDetails -eq 'SharedMailbox') {
        $warnings.Add('Mailbox was already a shared mailbox — conversion skipped.')
    }
    else {
        Set-Mailbox -Identity $job.mailbox -Type Shared
    }

    $observedType = $null
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Seconds 15
        $observedType = (Get-Mailbox -Identity $job.mailbox).RecipientTypeDetails
        if ($observedType -eq 'SharedMailbox') { break }
    }
    if ($observedType -ne 'SharedMailbox') {
        throw "Conversion not confirmed: observed RecipientTypeDetails is '$observedType' after waiting."
    }

    # -----------------------------------------------------------------------
    # Grant delegate access (idempotent) and verify
    # -----------------------------------------------------------------------
    $grantedPermissions = [System.Collections.Generic.List[string]]::new()
    foreach ($delegate in $delegates) {
        try {
            Add-MailboxPermission -Identity $job.mailbox -User $delegate `
                -AccessRights FullAccess -AutoMapping $true -ErrorAction Stop | Out-Null
        }
        catch {
            if ($_.Exception.Message -notmatch 'already has|existing permission entry') { throw }
        }
        if ($grantSendAs) {
            try {
                Add-RecipientPermission -Identity $job.mailbox -Trustee $delegate `
                    -AccessRights SendAs -Confirm:$false -ErrorAction Stop | Out-Null
            }
            catch {
                if ($_.Exception.Message -notmatch 'already has|existing permission entry') { throw }
            }
        }

        # Verify the grant is actually visible
        $fullAccess = Get-MailboxPermission -Identity $job.mailbox -User $delegate -ErrorAction SilentlyContinue |
            Where-Object { $_.AccessRights -contains 'FullAccess' }
        if (-not $fullAccess) {
            throw "Full Access grant for '$delegate' was not observed after Add-MailboxPermission."
        }
        $grantedPermissions.Add("$delegate (Full Access$(if ($grantSendAs) { ' + Send As' }))")
    }

    # -----------------------------------------------------------------------
    # Report observed state
    # -----------------------------------------------------------------------
    Send-JobCallback -CallbackUrl $job.callbackUrl -CallbackToken $job.callbackToken -Payload @{
        jobId    = $job.jobId
        ok       = $true
        observed = @{
            recipientType    = $observedType
            permissions      = @($grantedPermissions)
            totalItemSizeGb  = $sizeGb
            litigationHold   = [bool]$mailbox.LitigationHoldEnabled
        }
        warnings = @($warnings)
    }
    Write-Output "Job $($job.jobId) completed: $($job.mailbox) is SharedMailbox; $($grantedPermissions.Count) delegate grant(s)."
}
catch {
    $errorMessage = $_.Exception.Message
    Write-Error "Job $($job.jobId) failed: $errorMessage" -ErrorAction Continue
    Send-JobCallback -CallbackUrl $job.callbackUrl -CallbackToken $job.callbackToken -Payload @{
        jobId    = $job.jobId
        ok       = $false
        error    = $errorMessage
        warnings = @($warnings)
    }
    throw
}
finally {
    if ($connected) {
        Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
    }
}
