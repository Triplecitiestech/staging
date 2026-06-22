# AI Enablement Services Playbook — v2.0 (Go-to-Market Draft)

**Status:** Internal working draft for review · **Owners:** Kurtis Florance & James King
**Date:** 2026-06-22
**Supersedes:** AI Managed Services Playbook v1.0 (June 4, 2026)
**Source for this revision:** Fathom recording — *"AI Service Offerings Discussion — Jim King,"* 2026-06-22 — https://fathom.video/calls/720029300

---

## Read me first

This is **version 2** of our AI services playbook. v1 was built from the June 4 TBR / AI pitch meeting. This v2 folds in everything decided in the June 22 working session with Jim, where we narrowed the offering and corrected several positions from v1.

Two things to know before you read:

1. **The changelog below is the "what changed."** If you only have five minutes, read it. Everything after it is the full rewritten playbook with those changes already applied.
2. **One section is deliberately left open for Jim.** Section 10 (The Assessment) is the part Jim asked to review. The *structure* and *direction* reflect what we agreed in the meeting; the *exact question wording and ordering* is the open task. Jim marks that section up and sends it back, then we lock it.

A note on client names: where the meeting referenced specific clients and their financials or personal circumstances, this document generalizes them into patterns. Account-specific notes stay in our CRM (Keap), not in a shared playbook.

---

## Changelog — what changed from v1 → v2

| # | Area | v1 said | v2 says | Why (meeting reference) |
|---|------|---------|---------|--------------------------|
| 1 | **Offering names** | "AI Managed Services" (recurring) + "AI Development" (projects) | **"AI Enablement Services"** (the offering) + **"AI Implementation"** (the projects) | "Managed services" is too close to our core IT offering and confuses clients; "development" is off the table, so the project track is *implementation*, not development. [~24:00, ~21:30] |
| 2 | **Custom app development** | A full "AI Development" project track, sold as a service | **Off the table as a service line.** We are not a development house. Implementation = pre-built connectors, custom GPTs, agents, skills, and Cowork automations on existing platforms. A one-off custom build for an existing client is the rare exception, scoped with a maintenance fee — not marketed. | The support burden of building scalable, production-grade apps for many clients is too high. [~10:00–11:30] |
| 3 | **Platform standard** | "Managed-services standard = ChatGPT"; Claude only for build work | **We standardize on Claude.** ChatGPT is "meet them where they are" only (if a client already pays for it). We do not name the platform to the client up front — we position it as "we'll identify the right AI for you." | Claude/Cowork is pulling ahead and its SharePoint/M365 integration is excellent; "we've got to pick one, and I'm picking Claude." [~14:00–15:30, ~26:30–28:45, ~63:00] |
| 4 | **Monthly customer webinar** | A committed, bundled managed-services deliverable (owner: Jim), with a full agenda | **Removed.** Replaced with a **monthly success-stories email**. One-on-one help is a **paid** add-on, not bundled. | "I don't want to do webinars. If you want one-on-ones, you can pay us for that." [~20:50–21:15] |
| 5 | **Assessment price** | "From $1,000" | **$1,500 flat** for non-managed clients; **included** (not "free") for fully managed clients as a value-add | $1,500 ≈ 10 hours of our time; it qualifies the lead and rewards/retains managed clients. [~38:00–39:58] |
| 6 | **Recurring price model** | **$50 / user / month** | **Flat, fixed monthly fee — not per-user.** Quote-based, set after we learn their business. Per-user only if rolling out to every computer-using user. | "I don't want a per-user. I want a flat rate… flat, fixed, doesn't change." [~63:30, ~106:00 area / 1:06] |
| 7 | **Token economics** | The "hardest part," front-and-center; pool model, per-user allocation, threshold monitoring in the bundle | **De-emphasized.** Favor tools with **flat/unlimited use**, avoid token-intensive solutions, and favor **reversible** ones (easy fallback to the old manual process). Token monitoring is not in the standard bundle; it only matters for heavy/custom work. | Token costs are unpredictable and may rise; many clients won't touch tokens at all. Recommend what's safe and reversible. [~1:01:40–1:02:55, ~1:05:50–1:06:11] |
| 8 | **Report contents** | Waste estimate, platform rec, 90-day roadmap, three paths — **no pricing** | **Add pricing and a clear ROI calculation** to the report, built on the client's own numbers | "This report doesn't tell you what your cost would be… it should have pricing." [~1:00:12–1:00:43] |
| 9 | **Go-to-market lead** | Establish thought leadership, then sell the bundle | **Lead with the business problem, not the technology.** Take the client's AI "temperature" first, then position AI as the solution, using the "AI = the PC / the internet, we're in the AOL era" analogy. | "You uncover the problems they're having, and the ones AI can solve, you bring up." [~17:49–20:00, ~29:12–32:00] |
| 10 | **Assessment questionnaire** | Six profit zones first, then systems/readiness | **Foundation first** (systems, M365, readiness at the top), then **problem-driven, optional** profit-zone questions. It's an **internal interview script**, not a client form. Add a **custom-question bank** and a **catch-all** section. | "Put the foundation first… if they don't have a sales problem, don't ask the sales questions… this is for our use, to ask them in a meeting." [~50:38–59:45, ~55:06–57:10] |
| 11 | **Anthropic reseller** | "Apply to the Claude Partner Network now" | **Reseller application was denied** ("come back in six months"). Near-term we **provision and manage Claude on the client's behalf** rather than resell. Revisit in ~6 months. | "We were denied by Anthropic to resell… we fit a demographic they've satisfied for now." [~23:25–23:56] |
| 12 | **Custom Skills** | Not in the value-add menu | **Added** to the value-add menu — "I say a sentence, it reads the skill and does it." | Identified as one of the most important catalog items. [~1:10:13–1:10:54] |
| 13 | **Cowork enablement** | Listed as a value-add | Kept, **with required liability language / waiver** ("we set it up; we're not responsible for what you do with it") and a pilot step | Cowork can act in a browser; there have been incidents. Protect TCT. [~1:09:09–1:10:13] |
| 14 | **Open issue: admin access** | Not addressed | **New open issue.** How do we get admin control of a client's Claude/cloud tenant without reseller tooling? Needs a designated admin account (~$100/mo, billable) and guardrails against a client undoing our work. | Raised directly; unresolved because the reseller path was denied. [~1:06:27–1:07:10] |

---

## 1 · The Core Model

The offering is two distinct, **separately-sold** motions. Keeping them separate is the most important rule in this playbook — conflating them is what lets a client think they can call us to "snap our fingers" on custom work for a flat monthly fee.

### AI Enablement Services — the recurring engagement
We get a business set up to use AI well and keep it working: platform setup on Claude, an AI Acceptable Use Policy, up to three pre-built integrations, governance, user enablement, and ongoing management. This rides on top of our IT foundation, so the margin is strong — but it's active, not "set and forget," because the AI landscape moves fast.

> **Naming note:** v1 called this "AI Managed Services." We renamed it to **AI Enablement Services** because "managed services" is too close to our core IT offering and blurs the line for clients.

### AI Implementation — one-off projects
Custom GPTs, agents, **skills**, Cowork automations, and extra integrations beyond the included three. Billed up front, each carrying its own optional monthly maintenance fee once delivered. Near-term, these out-earn the recurring fee.

> **Development is off the table as a service line.** We are **not** a development house. We will not market or take on building scalable, production-grade custom applications. A one-off custom build for an *existing* client (e.g., replacing one legacy app) is a rare exception — scoped carefully, priced as a project, and carrying a maintenance fee. It is not part of the menu.

**Why carry both:** the recurring fee is predictable, near-free money once configured; the one-off projects make more in the near term. The natural path: a client adopts enablement, gets a taste of what AI can do, then buys an implementation project to push past the out-of-the-box limits.

---

## 2 · Go-to-Market — Lead With the Problem, Not the Technology

This is the biggest shift from v1's framing, and it's how every conversation should start.

**Take their temperature first.** Before anything else, find out where the client stands with AI:
- **Resistant / not interested** → plant the seed and move on: "When you're ready to look at AI, involve us — whether that's with us or another vendor." No push.
- **Curious / hesitant / "we've heard about it"** → this is most people. Lead into the assessment.
- **Already using it** (paying for ChatGPT, knee-deep with another vendor) → we don't say no. We help them get more out of what they have. Not a barrier.

**Lead with the business problem.** Uncover the problems they're having; the ones AI can solve, we bring up. We don't open with "buy our AI readiness package." We open with "we can help your business do *this*" — and the readiness work is simply *how we get there responsibly.*

**The analogy that always lands:**
> "AI right now is like the first time personal computers landed in a business, or the first time the internet really got used. It's that broad. We're in the AOL era — so much is coming. All of these things solve real business problems, and we're your trusted advisor for figuring out which ones fit you. Let me show you what it's already doing for other businesses. Does that sound like something that might help you?"

No one fails to understand that approach — especially owners who remember how painful computers and the early internet felt at first.

**Justify with the client's own numbers.** When they engage, the assessment's ROI math uses *their* figures. Example: average deal $1,000, closing 20%, and AI lifts that to 30% (a 50% increase). On 50 deals that's ~$50k more revenue; if the AI tool cost ~$5k up front and ~$500/mo, they net ~$40k. If they don't know their numbers, that's another reason they need the clarity our assessment provides.

---

## 3 · What's Included vs. What's Additional

The recurring fee covers **setup, policy, and up to three pre-built integrations.** Everything changed, added, or built after that is additional — that's the line that keeps the fee honest.

**Included in AI Enablement Services (recurring):**
- **Infrastructure setup** — domain, business/Team account, and full setup on **Claude** (our standard platform).
- **AI Acceptable Use Policy** — drafted, deployed, documented (template exists).
- **Up to 3 pre-built integrations** — connect Claude to up to three systems with native connectors (e.g., Microsoft Exchange/email + SharePoint + Teams, or a CRM) so it becomes the central brain. *Microsoft alone typically covers all three.*
- **Security & governance** — confirm and document that data is not used for training (off by default on business tiers); corporate (not personal) accounts.
- **User enablement** — AI office hours + a **monthly success-stories email** (replaces the v1 webinar).
- **Platform & integration-feasibility guidance** — which of their systems can actually connect.

**Always additional (project or T&M):**
- Adds, moves & changes (AMC) after onboarding.
- Custom GPTs, agents, and **skills** (one-off builds).
- Cowork workflows and automations built for a specific outcome.
- Integrations beyond the included three, or any non-native/custom (MCP) connection.
- Data cleanup / SharePoint remediation (a prerequisite project).
- CUI / CMMC-regulated workloads (out of scope at this stage — see §6).

> **Removed from the included list (vs. v1):** the monthly webinar and token-pool monitoring. The webinar is replaced by the success-stories email; token monitoring is not part of the standard bundle (most clients won't touch tokens — see §7).

**If a client buys AI direct (not through us):** we don't carry it under enablement. We can support it on a **premium T&M rate ($250/hr)** and/or advisory-only (we guide, we don't implement), and we'll likely require a **liability waiver.** Full management is strongly preferred — without visibility into their systems we can't safely own outcomes.

---

## 4 · Delivery Phases

One path, start to finish. Every engagement begins with taking the client's temperature, then the paid assessment. Branches are explicit gates, not detours.

**Phase 0 — Temperature check.** Where are they with AI (resistant / curious / already using)? Route accordingly (see §2). For the resistant, plant the seed and stop here.

**Phase 1 — AI Profit & Readiness Assessment (paid front door).** Everyone who is curious/open starts here. One paid engagement, two analyses, one report:
- **Part A — Profit Gap Analysis:** where AI adds profit or cuts waste. The dollar value of the waste and the AI plays that close it. *The opportunity.*
- **Part B — Readiness Assessment:** can we actually implement, and what has to happen first? Microsoft/Entra/SharePoint health, clean & connectable data, governance, and per-app integration feasibility. *The feasibility.*
- These are independent: a client can have a huge profit gap *and* not be ready. The gap proves it's worth it; readiness sets the starting point. If the foundation is missing, the roadmap simply opens with cleanup work (Phase 2) before the AI plays.
- **Deliverable:** the report — gap + readiness + platform recommendation + a sequenced 90-day roadmap + **pricing on the three paths** + the ROI math. (See §10 for the assessment itself.)

**Phase 2 — Foundation & Data Cleanup (conditional / gated).** Fires only when readiness says "not ready." Scoped as a project, not part of the recurring fee. Confirm Microsoft/Entra/SharePoint hygiene and that must-connect systems are actually connectable. We expect to hit this often. Do not proceed to provisioning until the foundation passes.

**Phase 3 — Platform Selection & Provisioning.** Stand up the **Claude** business/Team account, configure the domain, prepare to invite users. Connect the up-to-three pre-built integrations. Confirm training is off and corporate accounts are used.

**Phase 4 — Governance & Integrations.** Apply the security/governance baseline, deploy the AUP, document the ring-fencing. Wire the connectors (Claude ↔ Microsoft, SharePoint, email, etc.). Where useful, build a **skill** that teaches Claude how to use the connected third-party tools.

**Phase 5 — Enablement & Adoption.** Launch AI office hours — 2–3 weeks of prompting sessions ("try this, come back to me," then level them up). Centralize support through office hours, not ad-hoc "can I call you?" requests.

**Phase 6 — Ongoing Management (the recurring fee).** Handle adds/moves/changes (billed additional). Send the **monthly success-stories email** (community/value-add layer). Surface implementation opportunities: "you've got a taste — it can also do these as a project." Token monitoring only where heavy/custom usage exists.

> **Don't build Phase 2+ detail yet.** Our immediate focus is finalizing the **assessment package** (Phase 1). We work out the implementation detail when a client actually signs up for an assessment. We can run these conversations off the cuff today — Kurtis and Jim can walk into any meeting and have this conversation now.

**Three paths forward — the review-call upsell.** Every assessment ends by positioning three paths: **DIY** (client runs the roadmap), **Consult** (we advise & coach), or **Done-For-You** (we build and manage). The report — now with pricing — is the upsell trigger; the roadmap is the menu.

---

## 5 · Platform — We Standardize on Claude

> **This flips v1.** v1 made ChatGPT the managed-services standard. v2 standardizes on **Claude.**

**Why Claude:** it's pulling ahead, the SharePoint/Microsoft 365 integration is one of the best things about it, and Cowork opens up real, visible wins for non-technical users. We've picked one, and it's Claude.

**ChatGPT — meet them where they are.** If a client already pays for ChatGPT and just needs help getting value from it, we won't say no. It's not a barrier. But our setups standardize on Claude.

**Don't name the platform to the client up front.** We position it as "part of this is identifying the right AI for your business." Internally the answer is Claude today; externally we keep the option open so we're not boxed in if the landscape shifts (e.g., a provider gets disrupted). The assessment can still capture whether a client leans toward one platform or wants both — leave that option in.

**Cost reality (internal):** operating at team tier runs roughly $200–$350/mo per tool. Factor it into the flat fee.

---

## 6 · Security, Risk & Compliance

Lead from the truth, not from fear. The competitor instinct is "secure the AI" — but the headline data-exfiltration fear is largely a false alarm, and saying so is a differentiator.

**Myth — "AI will leak our data to competitors."** *False alarm.* Putting company data into an LLM does not let another company query the model for your specifics. The most a model might absorb is generic patterns. Narrow exception: public website content a model cites.

**Real risk — employee offboarding.** If an employee keeps all their work in a *personal* AI account and leaves, that data walks out the door. **Fix: corporate accounts, not personal.**

**Real risk — provider control & future use.** You have no visibility into what the provider does with inputs now or later (terms change; platforms get sold). This is the same bargain we've accepted with Google and Microsoft for 20 years. Name it plainly and let the client choose.

**Cowork — handle with care (new emphasis).** Cowork can control a browser and take actions for the user. It is not supposed to enter passwords, buy things, or delete data — but there have been incidents early on. Before we enable it for a client:
- Include clear **liability language / a waiver**: "We set these tools up; we are not responsible for what you do with them."
- **Pilot** the workflows before handing them over.

**Sensitivity & compliance forks:**
- **Hard sensitivity concern** → consider a local/private model; set expectations (fewer integrations, more limits).
- **CUI / CMMC data** → keep it out of cloud AI for now; treat as out of scope at this stage. (A lawyer or dental office changes the math — flag it early.)
- **Everyone else** → disclaimer, ring-fence training off, corporate accounts, proceed.

---

## 7 · Pricing & Packaging

> **Two big changes from v1:** the assessment is now **$1,500** (was "from $1,000"), and the recurring fee is a **flat, fixed monthly fee — not per-user** (v1 was $50/user/mo).

### The assessment — the qualifying front door
- **Non-managed existing clients (roughly 10–30 users):** **$1,500 flat.** That's ~10 hours of our time to get in, look around, build the report, and meet. It also **qualifies the lead** — if a client can't handle $1,500, they're not ready to spend on AI.
- **Fully managed clients:** **included** as a value-add (say "included," not "free" — there's real value). It strengthens retention and gives non-managed clients a reason to go fully managed.
- **Assumption:** we have the access we need. If we don't have credentials/visibility, that's the first caveat (same as onboarding).

### The recurring fee — flat and fixed
- **Flat, fixed monthly fee. Not per-user.** Per-user only applies if a client rolls AI out to *every* computer-using employee. Otherwise the fee reflects our time and the managed environment.
- **Quote-based, set after discovery** — there is no single price, exactly like selling IT managed services. We learn their business and their AI temperature, then quote.
- **Illustrative only (not set):** a setup of this kind might look like a one-time onboarding fee plus a monthly maintenance fee. Don't lead with a big minimum — if a client doesn't yet know what AI can do for them, a large number with no context just pushes them away. The assessment is what creates that context.

### Add-ons & rates
- **AI consulting / T&M rate:** **$250/hr.**
- **Custom GPTs / agents:** a starting price per build (v1 used $1,000 — **flag: possibly too high, revisit**), scaling with complexity.
- **Custom skills, Cowork builds, extra integrations:** project-quoted.
- **Unmanaged / direct-buy AI support:** $250/hr, advisory-only by default, waiver required.
- **Custom builds** can carry their own optional monthly maintenance fee.

### Token economics — de-emphasized
v1 treated token governance as the centerpiece. For this initiative it isn't:
- **Recommend tools with flat/effectively-unlimited use.** Avoid token-intensive solutions — token costs are unpredictable and likely to rise.
- **Favor reversible solutions** — if the AI tool stops working, the client can fall back to their old manual process; the only loss is the efficiency gain.
- Most clients won't be metering tokens at all. Token monitoring only matters for heavy API/agentic/custom work, and those engagements get repriced. Don't build a fragile homegrown monitor.

---

## 8 · AI Implementation Track (formerly "AI Development")

Anything custom — GPTs, agents, skills, Cowork automations, extra integrations — lives here, **not in the recurring fee.** Treat it with project discipline so a single client can't consume us with live tweak requests.

> **Reframed from v1.** This is **implementation**, not development. We assemble and configure on existing platforms (Claude, Cowork). We do not sell ground-up application development.

**Guardrails:**
- Every quote states a release cycle; new asks queue into the next release, not live tweaks.
- Communicate the roadmap like a patch list ("here's what's in the next release"). Kills the "call you every other day" problem.
- Each build can carry its own monthly maintenance fee — so each one adds to the recurring revenue.

**Value-add menu (the easy upsells once a client has a taste):**
- **Custom GPTs** — purpose-built assistants (grant-writing, proposal drafting, SOP/policy Q&A). *Revisit per-build price.*
- **Custom agents** — scheduled/triggered tasks that run automatically.
- **Custom skills (NEW)** — "I say a sentence, it reads the skill and does the thing." One of the most valuable items; all the integrations lead here.
- **Cowork recurring tasks (NEW emphasis)** — e.g., every Monday pull all invoices, email them to you, and file them in the right SharePoint folder.
- **Claude Cowork enablement** — teach the team to set up and use Cowork (context, skills, scheduled tasks). **Requires the liability language/waiver and a pilot (see §6).**
- **Done-for-you Cowork builds** — we build their workspace, tasks, and automations.
- **Data ingestion & routing** — e.g., analyze call logs for missed/unreturned calls and new callers, then auto-ingest and route — eliminating manual entry.
- **Workflows & integrations** beyond the included three.

**Target the right people first.** Part of every engagement is picking the roles where these tools deliver most — deploy there first for the fastest, most visible ROI and your best internal champions. Win loud, then expand.

---

## 9 · Examples & Proof

**Delivered win — call-log automation (Brooms Over Broome).** We analyzed their call logs and found the leak: missed calls, calls never returned, new callers slipping through. We built automatic ingestion and routing of that call data — eliminating manual entry and making sure no caller falls through the cracks. Recovered real business, zero new headcount, and it opened the door to more automation.

**Internal proof — our own AI assistant.** We have a working internal AI assistant (built on Composio) that connects to Teams, email, Fathom, Monday, and more — and does practical things like filing email attachments into the correct SharePoint folder and notifying the right person. Use it as a live "show, don't tell" demo of what well-connected AI does day to day. *(Internal tool, not a client product.)*

**Patterns worth re-telling (generalized):**
- **The client who tried AI and it failed.** Almost always because they weren't ready — messy foundational data, no assessment. Re-engage with readiness-first: "Here's *why* it didn't work; let's fix the foundation and do it right."
- **The long-tenured, valued client facing hardship.** Do right by them at renewal, and open the AI conversation — the ones who love technology are the best early adopters.
- **The non-technical owner who "got it" instantly** once they saw AI do something tangible in front of them (controlling a browser, cleaning up a SharePoint mess). There are a lot of these people, and they'll take to it.

**Positioning line that works:**
> "AI is in its AOL stage — mind-blowing and evolving fast. We'll share our journey with you. We could build you the moon today, but you'd pay thousands and we don't want that. We're getting it to a consumable, easy-to-use stage — and you'll walk away knowing things you had no idea were possible."

---

## 10 · The Assessment — **For Jim's Review**

> **This is the open section.** What's below reflects the *direction* we agreed in the meeting. The **exact questions, their wording, and their order** are what Jim reviews and sends back. Treat the question list as a working draft, not final.

### What we agreed (apply these)
1. **Foundation first.** Lead with **Systems & Integrations, Microsoft 365, and Readiness** — "we live and breathe this." The sales/marketing profit-zone questions come *after* the foundation, not before.
2. **Problem-driven and optional.** Nothing is mandatory. Ask only the questions tied to the problems the client actually has. If they don't have a sales-and-marketing problem, skip those questions entirely. The interviewer (Kurtis or Jim) decides which to ask in the room.
3. **It's an internal interview script, not a client form.** We ask these in a meeting; we don't send the questionnaire to the client (the send-to-client option stays dormant for now).
4. **Add a custom-question bank.** A reusable bank of custom questions/answers we can pull from and feed in per client, plus the ability to add ad-hoc questions on the fly.
5. **Add a catch-all section** for anything that doesn't fit the structured zones.
6. **The report must include pricing and ROI.** Today it shows estimated monthly waste, a platform recommendation, and a 90-day roadmap, but **no pricing** on the paths forward. Add the cost of each path and the ROI math (built on the client's own numbers).
7. **Platform-direction questions default to Claude.** Keep the option to capture whether a client leans toward one platform or wants both.

### Draft question set (foundation-first — Jim to mark up)

**A. Readiness & Foundations** *(lead here)*
- Is your Microsoft environment set up and healthy? (Healthy / Partial / Not set up / Unknown) — *foundation gate.*
- Where does your data live, and is it clean and connectable? (Clean / Some cleanup / Messy / Unknown) — *data gate; messy = a cleanup project first.*
- Do you handle CUI / CMMC-regulated data? (No / Some / Yes / Unsure) — *compliance fork.*
- Is anyone already using AI, and is it governed (policies, corporate accounts)? (None / Some, ungoverned / Some, governed / Widespread) — *shadow-AI risk + maturity.*
- Will you buy AI through us, or do you already have / insist on your own? (Through TCT / Already have / Insist on own / Undecided) — *scope fork.*

**B. Systems & Integrations** *(we live and breathe this)*
- What are your primary line-of-business applications?
- Which systems must the AI connect to / pull context from to be useful? — *maps to the up-to-3 included integrations.*
- Any industry-specific, custom, or legacy apps with no modern API? — *likely no native connector.*
- Where does business-critical data actually live (M365/SharePoint, CRM, file shares, a LOB database)?

**C. Platform Direction** *(defaults to Claude; capture lean)*
- Main thing you want AI to do? · Who will use it most? · Need custom integrations into LOB systems? · Appetite for automation/agentic work? · How deep is your Microsoft 365 usage? · Any hard data-sensitivity that might need a local/private model?

**D. Profit zones — problem-driven, ask only what applies** *(skip any zone that isn't a problem)*
- **Acquisition / Marketing** — manual lead gen & capture, content time, attribution, lead nurture.
- **Conversion / Sales** — speed-to-lead, admin bloat, follow-up on ghosted deals, qualification, call review.
- **Fulfillment / Delivery** — onboarding steps, scaling bottlenecks, manual reporting, SOP adherence.
- **Retention / Support** — repetitive questions, off-hours waits, owner firefighting, churn signals.
- **Administration / Finance & HR** — invoicing/collections, scheduling, HR onboarding, data entry, finding info.
- **Strategy / Leadership** — real-time dashboard, time in the weeds, gut vs. data, the owner's $15/hr task, the vacation test.
- For each zone in play, capture an **estimated monthly $ waste** (hours/week × loaded payroll) — this anchors the ROI in the report.

**E. Catch-all (NEW)** — anything that didn't fit above.

> **Jim's task:** go through A–E, cut what's not useful, reword for how *we* actually ask it in a meeting, and confirm the order. Send it back and we lock the assessment package.

---

## 11 · Open Questions & Risks

1. **Admin access & control (unresolved).** How do we get admin-level control of a client's Claude/cloud tenant without reseller tooling (now that the reseller path was denied)? It likely needs a designated admin account with a real email (~$100/mo, billable by us and Microsoft) and guardrails so a client user can't quietly undo our configuration. Solve before/at implementation.
2. **Anthropic reseller — denied; revisit in ~6 months.** Near-term we provision and manage Claude on the client's behalf rather than resell. We weren't going to make much margin reselling anyway, so this is not a blocker — but it's the root of the admin-access gap above.
3. **Recurring price — not yet set.** The flat monthly figure is quote-based and still illustrative. We need a defensible default range before we quote live.
4. **Cowork liability.** Finalize the waiver/contract language with counsel before enabling Cowork for any client.
5. **Token-cost trajectory.** Prices may rise as the market matures; sticking to flat/unlimited, reversible tools insulates clients (and us).
6. **Custom GPT pricing.** The $1,000-per-build anchor may be too high — revisit.

---

## 12 · Action Items / Next Steps

**Jim**
- **Review and critique the assessment questions** (Section 10) — foundation-first order, problem-driven cuts, wording for how we ask in the room. *This is the gating next step.*

**Kurtis**
- Refine the assessment form & logic: reorder foundation-first, make profit zones optional/problem-driven, add the custom-question bank and a catch-all section.
- Add **pricing + ROI** to the generated report.
- Add **Custom Skills** (and Cowork recurring tasks) to the value-add menu.
- Build the **$1,500 assessment package** and the Autotask line items: assessment **$1,500** (included for fully managed clients), the flat recurring fee, and the $250/hr T&M rate. Remove the webinar and per-user lines.
- Finalize Cowork liability language with counsel.
- Solve the **admin-access** question.
- Send the **Keap (Keap/CRM)** invite to Jim; all opportunities go into Keap.

**Both**
- Use this framework in upcoming TBRs and sales calls — we can run these conversations off the cuff today.
- Hold building the implementation phase in detail until a client signs up for an assessment.
- Revisit the Anthropic reseller path in ~6 months.

---

*Source: Fathom recording — "AI Service Offerings Discussion — Jim King," Kurtis Florance & James King, 2026-06-22 (https://fathom.video/calls/720029300). Internal working document — v2.0, go-to-market draft. Supersedes v1.0 (June 4, 2026).*
