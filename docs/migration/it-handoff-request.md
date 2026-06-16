# OR Whiteboard — IT Provisioning Request (Microsoft 365)

_A request from the anaesthesia department to the IT team. We have built the application; we do not have tenant admin rights. This document lists what we need IT to provision so the app can use our hospital's Microsoft 365 instead of an external service. Everything else (the app code, the data lists, the deployment build) we handle._

## What the app is

A web-based operating-room staffing whiteboard (replaces the physical board where the charge nurse assigns anaesthesia staff to rooms/shifts). It is built and working in a local demo mode. To go live it needs to **store its data inside our M365 tenant** (SharePoint) and **sign staff in with their hospital accounts** (Entra ID) — so no patient/staff data leaves the hospital and there is no external login to manage.

## What we need IT to provide

### 1. An Entra ID app registration (single-page app)
- Platform type: **Single-page application (SPA)**. Implicit grant **off** (we use auth-code + PKCE).
- Redirect URI: the URL where the app will be hosted (see item 4 — we will confirm the exact URL).
- **Please send back to us:** the **Application (client) ID** and the **Directory (tenant) ID**. These are not secrets; we put them in a config file. We do **not** need a client secret.

### 2. Microsoft Graph permission + admin consent
- Delegated permission **`Sites.Selected`** (least privilege — access to **one** site only, not all of SharePoint).
- **Admin consent** granted for that permission.
- A **site-level write grant** for the app registration on the single site in item 3.
- (If `Sites.Selected` turns out not to cover everything during testing, the fallback is `Sites.Read.All` + the per-site write — but please start with `Sites.Selected`.)

### 3. A dedicated SharePoint site
- One **SharePoint site** (e.g. team site) to hold the whiteboard's data.
- **Please send back:** the **site URL** (and site ID if handy).
- We do **not** need IT to build any lists/columns — the app creates and seeds its own lists via Graph once it has the write grant above. We will share the list schema with whoever needs it.
- Access control: please map two security groups to the site — an **editor** group (charge nurses who move staff) and a **viewer** group (everyone else). The app reads roles from the sign-in token.

### 4. Hosting decision (please advise)
The app is a static website. We'd prefer to host it on **Azure Static Web Apps** (integrates with Entra sign-in cleanly). **Can IT approve an Azure Static Web App resource** (an Azure subscription/owner is needed)?
- If **no**, the alternative is hosting the app **inside SharePoint** (an "SPFx web part"), which is more rebuild work for us — so we'd like to know early.

### 5. Kiosk sign-in decision (please advise)
The board runs on a **shared wall-mounted display** that nobody logs into individually. How should that device authenticate?
- Option A: a **dedicated departmental account** that stays signed in, excluded from interactive-MFA Conditional Access for that device.
- Option B: a service identity behind a small server component IT runs.
- This is a security/policy call that's yours to make — we just need to know which model so we build to it.

## What we will hand back / do ourselves
- Plug your **client ID, tenant ID, and site URL** into the app's config (no rebuild needed to switch tenants).
- Create and seed the SharePoint lists via Graph (once the write grant exists).
- Build, test, and deploy the app to whichever host is approved.

## Suggested first step (low-risk)
If possible, set up the app registration + consent + grant on a **test/dev site first**. That lets us run a tiny end-to-end check (sign in → write one record → read it back) to confirm the permissions are right **before** we point it at a production site. ~30 minutes of our time once the registration exists.

## Open questions for IT
1. Is `Sites.Selected` + a per-site write grant acceptable, and who performs the admin consent?
2. Azure Static Web App — approvable, or must we host inside SharePoint?
3. Shared-kiosk sign-in: which model (dedicated account vs. service identity)?
4. Which Entra security groups should map to editor vs. viewer?

---
_Technical contact on our side: (Josh / Hank). Full design detail: `docs/migration/sharepoint-pivot-plan.md` in the project repo._
