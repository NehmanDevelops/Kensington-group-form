# 🧳 AMGINE INTEGRATION — MASTER HANDOFF

_Last updated: 2026-07-20 — BookingProfile/PCC wiring + traveller email column bug fixed, CreatePNR failure isolated to specific branches, "guest vs external" traveller-type question raised with Raymond. See §10 below for full session log._

**To read this on your work laptop:** `git pull` in the repo, open this file + the latest `CHANGELOG-*.md`.

> **Current pipeline:** group row → **"Create Amgine Branch" checkbox** (Smartsheet webhook → `/api/create-branch` runs CreateBranch → CreatePolicyRule → CreatePolicyGroup automatically) → travellers in Traveller MasterSheet → **Ready to Book** → instant webhook booking (now also auto-attaches GDS BookingProfile, no extra checkbox) → statuses flow back.
> **Open with Amgine:** why booking (`CreatePNR`) fails on some branches but not others (see §10.3); whether traveller type should be "external" instead of "guest" (§10.4); how to control **Show Price** (their side). Existing branches loanDepot/TESTING lack a working policy link (old wrong GUID) — re-onboard if needed.

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

---

## 10. SESSION LOG — 2026-07-20 (Amgine call w/ Anna + Raymond)

### 10.1 PCC / GDS BookingProfile — implemented Raymond's spec
Raymond confirmed a GDS profile can live in a **different PCC** than the one you book/ticket in, and gave the exact payload shape:
```json
"BookingProfile": [
  { "Pcc": "3H4J", "GdsProfileId": "302503490", "GdsProfileType": "Traveler" },
  { "Pcc": "J7RJ", "GdsProfileId": "302503490", "GdsProfileType": "Corporate" }
]
```
- Added a **`Profile PCC`** column to the LIVE GROUP MASTERSHEET (positioned right next to `PCC` for visibility). Falls back to the booking `PCC` when left blank, so existing groups are unaffected.
- `api/amgine.js` (`sendOne`, search **"PCC"** — there's a banner comment) now builds `BookingProfile` from: `Profile PCC` (or `PCC`) + `Company Profile ID` + `Group Profile ID`.
- **⚠️ Open question for Raymond:** we currently send `GdsProfileType: "Corporate"` for BOTH ids. His example shows `"Traveler"` for one of them — confirm which type Kensington's profiles actually are and flip if needed (1-line change).
- **⚠️ Profile IDs must be the numeric Sabre GDS profile ID** (like `302503490`), not a profile name — verify what's loaded in `Company Profile ID` / `Group Profile ID` on each group row is numeric.

### 10.2 Removed the "Profiled Travellers" checkbox gate (deliberate, no safety switch)
- **Old behavior:** BookingProfile only sent `if (Profiled Travellers checkbox checked) && PCC`. This silently blocked profile data even when PCC + both profile IDs were fully populated (found on `VQ9GPANOCT26DFW` — Anna/Vera saw `BookingProfile`/PCC/profile id all null on Amgine's side despite the sheet being filled in correctly).
- **New behavior (as of commit `7fea2a6`):** BookingProfile sends automatically **whenever a PCC is present** — no checkbox required. Ready to Book is the only trigger needed now; nothing else to remember.
- **Decision:** deliberately no safety switch was re-added. Any group with a PCC filled in will always attempt to send a BookingProfile. If this ever causes an unwanted profile attach on a group that shouldn't have one, flag it — a gate can be re-added, but this time paired with a visible status note (not silent) so it's never a repeat surprise.

### 10.3 CreatePNR failure — isolated to specific branches (not our code)
Confirmed side-by-side in the Amgine queue: identical automation, same client (Kensington), same booking flow —
| Branch | Result |
|---|---|
| `VQ9GTESTDEC26` | **Books fine** — real PNRs (KNGMWP, KTJXYL, KAZMAX, ICHJHR, DZZQGE, GTQTBG, OQESIZ, …) |
| `VQ9GTEST2DEC26` | **Booking Failed** every time |
| `AMGINETEST` | GDS **search succeeds** (40 results returned) but **`CreatePNR` fails** — log shows `CreatePNRResponse: Failed to Create PNR` with an empty PNR, `Messages: None`, workflow ends in Suspense |
- **Conclusion:** the failure is at the GDS/PNR-commit layer — search/availability works, write (CreatePNR) doesn't. Same automation on a properly-provisioned branch (`VQ9GTESTDEC26`) succeeds every time. **This points to the booking PCC/ticketing config on the failing branches not being fully provisioned on Amgine's side**, not a payload/code issue.
- **Ask Amgine:** confirm the booking PCC on `AMGINETEST` / `VQ9GTEST2DEC26` (and whatever branch the real launch group uses) is provisioned for booking/ticketing, not just GDS shopping.
- **Go/no-go test before any real launch:** a test booking on the launch branch must return a **populated PNR** — not just reach "Ready" in the queue.

### 10.4 Traveller shows as "Guest user" — asked Raymond about "External"
- Every traveller currently shows as **"(guest user)"** in the Amgine Agent App, because our payload sends `AmgineTravelerId: -1` plus a `GuestSettings` block (`api/amgine.js`, `sendOne`, ~line 237–244) — that combination is literally what tells Amgine "this is a guest, not a registered traveller record."
- Raised with Raymond: is there a different field/traveller type that would show as **"external"** instead of "guest"? Waiting on his answer — once we know the field, it's a small payload change to wire in.

### 10.5 Fixed: traveller email was never sent (silent column-name bug)
- Root cause: `api/amgine.js` was reading a column literally named **`Email Address`** — but the Traveller MasterSheet's actual column is named **`Email`**. `Email Address` doesn't exist on the sheet, so every booking sent a blank email regardless of what agents typed in.
- **Fixed** (commit `b6df37f`): now reads `Email` first, falls back to `Email Address` if that column is ever added.
- **Note found while auditing other fields:** the sheet also has no column matching `Known Traveller Number` (KTN) — that field has never been populated in any booking payload. Low priority (optional loyalty/TSA field), but flagging in case KTN data needs to be collected somewhere and mapped later.

### 10.6 NEXT SESSION (upcoming, not yet scheduled) — "customizing emails"
Anna/Raymond mentioned the next walkthrough will cover **customizing emails**. No details given yet, but based on what's already in the payload, this is most likely one or both of:
1. **The Subject/Body we already send** in the New Request (`api/amgine.js` `sendOne`, ~line 235): `Subject: (KCG) ${who} — ${t.groupId}`, `Body: Kensington group booking for ${who} (group ${t.groupId})`. This text is what shows in the Agent App's "Original Email" panel — Raymond may want to walk through customizing this content/branding (Kensington logo, footer, wording) per client.
2. **Amgine's own traveller-facing transactional emails** — the approval-request email / booking-confirmation email Amgine sends to travellers (we saw an "Approval Form" link generated in a booking log earlier). These are likely templated at the branch/serviced-entity level on Amgine's side (similar to how Policy Tool config works) — from-address, logo, footer copy, wording — probably configured through the same TMC/branch admin area, not something we send in our payload.
- **Before that session:** have `api/amgine.js` open to the `Subject`/`Body` lines so you can show what we currently send if he asks, and ask directly: *"Is this about the Subject/Body we send in the request, or Amgine's own templated traveller emails? Where do we configure that — is it per-branch or per-entity?"*
- Once Raymond specifies where the config lives (a new API field we need to send, vs. a setting in their admin UI), that becomes the next implementation task here.
