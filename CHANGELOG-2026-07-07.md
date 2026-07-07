# 🛠️ Amgine + Smartsheet — Session Changelog (2026-07-07)

_What changed, why, how to test, and what's still open. Everything below is committed to `main` and deployed on Vercel. Pair this with `AMGINE_HANDOFF.md` (the master reference)._

---

## TL;DR
Hardened the Amgine booking integration end-to-end, made bookings **instant**, wired the manager's new group columns into Amgine (flow control + Sabre profiles), switched branch names to the Group ID, and fixed the recurring **duplicate group rows**. Two items remain, both needing an answer from Amgine (Raymond).

---

## What changed (in order)

### 1. `/api/amgine` reliability hardening
- **Failures now write to the row.** Before, a failed booking returned an error in the API response but left the sheet blank — the agent assumed it worked. Now every failure writes `Booking failed: <reason>` to **Amgine Status**.
- **Duplicate-send guard.** Rows are stamped `Sending…` *before* the Amgine call, so an overlapping scan (e.g. Power Automate + a manual Book Now) can't double-book the same traveller.
- **Parallel batches + 60s timeout.** Bookings now fire in parallel batches of 5 (was one-at-a-time), and `api/amgine.js` `maxDuration` is 60s — so a large group (40+ travellers) won't time out and silently skip half.

### 2. Instant bookings via Smartsheet webhook (replaced Power Automate polling)
- The old ~7-minute delay was Power Automate polling on a timer. Now a **Smartsheet change webhook** calls `/api/amgine` the moment **Ready to Book** is checked → near-instant.
- Webhook is registered + **ENABLED**: id `8066633076893572`, scoped to the Traveller MasterSheet (`8780932377956228`), callback `https://kensington-group-form.vercel.app/api/amgine`.
- **Power Automate flow** ("Amgine, Auto Book") is now redundant — safe to leave on as a backup (the dup-guard prevents double-booking), then switch off once the webhook is proven.

### 3. Agent link written on every send
- The **Amgine Link** column now fills instantly at send time (was blank / dependent on the webhook). Built from the tenant **workspace GUID** `8f4a9dd8-d0c9-49cd-aded-000485f5deae` + itinerary ID:
  `https://app.amgine.ai/agentapp/transaction/8f4a9dd8-d0c9-49cd-aded-000485f5deae/<itineraryId>`
- The webhook also falls back to this workspace GUID if Amgine omits it.

### 4. Per-group flow control — "Direct to traveller"
- New group column **Direct to traveller** now drives the booking:
  - **Checked** → skips the agent queue, straight to the traveller (`BypassAgent: true`).
  - **Unchecked** → agent reviews first (Option 2 default; the "Agent internvention" case).
- **Important:** `DirectToAgent` is ALWAYS `true`. Per Amgine's API notes, `DirectToAgent: false` makes the request **expire** (when Intent is specified). Only `BypassAgent` toggles.

### 5. Sabre profiles — `BookingProfile`
- When a group has **Profiled Travellers ☑ + Sabre Profile ID + PCC**, the booking sends a `BookingProfile` so Amgine pulls that GDS profile into the PNR:
  `{ Pcc, GdsProfileId: <Sabre Profile ID>, GdsProfileType: "Corporate" }`
- **Corporate** = group/shared profile (manager's call). Sabre matches on the profile **ID**, not the name.
- Fully optional — no checkbox / no ID / no PCC = books as guest, exactly as before.

### 6. Branch name = Group ID
- `create-branch.js` now names each Amgine branch after the **Group ID** (was `Company (Group ID)`). Group IDs are unique, so they satisfy Amgine's unique-name rule. Falls back to client name + timestamp only when no Group ID is supplied; the collision-retry still appends a timestamp if a name ever repeats.
- Only affects **new** branches; existing branches keep their names (their GUIDs are wired to group rows).

### 7. Fixed recurring duplicate group rows (root cause)
- **`submit.js`** (the group-form handler) writes to intake, LIVE GROUP MASTERSHEET, and KC AGENT on every submission — and was the **only writer with no dedup check**. So any repeat/edited/double-fired submission created duplicate master + agent rows.
- Fix: it now checks whether the submitted **GROUP ID** already exists on the master and **skips both the master and agent insert** if so.
- Verified the daily reconcile cron was innocent (`missingFromMaster: 0`) and sync-groups dedups correctly. Both sheets are currently clean.

### 8. Misc
- `.claude/launch.json` preview server repointed off the missing `npm` to the working PowerShell static server (`.preview-server.ps1`), so local preview works in this environment.

---

## Still open — needs Amgine (Raymond)
1. **Policy Tool link.** We want to auto-generate a link to each branch's policy page (`app.amgine.ai/tmc-management/policy?policygroupguid=<GUID>`) during branch creation, so Vera clicks straight through. **Blocked:** the GUID our `TravelerGroup` call returns errors in the tool. Need the correct `policygroupguid` and how to get it from the onboarding API. (Code to wire it is ~10 min once we know the GUID.)
2. **Show Price.** The group column exists, but there's **no price/display field** in the New Request payload — it's an Amgine branch/notification setting. Need Amgine to confirm how to control it.

## Reference-only (not wired, by design)
- **Air Contracts** column: there's no contract/fare field in the CreateBranch API. "ATI03"-style codes are Atlas's own contracts. Treated as reference for agents unless Kensington has its own contracts to load Amgine-side.
- **Sabre Profile ID / PCC** are used **at booking time** (BookingProfile), NOT at branch creation.

---

## How to test
- **Instant booking:** check *Ready to Book* on an onboarded group's traveller → row flips `Sending…` → `Sent` + itinerary ID + Amgine Link within seconds.
- **Direct to traveller:** check the box on a group → book → confirm the trip skips the agent queue.
- **Sabre profile:** put a real Sabre Profile ID + PCC on a group, check *Profiled Travellers*, book → confirm the profile pulls into the PNR (if it errors, flip `GdsProfileType` to `Traveler`).
- **Dedup:** the fix prevents new dupes; existing sheets are already clean.

## Key IDs
- Traveller MasterSheet: `8780932377956228` · LIVE GROUP MASTERSHEET: `4820086761148292` · KC AGENT GROUPS: `1453513052737412` · Group intake: `3569349083221892`
- Smartsheet webhook: `8066633076893572` · Amgine workspace GUID: `8f4a9dd8-d0c9-49cd-aded-000485f5deae`

## Commits (this session)
```
8a29deb  submit: dedup master + agent inserts by GROUP ID
94cd8c0  create-branch: branch name is now the Group ID (manager's call)
6b86945  amgine: group Sabre BookingProfile uses GdsProfileType "Corporate"
e3d9d16  amgine: fix direct-to-traveller flag + wire Sabre BookingProfile
a11a843  amgine: per-group Direct-to-traveller flag drives DirectToAgent/BypassAgent
d860723  amgine: write agent-app link on every send (workspace GUID)
2f83393  amgine: write failures to row, dup-send guard, webhook handler, parallel batches + 60s timeout
```
