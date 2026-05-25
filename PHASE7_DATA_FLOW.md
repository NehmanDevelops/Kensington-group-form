# Phase 7 — Integration Data Flow Requirements

**Owner:** IT (lead), Group Manager (requirements)
**Status:** Pre-integration prep — to be executed when Amgine onboards (Aug/Sep 2026)

---

## 1. SYSTEM OVERVIEW

| System | Role | Status |
|---|---|---|
| **Vercel Forms** (Group Travel + Traveller Profile) | Client-facing intake | ✅ Live |
| **Smartsheet** (LIVE GROUP MASTERSHEET, Traveller Profile, CVENT Email Parser) | Internal source of truth | ✅ Live |
| **CVENT** | External registration platform | ✅ Email parser live; full API sync pending |
| **Amgine** | External booking platform | ⏳ Not onboarded |
| **Jeni** | Internal Kensington system | ⏳ Sync requirements TBD |
| **SABRE** | Ticketing GDS | ✅ Live (manual entry by agents) |

---

## 2. DATA FLOW MAP

### 2.1 Inbound to Smartsheet

```
┌──────────────────┐
│ Group Travel     │── POST ──> Group Travel Form Sheet ──> LIVE GROUP MASTERSHEET
│ Form (Vercel)    │            (intake record)            (master tracker row)
└──────────────────┘
       │
       │ Auto-creates GROUP ID
       ▼
┌──────────────────┐
│ Traveller        │── POST ──> Traveller Profile Sheet
│ Profile Form     │            (one row per traveller, tagged with GROUP ID)
│ (Vercel)         │
└──────────────────┘

┌──────────────────┐
│ CVENT            │── Email ──> Email Parser – CVENT Sheet
│ (registration)   │             (Status, Options Sent, PNR, etc.)
└──────────────────┘

┌──────────────────┐
│ AMGINE           │── API ────> Traveller Profile Sheet  ← NEW (Phase 7)
│ (booking)        │             (Booking Link, Amgine ID, PNR, Offer Feedback)
└──────────────────┘
```

### 2.2 Outbound from Smartsheet

```
LIVE GROUP MASTERSHEET ──> Jeni (sync TBD — Group ID, Status, Assigned Agent)
                       └──> Reports/Dashboards (internal)

Traveller Profile ──────> Amgine? (push profile data to booking platform)
                  └─────> SABRE (manual today; potentially auto-sync)
```

---

## 3. TRIGGER POINTS

| # | Event | Source | Target | Trigger Action |
|---|---|---|---|---|
| 1 | New group request submitted | Vercel Form | Group Travel Form Sheet + LIVE GROUP MASTERSHEET | Create row in both, generate GROUP ID, notify corp.groups@kensington |
| 2 | New traveller profile submitted | Vercel Form | Traveller Profile Sheet | Create row tagged with GROUP ID, increment # Signed Up on mastersheet |
| 3 | Agent assigned to group | LIVE GROUP MASTERSHEET (manual) | Email to assigned agent | ✅ Already live |
| 4 | CVENT registration update | CVENT email | Email Parser sheet | Parse + populate Status, Options Sent, PNR |
| 5 | **Amgine: Option Sent** | Amgine API | Traveller Profile | Update Status → "Option Sent", record Amgine Booking Link |
| 6 | **Amgine: Booking confirmed** | Amgine API | Traveller Profile | Update Status → "Booked", record PNR, Amgine ID |
| 7 | **Amgine: Ticket issued** | Amgine API | Traveller Profile | Tick "Ticketed" checkbox, update Status → "Ticketed" |
| 8 | **Amgine: Booking cancelled** | Amgine API | Traveller Profile | Update Status → "Cancelled" |
| 9 | **Status changes to Ticketed** | Traveller Profile | Mastersheet # Ticketed count auto-updates | ✅ Formula already live |
| 10 | **Sync to Jeni** | LIVE GROUP MASTERSHEET (TBD frequency) | Jeni | Push GROUP ID, Status, Company Name, Assigned Agent |

---

## 4. FIELD MAPPINGS

### 4.1 Amgine → Smartsheet (Traveller Profile Sheet)

| Amgine Field | Smartsheet Column | Type | Notes |
|---|---|---|---|
| `booking_url` | Amgine Booking Link | URL | New column to add |
| `booking_id` | Amgine ID | Text | New column to add |
| `branch_id` | Amgine Branch ID | Text | New column to add |
| `pnr` | PNR | Text | Already exists on CVENT sheet — mirror to Traveller Profile |
| `status` | Status | Picklist | Map: `quoted` → `Option Sent`, `confirmed` → `Booked`, `ticketed` → `Ticketed`, `cancelled` → `Cancelled` |
| `offer_feedback` | Offer Feedback | Text | New column — captures decline reasons (Fare too high, Depart time too early, etc.) |
| `air_contracts` | Air Contracts | Text | New column to add |
| `profile_name` | Profile Name | Text | New column to add |
| `profile_id` | Profile ID | Text | New column to add |
| `profile_pcc` | Profile PCC | Text | New column to add |
| `show_price` | Show Price | Checkbox | New column to add |
| `direct_to_traveler` | Direct to Traveler | Checkbox | New column to add |

**Match key:** Traveller Email Address OR Amgine ID (whichever Amgine returns reliably)

### 4.2 Smartsheet → Amgine (push to booking platform)

| Smartsheet Column | Amgine Field | Notes |
|---|---|---|
| GROUP ID | `group_reference` | Used by agents to file booking under correct group in Amgine |
| First Name + Last Name | `traveller_name` | |
| Email Address | `traveller_email` | Primary match key |
| Date of Birth | `dob` | Required for ticketing |
| Passport Number, Country, Expiry | `passport_*` | International travel |
| Known Traveller Number | `ktn` | TSA precheck |
| Seat Preference, Meal Preference | `preferences` | |

### 4.3 CVENT → Smartsheet (Email Parser sheet) — current state

Already mapped in Email Parser – CVENT sheet (60 columns). Key fields:
- Event Code, Event Title, Event Date
- Status, Reservation Status
- Options Sent Date, Options Selected
- PNR

**Improvement needed:** CVENT Event Code should auto-link to GROUP ID on the mastersheet via cross-sheet formula. Currently agents fill Event Code manually.

### 4.4 Smartsheet → Jeni (TBD — requirements gathering needed)

| Smartsheet Source | Jeni Target | Sync Frequency |
|---|---|---|
| LIVE GROUP MASTERSHEET (GROUP ID, Status, Company Name, Assigned Agent) | TBD | TBD |
| Traveller Profile (PNR, Status, Booking dates) | TBD | TBD |

**Questions to answer with Jeni owner:**
- Does Jeni have an API or are we exporting flat files?
- One-way push or bidirectional sync?
- Real-time, hourly, daily?
- What fields does Jeni actually need?

---

## 5. AUTHENTICATION & ACCESS REQUIREMENTS

| System | Auth Method | Who Owns |
|---|---|---|
| Smartsheet | API Bearer Token | Dragos (IT admin) — Nehman/Vera need System Admin |
| Amgine | TBD — likely OAuth or API key | Amgine team |
| Jeni | TBD | Internal IT |
| CVENT | API key (if upgrading from email parsing) | CVENT account owner |

---

## 6. END-TO-END FLOW TO VALIDATE

**Test scenario:** New group "ACME Conference 2026" with 10 travellers

1. ✅ Client submits Group Travel Form → row appears in mastersheet with GROUP ID `N*ACMECONF26`
2. ✅ corp.groups@kensington gets notification
3. ✅ Vera assigns agent → agent gets email notification
4. ✅ Vera sends Traveller Profile form link to client
5. ✅ 10 travellers submit profiles tagged with `N*ACMECONF26` → # Signed Up shows 10 on mastersheet
6. ⏳ Agent pushes profiles to Amgine → Amgine creates booking offers
7. ⏳ Amgine returns booking link → populates Amgine Booking Link column
8. ⏳ Client books → Amgine sends status update → Status = "Booked" on Traveller Profile
9. ⏳ Agent tickets in SABRE → ticks Ticketed checkbox → # Ticketed updates
10. ⏳ Data syncs to Jeni for reporting

Steps 1-5 ✅ working today. Steps 6-10 ⏳ pending Phase 7 integration.

---

## 7. OUTSTANDING DECISIONS

- [ ] Confirm with Amgine: API endpoints, auth, rate limits, webhook support
- [ ] Confirm with Jeni owner: what data is needed, sync method
- [ ] Confirm with CVENT: upgrade from email parsing to API sync? Or keep current setup?
- [ ] Middleware vs direct API: do we use Zapier/Make.com, or build a custom Node service on Vercel?
- [ ] Error handling: where do failed sync attempts get logged?
- [ ] Backup plan: if Amgine API is down, do agents fall back to manual entry?

---

## 8. SUGGESTED PHASE 7 EXECUTION ORDER

1. **Week 1-2:** Discovery calls with Amgine, Jeni, CVENT teams. Document their APIs/capabilities.
2. **Week 3:** Finalize this data flow doc with confirmed field names and triggers.
3. **Week 4:** Add placeholder Smartsheet columns for all Amgine fields (so structure is ready).
4. **Week 5-6:** Build Amgine ↔ Smartsheet integration (highest priority).
5. **Week 7:** Build Smartsheet ↔ Jeni sync.
6. **Week 8:** CVENT improvements (if needed beyond email parser).
7. **Week 9-10:** End-to-end testing with a real test group.
8. **Week 11:** Agent training on new workflow.
9. **Week 12:** Go-live.
