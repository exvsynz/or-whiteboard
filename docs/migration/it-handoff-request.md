# OR Whiteboard — IT Provisioning Request (Microsoft 365)

_A request from the anaesthesia department to the IT team. We have built the application; we do not have tenant admin rights. This document lists what we need IT to provision so the app can use our hospital's Microsoft 365 instead of an external service. Everything else (the app code, the data lists, the deployment build) we handle._

## What the app is

A web-based operating-room staffing whiteboard (replaces the physical board where the charge nurse assigns anaesthesia staff to rooms/shifts). It is built and working in a local demo mode. To go live it needs to **store its data inside our M365 tenant** (SharePoint) and **sign staff in with their hospital accounts** (Entra ID) — so no patient/staff data leaves the hospital and there is no external login to manage.

## What we need IT to provide

### 1. An Entra ID app registration (single-page app)
- Platform type: **Single-page application (SPA)**. Implicit grant **off** (we use auth-code + PKCE).
- Redirect URI: the URL where the app will be hosted (see item 4 — we will confirm the exact URL).
- **Please send back to us:** the **Application (client) ID** and the **Directory (tenant) ID**. These are not secrets; we put them in a config file. We do **not** need a client secret.

### 2. Microsoft Graph permissions + admin consent
There are **two distinct grants on two different identities**. Please keep them separate — they are **not** the same consent.

**(2a) Editor app — delegated _write_ (staff sign in as themselves):**
- Delegated permission **`Sites.Selected`** on the app registration in item 1 (least privilege — **one** site only, not all of SharePoint).
- **Admin consent** for it, plus a **site-level _write_ grant** for the app registration on the single site in item 3.
- (If `Sites.Selected` turns out not to cover everything during testing, the fallback is `Sites.Read.All` + the per-site write — but please start with `Sites.Selected`.)

**(2b) Kiosk read broker — _application_ (app-only) _read_ (the wall display, see item 5):**
- This is a **separate, second** grant on the **Function App's identity** (item 4), **not** the editor app. It is an *application* permission (no user signed in), so it needs **its own admin consent** — please do not treat it as covered by 2a.
- Grant exactly: the **`Sites.Selected`** Microsoft Graph **application** permission, admin-consented, **then a site-scoped _Read_ role** to that identity on the board site only (`POST /sites/{board-site-id}/permissions` with `roles: ["read"]`).
- **Please do NOT grant** `Sites.ReadWrite.All`, `Sites.Read.All`, or any write role to this identity. The wall display only reads; it must never be able to change assignments.

### 3. A dedicated SharePoint site
- One **SharePoint site** (e.g. team site) to hold the whiteboard's data.
- **Please send back:** the **site URL** (and site ID if handy).
- We do **not** need IT to build any lists/columns — the app creates and seeds its own lists via Graph once it has the write grant above. We will share the list schema with whoever needs it.
- **Important:** once created, this site and its lists must **not be deleted or recreated** — the per-site grants in item 2 bind to this exact site, so recreating it breaks them and produces permission errors clinicians cannot diagnose without IT.
- Access control: please map two security groups to the site — an **editor** group (charge nurses who move staff) and a **viewer** group (everyone else). The app reads roles from the sign-in token.

### 4. Hosting + a small backend Function App
The app is a static website. We'd prefer to host it on **Azure Static Web Apps** (integrates with Entra sign-in cleanly). **Can IT approve an Azure Static Web App resource** (an Azure subscription/owner is needed)?
- If **no**, the alternative is hosting the app **inside SharePoint** (an "SPFx web part"), which is more rebuild work for us — so we'd like to know early.
- **Also required: one standalone Azure Function App** (Consumption plan is fine), linked to the Static Web App, to act as the wall-display read broker (item 5). We confirmed against Microsoft's docs that the Static Web App's *built-in* functions **cannot use a managed identity or Key Vault references** ([Microsoft Learn — managed vs. bring-your-own functions](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions)), so any app-only access to SharePoint must run on a separate Function App.
- Please enable a **system-assigned managed identity** on that Function App — that identity is the one that receives the app-only read grant in **2b**. If hospital policy forbids granting Graph access to a managed identity, the fallback is a **client certificate** (not a 6–12-month secret) on the broker app registration — please tell us which model so we build to it.

### 5. Kiosk (wall display) sign-in — our proposed model
The board runs on a **shared wall-mounted display** that nobody logs into individually. After reviewing the options we are **not** asking for a standing departmental account on the glass. The model we've designed:

- The wall display calls the small **Function App** (item 4), which reads the board from SharePoint with its **app-only read** grant (2b) and returns **only the fields shown on the wall** (a fixed, named allow-list — never the whole list). The display itself holds **no SharePoint/Graph credential**.
- To stop just anyone reaching that endpoint, the display authenticates to the Function with a **single narrow scope**. Please create **one lightweight app registration** that exposes a custom API scope named **`Board.Read`** (and nothing else). The kiosk signs in **once** (auth-code + PKCE) to obtain that scope and renews it silently. The Function validates this token's audience and scope before returning any data.
- **Net effect: the display has no mailbox, no licence, no Graph rights — only a revocable, single-scope token that can do nothing but read this one board.**

**What we explicitly do _not_ need** (to reduce risk on your side): no kiosk user account, no mailbox, no licence, **no Conditional Access / MFA exclusion**, no tenant-wide `Sites.Read.All`.

**One configuration request:** so the silent renewal survives reboots and long weekends without staff re-signing in, please set a **long sign-in frequency / persistent browser session** for the `Board.Read` kiosk app. (This is a Conditional Access *setting*, not an *exclusion* — much narrower than exempting an account from MFA.)

## What we will hand back / do ourselves
- Plug your **client ID, tenant ID, and site URL** into the app's config (no rebuild needed to switch tenants).
- Create and seed the SharePoint lists via Graph (once the write grant exists).
- Build, test, and deploy the app to whichever host is approved.

## Suggested first step (low-risk)
If possible, set up the app registration + consent + grant on a **test/dev site first**. That lets us run a tiny end-to-end check (sign in → write one record → read it back) to confirm the permissions are right **before** we point it at a production site. ~30 minutes of our time once the registration exists.

## Open questions for IT
1. Editor app: is delegated `Sites.Selected` + a per-site **write** grant acceptable, and who performs the admin consent?
2. Kiosk broker: is the separate **app-only** `Sites.Selected` + per-site **read** grant (2b) acceptable, and is a **managed identity** allowed to hold it — or must we use a certificate?
3. Hosting: Azure Static Web App **+ a standalone Function App** — approvable, or must we host inside SharePoint?
4. Does hospital Azure Policy cap secret/certificate lifetime (e.g. 90–180 days)? If so the certificate fallback in item 4 is out and the managed identity becomes mandatory — worth deciding before provisioning.
5. Are **three app registrations** (editor, kiosk-broker identity, `Board.Read` gate) acceptable under policy? If the third is a problem, please tell us — the fallback is weaker and we'd rather discuss it.
6. Which Entra security groups should map to editor vs. viewer?

---
_Technical contact on our side: (Josh / Hank). Full design detail: `docs/migration/sharepoint-pivot-plan.md` in the project repo._
