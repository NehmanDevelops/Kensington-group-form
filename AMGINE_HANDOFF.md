# 🧳 AMGINE INTEGRATION — MASTER HANDOFF

_Last updated: 2026-07-06 — full pipeline built, tested end-to-end, Option 2 + Intent-only live._

**To read this on your work laptop:** `git pull` in the repo, open this file.

---

## 0. TL;DR — what this is
Automated **Smartsheet → Amgine** travel-booking pipeline. Onboard a client from one form; then agents just check a box and the trip is created in Amgine, curated, and its status/link flow back to the sheet automatically.

**Repo:** `NehmanDevelops/Kensington-group-form` (deployed on Vercel)
**Local dir:** `C:\Users\owner\AppData\Local\Temp\kensington-group-form-3`
**Live base URL:** `https://kensington-group-form.vercel.app`
**Amgine contacts:** Raymond Sobaram (engineer) raymond@amgine.ai · Anna Spina (account mgr) · internal: Vera Perisic, Joselynn Alderson.

---

## 1. THE FULL PIPELINE (how it works)

**A. Onboard a client (one-time per group)**
1. Group must exist in LIVE GROUP MASTERSHEET (auto-created by the Group Travel Request form, or added manually — Group ID + company).
2. Fill the **Branch Request form** → it runs Amgine CreateBranch → CreatePolicyRule → CreatePolicyGroup automatically and writes the **Branch GUID + Policy GUID** onto that group's row.

**B. Every booking (automatic)**
3. Traveller lands in Traveller MasterSheet (profile form / CVENT-Swoogo parser / Excel upload).
4. Agent checks **Ready to Book**.
5. **Power Automate** ("Amgine, Auto Book" flow) polls Smartsheet, sees the change, POSTs `{"scan":true}` to `/api/amgine`.
6. `/api/amgine` finds Ready-to-Book + unbooked + named rows, looks up the group's Branch/Policy GUIDs, sends the New Request to Amgine, gets an **Itinerary ID**, writes it + status "Sent" back.
7. Amgine curates → fires a **webhook** to `/api/amgine` → handler writes **Amgine Status** + **Amgine Link** back.
8. Trip lands in the agent's Amgine queue as **"Ready"** (Option 2). Agent reviews, promotes to traveller, traveller approves, it books. Each status flows back.

**Key roles:** Power Automate = trigger/messenger only. `/api/amgine` = does the actual booking + write-back. Amgine webhook = status updates.

---

## 2. KEY DECISIONS (locked in)
- **Option 2 — agent reviews first.** Payload: `DirectToAgent: true, BypassAgent: false`. Trips go to the agent ("Ready"), agent promotes to traveller. (Vera's choice, 2026-07-02.)
- **Intent-only mode.** Payload includes `IntentOnly: true` → traveller fills their own trip in JENi; **airports/dates are optional** on the traveller row. (Raymond's recipe, 2026-07-06.)
- **Entity = Kensington.** `servicedEntityId = 918` is correct (Raymond renamed it from "Generic Entity" to Kensington). One entity covers all branches.
- **Self-serve branches work** — the full 3-step onboarding via `/api/create-branch` produces curating branches. No need to email Amgine per client. (White-label form was the alternative but needs every traveller's email registered — we chose Intent-only.)
- **Branch naming:** `Company (Group ID)`; auto-appends a timestamp only if that name already exists.

---

## 3. FORMS / PAGES (all at the live base URL)
| Page | Purpose |
|---|---|
| `branch-request.html` | **Create a branch** (onboard a client). Calls `/api/create-branch`. Required: client name, Group ID, address (Province/Country auto-convert to 2-letter), 1 cabin class. Air/Hotel/Car fields optional. |
| `book-now.html` | **Demo/manual "Book Now" button** — fires `{scan:true}` instantly, bypassing Power Automate's polling delay. Shows itinerary IDs. |
| `index.html` | Group Travel Request form (auto-creates group row + reporting email fields: mandatory Confirmation CC + conditional Reporting Recipient). |
| `reporting-request.html` | Corporate Reporting Request (Vera/Jos). Has Destination field + repeatable **UDID # / Client data** list → renders as a table in the email to corporate.reporting@traveledge.com. |
| `finance-request.html` | Finance Request (Jos). Dropdown: General / ADM (routes BSP vs ARC) / Payment Change / Payout / Refund. mailto to finance inboxes. |
| `udid-update.html` | UDID finance form (mailto to finance.support@traveledge.com). |
| `upload-excel.html` | Bulk group Excel upload (fixed dropzone rendering). |
| `traveller-profile.html`, `agentform.html`, `register.html` | Traveller/agent intake. |

## 4. API ENDPOINTS (`api/`, Vercel — 12-function cap, currently AT 12)
| File | Purpose |
|---|---|
| `amgine.js` | The integration. SEND: `{scan:true}` / `{rowId}` / `{email}` / `{firstName,lastName,groupId}`. WEBHOOK: handles `ItineraryState` → writes Status/Link/Note. |
| `create-branch.js` | Full 3-step branch onboarding + writes GUIDs to group row. `maxDuration: 60s`. |
| `submit.js` | Group Travel Request form intake. |
| `submit-profile.js`, `submit-udid.js` | Profile / UDID intake. |
| `parse-email.py` | CVENT/Swoogo email parser. |
| `sync-groups.js`, `sync-travellers.js`, `reconcile-groups.js` (daily cron), `upload-groups.js`, `hotel-dedup.js`, `agentform.js` | Supporting sync/util. |

**⚠️ At the 12-function cap.** Adding another api file breaks deploys — remove one or upgrade to Vercel Pro. (Static .html pages do NOT count.)

---

## 5. SHEET IDs
- Traveller MasterSheet: `8780932377956228`
- LIVE GROUP MASTERSHEET: `4820086761148292`
- KCG Agent traveller copy: `7213505705889668` · CVENT parser: `1658234917048196`
- Advisor Summary: `4629439471112068` · Numbers By Advisor report: `2981953635569540`

## 6. AMGINE CONFIG
- **servicedEntityId = 918** (Kensington). tmcId = 116. sourceSEB = 1687 (branch config template). All hardcoded in `create-branch.js` with env overrides (`AMGINE_SOURCE_SEB/TMC_ID/SOURCE_SE`).
- **Auth:** `client_secret_basic` (client_id:secret in Basic header). Token endpoint (Keycloak): `login-app.amgine.ai/identity/auth/realms/amgine-realm/protocol/openid-connect/token`.
- **Env vars (Vercel, all Sensitive):** AMGINE_TOKEN_URL, AMGINE_CLIENT_ID, AMGINE_CLIENT_SECRET, AMGINE_GRANT_TYPE, AMGINE_SCOPE, AMGINE_USERNAME, AMGINE_PASSWORD, AMGINE_API_URL, AMGINE_TMC_GUID, AMGINE_HASH, SMARTSHEET_API_TOKEN. (Secrets live only in Vercel.)
- **Onboarding API URLs:** CreateBranch `app.amgine.ai/publicapi/api/ClientOnboard/bulkUploadServicedEntityBranch?returnSuccess=true` · CreatePolicyRule `.../servicedEntity/0/Policy?servicedEntityBranchGuid={guid}` · CreatePolicyGroup `.../servicedentity/0/TravelerGroup?servicedEntityBranchGuid={guid}`.
- **Webhook** points at `https://kensington-group-form.vercel.app/api/amgine`.
- **Agent App:** `app.amgine.ai/agentapp` (you have a login).

---

## 7. GOTCHAS / KNOWN BEHAVIOR
- **Booking is a few seconds; the lag is Power Automate polling** (was ~7 min). Fix: lower the PA trigger poll interval to 1 min, or use `book-now.html` for instant.
- **A traveller row needs a NAME** (First or Last) to be picked up — no name = "nothing to book."
- **Airports/dates are now OPTIONAL** (Intent-only). But the group must be onboarded (branch GUIDs present).
- **Province/State + Country must be 2-letter codes** (ON, CA) — the branch form auto-converts full names.
- **Branch form: add the group row FIRST and let it save**, then run the form (endpoint retries the group lookup, but still).
- **Duplicate branch name** auto-retries with a timestamp suffix. **Suspense** historically = wrong/unconfigured branch; resolved by using properly-onboarded branches.

## 8. PENDING (not dev work)
- **Vera:** real per-client travel-policy rules (branches use a default now). Client-communication email examples for template setup.
- **Amgine/Raymond:** staging environment; clear junk test branches/itineraries.
- **Team:** pick pilot group(s); write the agent SOP (what to do at each status).
- **Discuss:** white-label form (vs Intent-only).

---

## 9. DEMO
- **Runbook (visual one-pager):** https://claude.ai/code/artifact/e2129260-bf6a-4af2-b2fc-5e5c4b4a6948
- **Flow:** onboard via branch form → add traveller (name + onboarded Group ID) → Ready to Book → **use book-now.html for instant** → show status/link + Agent App trip.
- **Pre-run one booking ~10 min before** so you have a completed row to show while the live one processes.
- **Framing line:** "Our automation gets the trip to Amgine and tracks it. The agent takes it from there."

### Likely Q&A (short)
- *Built with?* Smartsheet + a Vercel service + Power Automate + Amgine API/webhook.
- *Onboard a client?* One form creates the branch automatically.
- *Agent's job?* Check a box, then review + send in Amgine.
- *Travellers come from?* Forms / parser / Excel upload — auto.
- *Traveller builds own trip?* Yes, Intent-only in JENi.
- *Why the delay?* Power Automate polling + Amgine curation, not our code.
- *Booking fails?* State comes back on the row; re-bookable.
- *Policy per client?* Default now; real rules plug in (waiting on Vera).
- *Secure?* Keys only in the server env.
- *Staging / white-label / GDS availability?* Punt to Amgine.
