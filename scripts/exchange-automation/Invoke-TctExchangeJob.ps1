<#
.SYNOPSIS
    TCT Exchange Automation runbook — executes one Exchange Online job
    dispatched by the platform and reports the OBSERVED result to the
    callback endpoint.

.DESCRIPTION
    Runs in Azure Automation (PowerShell 7.4 runtime) triggered by a webhook.
    See docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md for the full setup.

    Envelope contract (webhook POST body):
      { "payload": "<json string>", "signature": "<hex HMAC-SHA256 of payload>" }
    The payload JSON: { jobId, action, tenantId, organization, targetUpn,
      delegates[{upn,fullAccess,sendAs}], forwardTo?, callbackUrl, issuedAt,
      hrRequestId?, companySlug }

    Actions:
      convert_to_shared — pre-checks, Set-Mailbox -Type Shared, delegate
        grants, then RE-READS everything (RecipientTypeDetails, permissions)
        and reports observed state + a licenseRemovalSafe verdict
        (<50GB, no litigation/in-place holds, no active archive).
      probe — read-only Get-OrganizationConfig connectivity check.

    Honesty rules: success is reported ONLY from re-read state; any partial
    grant is reported as failed with the observed grants attached. The
    callback is signed (x-exo-signature) and retried 2s/4s/8s/16s.

    Automation assets required:
      Certificate 'TctExchangeAutomation'   — auth cert (private key)
      Variable    'TctExoAppId'             — app registration client id
      Variable    'TctExoDispatchSecret'    — encrypted; verifies inbound envelope
      Variable    'TctExoCallbackSecret'    — encrypted; signs the callback

.NOTES
    PowerShell 7.x. Requires ExchangeOnlineManagement (plus PowerShellGet and
    PackageManagement uploaded to the same runtime environment — documented
    Azure Automation requirement for EXO module v3+).
#>

param(
    [Parameter(Mandatory = $false)]
    [object]$WebhookData
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Get-HmacSha256Hex {
    param([string]$Message, [string]$Secret)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
    try {
        $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Message))
        return ([System.BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
    } finally {
        $hmac.Dispose()
    }
}

function Test-FixedTimeEqual {
    param([string]$A, [string]$B)
    if ($null -eq $A -or $null -eq $B -or $A.Length -ne $B.Length) { return $false }
    $diff = 0
    for ($i = 0; $i -lt $A.Length; $i++) { $diff = $diff -bor ([int][char]$A[$i] -bxor [int][char]$B[$i]) }
    return $diff -eq 0
}

function Send-Callback {
    param([string]$CallbackUrl, [hashtable]$Body, [string]$Secret)
    $json = $Body | ConvertTo-Json -Depth 10 -Compress
    $signature = Get-HmacSha256Hex -Message $json -Secret $Secret
    $delays = @(2, 4, 8, 16)
    for ($attempt = 0; $attempt -le $delays.Count; $attempt++) {
        try {
            Invoke-RestMethod -Uri $CallbackUrl -Method Post -Body $json `
                -ContentType 'application/json' `
                -Headers @{ 'x-exo-signature' = $signature } `
                -TimeoutSec 30 | Out-Null
            Write-Output "Callback delivered (attempt $($attempt + 1))"
            return $true
        } catch {
            $status = $_.Exception.Response.StatusCode.value__
            Write-Warning "Callback attempt $($attempt + 1) failed (HTTP $status): $($_.Exception.Message)"
            # 401/404 = signature/config problem — retrying cannot help
            if ($status -in @(400, 401, 404)) { return $false }
            if ($attempt -lt $delays.Count) { Start-Sleep -Seconds $delays[$attempt] }
        }
    }
    return $false
}

function Get-MailboxSizeBytes {
    param($MailboxStatistics)
    # TotalItemSize.Value renders like "1.23 GB (1,320,702,444 bytes)"
    $raw = $MailboxStatistics.TotalItemSize.ToString()
    if ($raw -match '\(([\d,]+)\s*bytes\)') { return [int64]($Matches[1] -replace ',', '') }
    return $null
}

# ---------------------------------------------------------------------------
# 1. Parse + authenticate the webhook envelope
# ---------------------------------------------------------------------------

if (-not $WebhookData) { throw 'This runbook must be started by its webhook (WebhookData missing).' }

# Azure Automation sometimes hands PS7 runbooks WebhookData as a JSON string
# instead of an object — normalize before use.
if ($WebhookData -is [string]) { $WebhookData = $WebhookData | ConvertFrom-Json }
$requestBody = $WebhookData.RequestBody
if (-not $requestBody) { throw 'Webhook request body is empty.' }

$envelope = $requestBody | ConvertFrom-Json
if (-not $envelope.payload -or -not $envelope.signature) { throw 'Envelope must contain payload and signature.' }

$dispatchSecret = Get-AutomationVariable -Name 'TctExoDispatchSecret'
$expectedSignature = Get-HmacSha256Hex -Message $envelope.payload -Secret $dispatchSecret
if (-not (Test-FixedTimeEqual -A $envelope.signature.ToLowerInvariant() -B $expectedSignature)) {
    throw 'Envelope signature verification FAILED — dropping job (possible forgery or secret mismatch).'
}

$job = $envelope.payload | ConvertFrom-Json
Write-Output "Job $($job.jobId): action=$($job.action) org=$($job.organization)"

$issuedAt = [DateTimeOffset]::Parse($job.issuedAt)
$ageMinutes = ([DateTimeOffset]::UtcNow - $issuedAt).TotalMinutes
if ([Math]::Abs($ageMinutes) -gt 15) {
    throw "Job issuedAt is $([int]$ageMinutes) minutes old — outside the 15-minute replay window; dropping."
}

$callbackSecret = Get-AutomationVariable -Name 'TctExoCallbackSecret'
$appId = Get-AutomationVariable -Name 'TctExoAppId'
$startedAt = [DateTimeOffset]::UtcNow.ToString('o')

$result = @{
    jobId      = $job.jobId
    status     = 'failed'
    observed   = $null
    error      = $null
    azureJobId = $env:AUTOMATION_JOB_ID
    startedAt  = $startedAt
    finishedAt = $null
}

# ---------------------------------------------------------------------------
# 2. Connect and execute
# ---------------------------------------------------------------------------

$connected = $false
try {
    $certificate = Get-AutomationCertificate -Name 'TctExchangeAutomation'
    if (-not $certificate) { throw "Automation certificate asset 'TctExchangeAutomation' not found." }

    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    Connect-ExchangeOnline -Certificate $certificate -AppId $appId `
        -Organization $job.organization -ShowBanner:$false -ErrorAction Stop
    $connected = $true
    Write-Output "Connected to $($job.organization) app-only."

    switch ($job.action) {

        'probe' {
            $org = Get-OrganizationConfig -ErrorAction Stop
            $result.observed = @{ probeOk = $true; organizationName = $org.DisplayName }
            $result.status = 'succeeded'
        }

        'convert_to_shared' {
            if (-not $job.targetUpn) { throw 'targetUpn is required for convert_to_shared.' }

            # --- Pre-checks -------------------------------------------------
            $mailbox = Get-Mailbox -Identity $job.targetUpn -ErrorAction Stop
            $stats = Get-MailboxStatistics -Identity $job.targetUpn -ErrorAction Stop
            $sizeBytes = Get-MailboxSizeBytes -MailboxStatistics $stats
            $litigationHold = [bool]$mailbox.LitigationHoldEnabled
            $inPlaceHoldCount = @($mailbox.InPlaceHolds).Count
            $archiveActive = $mailbox.ArchiveStatus -eq 'Active' -or $mailbox.ArchiveState -eq 'Local'

            # --- Convert (idempotent) --------------------------------------
            if ($mailbox.RecipientTypeDetails -ne 'SharedMailbox') {
                Set-Mailbox -Identity $job.targetUpn -Type Shared -ErrorAction Stop
                Write-Output 'Set-Mailbox -Type Shared issued; polling for the conversion to take effect...'
            } else {
                Write-Output 'Mailbox is already a SharedMailbox (idempotent re-run).'
            }

            # --- Observe: poll until the directory reflects SharedMailbox ---
            $observedType = $null
            for ($i = 0; $i -lt 10; $i++) {
                $observedType = (Get-Mailbox -Identity $job.targetUpn -ErrorAction Stop).RecipientTypeDetails
                if ($observedType -eq 'SharedMailbox') { break }
                Start-Sleep -Seconds 15
            }
            if ($observedType -ne 'SharedMailbox') {
                throw "Conversion did not take effect within the polling window (observed: $observedType)."
            }

            # --- Delegate grants -------------------------------------------
            $grantErrors = @()
            foreach ($delegate in @($job.delegates)) {
                if (-not $delegate.upn) { continue }
                if ($delegate.fullAccess) {
                    try {
                        Add-MailboxPermission -Identity $job.targetUpn -User $delegate.upn `
                            -AccessRights FullAccess -InheritanceType All -AutoMapping $true `
                            -ErrorAction Stop -WarningAction SilentlyContinue | Out-Null
                    } catch {
                        if ($_.Exception.Message -notmatch 'already has|existing permission') {
                            $grantErrors += "FullAccess for $($delegate.upn): $($_.Exception.Message)"
                        }
                    }
                }
                if ($delegate.sendAs) {
                    try {
                        Add-RecipientPermission -Identity $job.targetUpn -Trustee $delegate.upn `
                            -AccessRights SendAs -Confirm:$false -ErrorAction Stop | Out-Null
                    } catch {
                        if ($_.Exception.Message -notmatch 'already has|existing permission') {
                            $grantErrors += "SendAs for $($delegate.upn): $($_.Exception.Message)"
                        }
                    }
                }
            }

            # --- Observe grants (re-read, never assume) ---------------------
            $fullAccessGrants = @(Get-MailboxPermission -Identity $job.targetUpn -ErrorAction Stop |
                Where-Object { $_.AccessRights -contains 'FullAccess' -and -not $_.Deny })
            $sendAsGrants = @(Get-RecipientPermission -Identity $job.targetUpn -ErrorAction Stop |
                Where-Object { $_.AccessRights -contains 'SendAs' })

            $observedGrants = @()
            foreach ($delegate in @($job.delegates)) {
                if (-not $delegate.upn) { continue }
                $delegateRecipient = $null
                try { $delegateRecipient = Get-Recipient -Identity $delegate.upn -ErrorAction Stop } catch { }
                $names = @($delegate.upn)
                if ($delegateRecipient) {
                    $names += $delegateRecipient.Name
                    $names += $delegateRecipient.DistinguishedName
                    $names += $delegateRecipient.PrimarySmtpAddress.ToString()
                }
                $hasFullAccess = [bool]($fullAccessGrants | Where-Object { $names -contains $_.User.ToString() -or $_.User.ToString() -in $names })
                $hasSendAs = [bool]($sendAsGrants | Where-Object { $names -contains $_.Trustee.ToString() -or $_.Trustee.ToString() -in $names })
                $observedGrants += @{ upn = $delegate.upn; fullAccess = $hasFullAccess; sendAs = $hasSendAs }
            }

            # --- License-removal safety verdict -----------------------------
            $retainReasons = @()
            $fiftyGb = 50GB
            if ($null -eq $sizeBytes) { $retainReasons += 'mailbox size could not be determined' }
            elseif ($sizeBytes -ge $fiftyGb) { $retainReasons += "mailbox is $([Math]::Round($sizeBytes / 1GB, 1)) GB (unlicensed shared mailboxes are limited to 50 GB)" }
            if ($litigationHold) { $retainReasons += 'litigation hold is enabled (requires a license)' }
            if ($inPlaceHoldCount -gt 0) { $retainReasons += "$inPlaceHoldCount in-place hold(s) present (requires a license)" }
            if ($archiveActive) { $retainReasons += 'online archive is active (requires a license)' }

            $result.observed = @{
                recipientTypeDetails = $observedType
                grants               = $observedGrants
                mailboxSizeBytes     = $sizeBytes
                litigationHold       = $litigationHold
                inPlaceHoldCount     = $inPlaceHoldCount
                archiveActive        = $archiveActive
                licenseRemovalSafe   = ($retainReasons.Count -eq 0)
                licenseRetainReasons = $retainReasons
            }

            if ($grantErrors.Count -gt 0) {
                # Partial success is reported as FAILURE with observed state so
                # the platform can render exactly what did and didn't happen.
                $result.error = "grant errors: $($grantErrors -join '; ')"
                $result.status = 'failed'
            } else {
                $result.status = 'succeeded'
            }
        }

        default { throw "Unknown action '$($job.action)'." }
    }
} catch {
    $result.status = 'failed'
    $result.error = $_.Exception.Message
    Write-Warning "Job failed: $($_.Exception.Message)"
} finally {
    if ($connected) {
        try { Disconnect-ExchangeOnline -Confirm:$false | Out-Null } catch { }
    }
}

# ---------------------------------------------------------------------------
# 3. Report the result — ALWAYS, success or failure
# ---------------------------------------------------------------------------

$result.finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
$delivered = Send-Callback -CallbackUrl $job.callbackUrl -Body $result -Secret $callbackSecret
if (-not $delivered) {
    # Fail the Azure job loudly; the platform's reconcile cron will time the
    # job out and route it to manual follow-up.
    throw "Callback delivery failed after retries. Result was: $($result | ConvertTo-Json -Depth 10 -Compress)"
}
Write-Output "Job $($job.jobId) finished: $($result.status)"
