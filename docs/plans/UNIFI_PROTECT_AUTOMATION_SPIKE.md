# UniFi Protect Automation — Reconnaissance & Design Spike

*Spike run 2026-08-06. Read-only reconnaissance. No MCP tool was registered, no tool
registry was modified, no PR was opened, no client console was touched.*

**Scope:** feasibility of a multi-tenant UniFi Protect automation capability (~85 client
networks) reached exclusively through the Ubiquiti Cloud Connector Proxy, with no
direct-to-console path and no always-on on-premise listener. TCT office console
(Protect **7.1.87**) is the reference/test bed.

Companion artifact: the complete official Protect 7.1.87 OpenAPI document is captured at
`docs/vendor-api/unifi-protect/openapi.json` (provenance + extraction command in
`SOURCE.md`). Every "the official API does / does not have X" claim below is checkable
against that file.

---

## 0 · Read this first — what this spike could and could not do

Three of the seven tasks required actions this session **could not perform**, for two
distinct reasons. Neither is a research dead end; both are unblocked by the owner in
minutes. Everything that could be settled from the vendor's own machine-readable spec
and product documentation **was** settled, and is reported with citations.

| Blocked task | Why | Unblocked by |
|---|---|---|
| **1 · Capture the webhook payload** | Creating an alarm in Alarm Manager is a **UI-only action** in the Protect web app behind the owner's UI SSO. There is no API to create an alarm (proven in §7a). This session has no browser session on unifi.ui.com. | Owner performs §1c (≈4 min) |
| **3 · Credential scope** (live test) | No `UBIQUITI_API_KEY` in this container, and **organization policy forbids pasting credentials into the conversation**, so the project's usual "ask the operator to paste it for a one-off" convention does not apply here. `api.ui.com` itself **is** reachable from this container (`GET https://api.ui.com/v1/hosts` with a bogus key → `401 {"code":"unauthorized",…}`), so only the credential is missing, not the network path. | Owner runs §3b (2 commands) |
| **4 · `GET /v1/cameras` live output** | Same credential constraint, and additionally gated on the §3 answer. | Owner runs §4b (1 command) |

**Consequence for the verdict table:** rows marked *(schema-proven)* are settled from the
vendor's spec and hold regardless. Rows marked *(needs live run)* are predictions with the
exact command that confirms or refutes them. Nothing below is presented as captured that
was not captured.

---

## 1 · Verdict per capability

| # | Capability | Verdict |
|---|---|---|
| 1 | **Webhook carries the plate string** | **UNKNOWN — must be captured.** Vendor documents exactly one payload example (a *motion* trigger); it contains no plate, no camera id, no confidence. No documented ID-Recognition example exists anywhere. §1c is the capture procedure. **This single unknown decides the whole design.** |
| 2 | **Plate roster manageable by API** | **NO — no roster exists in the Protect API at all** *(schema-proven)*. All 66 occurrences of `licensePlate` in the 7.1.87 spec are the same enum value in a detection-type list. The only documented plate roster in the UniFi ecosystem is a **UniFi Access user credential**, requiring an Access Control Hub. **Recommendation: don't use theirs — hold the roster ourselves** (§7c). That converts "add an authorized vehicle" from a site visit into an API call. |
| 3 | **Org Site Manager key reaches Protect via the proxy** | **UNRESOLVED — untestable here, and undocumented either way** *(needs live run)*. The Cloud Connector Proxy path this codebase already uses is **absent from the published Site Manager spec entirely**, so the vendor documents no answer. Empirical test in §3b. A **fallback that needs no new credential exists and is proven** (§3d). |
| 4 | **LPR hardware requirement** | **NOT "any AI camera."** Native LPR = **G6/AI series only, excluding 360 models**. G5/G4/G3/ONVIF require an **AI Port** (real-time) or **AI Key** (async, G4/G5 only). AI Port is **not compatible with AI-series cameras**. Fleet is qualifiable centrally *(schema-proven, §4c)*. |
| 5 | **Private API answers retrospective questions** | **YES, technically — and it is the only surface carrying the plate string.** But its auth is a **UniFi OS username/password login producing a session cookie + CSRF token, direct to the console**, which violates two hard constraints at once. **Recommend against.** §5. |
| 6 | **Attribute search (clothing colour etc.)** | **Exists in the product, UI-only, and requires an AI Key.** **No API surface exposes it** — the official spec has no search endpoint of any kind (0 of 54 paths) *(schema-proven)*. The attributes themselves exist in private-API event metadata (§6b). |
| 7 | **Per-client onboarding** | **8 manual steps per site, all in the Protect UI, none automatable** — because Alarm Manager has no CRUD API *(schema-proven)*. Falls to **3 steps** for a site whose cameras are already LPR-enabled. Design in §7. |

---

## 2 · Task 1 — Webhook payload

### 1a · What the vendor documents (verbatim)

Source: help.ui.com article **25478744592023**, "Send UniFi Protect Alerts to Web Services
using Webhooks", **updated 2026-08-05** (retrieved via the Zendesk Help Center JSON API —
`https://help.ui.com/api/v2/help_center/en-us/articles/25478744592023.json`; the HTML page
returns **403** to non-browser clients, which is why the JSON API was used).

> **Advanced Settings**
> By default, the webhook will create an HTTP GET request each time an alarm is triggered.
> For advanced cases, use the Advanced Settings:
> - HTTP GET allows custom headers for security tokens or other additional information.
> - HTTP POST delivers additional information about the alarm to your service.
> - Here is an example of the HTTP POST structure:

```json
{
  "alarm": {
    "name": "test post",
    "sources": [],
    "conditions": [
      {
        "condition": {
          "type": "is",
          "source": "motion"
        }
      }
    ],
    "triggers": [
      {
        "key": "motion",
        "device": "74ACB99F4E24"
      }
    ]
  },
  "timestamp": 1722526793954
}
```

**Complete field list as documented** — this is the whole body, there is nothing omitted:

| Field | Type | Value in example | Notes |
|---|---|---|---|
| `alarm.name` | string | `"test post"` | The alarm's name in Protect. **Operator-controlled — the only field we can inject meaning into.** |
| `alarm.sources` | array | `[]` | Empty in the only published example. Contents unknown. |
| `alarm.conditions[].condition.type` | string | `"is"` | |
| `alarm.conditions[].condition.source` | string | `"motion"` | Mirrors the trigger type. |
| `alarm.triggers[].key` | string | `"motion"` | The trigger type that fired. |
| `alarm.triggers[].device` | string | `"74ACB99F4E24"` | **A MAC address, not a Protect camera id.** See below. |
| `timestamp` | number | `1722526793954` | Unix epoch **milliseconds**. |

### 1b · What this settles, and what it does not

Answering the brief's explicit questions **for the documented motion payload**:

| Does it carry… | Answer |
|---|---|
| the plate string | **No** (motion trigger — a plate trigger is unknown) |
| camera id | **No — it carries a MAC address**, `triggers[].device`. Not the Protect camera `id`. |
| event timestamp | **Yes** — `timestamp`, Unix ms, at the alarm level (not per-trigger) |
| detection confidence | **No** |
| object attributes | **No** |

Three consequences that hold **whatever** the plate trigger turns out to send, because they
follow from the payload's *structure*:

1. **There is no console id, no site id, and no customer identifier anywhere in the body.**
   In a ~85-tenant deployment a bare POST is therefore **unattributable from its content
   alone**. Tenant identity must come from the URL (a per-site path token) — the payload
   cannot supply it. This is a hard design input, not a preference.
2. **`device` is a MAC**, so joining a webhook to a camera requires a MAC→camera map.
   Conveniently, both available inventory surfaces key on MAC: `/v1/cameras` returns `mac`
   alongside `id` (§4a), and Site Manager `/v1/devices` returns `mac` + `hostId` (§3d).
   MACs are globally unique, so this doubles as a **cross-check** on the URL token.
3. **POST is not the default — GET is.** "By default, the webhook will create an HTTP GET
   request." Selecting POST is an explicit per-alarm step in Advanced Settings, and it is
   the step most likely to be missed during onboarding. Note the article guarantees custom
   headers only for **GET** ("HTTP GET allows custom headers"); it does not say POST
   supports them. Do not design authentication around a POST header (§7d).

### 1c · Capture procedure — owner action required (≈4 minutes)

The brief is right that this must be captured, not assumed. It could not be done here: the
alarm must be created in the Protect UI, and **there is no API to create one** (§7a).

1. Open a capture endpoint: go to `https://webhook.site` and copy the unique URL it shows.
   (Vendor-endorsed for exactly this — the Alarm Manager article's Best Practices say
   "Test webhooks with basic tools like Slack or request bin before deploying in production.")
2. Go to `https://unifi.ui.com` → TCT office console → **Protect** → **Alarm Manager** →
   **Create Alarm**.
3. **Trigger:** choose the **ID Recognition** category → **License Plate**. Note on the way
   through whether the trigger offers a *specific plate / known-plate* selector or only
   "any plate" — **this is the Task 2 answer** (§3 of that section) and it is visible on
   this screen.
4. **Scope:** select the AI camera only.
5. **Action:** Add action → **Webhook** → **Custom Webhook** → paste the webhook.site URL.
6. **Advanced Settings: switch the method from GET to POST.** Without this you get a bare
   GET with no body and the capture is worthless.
7. Save. Drive a vehicle past the camera (or hold a plate in frame).
8. Copy the **raw request body** from webhook.site verbatim.
9. **Delete the test alarm.**

Paste the raw body back and the design in §7 resolves to branch A or branch B immediately.

**What to look for in the captured body**, in priority order:
- Any field containing the plate characters → **branch A**, the whole capability is viable.
- `alarm.triggers[].key` value for a plate trigger (probably `licensePlate`, unverified).
- Whether `alarm.conditions[].condition` gains a `value`/`name` field naming a specific
  plate — that would prove the trigger can be filtered to a known plate.
- Whether `alarm.sources[]` is still `[]` or now names the camera.
- Any `confidence` / `score`.

---

## 3 · Task 2 — Plate list management (gates multi-tenant viability)

### 2a · The official API has no plate roster. At all.

*Schema-proven.* Every occurrence of the string `licensePlate` in the entire Protect 7.1.87
spec — **66 of 66** — is the same enum member repeated across schema copies:

```
"enum": ["person", "vehicle", "package", "licensePlate", "face", "animal"]
```

appearing only in `featureFlags.smartDetectTypes`, `smartDetectSettings.objectTypes`, and
the `smartDetectTypes` array on the three smart-detect event variants. Grouped by owning
operation, the hits are: `/v1/subscribe/devices` (8), `/v1/subscribe/events` (6),
`/v1/cameras` + `/v1/cameras/{id}` GET/PATCH (7), and the rest are `components/schemas`
copies of those same objects.

**There is no plate entity, no roster collection, no "known vehicle" object, no
create/read/update/delete of a plate anywhere in the 54 paths.** Nor is there any
`/v1/plates`-shaped path. The nearest identity endpoints, `/v1/ulp-users` and `/v1/users`,
carry no plate field:

```
/v1/ulp-users  "Get all identity users" → firstName, fullName, id, lastName, modelKey, status
/v1/users      "Get all users"          → email, firstName, id, lastName, modelKey, name, ucoreUserId
```

### 2b · The private API has no roster either

The two most complete reverse-engineered implementations both model plates **only as a
read-only property of a detection event**, never as a manageable list. Searching
`uiprotect` 15.14.2 (PyPI, downloaded and inspected) for `known.?plate|plate.?list|licensePlates|/plates`
returns **zero** matches. `unifi-protect` 5.2.0 (npm) exposes plates only as
`metadata.licensePlate` on an event and as NVR-level *feature toggles*
(`aiFeatureSettings.licensePlateRecognitionSettings`, `smartDetection.licensePlateRecognition`)
— switches for whether LPR runs, not a list of plates.

### 2c · Where a plate roster *does* live in the UniFi ecosystem

Only in **UniFi Access**, as a per-user credential. Source: help.ui.com **23903814413335**,
"Configuring License Plate Unlock in UniFi Access" (updated 2026-07-26), verbatim:

> **Assigning License Plate Numbers to Users**
> - Navigate to Access application > People > select a user > Settings > Credentials > License Plate > +.
> - Enter the plate number and click Add.

That path is gated on substantial hardware and versions the article lists as **Requirements**:
UniFi OS 4.4.9+, **Access application 4.1.15+**, Protect 6.2+, and an Access Control Hub —
Gate Hub (UA-Hub-Gate), Door Hub (UA-Hub-Door), or Enterprise Access Hub (EAH-8) — with
cameras "connected directly to the Access Control Hub's PoE ports and paired with the hub."

**This is not a viable multi-tenant path.** It requires selling every client a UniFi Access
deployment to get a plate list. And `https://developer.ui.com/access/` returns **404** —
there is no published UniFi Access Integration API, so even with the hardware the roster
would still not be API-manageable.

### 2d · Whether Protect itself has a UI-only known-plate list — cannot be determined

The Alarm Manager article (**27721287753239**, updated 2026-07-23) lists Protect's trigger
categories and states verbatim:

> **ID Recognition:** Known/unknown faces, license plates, persons of interest.

So Protect clearly has a **known vs unknown** notion for plates. But the help center
documents **no Protect page for managing that list** — targeted searches for
`known license plates`, `ID Recognition`, `manage license plate list Protect`, and
`vehicle profile Protect` return only the Access articles above plus the two capability
overviews. **Cannot be determined from documentation whether Protect has its own
UI-managed plate roster.**

**What would prove it:** step 3 of the capture procedure (§1c). When the ID Recognition →
License Plate trigger is selected, the UI either offers a plate/known-plate selector (roster
exists) or only "any plate" (it does not). One screen, zero risk. *(Attempts to read
community.ui.com threads on this failed — it is a client-rendered SPA that returns a 1,842-byte
JS shell to both `curl` and WebFetch. Branch stopped rather than guessed at.)*

### 2e · Recommendation — hold the roster ourselves

**Do not depend on any vendor roster, even if §2d finds one.** Configure each site's alarm
to fire on **any** plate detection, and do the matching in TCT's own database.

| | Vendor roster (if it exists) | **TCT-side roster (recommended)** |
|---|---|---|
| Add an authorized vehicle | Log into that client's console, edit an alarm or an Access user → **a support ticket** | `INSERT` via an MCP tool → **an API call** |
| Alarms per site | Potentially one per plate | **Exactly one, forever** |
| Works without UniFi Access | Unknown | Yes |
| Survives a vendor UI change | No | Yes |
| Cross-client plate search | Impossible | Trivial |

This inverts the gating question. The brief asks whether adding a vehicle is a support
ticket or an API call; the answer is that it is a support ticket **only if we let the
vendor own the list**. The one thing that must come from Protect is the **plate string on
the wire** — which is exactly what §1c settles.

---

## 4 · Task 3 — Credential scope

### 3a · What is established

- **Site Manager API auth is `X-API-Key` in the header.** From the Site Manager v1.0.0 spec,
  `components.securitySchemes`:
  ```json
  {"site-manager-api-key": {"in": "header", "name": "X-API-Key", "type": "apiKey"}}
  ```
- **The key is org-scoped.** developer.ui.com Protect *Getting Started*, verbatim: "An API
  Key serves as a unique identifier used to authenticate API requests… **Each key is linked
  to the specific organization or UI account that generated it**."
- **Protect's own API is local-per-console.** Same page: "Each UniFi Application has its own
  API endpoints running locally on each site." The Protect spec declares
  `servers: [{"url": "/integration"}]` — a console-relative path, no host.
- **The Cloud Connector Proxy is undocumented.** The published Site Manager v1.0.0 spec has
  **9 paths** — `/v1/hosts`, `/v1/hosts/{id}`, `/v1/sites`, `/v1/devices`,
  `/v1/isp-metrics/{type}`(+`/query`), `/v1/sd-wan-configs`(+`/{id}`,`/{id}/status`) — and
  **zero occurrences of the string `proxy`**. The path this codebase depends on today
  (`src/lib/ubiquiti-proxy.ts:252`) is not in it:
  ```
  `${baseUrl}/v1/connector/consoles/${consoleId}/proxy/network/integration/v1${path}`
  ```
  The spec's only trace of the feature is `tags[0].name = "cloud-connector"`.

**Therefore the vendor documents no answer to this question in either direction**, and the
brief's instruction to test empirically is the only way to settle it.

### 3b · The empirical test — owner action required (2 commands)

Run in PowerShell 7.x. Substitute a real console id (any from
`https://api.ui.com/v1/hosts`, or read one out of an existing `unifi_resolve_site` result).

```powershell
$key     = '<UBIQUITI_API_KEY>'          # do not paste this into chat
$console = '<consoleId>'
$h = @{ 'X-API-Key' = $key }

# CONTROL — known-good Network path. Must return 200. If this fails, the key or
# console id is wrong and the Protect result below means nothing.
Invoke-WebRequest -Method GET -Headers $h -SkipHttpErrorCheck `
  "https://api.ui.com/v1/connector/consoles/$console/proxy/network/integration/v1/sites" |
  Select-Object StatusCode, @{n='body';e={$_.Content.Substring(0,[Math]::Min(300,$_.Content.Length))}}

# THE TEST — same grammar, protect substituted for network. /v1/meta/info is the
# smallest Protect endpoint and returns applicationVersion, so a 200 both proves
# reachability and confirms the firmware in one call.
Invoke-WebRequest -Method GET -Headers $h -SkipHttpErrorCheck `
  "https://api.ui.com/v1/connector/consoles/$console/proxy/protect/integration/v1/meta/info" |
  Select-Object StatusCode, @{n='body';e={$_.Content.Substring(0,[Math]::Min(300,$_.Content.Length))}}
```

If the second 404s, try the two other plausible groupings before concluding — the `network`
path interleaves the app name and the `/integration` prefix, and Protect's spec puts `/v1`
*after* `/integration`, so the ordering is worth probing:

```powershell
"https://api.ui.com/v1/connector/consoles/$console/proxy/protect/v1/meta/info"
"https://api.ui.com/v1/connector/consoles/$console/proxy/protect/integration/api/v1/meta/info"
```

**How to read the result** — the distinction matters, so record the exact status:

| Result | Meaning |
|---|---|
| `200` + `{"applicationVersion":"7.1.87"}` | **The org key reaches Protect through the proxy.** No per-console credential needed. Best case: §7 design B/A both simplify, and camera reads work fleet-wide today. |
| `404` on all variants, control `200` | The proxy is **namespaced to Network only**. Protect is not reachable this way at all. Fall back to §3d. |
| `401`/`403`, control `200` | Proxy *routes* to Protect but the org key is **not accepted by the Protect app** → a locally-generated Protect API key is required, which means **85 per-console keys** (see §3c). |
| Control fails | Test is void — fix the key/console id and re-run. |

### 3c · If a local Protect key turns out to be required

The brief permits creating one API key on the TCT office console (which currently shows
**API Key (0)**). That is the right next step **only if §3b returns 401/403**, not if it
returns 404 — a 404 means no amount of local key material helps, because the proxy will not
route there.

Weigh it honestly before building on it: a local Protect key per console means **~85 secrets
to generate, store, rotate, and re-issue on every console rebuild**, each requiring a UI
visit. That is a materially worse operational posture than the current UniFi integration,
whose entire appeal (per `docs/unifi-site-tools.md`) is "No LAN path, **no per-console
credentials**, no tunnels — that architecture is rejected." Adding 85 per-console
credentials to a capability re-litigates a settled architectural decision and should be an
explicit owner call, not an implementation detail.

### 3d · The fallback that needs no new credential — and already works

*Schema-proven.* Even if Protect is entirely unreachable through the proxy, the **existing
org key already answers the commercially important question** — *which clients can we sell
this to* — because the Site Manager API reports Protect inventory directly:

- `GET /v1/hosts` → `userData.controllers` is an array of application names. From the spec's
  own example: `["network","protect","access","talk","connect","innerspace"]`. Also
  `userData.consoleGroupMembers[].roleAttributes.applications.protect` = `{owned, required, supported}`.
  **→ enumerates every console running Protect.**
- `GET /v1/devices` (params `hostIds[]`, `time`, `pageSize`, `nextToken`) → per host, a
  `devices[]` array whose items include `mac`, `name`, `model`, `shortname`, `productLine`
  ("Product line of the device (network, protect, etc.)"), `status`, `version`,
  `firmwareStatus`, `isConsole`, `adoptionTime`.
  **→ enumerates every Protect camera across all 85 consoles, by model, with no per-console credential.**

Matching `model`/`shortname` against the LPR-capable hardware list in §4c yields the
sellability list immediately. This is the single most useful thing available today and it
is available *right now*.

---

## 5 · Task 4 — LPR hardware

### 4a · `GET /v1/cameras` — exact response schema *(schema-proven)*

The operation takes **no parameters** (no filtering, no pagination) and returns an array of
camera objects. Complete schema, with every enum the brief asked for **fully expanded**:

```
id                                        string
modelKey                                  const "camera"
state                                     enum [CONNECTED, CONNECTING, DISCONNECTED]
name                                      (untyped)
mac                                       string
isMicEnabled                              boolean
osdSettings.{isNameEnabled,isDateEnabled,isLogoEnabled,isDebugEnabled}   boolean
osdSettings.overlayLocation               enum [topLeft, topMiddle, topRight,
                                                bottomLeft, bottomMiddle, bottomRight]
ledSettings.{isEnabled,welcomeLed,floodLed}                              boolean
lcdMessage.type                           enum [LEAVE_PACKAGE_AT_DOOR, DO_NOT_DISTURB,
                                                CUSTOM_MESSAGE, IMAGE]
lcdMessage.resetAt                        number|null
lcdMessage.text                           string
micVolume                                 number
activePatrolSlot                          (untyped)
videoMode                                 enum [default, highFps, sport, slowShutter,
                                                lprReflex, lprNoneReflex]
hdrType                                   enum [auto, on, off]
featureFlags.supportFullHdSnapshot        boolean
featureFlags.hasHdr                       boolean
featureFlags.smartDetectTypes             array of enum [person, vehicle, package,
                                                         licensePlate, face, animal]
featureFlags.smartDetectAudioTypes        array of enum [alrmSmoke, alrmCmonx, alrmSiren,
                                                         alrmBabyCry, alrmSpeak, alrmBark,
                                                         alrmBurglar, alrmCarHorn,
                                                         alrmGlassBreak]
featureFlags.videoModes                   array of enum [default, highFps, homekit, sport,
                                                         slowShutter, lprReflex,
                                                         lprNoneReflex]
featureFlags.hasMic / hasLedStatus / hasSpeaker                          boolean
smartDetectSettings.objectTypes           array of enum [person, vehicle, package,
                                                         licensePlate, face, animal]
smartDetectSettings.audioTypes            array of enum [alrmSmoke, … alrmGlassBreak]
hasPackageCamera                          boolean
```

Two things worth naming explicitly, because they are the programmatic LPR test:

- **`featureFlags.smartDetectTypes` is capability; `smartDetectSettings.objectTypes` is
  configuration.** A camera is LPR-*capable* when `licensePlate` ∈ `featureFlags.smartDetectTypes`,
  and LPR is *switched on* when `licensePlate` ∈ `smartDetectSettings.objectTypes`. Confusing
  the two would report a capable-but-disabled camera as unsupported, or a configured-off site
  as ready. This distinction is what makes onboarding step 2 (§7e) detectable rather than guessed.
- **`featureFlags.videoModes` containing `lprReflex` / `lprNoneReflex`** is a second,
  independent hardware signal — those modes exist only on LPR-optimised hardware, and
  `videoMode` shows which is active. `lprReflex` corresponds to the reflective-plate setting
  the AI-LPR article calls **LPR Night Vision**.

### 4b · Live run — owner action (blocked on §3b returning 200)

```powershell
$key='<UBIQUITI_API_KEY>'; $console='<TCT office consoleId>'
Invoke-RestMethod -Headers @{'X-API-Key'=$key} `
  "https://api.ui.com/v1/connector/consoles/$console/proxy/protect/integration/v1/cameras" |
  Select-Object id, name, state, videoMode,
    @{n='ff.smartDetectTypes';       e={$_.featureFlags.smartDetectTypes -join ','}},
    @{n='ff.smartDetectAudioTypes';  e={$_.featureFlags.smartDetectAudioTypes -join ','}},
    @{n='ff.videoModes';             e={$_.featureFlags.videoModes -join ','}},
    @{n='cfg.objectTypes';           e={$_.smartDetectSettings.objectTypes -join ','}} |
  Format-Table -AutoSize
```

The AI camera is the row whose `ff.smartDetectTypes` contains `licensePlate`. **The per-camera
values could not be reported here** — that requires the credential (§0).

### 4c · Hardware requirement — this is not "any AI camera"

Source: help.ui.com **360058867233**, "UniFi Protect Cameras - AI Detections and Facial
Recognition" (updated 2026-07-28), *Smart Detection Capabilities by Camera Model*, verbatim rows:

| Detection Feature | G6 / AI Series | G5 / G4 Series | G3 Cameras | Third-Party (ONVIF) |
|---|---|---|---|---|
| **License Plate Recognition (LPR)** | ✓* | w/ AI Port | w/ AI Port | w/ AI Port |
| Vehicle Detection | ✓ | ✓ | w/ AI Port | w/ AI Port |
| Vehicle Type, Vehicle Color | ✓ | w/ AI Port | w/ AI Port | w/ AI Port |
| Clothing Type/Color, Gender, Accessories | w/ AI Key | w/ AI Key | w/ AI Key + AI Port | w/ AI Key + AI Port |
| Natural Language Search | w/ AI Key | w/ AI Key | w/ AI Key + AI Port | w/ AI Key + AI Port |

> `*` Excluding 360 models

Supporting facts, all load-bearing for a quote:

- **AI Key is a fallback, not an equal.** Article **29221435686039** (updated 2026-07-31):
  "**License Plate Recognition:** Enable LPR on G4/G5 series cameras" — and, verbatim: "AI Key
  also has the ability to provide Face Recognition and LPR on Protect G4/G5 series cameras.
  This functionality is similar to AI Port but **there will be delays in processing depending
  on the length of the queue**." Its comparison table marks G4/G5 LPR `✓**` = "**Async,
  realtime with AI Port**". AI Key is also throughput-capped: "**AI Key can only process
  1,000 detections per hour**".
- **AI Port does not stack onto AI-series cameras.** Article **28315005177239** (updated
  2026-07-11), verbatim Q&A: "**Does the AI Port support AI series cameras?** No, the AI Port
  is not compatible with Protect AI series cameras." Its camera capacity is also limited —
  "Each AI Port currently supports up to 5 cameras", ONVIF 4K: 1, 2K: 2, HD: 3; Protect 4K: 2,
  2K: 3, HD: 5 — and "Third party cameras cannot be mixed with Protect cameras."
- **The explicit LPR-capable model list** (from Access article **23903814413335**, which
  enumerates cameras qualified for License Plate Unlock — the most concrete model list Ubiquiti
  publishes): UVC-G6-Pro-Entry, UVC-G6-Entry, UVC-G6-Turret, UVC-G6-Bullet, UVC-G6-PTZ,
  **UVC-AI-LPR**, UVC-AI-Dome, UVC-AI-DSLR-LD, UVC-AI-Bullet, UVC-AI-Pro, **UVC-AI-Theta
  (excluding the 360 lens)**, UVC-AI-Turret, UVC-AI-PTZ, UVC-AI-PTZ-Precision. Match
  `shortname`/`model` from §3d against this list to produce the sellability list.
- **Siting constrains the sale as much as hardware.** Article **29457139215511**, "AI-LPR Setup
  in UniFi Protect" (updated 2026-08-05), verbatim: max mounting height **5m**; capture distance
  **12m**; max horizontal and vertical camera angle **<25 degrees**; angle for high-speed capture
  **<15 degrees**; "For lower speed or stopped traffic, up to 15m distance and 30 degree angle may
  work." It also warns the dedicated AI-LPR sees almost nothing else at night — "its visibility is
  limited to license plates and headlights only… consider installing a secondary 'context camera'".
  **A site with a qualifying camera pointed at the wrong angle is not a qualifying site.** Any
  fleet report from §3d is a shortlist for a site survey, not a list of ready sites.

---

## 6 · Task 5 — Private API assessment

### 5a · Exact surface

From `unifi-protect` 5.2.0 (npm, inspected) and `uiprotect` 15.14.2 (PyPI, inspected) — the two
maintained reverse-engineered clients, which agree:

- **Base:** `https://{console}/proxy/protect/api/` (`src/devices/endpoints.ts:35`)
- **Events:** `GET /proxy/protect/api/events`; also `/events/{id}` and
  `/events/{id}/smartDetectTrack` (`uiprotect/api.py:2086, 2976, 3505`)
- **Bootstrap:** `/proxy/protect/api/bootstrap` · **WebSocket:** `/proxy/protect/ws/updates?…`

**Query parameters actually sent** (`uiprotect/api.py:1992-2086`): `start`, `end` (both JS epoch
ms), `limit`, `offset`, `types[]`, `smartDetectTypes[]`, `orderDirection` (`ASC`/`DESC`),
`withoutDescriptions`, `allCameras`, `categories`.

Documented behavioural constraints, verbatim from that source:

> If `limit`, `start` and `end` are not provided, it will default to all events in the last 24 hours.
> If `start` is provided, then `end` or `limit` must be provided. If `end` is provided, then `start` or
> `limit` must be provided. Otherwise, you will get a 400 error from UniFi Protect

…plus a live-observed defect the library works around: `# manual workaround for a UniFi Protect bug` /
`# if types if missing from query params` — when `types` is absent and `start` is given, paging must be
driven manually. A first-party integration would inherit that bug.

### 5b · It does carry the plate string — and it is the only surface that does

`unifi-protect` 5.2.0 `src/types/events.ts`, `ProtectEventMetadataInterface`:

```ts
licensePlate: {
  confidenceLevel: number;
  name: string;          // ← the plate string
};
```

and per-detection attributes in `ProtectEventMetadataDetectedThumbnailInterface`:

```ts
attributes: {
  color:       { confidence: number; val: string };
  faceMask:    { confidence: number; val: string };
  trackerId:   string;
  vehicleType: { confidence: number; val: string };
  zone:        number[];
};
clockBestWall: number;
confidence:    number;
coord: [number, number, number, number];   // bounding box
croppedId: string; name: string; objectId: string; type: string;
```

Corroborated independently by `uiprotect/data/nvr.py:103` — `license_plate: str | None = None
# only populated for vehicle object_type`, on a `SmartDetectItem` that also carries `confidence`,
`coord`, `zone_ids`, `speed`, `depth`, and `attributes: dict[str, SmartDetectItemAttribute]`
where `SmartDetectItemAttribute = {val: str, confidence: int}`.

**Contrast with the official API**, which is the crux of this whole spike: the official
`/v1/subscribe/events` smart-detect variants carry **only** `id`, `modelKey`, `type`, `start`,
`end`, `device`, and `smartDetectTypes` — the last being the enum array. So the official stream
tells you **that** a plate was detected and **never which one**.

### 5c · Retrospective questions — yes, technically

"How many vehicles entered between two timestamps" maps directly to
`GET /proxy/protect/api/events?start=<ms>&end=<ms>&smartDetectTypes=vehicle&orderDirection=ASC`,
counting the returned events (with the `types`-absent paging bug worked around). Plate-level
questions map to reading `metadata.licensePlate.name` off each event.

### 5d · Recommendation: do not build on it

| Criterion | Assessment |
|---|---|
| **Auth model** | `POST /api/auth/login` with **UniFi OS local username/password** → session **cookie + CSRF token**, with rotation and 401-triggered relogin (`src/transport/auth.ts`: "the UniFi OS credential handshake, CSRF rotation, and the 401-triggered relogin seam"; state is `#cookie` + `#csrfToken`). **Not an API key.** For 85 tenants that is 85 local admin accounts to create, store, rotate, and survive console rebuilds — strictly worse than the 85 API keys already judged unacceptable in §3c. |
| **Proxy compatibility** | **Unknown and unlikely.** Both clients address `https://{console}/proxy/protect/api/...` **directly** — the LAN path the hard constraints forbid. Whether the Cloud Connector Proxy would forward the `api` (non-`integration`) namespace *and* carry cookie + CSRF headers end-to-end is untested and not documented. Even §3b's optimistic outcome would not imply it. |
| **Serverless fit** | Poor. Cookie/CSRF sessions are stateful and rotate; Vercel functions are not. Each cold start pays a full login handshake, ×85 consoles. |
| **Stability** | The brief asked for a firmware-breakage assessment: **high risk, and already demonstrated.** These are undocumented internal endpoints with no compatibility promise — the library's own comments describe the shapes as "**A semi-complete description of…**" and it ships a workaround for a live Protect paging bug. This repo has been burned by exactly this class of drift on the *documented* API already (`uapsdEnabled` silently removed from the WiFi schema; `ipv4Configuration` becoming mandatory at 10.2+ — `docs/gotchas.md` → UniFi). An undocumented surface across 85 consoles on heterogeneous firmware is that failure mode multiplied. |

**Verdict:** the private API is the only way to get plate strings by *polling*, and every path
to it violates a hard constraint. This is precisely why the webhook capture (§1c) is the
highest-priority task — a webhook that carries the plate makes the private API unnecessary,
and one that does not makes the plate string effectively unreachable within the constraints.

---

## 7 · Task 6 — Attribute search

**It exists in the product, it is UI-only, and no API exposes it.** Stated plainly, as the
brief asks.

- **It exists.** Article **360058867233**: "**Search in the Find Anything Tab** — Quickly search
  recordings using object types, license plates, keywords, or sound classifications." Attribute
  search proper is the **AI Key** feature set: "Clothing Type/Color, Face Enhancement, Gender,
  Accessories (Backpack, etc.)" and "Natural Language Search", both marked **w/ AI Key** on
  every camera tier. Article **29221435686039**: "Each smart detection processed by AI Key is
  analyzed and categorized in the background. This enables NeXT AI Natural Language Search in
  the Find Anything tab… **Results are best when searches describe people or vehicles.**"
- **It is UI-only.** *Schema-proven:* the official 7.1.87 spec has **no search endpoint among
  its 54 paths** — no `/search`, no query endpoint, no filter parameter on any collection
  (`/v1/cameras` takes **no parameters at all**). There is no API surface for Find Anything,
  natural-language search, or attribute filtering.
- **The nearest API-reachable thing is an alarm, not a search.** AI Key's "AI Enhanced Alarms"
  let an operator pre-register up to five queries as *triggers*: "Configure up to **5**
  predefined search queries to receive alerts for any detection that matches the query…
  Under Trigger, select **Objects -> AI Key Advanced**. Enter the desired search query and
  adjust the **match confidence**." That is forward-looking alerting configured in the UI —
  it cannot answer a retrospective question, and it cannot be created via API (§7a).
- **The attributes themselves do reach the wire — privately.** `attributes.color`,
  `attributes.vehicleType`, `faceMask`, each `{val, confidence}` (§5b). So attribute *data* is
  obtainable from the private API per event; attribute *search* is not obtainable from any API.
  If TCT ingests events into its own store, retrospective attribute queries become possible
  **on our side** — the same inversion recommended for plates in §2e.

---

## 8 · Task 7 — Design & onboarding

### 7a · The constraint that shapes everything

**Alarm Manager has no CRUD API.** *Schema-proven:* the 54 paths contain no create/read/update/
delete for an alarm. The only alarm-related operations are:

- `POST /v1/alarm-manager/webhook/{id}` — **inbound to Protect** ("Send a webhook to the alarm
  manager to trigger configured alarms"; path param `id` is a "User defined string used to
  trigger only specific alarms. **Alarm should be configured with the same ID to be triggered.**"
  → 204). This lets us *fire* an operator-preconfigured alarm; it is not a notification path to us.
- `/v1/arm-profiles` GET/POST/PATCH/DELETE + `/enable`, `/disable`, `/settings` — arm profiles
  (`name`, `automations[]`, `schedules[]` as cron `start`/`end`, `recordEverything`,
  `activationDelay`), and **"Only available when using local alarm manager."** These schedule
  *existing* automations; they do not define triggers or webhook actions.

**So every alarm is created by a human in the Protect UI, once per site, forever.** No amount of
engineering removes those steps. This is the dominant onboarding cost and it should be priced in.

### 7b · Available actuation *(schema-proven, and matching the brief's premise)*

```
POST /v1/relays/{id}/outputs/{outputId}/activate
     body: { state?: "on"|"off",  pulseDuration?: int ms }   // omit state = toggle
POST /v1/alarm-hubs/{id}/outputs/{outputId}/trigger
     body: { enable?: bool, delay?: int ms, duration?: int ms }  // duration 0 = indefinite
```

Both are single-target by path, which fits this codebase's existing single-target write rule
with no adaptation. Also available: PTZ (`/ptz/goto/{slot}`, `/ptz/patrol/start/{slot}`,
`/ptz/patrol/stop`), sirens (`/play`, `/stop`), and `POST /v1/cameras/{id}/talkback-session`.

### 7c · Recommended design

**Push, not poll. Protect pushes; TCT owns the roster and the history.**

```
  Protect (client site)                    TCT platform (Vercel)
  ─────────────────────                    ─────────────────────
  Alarm Manager alarm
   trigger: ID Recognition → any plate
   scope:   the LPR camera
   action:  Custom Webhook, POST
            .../api/webhooks/unifi-protect/{siteToken}
        │
        └── HTTPS POST ───────────────────▶ resolve {siteToken} → customer + console + site
                                            (fail closed on unknown token)
                                                 │
                                            store raw event  (raw-pg, append-only)
                                                 │
                                            match plate against TCT-owned roster
                                                 │
                                       ┌─────────┴──────────┐
                                  known plate           unknown plate
                                       │                    │
                                  (log only)     Autotask ticket / notify / optional
                                                 actuation via §7b through the
                                                 existing Cloud Connector Proxy
```

Why this shape:

- **No always-on listener, no inbound path to the client site.** Protect dials out to us.
  Satisfies both hard constraints without argument.
- **Serverless-native.** One short-lived POST handler. No sessions, no sockets, no polling
  against the proxy's 100 req/min-per-console budget.
- **It reuses a pattern already proven in this codebase.** `POST /api/webhooks/domotz`
  (`src/app/api/webhooks/domotz/route.ts`) is the same shape: token in the URL, raw-pg sink,
  ACK 200 on parse/storage hiccups so the vendor does not disable the channel, 401 only on
  token mismatch, `?sample=1` for a sample payload. Extend that pattern; do not invent one.
- **The roster and the history are ours** (§2e, §6) — so adding a vehicle and asking a
  retrospective question are both API calls, not site visits.

**Branch A — the captured payload contains the plate.** Build the above as drawn. This is the
sellable capability.

**Branch B — it does not.** The plate string is unreachable within the hard constraints
(§5d). The webhook still yields *"a plate/vehicle was detected at camera `<MAC>` at
`<timestamp>`"*, which supports after-hours vehicle alerting, traffic counting, and
actuation — but **not** vehicle identity, and therefore not the authorized-vehicle use case.
Say so plainly to the client rather than shipping a feature that silently cannot identify
anything. **Do not fall back to the private API to rescue branch B without an explicit owner
decision to accept 85 local credentials and a direct-to-console path.**

### 7d · Security notes (carrying this repo's existing rules forward)

- **Tenant identity lives in the URL**, because the payload has none (§1b). Per-site opaque
  token, `checkAutomationKey()`-style **fail-closed on unset env** (the Thread lesson,
  `docs/gotchas.md` → Thread Integration), and unknown token → 401, never a fuzzy match.
- **Do not authenticate via a POST request header.** The vendor guarantees custom headers
  only for GET (§1a). URL token is the only mechanism documented to work in POST mode.
- **The endpoint is internet-exposed and unauthenticated by design** — anyone who learns a
  token can forge plate events. Rate-limit it, treat every field as untrusted input, and
  cross-check `triggers[].device` (a MAC) against that customer's known camera MACs from
  §3d before acting on an event. A forged event that opens a gate is the failure mode worth
  engineering against.
- **New raw-pg table ⇒ `ALTER TABLE` in `src/app/api/migrations/run/route.ts` and POST
  `https://www.triplecitiestech.com/api/migrations/run` once after deploy.** A Prisma
  migration file alone is a no-op on this database (CLAUDE.md, Critical Gotcha #1).
- Kill switch `CONNECTOR_UNIFI_PROTECT_WRITES_ENABLED`, independent of
  `CONNECTOR_UNIFI_WRITES_ENABLED`, matching the existing per-surface convention.

### 7e · Per-client onboarding — step count

**8 manual steps** for a new site. Steps 1–8 are all in the Protect UI on the client's console
except step 8. **None can be automated** (§7a).

| # | Step | Where | Automatable? |
|---|---|---|---|
| 1 | Confirm an LPR-capable camera exists and is sited within the angle/distance limits (§4c) | Site survey — shortlist pre-computed centrally from §3d | Shortlist yes; survey **no** |
| 2 | Enable License Plate detection on the camera (adds `licensePlate` to `smartDetectSettings.objectTypes`) | Protect UI | No |
| 3 | *(AI-LPR only)* Enable **LPR Night Vision**; optionally **LPR Dedicated**; set optical zoom | Protect UI → Device → AI LPR → Settings / Recording Settings | No |
| 4 | *(G4/G5/G3/ONVIF only)* Adopt + pair an AI Port, or pair an AI Key and enable LPR under **Settings > Intelligence** | Protect UI | No |
| 5 | Create the alarm: trigger **ID Recognition → License Plate**, scope = that camera, schedule if wanted | Alarm Manager | **No — no CRUD API** |
| 6 | Add action **Webhook → Custom Webhook**, paste the site's unique TCT URL | Alarm Manager | No |
| 7 | **Advanced Settings: change GET → POST** | Alarm Manager | No |
| 8 | Register the site token → customer/console/site mapping | TCT admin UI | **Yes** |

**≈3 steps** (5, 6, 7 + the automatable 8) for a site whose camera is already LPR-enabled and
needs no AI accessory — the realistic case for a client already running a G6/AI camera.

Budget **one Protect UI session per site**, plus a survey for any site not already known-good.
At 85 sites this is a rollout project, not a toggle — worth stating in the sales motion.

### 7f · MCP tools we would expose

*(Specified only — deliberately **not** registered, per the spike's constraints.)*
`kqm_`-style structured failure envelope from the first commit; single console/site/target by
schema; secrets redacted.

**Read-only — safe now, and §3d-backed so the last two work even if §3b fails:**

| Tool | Signature | Notes |
|---|---|---|
| `unifi_protect_list_cameras` | `(consoleId: string, siteId: string)` | id, name, state, videoMode, `featureFlags.smartDetectTypes`, `smartDetectSettings.objectTypes`, mac. Needs §3b = 200. |
| `unifi_protect_camera_details` | `(consoleId, cameraId)` | Full camera object. Needs §3b = 200. |
| `unifi_protect_console_capabilities` | `(consoleId)` | `/v1/meta/info` `applicationVersion` + reachability; typed `FIRMWARE_UNSUPPORTED` / `CONSOLE_OFFLINE`, mirroring `unifi_console_capabilities`. |
| `unifi_protect_lpr_fleet_report` | `()` | **Org-wide sellability list.** Site Manager `/v1/hosts` + `/v1/devices`, `productLine=protect`, model matched against the §4c list. **Works today with the existing key.** |
| `unifi_protect_plate_events` | `(customer?, from, to, plate?, cameraMac?, limit?)` | Queries **TCT's own** captured events, not Protect. The retrospective surface, since the private API is out (§5d). |

**Roster CRUD (TCT-owned, §2e) — direct writes, audit-logged, attributed:**

| Tool | Signature |
|---|---|
| `unifi_protect_roster_list` | `(customer)` |
| `unifi_protect_roster_add` | `(customer, plate, label, authorized: boolean, notes?)` |
| `unifi_protect_roster_remove` | `(customer, plate)` |

**Tier-1 actuation — attributed, kill-switched, single target:**

| Tool | Signature | API |
|---|---|---|
| `unifi_protect_activate_relay_output` | `(consoleId, siteId, relayId, outputId, state?, pulseDurationMs?)` | `POST /v1/relays/{id}/outputs/{outputId}/activate` |
| `unifi_protect_trigger_alarm_hub_output` | `(consoleId, siteId, hubId, outputId, enable?, delayMs?, durationMs?)` | `POST /v1/alarm-hubs/{id}/outputs/{outputId}/trigger` |
| `unifi_protect_fire_alarm_webhook` | `(consoleId, siteId, alarmTriggerId)` | `POST /v1/alarm-manager/webhook/{id}` |

**Deliberately omitted, with reasons** (the convention from `docs/unifi-site-tools.md`):

| Requested | Why absent |
|---|---|
| Protect plate-roster read/write | **No such entity in the API** (§2a). Ours replaces it. |
| Alarm create/update/delete | **No CRUD in the API** (§7a). Manual, per site. |
| Attribute / natural-language search | **No search endpoint in the API** (§6). UI-only, AI Key-gated. |
| Historical event query against Protect | Not in the official API; the private one violates the hard constraints (§5d). Use `unifi_protect_plate_events`. |
| `/v1/subscribe/events` WebSocket | Persistent connection — incompatible with serverless and with the proxy's 25 s request timeout. And it **omits the plate string** anyway (§5b). |

---

## 9 · Still unknown

Ordered by how much each blocks the build.

1. **Does the ID-Recognition webhook payload contain the plate string?** *Blocks everything.*
   → §1c. **Proof:** the raw body from webhook.site.
2. **Does the Cloud Connector Proxy route to Protect, and does the org key authenticate there?**
   *Blocks all Protect reads (Tasks 3, 4).* → §3b. **Proof:** the HTTP status of the two
   commands. Distinguish 404 (not routed) from 401/403 (routed, key rejected) — they lead to
   opposite conclusions.
3. **Does Protect have its own UI-managed known-plate roster?** Documentation says nothing
   either way (§2d). → visible on the trigger screen at step 3 of §1c. *Does not block the
   recommended design, which does not depend on it.*
4. **What is the plate trigger's `triggers[].key` value, and does `conditions[].condition` gain
   a value naming a specific plate?** Falls out of the same capture.
5. **Does Alarm Manager's POST mode support custom headers?** The article promises them only
   for GET (§1a). Untested. *Mitigated* — the design uses a URL token regardless.
6. **Are `alarm.sources[]` ever populated, and with what?** `[]` in the only published example.
7. **Which of the ~85 consoles run Protect, and with which camera models?** Answerable today
   with the existing key (§3d) — not yet run here because of the credential constraint.
8. **Whether the TCT office AI camera is LPR-capable in fact.** §4b. The AI-series lineup
   qualifies per §4c, but `featureFlags.smartDetectTypes` is the only proof.
9. **Protect-specific Cloud Connector Proxy rate limits.** The Network figures (100 req/min per
   console, 25 s timeout, 10 MB cap) are documented for that path; whether they apply per-app or
   per-console when Protect is added is unknown. *Low impact* — the design is push-based.

---

## 10 · Evidence index

**Machine-readable specs** (extracted; see `docs/vendor-api/unifi-protect/SOURCE.md`)
- UniFi Protect API **7.1.87**, OpenAPI 3.1.0, 54 paths / 288 schemas — stored at
  `docs/vendor-api/unifi-protect/openapi.json`, sha256
  `511f47e31e325daf9cdf20748a4e362d3f23b02c9a5f9a57471033d248cf19fb`
- UniFi Site Manager API **1.0.0**, 9 paths, `X-API-Key` header scheme, zero `proxy` occurrences

**help.ui.com** (retrieved via `https://help.ui.com/api/v2/help_center/en-us/articles/{id}.json`
— the HTML pages 403 non-browser clients)

| ID | Title | Updated |
|---|---|---|
| 25478744592023 | Send UniFi Protect Alerts to Web Services using Webhooks | 2026-08-05 |
| 27721287753239 | UniFi Alarm Manager — Customize Alerts, Integrations, and Automations Across UniFi | 2026-07-23 |
| 360058867233 | UniFi Protect Cameras — AI Detections and Facial Recognition | 2026-07-28 |
| 29457139215511 | AI-LPR Setup in UniFi Protect | 2026-08-05 |
| 28315005177239 | Protect AI Port FAQs | 2026-07-11 |
| 29221435686039 | UniFi AI Key Setup and FAQs | 2026-07-31 |
| 23903814413335 | Configuring License Plate Unlock in UniFi Access | 2026-07-26 |
| 28494739821591 | Unlocking Gates with License Plate Recognition in UniFi Access | 2026-06-19 |

**developer.ui.com** — `/protect/v7.1.87/gettingstarted` (API-key scoping statement);
`/access/` → **404** (no published UniFi Access API)

**Reverse-engineered clients** (downloaded from public registries and read; used only to
characterise the *private* API, never as evidence about the official one)
- `unifi-protect` **5.2.0** (npm) — `src/types/events.ts`, `src/devices/endpoints.ts`,
  `src/transport/auth.ts`, `src/types/nvr.ts`
- `uiprotect` **15.14.2** (PyPI) — `uiprotect/api.py`, `uiprotect/data/nvr.py`,
  `uiprotect/data/devices.py`

**This repo** — `src/lib/ubiquiti-proxy.ts:252` (proxy URL builder),
`src/app/api/webhooks/domotz/route.ts` (the webhook pattern to extend),
`docs/unifi-site-tools.md`, `docs/gotchas.md` → UniFi

**Failed retrieval, branch stopped** — community.ui.com threads on Protect LPR webhooks are a
client-rendered SPA returning a 1,842-byte JS shell to both `curl` and WebFetch. No community
payload capture was obtained, and none is quoted.
