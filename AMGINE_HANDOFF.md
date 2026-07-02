# 🧳 AMGINE INTEGRATION — FULL HANDOFF

_Last updated: 2026-07-02 — ✅ FULL LOOP PROVEN END-TO-END_

## 🎉 STATUS: WORKING (2026-07-02)
Itinerary 261735 booked → curated to "Direct Traveler" on **Generic Branch** → Amgine fired a live webhook → the sheet auto-wrote `Amgine Status` = "Sent to traveler" + a client approval `Amgine Link`. Send, curate, webhook, and write-back all confirmed.

### 🔑 The Suspense fix (the big one)
Trips kept dying in **Suspense** because we were booking to self-created **"New Branch Name…"** branches (from the Postman CreateBranch call, which clones `sourceSEB=1687`). Those clones aren't content-configured, so Amgine can't curate them → Suspense every time. The **working** branch is **"Generic Branch"**:
- **Branch GUID:** `b58b59ea-fd74-4b25-85e4-f3620fc06982`
- **Policy GUID:** `a3497199-6936-4035-bc3c-8c911f7ebc83`

Put THOSE in a group's row (LIVE GROUP MASTERSHEET `Amgine Branch GUID` / `Amgine Policy GUID`) and trips curate. **For real groups: use the Generic Branch GUID, not a freshly-created one.** Open question for Raymond: should each client get its own configured branch, or all book under Generic Branch?



## 1. WHAT IT IS
Automated pipeline: **Smartsheet → Amgine corporate travel-booking API**. When a traveller is marked "Ready to Book," it auto-sends a booking request to Amgine and writes the itinerary ID back.

- **Repo:** `NehmanDevelops/Kensington-group-form` (deployed on Vercel)
- **Local working dir:** `C:\Users\owner\AppData\Local\Temp\kensington-group-form-3`
- **The endpoint:** `/api/amgine.js`
- **Production URL:** `https://kensington-group-form.vercel.app/api/amgine`

## 2. PEOPLE / CONTACTS
- **Raymond Sobaram** (Amgine engineer) — `raymond@amgine.ai`
- **Vera Perisic** (Kensington) — `vera.perisic@kensingtoncorporate.com`
- **You** — `nehman.rahimi@kensingtoncorporate.com`

## 3. KEY SHEET IDs
| Sheet | ID |
|---|---|
| Traveller MasterSheet (where bookings read from) | `8780932377956228` |
| LIVE GROUP MASTERSHEET (where Branch/Policy GUIDs live) | `4820086761148292` |
| KCG Agent traveller copy | `7213505705889668` |
| CVENT Email Parser | `1658234917048196` |
| Advisor Summary | `4629439471112068` |
| Numbers By Advisor report | `2981953635569540` |
| KCG MANAGER workspace | `1374247030417284` |

## 4. AUTH (the part that fought us)
- **Method: `client_secret_basic`** — client_id:secret go in a **Basic Authorization header**, NOT the body. Body-only → `unauthorized_client`.
- **Token endpoint (Keycloak):** `login-app.amgine.ai/identity/auth/realms/amgine-realm/protocol/openid-connect/token`
- **Env vars in Vercel** (all marked Sensitive): `AMGINE_TOKEN_URL`, `AMGINE_CLIENT_ID`, `AMGINE_CLIENT_SECRET`, `AMGINE_GRANT_TYPE`, `AMGINE_SCOPE`, `AMGINE_USERNAME`, `AMGINE_PASSWORD`, `AMGINE_API_URL`, `AMGINE_TMC_GUID`, `AMGINE_HASH`, plus `SMARTSHEET_API_TOKEN`.
- **Secret gotchas (history):** the secret once had a leading TAB pasted from Postman, and it contains a **lowercase "l"** that looks like a capital "I" — copy it from Postman Console to get the exact value. Secrets live ONLY in Vercel, never in repo/memory.

## 5. WHAT'S A "BRANCH" (Raymond kept asking)
A **branch = the account/container for ONE Kensington group**, sitting under the Service Entity ("Kensington Corporate").
- **1 group = 1 branch = 1 Branch GUID.**
- Every booking must specify a branch (`AmgineServicedEntityBranchGuid`) so Amgine knows the group/policy/billing.
- **Branch seen today:** Branch ID `1794`, GUID `2935c013-5a8e-42b4-afca-b49092edc4b2`, Name "New Branch Name 20260629165020", Service Entity Kensington Corporate.
- **Corp profile ID (Vera's note):** `930396495`

## 6. ONBOARDING A GROUP (currently MANUAL via Postman)
Run in order: **GetToken → CreateBranch → CreatePolicyRule → CreatePolicyGroup**, then paste the returned **Branch GUID** + **Policy GUID** into that group's row on LIVE GROUP MASTERSHEET.

**Columns already added:**
- Group sheet: `Amgine Branch GUID`, `Amgine Policy GUID`, `Amgine Onboarded`
- Traveller sheet: `Ready to Book`, `Amgine Itinerary ID`, `Amgine Status`, `Departure Airport (IATA)`, `Arrival Airport (IATA)`

## 7. HOW SENDING WORKS (`/api/amgine.js`)
**Three trigger modes (POST):**
- `{"scan": true}` → books EVERY row where `Ready to Book` is checked AND `Amgine Itinerary ID` is empty (loop guard: once ID is written, won't re-fire)
- `{"rowId": <id>}` → book one row
- `{"email": "..."}` or `{"firstName","lastName","groupId"}` → lookup test

**Payload built per traveller:** GuestSettings (FirstName, MiddleName, LastName, Gender→M/F, DateOfBirth→DD-MM-YYYY, Email, Phone, KnownTravelerNumber, RedressNumber, CountryOfIssue), Intent (Flight nodes: From/To IATA, DepartureDate ISO, NonStop), **ExternalId = {Id: Smartsheet row id, ThreadId: groupId}** (this is the webhook match key), TmcGuid, Hash, TravelerRequested (branch GUID + policy GUID).

**Helpers:** `toGender()` Male→M/Female→F · `toDOB()` → DD-MM-YYYY · `toISODate()` → YYYY-MM-DDT00:00:00 · `toIATA()` extracts 3-letter code.

## 8. ⚠️ LAST CHANGE (already committed + pushed)
Flipped the Suspense flags in the payload:
```
WAS:  DirectToAgent: true,  BypassAgent: false   ← parked everything in agent Suspense queue
NOW:  DirectToAgent: false, BypassAgent: true    ← bypasses the agent queue
```
**Why:** every request was landing in "Suspense" (agent to-do queue). Raymond was puzzled too. This makes Amgine process instead of parking. **Commit pushed; Vercel auto-redeploys (~30s).** ⏳ **Needs re-test to confirm Suspense is gone.**

## 9. POWER AUTOMATE TRIGGER (built, working)
Flow: **"When a sheet is updated"** on Traveller MasterSheet → **HTTP POST** to `https://kensington-group-form.vercel.app/api/amgine` with body `{"scan": true}`, header `Content-Type: application/json`. No dynamic content needed. **Proven:** itinerary 260284 auto-booked in ~18s.

## 10. TEST ITINERARIES CREATED (ask Raymond to clear these)
`260117`, `260135`, `260284` (PA auto), `260344` (Test Booking), `260345` & `260358` (Raymond Davis, TYS→SNA), `260341` (in agent-app URL).

## 11. ✅ WEBHOOK — BUILT & TESTED (2026-07-02)
- Raymond sent `WebhookResponses.txt` with example payloads for every lifecycle state.
- The webhook half of `/api/amgine.js` is now a **real handler**: detects `ItineraryState`, matches the traveller row by **ExternalId** (our row id) or fallback **ItineraryId**, then writes:
  - `Amgine Status` — friendly label (e.g. "Ready — agent to action", "Sent to traveler", "Booked", "Booking failed"; unknown states → "Suspense: <state>")
  - `Amgine Link` — Agent Experience link, or a **client approval link** when the payload has an `AccessHash` (Direct_Traveler / Agent_Approved)
  - `Amgine Note` — any traveler/agent note
  - Columns `Amgine Link` + `Amgine Note` were added to the master sheet.
- **States handled:** Ready, Direct_Traveler, Agent_Approved, Agent_Declined, Client_Declined, Client_Booking, Booked, Booking_Failed; anything else = Suspense.
- **Tested live** against itinerary 260358 (Ready / Agent_Approved / unknown all matched + wrote correctly). Always returns HTTP 200.
- **🔴 LAST STEP:** reply to Raymond — *"Web service is ready, please switch my webhook from https://kensingtonamgs.requestcatcher.com/ to https://kensington-group-form.vercel.app/api/amgine"*. He updates it server-side.

## 12. AGENT APP
- URL: `https://app.amgine.ai/agentapp/transaction/de167993-6164-4baf-bccb-62b630363808/260341`
- **Need login from Raymond** to visually verify bookings.

## 13. ⚙️ VERCEL CONSTRAINT
Hobby plan = **12-function cap**, currently near it (~11). A 13th file silently breaks ALL deploys. Adding `create-branch.js` may need a slot freed or **upgrade to Vercel Pro**.

## 14. PARALLEL-SESSION RULE
Your laptop Claude pushes to the SAME repo. **Always `git fetch` + `git reset --hard origin/main` BEFORE editing**, and push promptly, or you'll collide.

---

## ✅ WHAT'S NEXT (priority order)
1. **Confirm Suspense fix** — wait for redeploy, clear Raymond Davis's `Amgine Itinerary ID`, fire `{"scan":true}`, check if it skips Suspense.
2. **Webhook** — get Raymond to confirm the exact URL + enable + fire a test; capture the POST payload; build the handler.
3. **Build branch-creation form** (chosen) → `/api/create-branch.js` calling Amgine CreateBranch automatically. **BLOCKED until you paste the Postman specs for: CreateBranch, CreatePolicyRule, CreatePolicyGroup (URL + body of each).** Watch the Vercel function cap.
4. **Onboard real groups** — paste Branch/Policy GUIDs into LIVE GROUP MASTERSHEET.
5. **Fill IATA airport codes** for real travellers (else flight legs are empty).
6. **Get Agent App login** from Raymond.
7. **Clear test itineraries** (260117, 260135, 260284, 260341, 260344, 260345, 260358).
