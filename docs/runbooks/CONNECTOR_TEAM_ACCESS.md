# Runbook — Giving a technician access to the TCT connector

*Owner-run. Adds a TCT staff member to the Claude connector so they can use Autotask, IT Glue, Datto RMM and UniFi tools from Claude. One-time tenant setup, then ~5 minutes per person.*

---

## What you are actually granting

There is **no shared password and no environment variable to hand out.** Each technician signs in with **their own Microsoft 365 account** — the same one they use for email. The connector reads their identity from that sign-in and uses it to attribute their work.

That matters more than it sounds:

- Autotask notes, time entries and status changes are written **as that technician**, through Autotask resource impersonation. If Ghenel adds a note, Autotask shows Ghenel, not a service account.
- HR record writes record the actor's email in the audit trail.
- Removing someone's access is one change in Entra, not a password rotation across the team.

**Prerequisite per person:** their connector sign-in email must match their **Autotask resource email** exactly. If it doesn't, reads work but every write fails with "No active Autotask resource found for …". Check this first — it is the single most common onboarding failure.

---

## Risks and dependencies, before you start

- **Everyone you add gets the same tool surface.** There is currently **no per-technician permission tiering** in the connector. A technician you add can read every customer's Autotask and IT Glue data and see UniFi config at every site. Reads are broad by design.
- **Writes are narrower but not zero.** Ticket notes, time entries, statuses and IT Glue documents are direct writes any signed-in technician can make. Config changes to Autotask settings and UniFi networks are **not** — those require a staged approval that only someone with staff login to `/admin/connector/staged-writes` can grant.
- **IT Glue passwords are unreachable** for everyone, by construction. No tool touches the passwords resource.
- If you need per-person restrictions before rolling out to the whole team, stop and scope that work first. Access is currently all-or-nothing.

---

## One-time setup (do this once, not per person)

You already have the app registration from the Entra cutover — this adds user assignment to it.

1. Go to **https://entra.microsoft.com** → **Applications** → **Enterprise applications** → find the connector app (the one whose Application ID URI is `https://www.triplecitiestech.com/api/connector/mcp`).
2. Open **Properties**.
3. Set **Assignment required?** to **Yes**. Save.
   - This is the switch that makes the connector opt-in. With it set to **No**, *anyone* in your tenant who finds the URL can connect. With it **Yes**, only people you explicitly assign can.
4. Confirm **Visible to users?** is set however you prefer — it only affects whether the app shows in the user's My Apps portal. It does not affect connector access.

---

## Per technician (~5 minutes)

### Step 1 — Assign them in Entra

1. **https://entra.microsoft.com** → **Applications** → **Enterprise applications** → the connector app.
2. **Users and groups** → **Add user/group**.
3. Select the technician → **Assign**.

Recommended: create one Entra security group, e.g. `TCT-Connector-Users`, assign the **group** to the app once, and then add and remove people from the group. Adding a tech becomes a group membership change instead of an app change.

### Step 2 — Confirm their Autotask email matches

In Claude (your own session, before handing anything over):

> Use `autotask_find_resource` with their email.

If it returns `found: false`, fix the mismatch in Autotask or Entra before continuing. Their writes will fail otherwise.

### Step 3 — Send them the connection instructions

**Which instructions you send depends on your Claude plan.** Check first: open Claude and look for **Organization settings**. If it exists, you are on **Team or Enterprise** and should use Path A. If you only see **Customize → Connectors**, you are on Pro/Max and must use Path B.

#### Path A — Team or Enterprise (strongly preferred)

You configure the connector **once, org-wide**, and technicians never see the client secret at all.

1. **Organization settings → Connectors** → **Add**.
2. Hover **Custom**, select **Web**.
3. Enter the connector URL: `https://www.triplecitiestech.com/api/connector/entra/mcp`
4. Expand **Advanced settings** and enter the **client ID** and **client secret**.
5. **Add**.

Technicians then go to **Customize → Connectors** and click **Connect** on the connector you configured. They sign in with their own Microsoft account. **No secret is ever distributed.**

This is the right answer for a team, and it is the one to use if you have the plan for it. It removes the shared-secret distribution problem entirely, which matters given you intend to sell the business.

#### Path B — Pro/Max individual accounts

Each technician adds the connector themselves and **does** need the client ID and secret.

> **The client secret is a credential.** Do not paste it into a group chat, a ticket, Teams, or a document. Send it through your password manager's secure-share, or read it aloud. It is the same secret for every technician, so one leak is a rotation event for the whole team — you would have to generate a new secret in Entra and have every tech re-enter it.
>
> If you are on Pro/Max and adding more than two or three people, upgrading to Team is worth it for this reason alone.

### Step 4 — Verify they are actually working

Ask them to run these two, in order, and send you the result:

1. `tct_connector_capabilities` — proves they are connected and authenticated. Should return a tool count and a build commit.
2. An Autotask internal note on a test ticket — proves attribution. Check the note shows **their** name in Autotask, not yours and not a service account.

If step 2 fails on attribution, go back to Step 2.

---

## Removing access

**https://entra.microsoft.com** → **Enterprise applications** → the connector app → **Users and groups** → select the person → **Remove**.

Their existing access token stays valid until it expires (up to 90 minutes). To kill it immediately, also go to **Microsoft Entra ID** → **Users** → the person → **Revoke sessions**.

For a departing employee this happens automatically as part of the normal offboarding disable — a disabled account cannot get a new token.

---

## Technician instructions — copy and send this

> **Connecting Claude to Triple Cities Tech systems**
>
> This gives Claude access to Autotask, IT Glue, Datto RMM and UniFi. You sign in with your own TCT Microsoft account, and anything you write into Autotask is recorded under your name.
>
> **If Kurtis told you the connector is already set up for the team (Path A):**
>
> 1. In Claude, go to **Customize → Connectors**.
> 2. Find **Triple Cities Tech** in the list and click **Connect**.
> 3. A Microsoft sign-in window opens. Sign in with your **TCT email** — the same one you use for Outlook. Approve the permission prompt.
> 4. You should land back in Claude with the connector showing as connected.
>
> You do not need, and will not be given, any password or key for this. If someone sends you one, that is a mistake — tell Kurtis.
>
> **If Kurtis sent you a client ID and secret instead (Path B):**
>
> 1. In Claude, go to **Customize → Connectors**.
> 2. Click **+**, then **Add custom connector**.
> 3. Paste the connector URL Kurtis gave you.
> 4. Expand **Advanced settings** and paste in the **client ID** and **client secret**.
> 5. Click **Add**, then **Connect**, and sign in with your TCT Microsoft account as above.
>
> **Either way:** if you use Claude in more than one place (web, desktop app, Cowork), repeat this in each one. To use the tools in a specific chat, click the **+** button at the lower left of the chat and turn the connector on under **Connectors**.
>
> **Check it works.** Ask Claude:
>
> > What can the TCT connector do? Call tct_connector_capabilities.
>
> You should get back a list of available tools and a build id. If you get an error, or Claude says it has no TCT tools, tell Kurtis — do not try to fix it yourself.
>
> **How to use it well:**
>
> - Ask in plain language: *"pull up ticket T20260722.0014"*, *"what's the SOP for VPN setup at Tri-Bros"*, *"which devices at the Montrose site are offline"*.
> - **If Claude tells you it cannot do something, ask it to call `tct_connector_capabilities` first.** Claude sometimes says a capability is missing when it isn't. That tool is the authoritative answer.
> - Before Claude writes anything into Autotask, it should show you the exact text first. Read it. It is going out under your name.
> - Some changes — Autotask settings, UniFi network config — will come back as "staged for approval." That is not an error. It means the change is waiting for a human to approve it, and that is deliberate.
>
> **Do not:**
>
> - Share the client secret with anyone, including other techs. Access is granted per person by Kurtis.
> - Ask Claude for customer passwords. It has no access to IT Glue passwords at all, by design.
> - Paste customer personal information, card numbers or credentials into the chat.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sign-in succeeds, connector still fails | Not assigned to the app in Entra | Step 1 |
| "No active Autotask resource found for …" | Connector email ≠ Autotask resource email | Step 2 |
| Claude says it has no TCT tools | Almost always a thin tool search, not a real outage. | Ask it to call `tct_connector_capabilities` explicitly by name |
| Writes rejected as disabled | The relevant kill switch is off | Check `CONNECTOR_CONFIG_WRITES_ENABLED` / `CONNECTOR_UNIFI_WRITES_ENABLED` / `CONNECTOR_HR_WRITES_ENABLED` in Vercel |
| Disconnects roughly daily | See `CONNECTOR_AUTH_ENTRA.md` § Disconnects | Tenant config, not per-user |
| Sign-in window never finishes | Redirect URI registered under the wrong platform | Must be **Web**, not SPA — see `CONNECTOR_AUTH_ENTRA.md` step 3 |

---

Sources: [Assign users to an application](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/assign-user-or-group-access-portal) · [Restrict app to a set of users](https://learn.microsoft.com/en-us/entra/identity-platform/howto-restrict-your-app-to-a-set-of-users) · [Claude custom connectors](https://support.anthropic.com/en/articles/11175166-about-custom-connectors-remote-mcp) — retrieved 2026-07-28.
