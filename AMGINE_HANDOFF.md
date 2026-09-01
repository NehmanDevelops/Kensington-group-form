# 🧳 AMGINE INTEGRATION — MASTER HANDOFF

_Last updated: 2026-08-27 — Duplicate-branch root cause found + fixed, two real production branches repaired, PE Emails custom field shipped (§19-§23). See §24 for what's still open._

**To read this on your work laptop:** `git pull` in the repo, open this file + the latest `CHANGELOG-*.md`.

**🔐 Credentials:** Every secret (Smartsheet API token, all `AMGINE_*` values) lives ONLY in Vercel's environment variables (marked Sensitive — write-only, can't be viewed again once set). They are deliberately **not** written anywhere in this repo, including this file. To run any of the manual `node -e "fetch(...)"` one-off scripts referenced below from a fresh machine, you need the Smartsheet token pasted to you directly (ask Nehman) — never commit it to a file.

> **Current pipeline:** group row → **"Create Amgine Branch" checkbox** (Smartsheet webhook → `/api/create-branch` runs CreateBranch → CreatePolicyRule → CreatePolicyGroup → **PCC validate/create → queue fix → email connector fix**, all automatic, §13-§15) → travellers in Traveller MasterSheet → **Ready to Book** → instant webhook booking (auto-attaches GDS BookingProfile + PE Emails custom field, §22) → statuses flow back.
> **Open with Amgine:** why booking (`CreatePNR`) intermittently shows `PSGR SECURITY DATA REQUIRED` retries (§24); whether "PCC Target for Authentication" always correctly shows the shared VQ9G-AUTH entry (expected, not a bug — confirmed §14); white-labeling JENi — spec not yet received (§24).
> **Branch address is FIXED and confirmed Toronto/ON/CA** on every branch created since 2026-08-24 (§15.4 closed) — do not re-flag this.
> **Duplicate-branch bug is FIXED** as of 2026-08-26 (§19) — any new duplicate would be a NEW bug, not a recurrence of the old one.

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

---

## 11. AMGINE CALL PREP — 2026-07-22 (read this before the call)

**Where things stand (from the 07-21 email thread):**
- Vera confirmed we will use Amgine's **email-address resolution** for traveller profiles (we do NOT store per-traveller GDS profile IDs; we send the traveller's email, which the pipeline already does).
- Open with Raymond: (a) what, if anything, WE send to tell Amgine to resolve by email so the traveller comes through as **external** instead of **guest**; (b) why the profile was not pulling before.
- **Deadline:** the client that was mid-implementation launched today (Amgine not used again this round). **2 more groups launch next week — goal is to have Amgine working by then.**

### 11.1 Topic — Guest → External (traveller type)
- **Why it shows as "guest" now:** payload sends `AmgineTravelerId: -1` + a `GuestSettings` block. The traveller's email is already sent inside GuestSettings (`{ FieldName: 'Email', Data: t.email }`).
- **Where in code:** `api/amgine.js` → function `sendOne` → search **`GuestSettings`** (or `AmgineTravelerId`). It's inside `const payload = { … }`, in `TravelerRequested` and `TravelerInformation`.
- **What to do on the call:** show Raymond those lines + the Email field, ask EXACTLY what to send so Amgine resolves by email and marks the traveller external (does `AmgineTravelerId` stay `-1` or change? a new flag? a different block instead of `GuestSettings`?). **Write his answer down verbatim.**
- **Likely change shapes (educated guesses — do NOT pre-apply, wait for Ray's exact word):**
  1. Change the ID: `AmgineTravelerId: -1` -> `0` / `null` / omit (so it looks up instead of guesting).
  2. Drop/replace the `GuestSettings` block (it may be what forces guest mode).
  3. Add a flag: e.g. `TravelerType:"External"` / `ResolveByEmail:true` / `LookupProfile:true`.
  4. Move the email up to the `TravelerRequested` level so the matcher sees it.
- **The nuance that may BE the answer:** email resolution only works if a traveller profile with that email ALREADY EXISTS in the GDS. Our group travellers are often one-off with no stored profile, so there may be nothing to resolve — that could be why it was not pulling, and "guest" may be correct for them. ASK: does a profile need to exist first, and how is one created?

### 11.2 Topic — Email settings (Notify / CC / Reply-To)
- **What's already built:** optional `EmailSettings` object in the payload, fed by three group-row columns — **Notify Emails / CC Emails / Reply-To Email**. It is omitted entirely unless a column is filled, so it is a no-op for every current booking. The field NAME `EmailSettings` and its shape are a best guess.
- **Where in code:** `api/amgine.js` → search **`EmailSettings`** (two spots: the block that reads the columns ~line 246, and where it attaches to the payload ~line 269).
- **What to confirm with Raymond:** the exact field name + shape Amgine expects, and whether this is about the subject/body WE send vs. Amgine's own traveller-facing emails.

### 11.3 THE GOLDEN RULE
Do NOT hand-edit `api/amgine.js` live during the call — a bad edit to the payload breaks every booking. Show Raymond the spot, capture his exact wording, then wire it afterward + syntax-check (`node --check api/amgine.js`) before pushing. Same pattern used for the PCC and email work.

### 11.4 Questions to make sure we ask
1. Email → external: what field/value do we send? (does `AmgineTravelerId` stay `-1`?)
2. Why was the traveller profile not pulling before?
3. `EmailSettings`: exact field name + shape? Our subject/body or Amgine's emails?
4. Can we get it fully working before next week (2 groups launching)?
5. Snap codes / test-pricing: our manager can't get a snap code to test-price. §12.3 already shows Raymond said placeholder codes never price out because a code has to be **programmed against a real client on Amgine's side** first — confirm: does a snap code need to be provisioned against a specific **airline account** on Amgine's end (separate from what we send in `NegotiatedRateCodes`) before it'll ever return a rate, even with a real client? If so, what does Ray need from us (airline, client name, code) to provision one for a real test?

### 11.5 Deploy reminder
All Amgine code lives in `api/amgine.js` (Vercel). Commit email must be `nehmanmain@gmail.com` or Vercel blocks the deploy. Secrets only in Vercel env vars.

---

## 12. AIR SNAP CODES / NEGOTIATED RATE CODES / TOUR CODES (live — 2026-07-31 to 2026-08-05)

### 12.1 What Raymond gave us
Sent at the **ROOT** of the booking payload (sibling of `ExternalId`, `TravelerRequested`, etc.), NOT nested under traveller info:
```json
{
  "BranchInfo": {
    "AirConfig": {
      "NegotiatedRateCodes": [
        { "Airline": "AA", "CorporateId": "DIS01" },
        { "Airline": "DL", "CorporateId": "DIS02" },
        { "Airline": "DL", "TourCode": "YYZNYC" }
      ]
    }
  }
}
```
- `CorporateId` = a contracted/negotiated rate (airline snap code).
- `TourCode` = a tour code — same array, just swap `CorporateId` for `TourCode` on that entry.
- Confirmed by Raymond these can mix in the same `NegotiatedRateCodes` array.

### 12.2 What we built (LIVE in `api/amgine.js`)
- **Where in code:** `api/amgine.js` → function `sendOne` → search **`NegotiatedRateCodes`** (or `Snap Code`). Comment header: `// ── Negotiated rate codes / tour codes (Raymond, 2026-07-31) ──`.
- **Source: two columns on the LIVE GROUP MASTERSHEET (group row)** —
  - **`Snap Code/Contract Code`** → becomes `CorporateId` entries.
  - **`Tour Code`** → becomes `TourCode` entries.
- **Format (per column):** `"AA:DIS01, DL:DIS02"` — `AIRLINE:CODE` pairs, comma **or** semicolon separated. Parsed by `parseAirlineCodePairs()`.
- **No-op by default:** if both columns are blank on a group row, `BranchInfo` is omitted entirely from the payload — zero effect on any group that doesn't use this. Same safe pattern as `EmailSettings` / `BookingProfile`.
- **Attached at:** `const payload = { ... ...(hasNegotiatedRateCodes ? { BranchInfo: { AirConfig: { NegotiatedRateCodes: negotiatedRateCodes } } } : {}), ... }` — confirmed at the payload ROOT, matching Raymond's spec exactly.

### 12.3 Test result (2026-08-05)
- Test itinerary **276617** on branch **SNAPCODETEST01** sent AA/DIS01, DL/DIS02, DL tour code YYZNYC per Raymond's payload shape.
- JFK→LAX search showed **Corp Rate = N/A across the board.**
- **Raymond confirmed this is EXPECTED**, not a bug: placeholder/fake codes never price out — a real code has to be programmed against a real client on Amgine's side to actually show a rate or book. As long as the codes are visibly **coming through** on his end, that's sufficient for now.
- **Vera confirmed:** "As long as Ray sees them coming through then that should be good! For now." She'll program a real code with a real client later to verify actual pricing/booking behavior.
- **⚠️ Open note:** the SNAPCODETEST01 / itinerary 276617 test does not correspond to any group row in the LIVE GROUP MASTERSHEET (checked 2026-08-05 — `Snap Code/Contract Code` and `Tour Code` are blank on every row, no group ID contains "SNAP"). That test was likely fired directly against Amgine (Postman or similar), not through our Smartsheet pipeline. **Our code path itself has not yet been proven end-to-end with real data in a group row** — worth a real test (enter codes on an actual group row, fire a booking, confirm Raymond sees `NegotiatedRateCodes` on that itinerary) next time it's convenient.

### 12.4 How to use it going forward
On any group's row in the LIVE GROUP MASTERSHEET, fill in:
- **`Snap Code/Contract Code`**: e.g. `AA:DIS01, DL:DIS02`
- **`Tour Code`**: e.g. `DL:YYZNYC`

Next booking sent for that group will automatically include `BranchInfo.AirConfig.NegotiatedRateCodes` built from those columns. No code change needed per client — just fill the columns.

---

## 13. PCC-CODE → NUMERIC-ID MAPPING (2026-08-05 to 2026-08-13)

### 13.1 The problem
Every `*PccId` field on a branch (FlightBookingPccId, TicketingPccId, etc. — see §14) is an **integer internal Amgine id**, not the PCC code itself. Raymond originally sent a Postman example with values `506`/`501` and no explanation of which PCC each belonged to.

### 13.2 Resolved via Amgine's own `GetPCCs` endpoint (confirmed 2026-08-13)
`GET https://app.amgine.ai/publicapi/api/tmc/116/TmcPcc?tmcId=116&isActive=true` returns every PCC's real numeric id. Confirmed mapping for Kensington's 8 PCCs:

| Code | Numeric id | Currency |
|---|---|---|
| VQ9G | 492 (booking) / **491 = VQ9G-Kensington-AUTH, a separate auth-only entry — see §13.3** | USD |
| SY90 | 501 | CAD |
| B3SG | 502 | USD |
| 1OEG | 503 | USD |
| W1AL | 504 | CAD |
| VB6L | 505 | USD |
| I5BA | 506 | CAD |
| B14G | 507 | USD |

Hardcoded as `KNOWN_PCC_IDS` in `api/create-branch.js` (search that exact string) — used as the fallback when `GetPCCs` itself can't be reached.

### 13.3 Bug found: VQ9G has TWO entries sharing the same identifier
`GetPCCs` returns id `491` (`VQ9G-Kensington-AUTH`, `isAuthenticator:true`, no booking queues) **and** id `492` (`VQ9G-Kensington-US`, the real booking PCC) — both with `identifier: "VQ9G"`. Naive `Array.find()` by identifier silently grabbed whichever came first (491, the auth-only one), which has no Success/Fail queues — this broke every VQ9G branch's queue setup until fixed.
**Fix (commit, 2026-08-13):** `findPcc()` in `create-branch.js` explicitly filters out `isAuthenticator:true` entries unless that's the only match.

---

## 14. FULL PCC / QUEUE / CONNECTOR ONBOARDING AUTOMATION (live since 2026-08-13)

Raymond's meeting summary (email to Vera, 2026-08-13) described three capabilities to build:
1. Retrieve/select PCCs configured in Amgine for profile read/shop/book.
2. Retrieve/select PCC/Queue numbers for PNR pass/fail.
3. Send air snap codes with each request (already done, §12).

All three are now wired automatically into `api/create-branch.js`'s `onboard()` function, running right after the existing `CreateBranch → CreatePolicyRule → CreatePolicyGroup` chain, no extra checkbox/step for the agent:

| Step | Endpoint | What it does |
|---|---|---|
| 1 | `GET /publicapi/api/tmc/116/TmcPcc?tmcId=116&isActive=true` (`GetPCCs`) | Validates the group's PCC(s) exist |
| 2 | `POST` same URL (`CreatePCCs`) | Creates a missing PCC (full record body — see `PCC_DEFAULTS` in code). **Queues left empty** — real Sabre queue numbers need Amgine/GDS admin setup first; we never invent them. |
| 3 | `GET /publicapi/api/tmc/116/TmcPcc/{id}?tmcId=116&id={id}` (`GetPCCsInfoQueue`) | Gets that PCC's `tmcPccQueues` array (queue `id`, `number`, `name`) |
| 4 | `PUT` same URL (`SavePCCsInfoQueue`) | Adds queues to an existing PCC — full-record PUT, not a partial patch. Rarely triggers; all 8 known PCCs already have queues. |
| 5 | `GET /publicapi/api/AccountDetails/fromTmc/116/0?tmcId=116&branchId=0` (`GetConnectors`) | Lists the 5 email connectors (see §15.2) |
| 6 | `PUT /publicapi/api/AccountDetails/{accountDetailsId}` (`SetConnector`) | Associates/disassociates a branch (by **numeric** branch id, not GUID) with a connector, via its `branchIds` array |

### 14.1 Where in the code
`api/create-branch.js`:
- Endpoint URL builders + `PCC_DEFAULTS`: search `getPCCsUrl`.
- Helper functions `getPCCs`, `createPCC`, `getPCCQueueInfo`, `savePCCQueues`, `getConnectors`, `associateConnector`, `disassociateConnector`, `fixBranchQueues`: all defined near the top of the file, right after `deepFind`.
- Wired into `onboard()`: search `Live PCC validate/create + queue wiring` for the PCC/queue block; search `SetConnector — associate the branch` for the connector block.

### 14.2 New Smartsheet columns (LIVE GROUP MASTERSHEET)
- **`PCC`** — converted from free text to a validated **picklist** (the 8 codes in §13.2 table).
- **`Email Country`** — picklist, `us` / `cad`. Drives which connector a branch uses (§15.2) AND (separately) the `BranchInfo.Notifications.CustomTripData.Country` field sent on every booking (§14.3).
- **`TravelerProfilePccId`, `TravelerProfileReadPccId`, `ProfilePccId`, `FlightSearchPccId`, `HotelSearchPccId`, `CarSearchPccId`, `FlightBookingPccId`, `HotelBookingPccId`, `CarBookingPccId`, `TicketingPccId`** — the 10 branch-level `*PccId` fields. Normally left blank (manual override only); auto-filled with the resolved number after onboarding, for visibility/proof of what was actually sent. **Profile-related** fields (`ProfilePccId`, `TravelerProfilePccId`, `TravelerProfileReadPccId`) resolve from `Profile PCC`; everything else resolves from `PCC` (mixing these up was a real bug, fixed 2026-08-15 — see commit history on `create-branch.js`).
- **`Success Queue ID Override`, `Fail Queue ID Override`** — TEXT_NUMBER, normally blank. Auto-filled with the actual queue id used. Type a specific numeric queue id here to force a specific queue instead of the automatic Success/Fail name-match (e.g. if a PCC ever has duplicate-named queues).

### 14.3 Email Country content flag (separate from the connector — don't confuse the two)
`BranchInfo.Notifications.CustomTripData.Country` (`"cad"` or `"us"`, defaults `"us"`) is sent on **every booking** — per Raymond, this controls **email content/wording**, not which address it's sent from. Built in `api/amgine.js` (search `CustomTripData`), merged into the same `BranchInfo` object as `NegotiatedRateCodes` so neither spread clobbers the other.

### 14.4 There is no true two-dropdown UI (and why)
Raymond originally described "two dropdowns — pick the PCC, then pick the queue for that PCC." Smartsheet **cannot** do a dropdown whose options dynamically change based on another column's value on the same row (no per-cell scripting layer, unlike Google Sheets Apps Script). What's built instead achieves the same real-world result: `PCC` is a real (static) dropdown; the queue is resolved automatically and shown via the override columns (§14.2), which double as a manual force-a-specific-queue mechanism. Confirmed with Raymond this is acceptable.

---

## 15. BUGS FOUND *AFTER* THE §14 IMPLEMENTATION SHIPPED (2026-08-19 to 2026-08-21) — important, read before assuming anything from §14 "just works"

### 15.1 `CreateBranch` silently ignores the queue-id fields — the real queue bug
Setting `travelerPnrSuccessQueueId`/`travelerPnrFailQueueId` directly in the `CreateBranch` payload (what §14 originally shipped with) **does not stick.** Confirmed by creating a branch with `PCC: SY90` (whose queue ids are 349/350) and immediately reading the branch back (`GET /publicapi/api/ServicedEntityBranch/{id}?id={id}`) — it showed **VQ9G's** queue ids (333/334) instead, i.e. the branch silently inherited the generic template's (`sourceSEBIDForNotificationRules` = branch 1687, VQ9G-based) default queue, regardless of what was sent at creation.
- This was initially misdiagnosed as "just a display label bug" (the Content Config page showed `[VQ9G-Kensington-US] Success (151-)` on an SY90 branch) — **it was not cosmetic; the underlying id really was wrong.**
- **Fix:** `fixBranchQueues()` — a required (not optional) step that runs right after every `CreateBranch` call succeeds: `GET` the branch back, then `PUT` the full record with the correct `travelerPnrSuccessQueueId`/`travelerPnrFailQueueId` forced in. Confirmed this actually sticks (re-read after the PUT shows the corrected ids), and confirmed on Amgine's own Content Config page the label corrects too (not just the number).
- **Any branch created between 2026-08-13 (when §14 first shipped) and 2026-08-21 (when this fix landed) may have the wrong queue baked in** and needs the same correction manually applied (see §16 for the pattern).

### 15.2 New branches auto-associate with the wrong email connector by default
Contradicts what Raymond said ("I've updated the generic branch so it is not associated to any email address") — empirically, every new branch was landing in the **USA** connector's `branchIds` list by default at creation, regardless of the group's actual `Email Country`. The 5 connectors (from `GetConnectors`):

| accountDetailsId | Address | Notes |
|---|---|---|
| 128 | `noreply@amgine.ai` | The old wrong default (before the fix below) |
| 139 | `canada@kensingtoncorporate.com` | |
| 140 | `usa@kensingtoncorporate.com` | The *new* default every branch was landing in |
| 141 | `concierge@kensingtoncorporate.com` | Not used by our automation |
| 143 | our own webhook (`/api/amgine`) | Every real branch should be in this one — separate from Email |

**Fix:** before associating the correct connector, the code now explicitly loops through every OTHER `notificationChannel: 'Email'` connector and disassociates the branch from it first (search `Strip the branch out of every OTHER email connector` in `create-branch.js`). Confirmed clean on both a CAD and a US test branch (branch shows up in exactly one connector's `branchIds`, never two).

### 15.3 There is no way to fix the queue/connector on an already-existing branch from Smartsheet
Both fixes above (§15.1, §15.2) only run at **branch creation time**. Nothing re-triggers them for a branch that already exists — the "already onboarded" guard prevents re-running the whole chain (which would also create a *second* duplicate branch, not fix the first). **Not yet built:** a lightweight, Smartsheet-triggerable "re-apply queue+connector fix to this existing branch" action. Today, fixing an old branch requires a manual one-off script (see §16 for the exact pattern used).

### 15.4 Branch address defaults to a US placeholder, not Kensington's real Toronto address
`api/create-branch.js` (~line 180-184, search `225 W 34th Street`) falls back to `225 W 34th Street, New York, NY, US` whenever a group row doesn't explicitly provide address fields — which is every real group, since address should be Kensington's own, not something staff types per client. **This is why every branch shows "New York" instead of Toronto/YTO like the manually-configured "Generic Branch."** Flagged by Colin Braganza (Amgine) 2026-08-24 (question E). **Not yet fixed** — the fix is simply swapping the fallback to Kensington's real address (`2 Queen St E, Toronto, ON, M5C 3G7, CA` — already used correctly in `PCC_DEFAULTS` for PCC creation, just not for branch creation).

---

## 16. REAL (PRE-FIX) BRANCHES MANUALLY CORRECTED — 2026-08-21

The §15.1/§15.2 bugs affected any branch created 2026-08-13 to 2026-08-21. Found by auditing every branch in connector 128's/140's `branchIds` list against real (non-test) group names in the LIVE GROUP MASTERSHEET.

- **`VQ9GPANOCT26DFW`** (numeric branch id **1965**, guid `ce1b98ba-d3de-4a0a-b9af-8332e53ce131`) — a real client (Pancreatic Cancer Action Network) booking (Cheryl Day, itinerary 284517) was confirmed sent from `noreply@amgine.ai` instead of Kensington's address. **Manually corrected**: disassociated from connector 128, associated with connector 140 (USA); queue confirmed already correct (VQ9G's own 333/334 — coincidentally right since this branch's actual PCC is VQ9G).
- **`SY90WOLSEP26LAX`** (Wolseley, real client) — flagged as needing the same check/fix; **not yet confirmed fixed** at last check.
- **`VQ9GPANOCT26DFW` id 1964** — a second, separate, older branch sharing the same name (duplicate-creation leftover). **Not the one actually in use** — the group row's `Amgine Branch GUID` points at 1965, not 1964. Left alone; likely safe to ignore or eventually clean up.
- **How to find a branch's numeric id from its GUID/name** (needed for any manual connector/queue fix — there is no Amgine admin UI page that shows this, only the API): `GET https://app.amgine.ai/publicapi/api/ServicedEntityBranch?tmcId=116&page={n}&pageNumber={n}&pageSize=100` is a **paginated** list of every branch (`{ items: [...], paging: {...} }`) — scan pages for a matching `guid` or `name`. (This was built as a temp debug endpoint each time, then removed — search the git log for `testFindBranch`/`testFindByGuid` to see the exact pattern if you need to rebuild it.)

**⚠️ Not yet done: a full sweep.** Only the branches surfaced by an actual real booking or by spot-checking were fixed. A systematic audit (list every connector-128/140-stuck branch, cross-reference against real Group IDs in the master sheet, fix each) has not been completed — the one-off audit in this session found 92 stuck branches, all but 2-3 of which were obvious test/demo junk.

**⚠️ CORRECTION (2026-08-26) — the "id 1965 is the plain-name one" claim above was wrong.** Re-checked directly against Amgine: id **1964** has the plain name `VQ9GPANOCT26DFW` and has **zero queues configured** (`travelerPnrSuccessQueueId`/`FailQueueId` both `null`) — it's the broken leftover. Id **1965** is actually named `VQ9GPANOCT26DFW 1784230830229` (WITH the timestamp suffix) and has VQ9G's real working queues (333/334) — it's the one the group row is correctly linked to (guid `ce1b98ba-d3de-4a0a-b9af-8332e53ce131`) and the one actually in use. The naming convention ("plain name = keep, numbered = disable") that Vera assumed is **not a reliable rule** — see §19 for why duplicates happen and §21 for the full re-investigation. Always check queue config + `isActive`, never just the name shape.

---

## 17. OTHER BUGS FOUND & FIXED THIS SESSION (unrelated to §13-§16, found while investigating adjacent issues)

### 17.1 Every form submission silently failed to mirror to the LIVE GROUP MASTERSHEET
`api/submit.js`'s hardcoded `MASTER.completed` column id (`4048986209292164`) no longer matched a real column (it was recreated at some point, getting a new id). Smartsheet rejects the **entire row** if any single column id in the payload is invalid — so this one stale id silently broke the mirror-to-master step for **every** group-form submission, for an unknown period of time. The intake row still saved fine (that's a separate write), so nobody noticed anything was wrong except that the master sheet and its Group ID auto-assignment/notification pipeline never saw those submissions.
- **Fixed:** updated to the correct current id (`7249103084097412`), including the matching key in the `MASTER_TO_AGENT` mirror map (KC Agent Groups sheet).
- **Real-world impact found:** at least two genuinely-missed real client submissions (Subaru Canada — Danielle Trottier, Jennifer Wedley) were stuck on the intake sheet with no Group ID and no master row. Manually created their master rows (blank Group ID, same pattern the automatic mirror would have used) — someone still needs to assign them real Group IDs.
- **Root lesson:** `submit.js`, `create-branch.js`, and any other file with a hardcoded Smartsheet column id map should have those ids spot-checked occasionally — Smartsheet columns silently deleted/recreated (even by intent, e.g. converting a column type) get a new id with no warning, and any hardcoded old id just silently drops that one field (or, worse, breaks the whole write) from then on.

### 17.2 Stale hardcoded Amgine workspace GUID
`api/amgine.js`'s `AMGINE_WORKSPACE_GUID` fallback constant (used to build the Agent Experience link when Amgine's webhook doesn't supply its own `WorkspaceGuid`) was outdated (`8f4a9dd8-d0c9-49cd-aded-000485f5deae`), producing wrong agent-app links. **Fixed** — updated to the correct value (`963f7455-194e-4ecb-b92e-a5122730f18f`). Confirmed nothing overrides this via a Vercel env var of the same name (checked — not present), so the code fallback is what's actually in effect.

### 17.3 Smartsheet "duplicate branch" symptom — usually just test-session residue, not a pipeline bug
If you see two branches for the same Group ID (one plain name, one with a timestamp suffix), check whether it's really a pipeline bug first: the normal "Create Amgine Branch" checkbox flow has a guard that blocks re-onboarding an already-onboarded group (Branch GUID must be blank), so duplicates from that path shouldn't happen. Duplicates usually come from someone (often Nehman, testing) calling `/api/create-branch` **directly** multiple times for the same Group ID, bypassing that guard — each call that finds the name already taken auto-retries with a timestamp suffix (intentional collision-avoidance, not a bug). Always check the group row's `Amgine Branch GUID` to see which one is actually linked/in-use before assuming both matter.

---

## 18a. FULL PIPELINE TEST — 2026-08-24 (confirms §14/§15 fixes work end-to-end)

Ran a complete real test: new group → onboard via the **actual checkbox-webhook path** (not the manual form) → traveller added → Ready to Book → instant booking. All confirmed working:
- Branch created, PCC `VQ9G` resolved to numeric `492`, queues auto-corrected to `333`/`334` (the §15.1 fix holds).
- Traveller booked automatically the instant "Ready to Book" was checked — itinerary created, status "Ready — agent to action", Agent App link generated. No Power Automate polling delay involved (this is the instant-webhook path, separate from PA).
- **Email Country → connector routing confirmed correct on the real pipeline**: a group with `Email Country = cad`, onboarded via the checkbox (simulated the exact webhook event Smartsheet sends), landed in the `canada@kensingtoncorporate.com` connector — the §15.2 fix holds for the path that actually matters.

**New finding — low priority, explicitly not worth fixing per Nehman (2026-08-24):** the *manual* `/api/create-branch` direct-POST path (what `branch-request.html`'s form uses, also reachable via Postman/manual testing) has **no way to set Email Country at all** — it only reads `body.emailCountry`, which the form never sends and which has no row-lookup fallback (unlike the checkbox path, which reads `Email Country` off the group row via `handleGroupWebhook`'s `val()` helper). Any branch onboarded through the manual form always defaults to the USA connector, regardless of the group's actual `Email Country` setting. **Not a real-world problem** — the checkbox path is the one actually used for real client onboarding — but worth knowing this if `branch-request.html` is ever relied on for a real Canadian client instead of the checkbox.

Test artifacts (`PIPETEST0824`, `PIPETEST0824CAD`, `PIPETEST0824CAD2` group rows + traveller row) were cleaned up from Smartsheet after. The 3 Amgine test branches created (ids `2257`, `2258`, `2259`) still exist on Amgine's side — no delete capability built, same as the existing test-branch junk noted in §16.

---

## 18. OPEN ITEMS (as of 2026-08-24)

1. ~~**Branch address defaults to NYC instead of Toronto** (§15.4)~~ — **FIXED 2026-08-24.** Address fallback in `create-branch.js` now reuses `PCC_DEFAULTS` (Kensington's real Toronto address) instead of the hardcoded `225 W 34th Street` placeholder. Verified live: a fresh branch onboarded via the real checkbox path, no address supplied, correctly came back `city: Toronto, country: CA`.
2. **No way to re-apply the queue/connector fix to an existing branch from Smartsheet** (§15.3) — would need a small dedicated trigger; currently manual one-off scripts only.
3. **Full sweep of pre-2026-08-21 branches not completed** (§16) — only spot-checked ones are confirmed fixed.
4. **`PSGR SECURITY DATA REQUIRED PLEASE UPDATE AND RETRY`** — appeared multiple times in a real booking's request history (Cheryl Day, itinerary 284517) during `EndTransaction`, retried automatically and the booking ultimately completed successfully (`PNR WGAMQS`, `Flight Booking Process Completed!`). Not yet understood whether this is expected noise or worth asking Raymond about if it ever blocks a booking outright instead of just retrying.
5. **Colin Braganza's question F** (2026-08-24): whether Kensington's own team can self-serve edit/delete/clean up branches directly in Amgine's admin UI without needing Amgine's help each time — purely a question about Amgine's tool/permissions, not something in our code. Unanswered as of this writing.
6. **CreatePNR failures on specific branches** (§10.3, from July) — never fully resolved; last known conclusion was a GDS/PCC provisioning issue on Amgine's side, not our payload. Not retested recently.
7. **`SY90WOLSEP26LAX` (Wolseley)** — flagged in §16 as needing the same connector check as `VQ9GPANOCT26DFW`; confirm and fix if needed.

---

## 19. ROOT CAUSE OF RECURRING DUPLICATE BRANCHES — FOUND AND FIXED (2026-08-26)

### 19.1 The mechanism
The **webhook** onboarding path (`handleGroupWebhook` in `create-branch.js`) has always correctly guarded against re-onboarding: it only processes a row if its `Amgine Branch GUID` is blank. The **direct-POST** path (`branch-request.html` / manual API calls / Postman) had **no such guard at all** — it would run the full `CreateBranch` chain regardless of whether that `groupId` was already onboarded.

Consequence: any duplicate submission for an already-onboarded group (double-click on the form, a resubmit "just in case," a retried call) silently:
1. Created a **second branch** in Amgine with the same intended name → CreateBranch's own name-collision handling forced a retry with a `Date.now()` timestamp suffix appended (hence names like `VQ9GNTAOCT26PHX 1787339826356`)
2. **Overwrote the group row's `Amgine Branch GUID`** to point at this brand-new duplicate, silently orphaning the original — with no warning, no error, nothing in the response to flag it happened

This is the real explanation for the recurring "why do these branches keep doubling up" pattern (previously misdiagnosed in §17.3 as just manual test residue) — two real incidents hit this in the same week (§21).

### 19.2 The fix (commit `f8be65a`)
Added the same guard to the direct-POST path: before calling `onboard()`, look up the group row by `groupId`; if it already has a non-blank `Amgine Branch GUID`, refuse with `409` and return the existing GUID instead of creating anything:
```json
{"error":"Group \"X\" is already onboarded (Branch GUID ... already set on its row) — refusing to create a duplicate branch.","existingBranchGuid":"..."}
```
**Verified live**: re-tested against `VQ9GNTAOCT26PHX` (already onboarded) — correctly blocked, no duplicate created. (First verification attempt raced the Vercel deploy and hit stale code, creating one more accidental stray branch — id `2305` — which was found and deactivated immediately after; not a flaw in the fix itself, just a timing mistake in how it was tested.)

### 19.3 Also fixed the same day: silent write-back failures (commit `779e8ae`)
Separately, Smartsheet was observed throwing **transient `errorCode 4003` ("Access Denied")** on otherwise-valid, correctly-authorized requests — confirmed reproducible (same call fails then succeeds seconds later with zero changes). If this hit *during* the write-back step right after a branch was created, the branch existed in Amgine but the GUID never made it onto the sheet — leaving that row looking "not yet onboarded" and eligible to be re-onboarded on the next trigger, which is a second way to get a duplicate.
- **Fix**: added `ssRetry()` — retries the sheet fetch/write with backoff (up to 4 attempts) before giving up. If the full write-back still fails after retries, falls back to a minimal write (just the Branch GUID + a loud `⚠` warning in the status column) so the row is never left silently un-onboarded.
- Applied to both the webhook path and the direct-POST path's group-row lookup/write-back.
- **Verified live**: re-ran a full onboarding test after this shipped — completed with zero manual intervention (previously required a manual fix after hitting the transient error mid-test).

### 19.4 Also removed: a duplicate webhook registration
Two separate Smartsheet webhooks named "Amgine branch onboarding" were both registered against the LIVE GROUP MASTERSHEET, both pointing at `/api/create-branch` (ids `395926712936324` and `6201348107593604`). Both fired on a single checkbox tick, doubling Amgine API load per trigger and doubling the odds of hitting the §19.3 race. Deleted the older/unmaintained one (`395926712936324`); kept `6201348107593604`.

---

## 20. REAL BRANCHES FOUND AND REPAIRED — 2026-08-26/27

### 20.1 `VQ9GPANOCT26DFW` (Pancreatic Cancer Action Network) — re-investigated, see correction in §16
Group row confirmed correctly linked to branch **1965** (guid `ce1b98ba-...`, the one with working queues 333/334) — **no relink needed**, the original 2026-08-21 fix held. What actually needed fixing was two travellers whose bookings had no `BookingProfile` attached (flagged by Raymond: itineraries `286185`/`286186`/`286187` — "Does not contain a profile"):
- **Connie Stegora** (row `5136058717175684`): old itinerary `286186` (broken) → resent → new itinerary **`286815`**
- **Kimberly McMullen** (row `138653714218884`): old itinerary `286185` (broken, and its Itinerary-ID column was stale/mismatched vs its own Link column — a minor but harmless leftover from Raymond's own manual resend) → resent → new itinerary **`286817`**
- Group row confirmed to already have real `Company Profile ID` (`213953538`) and `Group Profile ID` (`946172509`) set, so `BookingProfile` should now build correctly on resend — **not independently confirmed on the real PNR**, just confirmed the payload shape is right and the resend succeeded end-to-end.

### 20.2 `VQ9GNTAOCT26PHX` (National Tactical Officers Association) — real disabled-branch incident
Justin Marshall's booking (itinerary `286900`) went to **Suspense**. Investigation found the group row was linked to branch **2250** (`VQ9GNTAOCT26PHX 1787339826356`) which was **`isActive: false`** — disabled on Amgine's side. The actually-active, correctly-configured branch (**2249**, plain name `VQ9GNTAOCT26PHX`, same PCC/queues) existed but wasn't linked to anything.
- **Fix**: repointed the group row's `Amgine Branch GUID` to `1e05aa73-b9e5-49b5-aae2-b108e7b8d537` (branch `2249`).
- **Resent** Justin Marshall's booking (row `7534718708481924`): old itinerary `286900` (suspended) → new itinerary **`286911`**.
- This branch pair was created **2026-08-26 at 19:33 UTC** — well after the §19 guard fix went live (~13:36 UTC same day) — so this specific incident predates the fix or was created by a different path than the one patched. Worth checking Vercel logs around that timestamp if it recurs, to confirm whether it was direct-POST (should now be blocked) or something else.

### 20.3 The real lesson from both incidents
**"Plain name vs numbered suffix" is not a reliable signal for which branch is correct.** In the PAN case, the *suffixed* branch was the good one. In the NTA case, the *plain* one was. The only reliable check is: **is it `isActive`, and does it have real queue ids set?** Both incidents were diagnosed the same way — pull all branches matching the group name, compare `isActive`/queues/PCC/connector side by side, cross-reference against what the Smartsheet group row's `Amgine Branch GUID` actually points to.

---

## 21. PE EMAILS CUSTOM FIELD — SABRE PNR EMAIL FIX (Raymond, 2026-08-26/27)

### 21.1 The problem
Vera reported: the traveller's email reaches Amgine fine (confirmed — `GuestFieldSnapshots` has sent `{FieldName:'Email', Data:t.email}` correctly since the 2026-07 fix, §10.5) but **doesn't end up written into the actual Sabre PNR's native "PE" (Passenger Email) field** once the reservation books. Real consequence: airline/GDS-side systems and anyone pulling the raw PNR directly have no traveller contact info on the actual reservation.

### 21.2 The fix
Raymond added a branch-level **Custom Field** named `"PE Emails"` and asked us to populate it ourselves; his backend maps it into the real PNR. Format (his example): `"PE" + delimiter + email + delimiter`, multiple travellers tethered with `[|]` (not used in practice — we only ever send one traveller per request).

**Shipped in `api/amgine.js` (commit `8d6e4f1`)**, inside `TravelerInformation[0]`, sibling to `GuestSettings`/`BookingProfile`:
```js
...(t.email ? { CustomFields: [{ Name: 'PE Emails', Data: `PE\\${t.email}\\` }] } : {}),
```
Produces e.g. `"PE\nehman.rahimi@kensingtoncorporate.com\"`.

**⚠️ Delimiter note**: Raymond's emailed example rendered the delimiter as **`¥`** (yen sign) — judged to almost certainly be a `\` (backslash) mangled by font/locale rendering, not literal. **Confirmed correct** — verified via a live test (itinerary `287048`, row `8676367404760964`, kept intentionally for reference): the Custom Fields panel in Agent Experience shows exactly `PE\nehman.rahimi@kensingtoncorporate.com\`, matching what we sent byte-for-byte.

### 21.3 What's still unconfirmed
The Custom Field is confirmed **received and stored correctly** by Amgine. Whether it actually propagates into the real Sabre PNR's native PE field once a booking completes has **not** been independently verified (no visibility into the raw GDS record from our side) — ask Raymond to confirm on a completed booking, or check via whatever tool shows the actual PNR.

### 21.4 No new Smartsheet column needed
The field is built entirely from the traveller's existing `Email` column — fully automatic, nothing for agents to fill in separately.

---

## 22. NOTIFICATIONS-NOT-RECEIVED — NOT OUR SIDE (2026-08-26)

Vera also reported two other things in the same round of feedback:
1. **PNR-creation notification not reaching Kensington's inbox** — nothing in our payload triggers or configures this at all; it's entirely Amgine's internal notification engine. Raymond's own response ("I think it's already set up that way") didn't resolve it — still open, not actionable on our side until he investigates further.
2. Separately, Raymond asked Vera for **the list of branches + their configured `Email Country`** so he could consider hardcoding email routing manually per branch instead of relying on our dynamic country-driven connector logic — see §23 for what that pull revealed.

---

## 23. DATA FINDING: `Email Country` IS BLANK ON MOST REAL GROUPS (2026-08-26)

Pulled the full LIVE GROUP MASTERSHEET to answer Raymond's request above. Finding: **only ~5 of ~28 real groups have `Email Country` filled in at all** — everything else is blank. The code defaults blank/unrecognized values to `"us"`:
```js
const emailCountry = norm(inp.emailCountry).toLowerCase() === 'cad' ? 'cad' : 'us';
```
This is defensible logic, but it means **every group where nobody filled in the field silently got the USA connector at onboarding**, regardless of the client's actual country. If any of those blank groups are genuinely Canadian, they've been sending from the wrong address the whole time — not because the connector logic is broken, but because the *input* driving it was never set. This is a workflow/data-entry gap, not a code bug.

Also found a typo: `VQ9GNTAOCT26PHX` had `Email Country = "usd"` (should be `"us"`) — harmless functionally (still defaults to `us` either way) but noted.

**Decision (Nehman, 2026-08-26): not being retroactively fixed.** The logic is already correct for every *future* group — as long as the Email Country dropdown is set to `us`/`cad` at onboarding time, routing works correctly automatically. No further action needed unless someone chooses to audit the existing blank groups later.

---

## 24. OPEN ITEMS (as of 2026-08-27)

1. **White-labeling JENi** — Kensington + Amgine had a training call 2026-08-26 about white-labeling. Real per-branch fields exist in Amgine's schema already (`EnableWhiteLabel`, `WhiteLabelMode`, `WhiteLabelTravelFormUrl`, `WhiteLabelWelcomeMessage`) plus a dedicated **"White Label Config"** page in the branch admin sidebar. **Not yet spec'd**: whether `WhiteLabelTravelFormUrl` needs to be a page *we* host (a real, small build — a Kensington-branded landing page on Vercel) or something Amgine hosts and just skins with our branding. Also unclear whether it goes on the generic template branch (`1687`) so all future branches inherit it automatically, or needs setting per-branch. **Waiting on Raymond's answer before any code is written.**
2. **PE Emails field** — confirmed received correctly by Amgine (§21.3); NOT yet confirmed to actually populate the real Sabre PNR. Needs Raymond or a completed-booking check.
3. **PNR-creation notification to inbox** — still not reaching Kensington's inbox; Raymond hasn't resolved it, not actionable on our side (§22).
4. **`PSGR SECURITY DATA REQUIRED PLEASE UPDATE AND RETRY`** — still unexplained (carried over from §18, no new information).
5. **Colin Braganza's question F** (self-serve branch editing in Amgine's UI) — still unanswered, purely Amgine's side.
6. **`SY90WOLSEP26LAX` (Wolseley)** — still flagged from §16, never explicitly reconfirmed.
7. **Whether the 2026-08-26 19:33 UTC `VQ9GNTAOCT26PHX` duplicate (§20.2) predates the §19 guard fix or slipped through a different path** — worth a quick Vercel-logs check if a similar incident happens again; if it does, the guard isn't fully closing the gap and needs another look.
8. **Email Country blank on ~23 real groups** (§23) — deliberately not being retroactively fixed per Nehman's call; flagged here only so it isn't rediscovered as "new" later.
