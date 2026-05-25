# Agent Workflow Guide

**Kensington Corporate — Group Travel System**
**Audience:** Travel Advisors / Agents
**Last updated:** May 2026

---

## 1. OVERVIEW

This guide walks you through working a group from start to finish in the Smartsheet system. Every group has a unique **GROUP ID** (e.g. `N*MENASCAR`) — this is your single source of truth for tracking everything tied to that group.

**Three main sheets you'll use:**

| Sheet | What it's for |
|---|---|
| **LIVE GROUP MASTERSHEET** | High-level group info — your starting point. One row per group. |
| **Traveller Profile** | Individual traveller records. One row per traveller, tagged with the GROUP ID. |
| **Email Parser – CVENT** | Auto-populated from CVENT registration emails. Shows booking status, PNR, options sent. |

---

## 2. STAGE 1 — RECEIVING A NEW GROUP

### 2.1 You'll get an email
When the Group Manager (Vera) assigns you to a group, you'll receive an automatic email:

> *"You've been assigned to a new group — [Group Name]. Please log in to Smartsheet to review the details."*

### 2.2 Open LIVE GROUP MASTERSHEET
Find your row by the GROUP ID. You'll see:
- **Company Name** + **Group Name** (e.g. Monster / Reyes FSOP NASCAR)
- **Contact Name** + **Contact Email**
- **Travel Start Date** + **Travel End Date** + **Return Date**
- **Registration Open From / To**
- **Event Status** (Open / Closed)
- **Group Travel Intake** (the original form submission, attached as a file)

### 2.3 Change Status from `New` → `In Progress`
Click the **Status** column on your group's row and select **In Progress**. This signals to the manager that you've picked it up.

---

## 3. STAGE 2 — CLIENT CONTACT

### 3.1 Reach out to the client
Use the Contact Email and Contact Name from the mastersheet. Confirm:
- Final passenger count
- Travel dates
- Cabin class preferences
- Any deviations from the standard policy

### 3.2 Send them the Traveller Profile form link
The client will share the form with each traveller in the group. Each submission creates a new row in the **Traveller Profile** sheet, automatically tagged with their **GROUP ID**.

### 3.3 Watch the # Signed Up column
On the mastersheet, the **# Signed Up** column auto-counts how many travellers have submitted profiles for your group. You don't have to track this manually.

---

## 4. STAGE 3 — WORKING THE TRAVELLERS

### 4.1 Open Traveller Profile sheet, filter by GROUP ID
Use the filter button at the top → filter **Group ID** = your group's GROUP ID. You'll see only the travellers for your group.

### 4.2 For each traveller:

1. **Review their profile** — passport, dates of birth, preferences, loyalty numbers
2. **Push them into Amgine** (or your current booking tool) — generate flight options
3. **Send options to the client** — once sent, tick the **Contacted** checkbox

### 4.3 The Contacted checkbox matters
Ticking **Contacted** does two things automatically:
- Increments the **# Contacted** count on the mastersheet for your group
- Updates the **Numbers By Advisor** report so the manager can see your progress

### 4.4 When the client books
Once a traveller has confirmed and you've ticketed them in SABRE:
- Update **Status** on their Traveller Profile row → **Booked**
- Tick the **Ticketed** checkbox once tickets are issued

This auto-updates **# Ticketed** on the mastersheet.

---

## 5. STAGE 4 — CVENT REGISTRATION EMAILS

If the group uses CVENT for registration, you'll see emails being parsed automatically into the **Email Parser – CVENT** sheet.

**Important:** Make sure the **Event Code** field on the CVENT sheet matches the GROUP ID. If it's blank, fill it in — otherwise the Traveller Progress Report won't link CVENT registrations back to your group.

**Color coding:**
- 🟢 **Green row** = Status is `Booked` (ticketed)
- 🟡 **Yellow row** = Status is `Awaiting Client` (option sent, waiting on them)

---

## 6. STAGE 5 — CLOSING OUT A GROUP

When all travellers are ticketed and travel is complete:

1. Go to LIVE GROUP MASTERSHEET → your group's row
2. Change **Status** → **Complete**
3. Tick the **Completed** checkbox
4. Verify **# Ticketed** matches the total group size

This moves the group out of the active dashboard and into the archive.

---

## 7. WHERE TO FIND THINGS

| What you need | Where it lives |
|---|---|
| List of groups assigned to you | **Numbers By Advisor** report — filtered to your name |
| Travellers for a specific group | **Traveller Profile** sheet — filter by GROUP ID |
| Group progress at a glance | **GROUPS Dashboard** → Progress Breakdown widget |
| Your own stats (Open / In Progress / Ticketed) | **Numbers By Advisor** report |
| CVENT booking confirmations | **Email Parser – CVENT** sheet |

---

## 8. STATUS DEFINITIONS

### Group Status (on LIVE GROUP MASTERSHEET)
| Status | Meaning |
|---|---|
| **New** | Just submitted, not yet picked up |
| **In Progress** | Agent assigned, actively working |
| **Complete** | All travellers ticketed, group closed |

### Traveller Status (on Traveller Profile + CVENT sheets)
| Status | Meaning | Row color |
|---|---|---|
| **New** | Profile submitted, no action yet | White |
| **In Progress** | Agent working on options | White |
| **Awaiting Client** | Options sent, waiting on booking decision | 🟡 Yellow |
| **Booked** | Confirmed and ticketed | 🟢 Green |
| **Cancelled** | Booking cancelled | Grey |

---

## 9. COMMON QUESTIONS

**Q: I don't see a group I was told I was assigned to.**
A: Check your email — the assignment notification has a direct link. Also confirm with Vera that the Assigned Agent field on the mastersheet is set to your name.

**Q: The # Signed Up count is wrong.**
A: Double-check the GROUP ID on the mastersheet matches what's in the Traveller Profile sheet. If a profile was submitted with a wrong/missing GROUP ID, the count won't reflect it. Edit the Group ID on the traveller's row to fix.

**Q: Why is # Contacted not going up after I emailed the client?**
A: You need to tick the **Contacted** checkbox on each individual traveller's row in the Traveller Profile sheet — emails are tracked manually via that checkbox.

**Q: A traveller's row is highlighted yellow / green — what does that mean?**
A: Yellow = Awaiting Client (option sent), Green = Booked. This is automatic based on the Status field.

**Q: I need to escalate something — who do I go to?**
A: Vera Perisic (Group Manager) — vera.perisic@kensingtoncorporate.com

---

## 10. QUICK REFERENCE CHECKLIST

When you pick up a new group:
- [ ] Read the email notification
- [ ] Open LIVE GROUP MASTERSHEET — find your row by GROUP ID
- [ ] Change Status → In Progress
- [ ] Contact the client
- [ ] Confirm passenger count, dates, preferences
- [ ] Wait for traveller profiles to come in (watch # Signed Up)
- [ ] Filter Traveller Profile sheet by GROUP ID
- [ ] Generate options in Amgine / send to client
- [ ] Tick Contacted as you reach each traveller
- [ ] Book + ticket in SABRE
- [ ] Tick Ticketed for each completed traveller
- [ ] When everyone's ticketed → Status = Complete + tick Completed checkbox

---

**Need help?** Contact Vera Perisic (Group Manager) or Nehman Rahimi (IT).
