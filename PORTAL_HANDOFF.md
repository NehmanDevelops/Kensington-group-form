# 🌐 CUSTOMER PORTAL — PROJECT HANDOFF (started 2026-07-09)

_New project, green-lit by Sandra Marias. This doc is the transfer point: read it (plus the docs listed at the bottom) and you have full context to start building from any machine._

---

## 0. What this is
A **customer-facing portal** for Kensington Corporate's travelers. Each traveler logs in with an **email + password we provide** and gets a dashboard with their travel resources. Requested by Sandra (2026-07-09), backed by Kathy + Joselynn. **Priority: next alongside Amgine** (Amgine currently blocked on Raymond granting Vera Policy Tool access; Booking Builder + email project = lowest priority per Sandra).

## 1. Portal features (Sandra's spec)
1. **OBT login links** — buttons to the client's Online Booking Tool: **Concur, Deem, or Amgine/JENi** (per-client which one).
2. **Dedicated team contacts** — how to reach their dedicated team/agent + online support. (We already have group → Assigned Agent in Smartsheet.)
3. **Chat** — possibly Twilio (company already uses Twilio for phones). **Explicitly NOT important — phase 2.**
4. **Invoice retrieval** — see Sandra's answer below.
5. **TripIt** — 3rd-party trip tracking; portal needs **setup/usage instructions** (static how-to page).

## 2. Sandra's answers (2026-07-09 email — decisions/constraints)
- **Invoices:** customers currently get a link to the **OLD reporting tool** ("Invoice Retrieval" link). Joselynn confirmed the **NEW reporting tool does NOT have this feature.** → Portal v1: link out to the old reporting tool (need its exact URL from Sandra/Jos). Long-term invoice source = open question.
- **TripArc app:** Sandra wants to piggyback on Trip-ARC's (another division) started app eventually, but **"creating the Portal is first step before the app."** → **Set up time with Joselynn** to learn who to contact at Trip-ARC.
- **SSO for Concur/Deem:** **connect with Chris Wilson** (chris.wilson@kensingtoncorporate.com) on SSOs etc.
- **Project management:** Joselynn is very busy; **Sandra will help PM — go to her at any standstill.**
- **Website update:** doable but needs **IT cooperation** (hosting/access); can draft in the meantime.

## 3. Technical plan (agreed direction)
- **New repo + NEW Vercel project** (e.g. `kensington-portal`) — the existing Kensington-group-form project is AT the 12-function cap; the portal needs its own headroom and its own domain (e.g. portal.kensingtoncorporate.com later; *.vercel.app to start).
- **Stack:** same as everything else — static HTML/CSS/JS front end (Kensington brand: purple #3A2F3C, cream #FDF9EC, taupe #767260, green #1A3E32, SangBleu fonts) + Vercel serverless APIs.
- **Auth:** email + admin-provisioned password. Passwords **hashed** (bcrypt/scrypt), session via signed cookie/JWT. Credentials + traveler→client mapping can live in a Smartsheet (admin-friendly) or a small store — decide at build time. This is customer-facing: do auth properly.
- **Per-client config:** which OBT they use (Concur/Deem/JENi link), their dedicated agent/team, their client name/logo — one config row per client (Smartsheet fits).
- **Mobile-friendly/PWA from day one** — that's the interim answer to the app until Trip-ARC cooperation lands.
- **Build order (proposed):** 1) prototype: login + dashboard shell with the 5 sections (show Sandra fast) → 2) real auth + per-client config → 3) contacts from Smartsheet → 4) invoice link + TripIt page → 5) chat (phase 2, only if wanted).

## 4. Next actions
- [ ] Create `kensington-portal` repo + Vercel project; build the login + dashboard prototype.
- [ ] Ask Sandra/Jos for the **old reporting tool's Invoice Retrieval URL**.
- [ ] **Meeting with Joselynn** → Trip-ARC contact (app piggyback, later phase).
- [ ] **Chris Wilson** → SSO options for Concur/Deem (v1 ships with plain links regardless).
- [ ] Website: ask IT who owns hosting/access before drafting anything real.

---

## 5. BOOKING BUILDER — open thread with Kathy (context for the reply sent 2026-07-09)
Status: **done & tested end-to-end on the live files** (see `CHANGELOG-2026-07-09.md` §A). Flow: CSM logs hotel in Contracted Suppliers → daily 10 AM Office Script run → new hotels appended to Preferred Hotels file → notification email. Replied to Kathy:
- **"Move the existing data over in one go"** — Kathy asked about bringing existing data over (no copy-pasting); we said yes and asked **what data she wants brought over**. ⚠️ Await her answer — likely candidates: the old Hotel Preference Sheet contents, another legacy hotel list, or Booking Builder's current file. One-off script/import when she specifies.
- **Notification inbox** — currently nehman.rahimi@; suggested **onlinesupport@kensingtoncorporate.com**, awaiting confirmation. Change = edit "Send an email (V2)" To field in the PA flow, Save.
- Also pending her review: the ~300 backfilled rows (blank CityCode/ChainCode/AccountNumber) + whether "Chainwide" rows belong.

### 📋 OFFICE TODO (2026-07-10, Kathy's follow-ups — build in the Office Script)
1. **Auto-removals (Kathy chose automatic):** when a hotel disappears from Contracted Suppliers, the daily run removes it from the Preferred file and lists removals in the notification email alongside additions. **Only ever remove automation-added rows** — pre-existing entries untouched. Implementation: the script needs a way to know which Preferred rows the automation added (add a marker/source column it stamps on append, or treat the backfilled range rows 240+ as automation's for the initial tag), then diff tagged rows against current Contracted (Propertyid ↔ LT_HOD) → delete missing → return `{count, added[], removed[]}` and include removals in the email body. Kathy was told "I'll set it up and let you know when it's live."
2. **Notification inbox switched?** Kathy confirmed onlinesupport@kensingtoncorporate.com — verify the PA flow's "Send an email (V2)" To field was actually changed and saved.
3. **Account code:** Kathy says CSMs don't store account codes anywhere. Proposed: add an Account Number column to Contracted Suppliers for CSMs to fill; the script already copies mapped columns — wire it once the column exists. If codes live in another system, she'll point to it.
4. Resolved 2026-07-10: "send everything over" = contracted data (already in via the ~300 backfill — told her); notification question answered (initial backfill notified only Nehman by design).

## 6. State of everything else (quick map)
- **Amgine** — 95%; blocked on Raymond→Vera Policy Tool access. Master ref: `AMGINE_HANDOFF.md`, latest: `CHANGELOG-2026-07-09.md` §B. Top priority for anything Vera needs.
- **UDID / finance / reporting forms** — complete, awaiting Jos feedback.
- **Profitability calculator** — complete, awaiting Jos + Michael feedback (separate local project).
- **Smartsheet infrastructure** — live & stable; updated on Vera's requests.
- **Email project** — parked, lowest priority (Sandra).

## 7. Docs index (read in this order on a fresh machine)
1. `PORTAL_HANDOFF.md` ← you are here (new project)
2. `AMGINE_HANDOFF.md` — master Amgine reference
3. `CHANGELOG-2026-07-09.md` — Booking Builder finale + Amgine last fixes
4. `CHANGELOG-2026-07-07.md` — Amgine hardening/webhook/Sabre session
