# AI Enablement Services Playbook — v2.0

*Internal working document · Go-to-market draft*
*Owners: Kurtis Florance & James (Jim) King · Drafted 2026-06-22*

> **What this is.** Version 2 of the AI Managed Services Playbook (live at
> `/admin/documents/ai-playbook`, v1.0, June 4, 2026). This rewrite folds in
> every decision and change Jim raised in the **"AI Service Offerings
> Discussion"** call on **June 22, 2026**
> ([Fathom recording](https://fathom.video/calls/720029300)).
>
> **Why two versions.** v1.0 (the live in-app playbook) stays exactly as it is
> so we can see what we started with. This document is what changed. Share *this*
> with Jim. Jim's main job on the next pass is to **review and red-line the
> Assessment Phase questions** — see [§11](#11--the-assessment-phase--for-jims-review),
> which is written for exactly that.
>
> Timestamps like `[12:20]` link to the moment in the call so any change can be
> verified against what was actually said.

---

## At a glance — what changed from v1.0 → v2.0

| # | Topic | v1.0 (June 4) | v2.0 (June 22) | Source |
|---|-------|---------------|----------------|--------|
| 1 | **Offering names** | "AI Managed Services" (recurring) + "AI Development" (projects) | **"AI Enablement"** (recurring) + **"AI Implementation"** (projects). "Managed services" is too close to our core MSP; "development" overstates what we do. | [[24:01]](https://fathom.video/calls/720029300?timestamp=1450) [[21:33]](https://fathom.video/calls/720029300?timestamp=1293) |
| 2 | **Custom app development** | A core motion, incl. ERP-style app builds | **Off the table as a marketed line.** We are not a development house. Custom GPTs / skills / workflows live in "AI Implementation," sold separately. Big app builds are case-by-case, never productized. | [[11:02]](https://fathom.video/calls/720029300?timestamp=662) |
| 3 | **The core offer** | Assessment was one of several entry points | **The paid AI Readiness Assessment is THE product.** There is no shrink-wrapped product to sell — the assessment is the front door for everyone. | [[37:38]](https://fathom.video/calls/720029300?timestamp=2258) |
| 4 | **Assessment price** | From $1,000 | **$1,500 flat** for non-managed clients (≈10 hrs of work). **Included as a value-add for fully-managed clients** — a retention lever and an upgrade incentive. | [[39:58]](https://fathom.video/calls/720029300?timestamp=2398) [[38:48]](https://fathom.video/calls/720029300?timestamp=2328) |
| 5 | **Default platform** | **ChatGPT** is the managed-services standard | **Claude is the standard.** Don't over-commit a platform to the client in writing — the assessment names the "proper AI." Support ChatGPT if they already pay for it. | [[27:00]](https://fathom.video/calls/720029300?timestamp=1620) [[1:02:55]](https://fathom.video/calls/720029300?timestamp=3775) |
| 6 | **Anthropic reseller** | Plan: apply to the Claude Partner Network for multi-tenancy + billing | **Application denied** ("not us, it's them — come back in 6 months"). Near-term reseller/multi-tenant billing and central admin control are off the table. | [[23:25]](https://fathom.video/calls/720029300?timestamp=1405) |
| 7 | **Pricing model** | $50 / user / month | **Flat, fixed fee** — not per-user (per-user only if rolling out to every computer-using employee). Price is set *after* the assessment, like selling managed services: there is no one price. | [[1:06:14]](https://fathom.video/calls/720029300?timestamp=3974) |
| 8 | **Token economics** | A centerpiece section ("the hardest part to get right") | **De-emphasized.** Recommend low-token, reversible tools; bring token planning back only for heavy API/agent work. Most clients won't be metering tokens at all. | [[1:01:37]](https://fathom.video/calls/720029300?timestamp=3697) |
| 9 | **Monthly webinar** | A committed managed-services deliverable (owner: Jim) | **Cut.** Replace with a **monthly success-stories email**. One-on-ones are paid. | [[20:53]](https://fathom.video/calls/720029300?timestamp=1253) |
| 10 | **The report** | Gap + readiness + roadmap + 3 paths | **Add pricing and a clear, client-numbers ROI** to the report. Today it shows estimated loss but no cost/return. | [[1:00:12]](https://fathom.video/calls/720029300?timestamp=3612) |
| 11 | **Assessment questions** | Six profit zones first, then readiness/systems | **Lead with foundations** (Microsoft / SharePoint / line-of-business systems); make the profit-zone questions **conditional** (skip zones with no problem); nothing mandatory; add a **custom-question bank + catch-all**; it's a **staff-filled** internal worksheet, not sent to the client. **← Jim reviews this next.** | [[58:09]](https://fathom.video/calls/720029300?timestamp=3489) [[55:06]](https://fathom.video/calls/720029300?timestamp=3306) |
| 12 | **Included integrations** | Up to 3 native integrations | **Unchanged** — up to 3 pre-built/native connectors (e.g., Exchange + SharePoint + Teams, or a CRM). More than 3, or anything custom, is additional. | [[1:02:55]](https://fathom.video/calls/720029300?timestamp=3775) |
| 13 | **Value-add menu** | GPTs, agents, Cowork, workflows | **Add "Custom Skills"** as a headline value-add ("say a sentence → it reads the skill and does it"). | [[1:10:13]](https://fathom.video/calls/720029300?timestamp=4213) |
| 14 | **Cowork enablement** | Listed as a value-add | Keep it, but **wrap it in strong liability language** ("we set it up; we're not responsible for what you do with it") and always pilot. | [[1:09:09]](https://fathom.video/calls/720029300?timestamp=4149) |
| 15 | **Admin access** | Assumed manageable | **Open problem.** Managing a client's cloud account needs a designated admin email (billable, ~$100/mo platform overhead) and carries client-change risk. The reseller denial makes this harder. Not solved — flagged, not built. | [[1:06:27]](https://fathom.video/calls/720029300?timestamp=3987) |
| 16 | **Build sequencing** | Build the whole offering by end of June | **Refine the assessment first. Don't build Phase 2 (implementation) until someone buys an assessment.** Kurtis refines the questions 2–3× before handing any of it to Janelle. | [[1:12:06]](https://fathom.video/calls/720029300?timestamp=4326) |

Everything below is the full v2 playbook, rewritten to match.

---

## 01 · The Core Model

The offering is **two distinct, separately-sold motions.** Keeping them separate
is still the #1 rule — but both have new names, and the second is deliberately
smaller than it was in v1.

**AI Enablement — the recurring practice.**
Starts with the paid Readiness Assessment, then setup on the chosen platform
(account, AI Acceptable Use Policy, up to 3 native integrations, governance),
then light ongoing management. This is the "blue" foundation. It is *not* called
"managed services" — that name is too close to our core MSP and confuses the
two on an invoice [[24:01]](https://fathom.video/calls/720029300?timestamp=1450).

**AI Implementation — the project layer.**
The one-offs that ride on top: custom GPTs, **custom skills**, workflows,
connectors beyond the included three, and data cleanup. Renamed from "AI
Development" because we are explicitly **not a development house**
[[11:02]](https://fathom.video/calls/720029300?timestamp=662). Each is quoted and
billed on its own.

> **The sequencing rule:** you can't sell the purple (Implementation) until the
> blue (Enablement) is done. Enablement comes first, every time
> [[21:36]](https://fathom.video/calls/720029300?timestamp=1296).

**Why custom development is off the table.** There's a massive gap between "an
app that works for one person" and "an app that scales to hundreds." A couple of
custom builds under support would overwhelm us
[[10:00]](https://fathom.video/calls/720029300?timestamp=600). We'll still say yes
to the occasional larger build (e.g., the AllSpec ERP-style project) — but as a
one-off with its own build fee *and* a monthly maintenance fee
[[1:07:10]](https://fathom.video/calls/720029300?timestamp=4030), not as a service
line we market.

**Go-to-market sequencing (unchanged in spirit).** Use TBRs and sales calls to
establish TCT as the AI authority now; the assessment is the engagement vehicle.
Jim's framing: *"You could send me to any client and I could do this off the top
of my head — it's no different from any other pitch about solving problems with
technology, just way cooler tech with a way higher ROI in the right
environment"* [[1:00:51]](https://fathom.video/calls/720029300?timestamp=3651).

---

## 02 · The Assessment — The Paid Front Door

This is the product. Everyone interested starts here
[[44:44]](https://fathom.video/calls/720029300?timestamp=2700).

**What the client buys:** an honest answer to *"Should we use AI, can we, and in
what order?"* — delivered as one report. Not a pitch
[[37:05]](https://fathom.video/calls/720029300?timestamp=2225).

**Price.**
- **$1,500 flat** for non-managed clients. That's roughly 10 hours — get in, look
  around, build the report, run the meeting — assuming we have the access we need
  [[38:00]](https://fathom.video/calls/720029300?timestamp=2280).
- **Included for fully-managed clients** (shown as a line item with the price
  struck to "included," not "free," because there's real value
  [[39:00]](https://fathom.video/calls/720029300?timestamp=2340)). This is a
  reason for at-risk accounts to renew and for break-fix/lower-tier clients to go
  fully managed.
- The price also **qualifies the lead** — if a prospect can't commit to $1,500,
  they're not a fit [[34:01]](https://fathom.video/calls/720029300?timestamp=2041).

**Why charge even when the answer might be "no."** Jim: *"Whether you do it or
not, your competitors are. At a bare minimum you should understand your
capabilities in your own market."* There's value even in a no
[[36:35]](https://fathom.video/calls/720029300?timestamp=2195).

**What we actually do in the assessment** [[40:09]](https://fathom.video/calls/720029300?timestamp=2409):

1. **Deeper discovery into business problems.** The discovery call already
   surfaced some; this goes deeper. If the business can't leverage AI, that's a
   fine answer — but we find out here.
2. **Look at the environment.** Get access; check whether the infrastructure is
   ready today and, if not, what it takes (a separate quote). The recurring
   example: 5–10 years of SharePoint technical debt — *garbage in, garbage out.*
   We have to get the data right first
   [[40:09]](https://fathom.video/calls/720029300?timestamp=2409).
3. **Evaluate integrations / vendors.** Call their vendors and assess what can
   actually connect. *"AI needs more access than you do to use it"* — what a
   person needs to push buttons is different from what a system needs to pull data
   and collaborate [[40:09]](https://fathom.video/calls/720029300?timestamp=2409).
4. **Come back with the verdict + ROI.** What's possible in *their* environment,
   what it costs to get there (training, setup, ongoing), and a hard example of a
   client we've done it for — *with the results.* Results are the most important
   part [[41:00]](https://fathom.video/calls/720029300?timestamp=2460).

**The deliverable is the AI Profit report** — generated from the assessment form.
See the report changes in [§10](#10--examples--case-studies) and the question set
in [§11](#11--the-assessment-phase--for-jims-review).

---

## 03 · What's Included vs. What's Additional

The line that keeps the fee honest hasn't moved; the wrapper around it has.

**Included in the AI Enablement setup / recurring:**
- Infrastructure setup — domain and the business/Team account on the chosen
  platform (Claude by default — see [§05](#05--platform--claude-first)).
- **AI Acceptable Use Policy** — drafted, deployed, documented (template already
  built). Introduced in the setup phase, *not* the first meeting
  [[44:13]](https://fathom.video/calls/720029300?timestamp=2653).
- **Up to 3 native (pre-built) integrations** — e.g., Microsoft Exchange,
  SharePoint, and Teams (that's three on its own), or a CRM
  [[1:03:50]](https://fathom.video/calls/720029300?timestamp=3830).
- Security & governance — confirm and document that data isn't used for training.
- User enablement — AI office hours.
- Platform & integration-feasibility guidance.

**Always additional (AI Implementation projects or T&M):**
- Adds, moves & changes after onboarding.
- Custom GPTs, **custom skills**, agents, workflows, automations.
- Integrations beyond the included 3, or any non-native (MCP/custom) connection —
  including building a connector *plus* a skill that teaches the AI how to use the
  third-party tool [[1:04:27]](https://fathom.video/calls/720029300?timestamp=3867).
- Data cleanup / SharePoint remediation (a prerequisite project when the
  foundation is messy).
- Large app builds (case-by-case).
- CUI / CMMC-regulated workloads — out of scope at this stage.

**Integration feasibility — three outcomes per system:** native connector
(included, fast), MCP available (additional integration project), no connector /
legacy app (custom project or not worth it — set expectations).

> **The line in the sand:** "We set up and manage the platform — the account, the
> policy, and up to three native integrations. Anything you want changed, added,
> or built after that is additional, quoted as a project or billed T&M."

**If a client buys AI direct (not through us):** we don't carry it under
Enablement. We can support it advisory-only on a premium T&M rate, likely with a
liability waiver — but full management is strongly preferred, because we can't own
outcomes for a setup we don't control.

---

## 04 · Delivery Phases

One path, start to finish. Every customer begins with the paid Assessment;
branches are explicit gates.

| Phase | What happens | Notes for v2 |
|------|--------------|--------------|
| **1 · AI Profit & Readiness Assessment** | The paid front door. Discovery → environment & integration review → report. | **$1,500 / included for managed.** The deliverable is the report (now with pricing + ROI). |
| **2 · Foundation & Data Cleanup** *(conditional)* | Fires only if the assessment says "not ready." Scoped as a project, not recurring. | Cost scales with how messy SharePoint / the data is. Don't provision until the foundation passes. |
| **3 · Platform Selection & Provisioning** | Stand up the account, configure the domain, prepare to invite users. | **Default to Claude** (not ChatGPT). Use corporate accounts; confirm training is off. |
| **4 · Governance & Integrations** | Apply the governance baseline, deploy the AUP, wire the up-to-3 native connectors. | Clean context in → better output. |
| **5 · Enablement & Adoption** | AI office hours: "try this, come back to me," then level them up. | Centralize support through office hours, not ad-hoc calls. **No webinar.** |
| **6 · Ongoing Management — the recurring fee** | Light management, adds/moves/changes (billed additional), surface project opportunities. | **Monthly success-stories email** replaces the webinar [[20:53]](https://fathom.video/calls/720029300?timestamp=1253). Token monitoring only where relevant. |

**Don't build Phase 2+ yet.** The decision in the call: refine the assessment,
let Jim review the questions, then build the assessment package and clearly define
its deliverable. We worry about implementation when someone actually signs up for
an assessment [[1:12:06]](https://fathom.video/calls/720029300?timestamp=4326).

**Three paths forward (the review-call upsell).** Every assessment ends by
positioning **DIY** (client runs the roadmap), **Consult** (we advise & coach), or
**Done-For-You** (we set up and manage — Enablement + Implementation). The report
is the upsell trigger; the roadmap is the menu.

**Decision gates (run in order):**
- **Readiness** — do foundations + data pass? *No →* foundation/cleanup project
  first (Phase 2).
- **Compliance** — any CUI / CMMC data? *Yes →* keep it out of cloud AI; out of
  scope for now.
- **Procurement** — buying AI through TCT? *No →* T&M / advisory-only with a
  waiver; full management strongly preferred.
- **Platform** — *default Claude;* support ChatGPT only if they already use it.
- **Integration** — native connectors for the must-connect systems? *No →* MCP or
  custom = additional.
- **Expansion** — custom build wanted now? *Yes →* scope as an AI Implementation
  project with its own maintenance fee.

---

## 05 · Platform — Claude First

**This flipped from v1.** v1 standardized on ChatGPT for everyday use and reached
for Claude only on builds. v2 standardizes on **Claude**.

- Claude keeps pulling ahead; Cowork and the SharePoint/Microsoft integration are
  standout capabilities for our target clients
  [[14:00]](https://fathom.video/calls/720029300?timestamp=840). Part of the
  Enablement package is setting up Claude
  [[27:00]](https://fathom.video/calls/720029300?timestamp=1620). Kurtis has
  already changed the internal default to Claude
  [[1:02:55]](https://fathom.video/calls/720029300?timestamp=3775).
- **Don't over-commit a platform to the client in writing.** Part of the assessment
  is identifying the "proper AI" — we don't need to tell a client it will always be
  Claude. This protects us if the landscape shifts ("maybe the government shuts
  them down again — who knows")
  [[28:32]](https://fathom.video/calls/720029300?timestamp=1712)
  [[56:16]](https://fathom.video/calls/720029300?timestamp=3376).
- **Don't say no to ChatGPT.** If a client already pays for and likes ChatGPT,
  help them get more out of it — it's not a barrier
  [[27:45]](https://fathom.video/calls/720029300?timestamp=1665).

**Compliance shifts the math.** A lawyer or dental office (regulated data) changes
the platform/architecture calculus — flag it early
[[1:05:36]](https://fathom.video/calls/720029300?timestamp=3936).

---

## 06 · Security, Risk & Compliance

Lead from the truth, not from fear. (Carried forward from v1, with two additions.)

- **"AI will leak our data to competitors" — largely a false alarm.** A model
  doesn't let another company query it for "your financials." Saying so honestly is
  a differentiator.
- **Employee offboarding is the real risk.** Work locked in a *personal* AI account
  walks out the door when the person leaves. Fix: **corporate accounts, not
  personal.**
- **Provider control — acknowledge, don't over-sell.** You can't control what a
  provider does with inputs long-term; it's the same bargain we've accepted with
  Google and Microsoft for 20 years. Name it plainly and let the client choose.
- **Sensitivity forks:** hard-sensitivity → consider local/private (fewer
  integrations, more limits); CUI/CMMC → out of scope for now; everyone else →
  disclaimer + training-off + corporate accounts.

**New in v2:**

- **Cowork liability.** Cowork can control a browser and act on the user's behalf.
  It's *supposed* not to enter passwords, buy things, or delete data, but early
  cases went off the rails. We need strong language — *"we set it up; we are not
  responsible for what you do with these tools"* — and we still pilot every
  deployment [[1:09:09]](https://fathom.video/calls/720029300?timestamp=4149).
- **Admin access is an open problem.** Managing a client's cloud account means a
  designated admin email (billable by us and by Microsoft, ~$100/mo of platform
  overhead) and the risk that a client user goes in and undoes our work. The
  Anthropic reseller denial removes the admin-level control that path would have
  given us. **Not solved — flagged**
  [[1:06:27]](https://fathom.video/calls/720029300?timestamp=3987).

---

## 07 · Token Economics — Deliberately De-emphasized

**Demoted from a centerpiece to a footnote.** In the call, both agreed token
economics is *not* a focus for this initiative — most of our clients won't even be
metering tokens [[1:01:37]](https://fathom.video/calls/720029300?timestamp=3697)
[[1:05:50]](https://fathom.video/calls/720029300?timestamp=3950).

Operating principles instead:
- **Recommend low-token tools.** Don't know what token costs will be in 6–24
  months — investors haven't been paid back, prices may rise. Favor tools where
  the client gets effectively unlimited use (flat-rate seats, not metered API)
  [[1:01:59]](https://fathom.video/calls/720029300?timestamp=3719).
- **Recommend reversible tools.** Favor solutions where, if the AI stops working,
  the client simply reverts to the old manual process — they just lose the upside,
  they don't go down [[1:02:41]](https://fathom.video/calls/720029300?timestamp=3761).
- **Bring token planning back only for heavy API/agent solutions** — that's the
  one place runaway bills happen, and it's the exception, not the norm
  [[1:01:37]](https://fathom.video/calls/720029300?timestamp=3697).

(The old pool / 70–30 allocation model and threshold monitoring remain valid
*reference* for the rare metered engagement, but they are no longer a standard part
of the offering.)

---

## 08 · Service Bundle & Pricing

**Flat fee, not per-user.** The only time we'd use a per-user fee is a rollout to
every computer-using employee. Otherwise it's a flat, fixed number — effectively
Kurtis's and Jim's time — that doesn't change month to month
[[1:06:14]](https://fathom.video/calls/720029300?timestamp=3974).

**Price is set after the assessment.** Like selling managed services, there's no
single price — you get in, learn their systems, then quote
[[30:09]](https://fathom.video/calls/720029300?timestamp=1809). You can give
"starting at" ranges and tier examples if a prospect needs a number, and you can
cite a real client's cost-and-result, but the real number follows the assessment.

| Line item | v2 pricing | Notes |
|-----------|-----------|-------|
| **AI Profit & Readiness Assessment** | **$1,500** (one-time) · **included** for fully-managed | The product. ≈10 hrs. May credit toward setup if they proceed. |
| **AI Enablement — setup** | one-time, flat (illustrative: ~$5,000) | Domain + account + AUP + up to 3 native integrations. Final number follows the assessment. |
| **AI Enablement — recurring** | flat monthly (illustrative: ~$500–$1,500) | Light ongoing management + the monthly success-stories email. Not per-user. |
| **Custom GPT / agent** | from ~$1,000 (by complexity) | AI Implementation. Possibly revisit — flagged as maybe high. |
| **Custom skill** | project quote | **New value-add** (see [§09](#09--ai-implementation-track)). |
| **Workflow / integration / app build** | project quote | Larger builds can carry their own maintenance fee. |
| **Unmanaged / direct-buy AI support** | premium T&M, waiver required | Advisory-only by default. |
| **AI consulting (hourly)** | **~$250/hr** | Standard rate floated in the call [[1:02:55]](https://fathom.video/calls/720029300?timestamp=3775). |

> *Dollar figures other than the $1,500 assessment and the ~$250/hr rate are
> illustrative working numbers from the call, not finalized list prices. Confirm
> before quoting live.*

**Reseller status: denied.** Anthropic declined our reseller application — "not us,
it's them; come back in six months." We weren't going to make real margin reselling
Claude anyway. Practically: no near-term partner-channel multi-tenancy, billing, or
central admin control — provision and manage on the client's account instead
[[23:25]](https://fathom.video/calls/720029300?timestamp=1405).

**Margins still look strong** because the AI layer rides on the MSP foundation
that's already in place. Best value is as an add-on for existing managed clients.

---

## 09 · AI Implementation Track

*(Renamed from "AI Development.")* Anything custom lives here — never in the
recurring fee. Treat it with project discipline so one client can't consume you
with live tweak requests.

**Guardrails (unchanged):** every quote states a development cycle (ships at v1.2;
new asks queue to 1.3, 1.4); no live tweaking (dev → test → production);
communicate the roadmap like a game-studio patch list; each build can carry its own
monthly maintenance fee.

**Value-add menu:**
- **Custom skills — NEW, and a headline item.** Jim's most-used example: *"I say a
  sentence — 'build me X' — it reads the skill and goes and does it."* Every
  integration ultimately leads to a skill, so this belongs front and center on the
  menu [[1:10:13]](https://fathom.video/calls/720029300?timestamp=4213).
- **Custom GPTs** — purpose-built assistants (grant-writing for non-profits, SOP
  Q&A, onboarding helpers). From ~$1,000 (possibly revisit — flagged as maybe high
  [[1:09:09]](https://fathom.video/calls/720029300?timestamp=4149)).
- **Claude Cowork enablement** — teach the team to set up and use Cowork (context,
  skills, scheduled tasks). **Heavy liability language required** (see [§06](#06--security-risk--compliance)).
- **Done-for-you Cowork builds** — recurring scheduled tasks (e.g., "every Monday,
  pull all invoices, email them to you, file them in SharePoint").
- **Workflows & integrations** beyond the included 3 — native = small, MCP/custom
  = larger.
- **Data ingestion & routing** — e.g., the Brooms Over Broome call-log automation.

**Build the library.** Maintain a catalog of pre-built, quick-win plays we can fire
off easily [[21:14]](https://fathom.video/calls/720029300?timestamp=1274). Target
the roles where the tools deliver most first — win loud, then expand.

---

## 10 · Examples & Case Studies

Carried forward from v1, with the report change and one new archetype.

**Delivered — Brooms Over Broome (call-log automation).** Analyzed call logs, found
the leak (missed calls, never-returned calls, new callers slipping through), built
automatic ingestion and routing — eliminating manual entry. Recovered missed
business in real dollars, zero new headcount. The model ROI story
[[42:46]](https://fathom.video/calls/720029300?timestamp=2566).

**The "tried it and failed" archetype (Triboros).** A client who went out, tried AI
with another vendor, and it didn't work — almost certainly because they weren't
ready and their foundation was a mess. The pitch: *"When you're ready to look at AI
again, involve us"* — and they still go through the assessment, which uncovers
exactly why it failed [[24:48]](https://fathom.video/calls/720029300?timestamp=1488)
[[45:00]](https://fathom.video/calls/720029300?timestamp=2700).

**On the horizon / proof points:** AllSpec (AI-built ERP-style solution — the
concrete near-term build, carries a maintenance fee), Kurtis's mom's business
(proof-of-concept; first time she's been excited by technology), and the internal
**TCT Mail Agent** demo (below).

**The report must change** [[1:00:12]](https://fathom.video/calls/720029300?timestamp=3612):
- Today it shows recommended platform, a foundation-first roadmap, and estimated
  monthly loss — but **no pricing and no return.**
- **Add pricing** for each of the three paths.
- **Add a clear ROI built from the client's own numbers.** The method (straight
  from the call): take their volume and close rate, model a realistic lift, show
  the gain against the cost. *"Average deal $1,000, closing 20%, we lift it to 30% —
  that's 50% more; on 50 deals you just made $50k. The tool cost $5k up front and
  $500/mo. You made $50k, paid ~$10k, netted ~$40k."* If they don't know their
  numbers, that's another gap we expose
  [[42:46]](https://fathom.video/calls/720029300?timestamp=2566). The ROI calculator
  already exists; wire its output into the report.

**Positioning line that works:** *"AI is in its AOL era — like the first time
businesses got computers or the internet. There's a million things you can do with
it, and as your trusted IT advisor we'll help you figure out which ones move your
business. Let me show you what it's done for others."* No one fails to understand
that framing [[30:09]](https://fathom.video/calls/720029300?timestamp=1809)
[[53:00]](https://fathom.video/calls/720029300?timestamp=3180).

---

## 11 · The Assessment Phase — *for Jim's review*

> **Jim — this is the section to red-line.** The next step is your critique of
> these questions; once you're happy, we build the assessment package and define
> exactly what the client gets. Kurtis will iterate 2–3× before Janelle ever
> touches it [[1:12:06]](https://fathom.video/calls/720029300?timestamp=4326).
> The form is **staff-filled** — we ask these in the meeting; we don't send it to
> the client (at least not yet) [[46:25]](https://fathom.video/calls/720029300?timestamp=2785).

### Direction set in the call

1. **Lead with the foundations, not sales/marketing.** Systems & integrations,
   line-of-business apps, Microsoft, SharePoint — *"this is good, we live and
   breathe this"* — should come first. Don't open with the sales questions
   [[58:09]](https://fathom.video/calls/720029300?timestamp=3489)
   [[51:00]](https://fathom.video/calls/720029300?timestamp=3060).
2. **Make the profit-zone questions conditional.** Only ask the zone questions
   tied to a problem the client actually has. *"If they don't have a sales and
   marketing problem, don't ask any of those questions."* The questions you ask are
   driven by the problems you uncover
   [[59:20]](https://fathom.video/calls/720029300?timestamp=3560).
3. **Don't ask about problems we can't solve.** If we have no solution for a
   category, drop or skip those questions — otherwise the report promises things we
   can't deliver and every implementation becomes bespoke
   [[58:09]](https://fathom.video/calls/720029300?timestamp=3489).
4. **Nothing is mandatory.** Both like that the form requires nothing — the more
   they leave blank, the more upside is left on the table, but that's the
   interviewer's call [[55:06]](https://fathom.video/calls/720029300?timestamp=3306).
5. **Add a custom-question bank + a catch-all section.** A reusable bank of
   custom Q&A we can pull from, plus a free-form catch-all so nothing gets lost
   [[55:15]](https://fathom.video/calls/720029300?timestamp=3315)
   [[57:00]](https://fathom.video/calls/720029300?timestamp=3404).
6. **Reframe the platform-direction questions around Claude.** The current set
   tallies "leans" toward ChatGPT vs. Claude. Since we now default to Claude, these
   should capture use-case and integration depth to confirm the recommendation —
   not to pick a vendor from scratch.
7. **Soften the token/agent questions.** Token economics is de-emphasized; drop the
   "mind metered tokens" framing and favor low-token, reversible solutions.
8. **Add pricing + ROI to the generated report** (see [§10](#10--examples--case-studies)).

### Proposed question order for v2

v1 ran the six profit zones first, then readiness/systems/platform. Per Jim's
feedback, v2 **flips it** — foundations first, then conditional profit zones:

1. **Systems & Integrations** — line-of-business apps *(was group 8 → now first)*
2. **Readiness & Foundations** — the gates *(was group 7 → now second)*
3. **Platform Direction** — reframed to confirm Claude *(was group 9)*
4. **Profit Zones 1–6** — conditional, ask only what's relevant *(were groups 1–6)*
5. **Custom-question bank + catch-all** — *new*

### Current question set (today's live form — mark it up)

These are the questions exactly as they exist now in the discovery form, for Jim
to cut, keep, reorder, or reword.

**Foundations — Readiness & Gates** *(move to the top)*
- **Microsoft Foundation** — Is your Microsoft environment set up and healthy?
  *(Healthy / Partial / Not set up / Unknown)* — foundation gate.
- **Data Readiness** — Where does your data live, and is it clean and connectable?
  *(Clean / Some cleanup / Messy / Unknown)* — data gate.
- **Compliance** — Do you handle CUI / CMMC-regulated data? *(No / Some / Yes /
  Unsure)* — compliance fork.
- **Current AI Use** — Is anyone already using AI, and is it governed (policies,
  corporate accounts)? *(None / Some, ungoverned / Some, governed / Widespread)* —
  shadow-AI risk.
- **Procurement** — Will you buy AI through us, or do you already have / insist on
  your own? *(Through TCT / Already have it / Insist on own / Undecided)* — scope
  fork.

**Foundations — Systems & Integrations** *(move to the top)*
- **LOB Apps** — What are your primary line-of-business applications?
- **Must Connect** — Which systems must the AI connect to / pull context from to be
  useful? *(maps to the up-to-3 included integrations)*
- **Custom / Legacy** — Any industry-specific, custom, or legacy apps with no
  modern API?
- **Where Data Lives** — Where does business-critical data actually live (M365 /
  SharePoint / CRM / file shares / a LOB DB)?

**Platform Direction** *(reframe around Claude; today it tallies ChatGPT-vs-Claude
"leans")*
- **Primary Use Case** — main thing you want AI to do?
- **Primary Users** — who uses it most (general staff / technical / mix)?
- **Integration Needs** — custom integrations into LOB systems?
- **API & Agents** — appetite for API-driven / agentic workloads? *(soften — token
  caution is no longer the headline)*
- **Microsoft 365 Depth** — how deep is M365 usage?
- **Sensitivity** — any hard data-sensitivity that might require a local / private
  model?

**Profit Zones (1–6)** *(make conditional — ask only the zones with a real
problem; pick 2–3 questions per zone; nothing mandatory)*
- **Acquisition / Marketing** — content creation, lead capture, outbound,
  attribution, lead nurture ("the graveyard").
- **Conversion / Sales** — speed-to-lead, admin bloat, ghosting follow-up,
  qualification, call analytics.
- **Fulfillment / Delivery** — first-48-hours onboarding, scaling breakpoint,
  reporting drag, SOP adherence, margin killers.
- **Retention / Support** — top repetitive questions, off-hours support, founder
  dependency, churn reactivity, knowledge access.
- **Administration / Finance-HR** — invoicing & collections, scheduling, HR
  onboarding, data entry, information silos.
- **Strategy / Leadership** — real-time dashboard test, time-in-the-weeds, decision
  data vs. gut, the "$15/hr task," the "vacation test."
- Each zone captures an **estimated monthly waste ($)** that anchors the report's
  Profit Gap number.

### Open questions for Jim

- Which profit zones do we keep, and which do we drop because we don't have a clean
  solution for them today?
- Are there foundation/systems questions missing that you'd always ask?
- What goes in the **custom-question bank** to start?
- Confirm: report shows pricing for all three paths plus a client-numbers ROI —
  anything else it must include?

---

## 12 · Action Items / Next Steps

**Kurtis:**
- Refine the assessment form: reorder foundations-first, make profit zones
  conditional, add a custom-question bank + catch-all, reframe platform questions
  around Claude. Iterate 2–3× before involving Janelle.
- Add **pricing + client-numbers ROI** to the generated report (wire in the ROI
  calculator).
- Add **Custom Skills** to the value-add menu.
- Build the AI Enablement / AI Implementation line items in Autotask once pricing
  is locked — **flat fee, not per-user.**
- Replace the webinar deliverable with a **monthly success-stories email.**
- Update the live in-app playbook to v2 terminology once Jim signs off (edit the
  existing components — see the note below).
- Send Jim the **Keap** CRM invite (all opportunities go in Keap, not HubSpot).

**Jim:**
- **Review and red-line the assessment questions** ([§11](#11--the-assessment-phase--for-jims-review)).

**Both:**
- Use this framework off-the-cuff in the next TBR / sales call — we can run the
  conversation now and formalize afterward
  [[1:12:47]](https://fathom.video/calls/720029300?timestamp=4367).

**Parked (not part of this playbook):**
- Standing up a designated-admin-access model (open problem — [§06](#06--security-risk--compliance)).
- Re-applying to Anthropic's reseller program in ~6 months.
- Building out Phase 2 (Implementation) — wait until an assessment is sold.

---

### Also discussed in the call (account admin, not playbook)

For the record, the call also covered routine account work unrelated to the
offering: TBR scheduling for a couple of accounts (contract-timing correction on
one; a proactive renewal/right-sizing on another), and the reminder that all sales
opportunities are logged in Keap.

---

### Note for the engineering follow-up

This v2 lives as a doc on purpose. The live playbook is built from one section
registry (`src/components/admin/documents/ai-playbook/sections/index.tsx`) and
shared primitives — and the assessment questions are a single source of truth in
`src/lib/ai-discovery/questions.ts`. When Jim signs off, fold v2 into the **existing**
components and that questions file (no parallel `*-v2` files, per `CLAUDE.md`):
rename the two motions, flip the platform default to Claude, demote the token
section, swap the webinar for the monthly email, set flat-fee pricing and the
$1,500 / included assessment, reorder the question groups foundations-first with a
custom-question bank + catch-all, and add pricing + ROI to the report output.

---

*Source: Fathom recording "AI Service Offerings Discussion — Jim King,"
Kurtis Florance & James King, 2026-06-22
([recording](https://fathom.video/calls/720029300)).
Supersedes AI Managed Services Playbook v1.0 (June 4, 2026), which remains live and
unchanged at `/admin/documents/ai-playbook`.*
