# Kensington Corporate — Project Handoff

**Last updated: 2026-10-08.** This is the single place that says what exists, how it works, what is still open and what not to redo.
No passwords, tokens or secrets are written here. Secrets live only in Vercel / GitHub Actions environment settings (names are listed below).

> **How to use this file.** Read sections 1–2 first, then jump to the system you are touching. When something ships, changes or a decision is made, update this file in the same commit. Section 6 (Open items) is the to-do list; Section 7 (Decisions and dead ends) saves you from repeating work.
> Per-system deep dives that already exist: `AMGINE_HANDOFF.md`, `PORTAL_HANDOFF.md` (this repo), `HUBSPOT_HANDOFF.md` (repo `implementation-hubspot-sync`), `README.md` (repo `sales-bi-sync`).

---

## 1. People and who asks for what

| Person | Role / what they care about |
|---|---|
| **Nehman Rahimi** | Smartsheet Workflow & Automation intern, moving to Jos's team. Builds and maintains everything here. Prefers plain-English answers, all steps at once, short Teams drafts. |
| **Joselynn (Jos) Alderson** | Nehman's manager. Sets priorities: Power BI → HubSpot numbers, go-live communications, reporting requests. |
| **Jenna Davidson** | Implementations (CSIM). Owns the go-live emails and the per-client implementation workbooks. |
| **Vera Perisic** | Groups. Owns the group master sheets and the Arbonne project. |
| **Michael, Sandra, Kathy** | Stakeholders for HubSpot dashboard, reporting and finance requests. |

---

## 2. The map (what runs where)

All repos are under GitHub user `NehmanDevelops`. Deploys are on Vercel (`vercel --prod --yes` if git auto-deploy does not fire).

| System | What it does | Live URL | Repo |
|---|---|---|---|
| **Forms site** | Group Travel, Finance, Corporate Reporting, UDID, Traveller Profile, Agent, Branch, Go-Live Communications, etc. Serverless functions in `api/` write to Smartsheet. | https://kensington-group-form.vercel.app | `Kensington-group-form` |
| **Go-Live Communications** | One form → three emails (internal, client welcome, Travel Manager next steps), customizable in place. | …/go-live-communication.html | same repo + `kensington-link-portal` (settings) |
| **Arbonne sync** | Arbonne's Smartsheet → our Envoy Traveller MasterSheet, both directions. | (runs inside `api/reconcile-groups.js`) | `Kensington-group-form` |
| **Link Hub** | One page listing every live tool; add/remove links. Also hosts the Go-Live settings service. | https://link-portal-alpha.vercel.app | `kensington-link-portal` |
| **Sales BI ↔ HubSpot** | Monthly: Power BI sales + margin per client → HubSpot Company properties. | https://sales-bi-sync.vercel.app (dashboard) | `sales-bi-sync` (GitHub Actions does the work) |
| **Implementation ↔ HubSpot** | Smartsheet implementation plans → HubSpot company record, tasks as Tickets, dashboard, 30-day archive. | https://implementation-hubspot-sync.vercel.app | `implementation-hubspot-sync` |
| **Status board** | Nehman's projects/wishlist/schedule board. | https://nehman-status-board.vercel.app | `nehman-status-board` |
| Other apps | Profitability calculator, Kensington Portal, Agent Portal, standalone Traveller Profile. | see Link Hub | `kensington-profitability-calculator`, `kensington-portal`, `kensington-agent-portal`, `Kensington-traveller-profile` |

**Secrets / environment variables (names only):**
- Forms site (Vercel): `SMARTSHEET_API_TOKEN` (the token belongs to the **corp.groups@kensingtoncorporate.com** account), `FINANCE_FLOW_URL` and related Power Automate URLs.
- Link Hub (Vercel): `GITHUB_TOKEN` (used to save links and Go-Live settings into its own repo).
- Sales BI sync (GitHub Actions secrets): `PBI_CLIENT_SECRET`, `HUBSPOT_TOKEN`.
- Implementation sync (Vercel): HubSpot key + Smartsheet token; see its handoff.

---

## 3. Systems in detail

### 3.1 Forms site and the group sheets (`Kensington-group-form`)
- **Vercel Hobby limit: 12 serverless functions.** `api/` has 11 files today. A 13th file silently breaks deploys, so add new behaviour inside an existing function when possible (that is why the Arbonne sync lives in `reconcile-groups.js`).
- **Group Travel form** (`index.html`, `api/submit.js`): writes to the intake sheet and mirrors a row to the group master. Has a 3-minute duplicate guard and mirrors Event Name.
- **Sheet naming trap.** The code's `MASTER_SHEET` (`4820086761148292`) is the sheet named **"1. LIVE Groups"** (153 columns). A *different*, smaller sheet is literally named **"LIVE GROUP MASTERSHEET"** (`1628238211141508`, 11 columns). Comments in older code call the first one "LIVE GROUP MASTERSHEET". Check IDs, not names.
- **Intake sheet** `3569349083221892`. **"Synced to Master"** checkbox column (added 2026-10-02): a group is only ever created on the master once. This stops the daily cron `/api/reconcile-groups?commit=1` (13:00 UTC ≈ 9am ET) from resurrecting groups Vera archived. A one-time `?setup=1&commit=1` already ran (20 rows ticked). If the intake sheet also has a "Do Not Sync" checkbox column, ticking it retires a group too.
- **Reporting Request form** (`reporting-request.html`): "New Client?" dropdown (new clients give a go-live date instead of travel dates) and a "Request Type" dropdown (Group / CSM/CSIM). The Request Type options were Nehman's guess and were never confirmed with Jos.
- **Finance request form** (`finance-request.html`): every request type is sent to the Excel tracker via Power Automate (`requestType` + `details`).
- **Amgine, Customer Portal, UDID flow:** see `AMGINE_HANDOFF.md` and `PORTAL_HANDOFF.md`.

### 3.2 Go-Live Communications (`go-live-communication.html`)
**What users see:** one page. Fill in the account once; three email tabs (Internal communication, Welcome letter, Travel Manager next steps) show a live Outlook-style preview. "Create email in Outlook" opens a normal Outlook draft (mailto) with To, CC, subject and plain-text body; fireworks play; Internal and Welcome also log to the Excel tracker through Power Automate (`/api/finance-tracker`, action `proxy-flow`, Mode = Internal / External). You can type extra "Also send to / Also CC" addresses per email.

**Styled email (added 2026-10-08, Michael wanted it "flashy"):** buttons *Copy styled email* and *Download styled email* next to Copy text. `GoLive.toHtml()` in `go-live-engine.js` turns the plain email into a branded HTML version (green banner, logo from `/kensington-logo-cream.png`, gold headings). It is built from exactly what the preview shows (form answers, extra recipients, unsaved wording edits). Outlook cannot receive HTML from a link, so the user pastes it (Ctrl+V) into a new email; the download is a page with a Copy button. US reservations email `usa@kensingtoncorporate.com` is now in the welcome letter. Lesson: never write a literal closing script tag inside a JS string in the page (it killed the whole page for ~10 minutes); always run `node --check` on the page script before pushing.

**Customizing (everything happens in place, no separate page):**
- **+ Add a field** at the bottom of every section (question, answer type, choices, tick which emails mention it).
- **edit choices** next to each dropdown (e.g. add a third OBT).
- **✎ Edit this email** under the preview: edit subject and body as friendly text (`‹Account Name›`, `‹IF Region is USA› … ‹OTHERWISE› … ‹END IF›`), and the date style. "Save for everyone".
- Footer links: *Start a new account*, *Undo the last change to the form settings*, *Open the Excel tracker*.
- Not available without a developer: rename/remove/reorder a question, change "required". (The old editor page was removed on purpose to keep it simple; `go-live-admin.html` is only a redirect.)

**How it works under the hood:**
- `go-live-engine.js`: template engine (`{{field}}`, `{{date:field}}`, `{{names:contacts:Travel Manager}}`, `{{#if …}}…{{else}}…{{/if}}`, `## Heading`) plus `toFriendly` / `toRaw` so editors never see the `{{ }}` code. Divider lines use underscores because box-drawing characters made the mailto link 9,000+ characters.
- `go-live-default-config.json`: the original fields and the three email templates, built from Jenna's workbook wording (Premium Brands and Partners for Affordable Housing). Used if the settings service is unreachable and for "reset".
- **Live settings** are `golive-config.json` in repo `kensington-link-portal`, served by `api/golive-config.js` on the Link Hub project. GET is public (no client data in it). Writes are accepted **only** from requests whose Origin is `https://kensington-group-form.vercel.app`; there is **no passcode** by Nehman's decision. Every save is a git commit, so any change can be undone. The footer Undo compares *contents* and restores the most recent version that differs from live (the commit list can lag, an index-based undo once restored the wrong version).
- Settings also hold `dateFormat` (default `{weekday}, {month} {dayth}, {year}` → "Wednesday, October 21st, 2026", per Jos).
- Contacts are typed one per line: `Name | Title | Email | Role`. People whose Role contains "Travel Manager" are who the welcome letter and Travel Manager email are addressed to and greeted by first name.
- Client contact details are never stored outside the user's browser (a draft is kept in that browser's localStorage). `golive-log.json` and its `log` / `deleteLog` actions still exist in the service but the page no longer uses them.

**Tests (run before changing the engine or the default templates):** `node tests/test-engine.js` (42 checks) and `node tests/test-friendly.js` (9 checks). They feed real Premium Brands / Partners data through every template and check the wording, the weekday comma, SSO vs 2FA, Canada vs USA, custom date styles, and that the friendly editor text round-trips exactly.

**Known limits and my-wording items:**
- Outlook desktop accepts **plain text only** from a web page. The welcome email is ≈ 6,000 characters as a link (3,900 is the largest size seen working). If a body is cut off, tell the developer; over 8,000 characters the page copies the text as a safety net.
- **USA support details are not on file**: US welcome letters show a gold `[US support details…]` placeholder to fill by "✎ Edit this email". Same for Deem sign-in instructions.
- The SSO sign-in sentence and the "loyalty numbers migrated" sentence are the developer's wording, not Jenna's. The Customer Success Manager paragraph was written without "She" (no pronoun guessing).
- The Excel-upload-to-prefill idea (read the implementation workbook and fill the form) is **not built**.

### 3.3 Arbonne NVPLM sync (live since 2026-10-07)
- **Their sheet:** "Flights US/CA NVPLM 2027 Maui Trip", id `4224539799277444` (corp.groups has Admin). **Our sheet:** "2. ENVOY Traveller MasterSheet", id `8780932377956228` (not LIVE Groups).
- **Rule:** only rows with **NVP Approved by Arbonne = YES** are copied. Rows are keyed by `Arbonne Row ID` (`ARB-<their row id>`), created once, then updated in place. Duplicate copies of the same key are deleted (oldest kept).
- **Their → ours** (mapping lives in `api/reconcile-groups.js`: `ARB_THEM_TO_US`, matched by column title): notes from Arbonne → **Client Notes** (new column), Consultant ID → Expense Account/Employee Id, email, on-site phone → Phone Number, departure city/airport → Departure Airport, arrival date → Departure Date, date of return → Return Date, preferred times, seat preference, preferred airline → Airline Preference 1, all NVP and Guest name/DOB/gender/citizenship/KTN fields, plus four approval columns added to our sheet. **Group ID** comes from their dropdown (`MLTIARBJAN27OGGC` Canadian / `MLTIARBJAN27OGGU` US); the label text after the ID is ignored.
- **Ours → theirs:** Agent Notes → "Notes From Travel Edge"; Agent Assigned → "Travel Edge Team Member"; In progress and Completed checkboxes (direction was assumed, not confirmed).
- **Not copied** (not on Vera's list): passport fields, Return Airport, Comments, their Status.
- **Triggers:** webhooks on both sheets (ids `6465073863518084` their sheet, `4213274049832836` Envoy) call `/api/reconcile-groups`; the daily cron also runs it. If a webhook ever shows `DISABLED_CALLBACK_FAILED`, open `/api/reconcile-groups?arbonneHooks=1` to re-register/enable. Manual runs: `?arbonne=1` (dry run) and `?arbonne=1&commit=1` (live). The kill-switch is `ARB_ENABLED` in the code.
- **Test leftovers to clean up:** Envoy row 378 (copied test row) and their row 8 (test Group ID, note, agent, In-progress tick).
- **TEMP route still deployed:** `?peek=` in `reconcile-groups.js` (public, read-only, returns column names/counts only). Remove it.

**2026-10-09 fixes (Vera):** (1) *Swoogo parser:* for Swoogo alerts only (recognised by wording like "Kensington Group ID" / "someone has registered with travel", since the body never says "swoogo") the master's **Departure Airport** column now gets only the departure airport, and the new mapping `arrival_airport` -> **Arriving Airport** (col 5389074362044292, master sheet only) is autofilled `MIA` when the registrant left it blank or chose Miami (another destination is kept as typed). Rows written before this keep the old combined text. (2) *Arbonne sync:* the sync copies every YES row of Arbonne's sheet, remembering copies only through our "Arbonne Row ID" column, so deleting our copy of a test row by hand made the next run re-create it (it kept reappearing on a new line). Now any Arbonne row whose name says "test" (rows 1-8 of theirs) is never copied, and our synced copy of one is deleted on the next committed run (done once: 1 row).

**2026-10-09 evening, Arbonne rows stopped coming over (Vera):** 30 approved rows sat un-copied because ONE unreadable date (Arbonne DOBs typed like `05301975`, plus a typo `20/23/1997`) made Smartsheet reject the whole batch of new rows, and the webhook handler hides errors on purpose (always answers 200). Fixed: dates are normalised to yyyy-mm-dd (a date that cannot be read is skipped and listed in `unreadableDates` in the `?arbonne=1` output), a rejected batch falls back to adding rows one by one, and webhook failures are now logged. Ran once: 30 created. **If Arbonne rows stop again, run `/api/reconcile-groups?arbonne=1` (dry run) first: `error`, `unreadableDates`, `approvedNew` tell you why.**

**GROUPS Dashboard (KCG MANAGER workspace) #INVALID REF, fixed 2026-10-14:** the dashboard's metric boxes read the sheet *KPI Summary - Groups* (id 1464420222848900) and the advisor table reads *Advisor Summary* (4629439471112068). Their formulas use **named cross-sheet references** (`{MasterStatus}`, `{MasterTravAssigned}` ...). When a source column is deleted (here: LIVE Groups "Status" and an "Assigned" checkbox on the Envoy traveller sheet), Smartsheet deletes the reference and every formula using it shows #INVALID REF. Fix = recreate a reference with the SAME name (API: `POST /sheets/{id}/crosssheetreferences`, then Smartsheet recalculates by itself): `MasterStatus` -> LIVE Groups (4820086761148292) column "Status"; `MasterTravAssigned` -> ENVOY (8780932377956228) column "In progress" (it replaced "Assigned"). **Lesson: never delete a column that a cross-sheet reference points at, rename it.** Open points: the "Quoting" status is not an option of the Status column (count is always 0); all 19 live groups are "New"; the *Ticketed YTD (since June)* box can drop when archived groups leave the live sheet.

**2026-10-14 Arbonne Client Notes (Vera):** our yellow *Client Notes* column was mapped from Arbonne's "Notes from Arbonne", which is empty on every row; the text actually sits in their **"Comments "** column (28 of 45 approved rows). The sync now fills Client Notes from their first non-empty of Client Notes / Comments / Notes from Arbonne (`notesSources` in `arbonneSync`). One run updated 27 rows. Their sheet has no column literally called "Client Notes".

**2026-10-14 Arbonne sync must not overwrite agent edits:** the sync used to rewrite every mapped cell on already-copied rows whenever Arbonne's value differed, so the manager's edits to *Departure Airport* (e.g. "Regina, SK" -> YQR) were reverted on the next run. Now the columns in `AGENT_OWNED` (Departure Airport, Departure/Return Date, Departure/Return Time, Seat Preference, Airline Preference 1) are only FILLED when our cell is blank. Everything else (names, approvals, notes ...) still follows Arbonne. Edits that were already reverted cannot be recovered by us; check the sheet's cell history.

**GROUPS Dashboard "Ticketed" numbers fixed 2026-10-14 (Vera: "the data is wrong, 66 tickets since yesterday"):** the KPI sheet's *Ticketed MTD* / *Ticketed YTD (since June)* (rows 10-11 of *KPI Summary - Groups*) summed `# Ticketed` of LIVE groups by **Travel Start Date**, so tickets issued this month for later trips (e.g. loanDepot, 66) were missing (showed 50 / 50). They now count completed travellers on the ENVOY master by **Ticketed Date** (cross-sheet refs `EnvoyTicketedDate`, `EnvoyCompleted`): `=COUNTIFS({EnvoyTicketedDate}, >=first of this month, {EnvoyTicketedDate}, <=TODAY(), {EnvoyCompleted}, 1)`; YTD from June 1 of the current (or previous, before June) year. Result 81 / 388 on 2026-10-14. 2 of 390 completed rows have no Ticketed Date and are not counted. Known data issues left: the Status column of LIVE Groups is all "New"; 2 GROUP DEMO rows are counted in Total Active; the same advisor appears under several spellings in *Agent Assigned* (Grace Northrop / Northrup / her email; Karen / Karen Smith have no advisor row).

**GROUPS Dashboard data clean-up 2026-10-14:** (1) the KPI sheet's status/launch formulas now ignore the 2 "GROUP DEMO" rows (cross-sheet ref `MasterCompany` -> LIVE Groups *Company Name*; Total Active 19 -> 17). The two reports behind the chart and the "Progress Breakdown by Agent" table still list the demo groups (filter them in the report, UI only). (2) "Quoting" added as an option of LIVE Groups > *Status* (the dashboard's Quoting box could never count before). (3) Grace Northrop's 5 stray bookings (typed "Grace Northrup" / her e-mail) now use her real mailbox `grace.northrup@kensingtoncorporate.com` (note the "u") with display name "Grace Northrop" so the advisor table counts them (7 -> 12). Still open: nobody maintains LIVE Groups > *Status* (all "New"); "Karen" (6) and "Karen Smith" (7) bookings have no advisor row; the unnamed top row of *Numbers By Advisor* shows 39 vs 29 blank agent rows; the dashboard layout was left scattered after a failed redesign (needs hand-dragging in the editor).

**Contracted Suppliers -> HubSpot (built and imported 2026-10-14; Jenna / the CSM team).** The Excel `Contracted Suppliers.xlsx` (SharePoint, team-client-service-CustomerSuccessManagement) stays the MASTER; HubSpot is filled from it, one way. Each row of its **Hotel** sheet (Table1: Account, CSM, Hotel, City, Sabre ID, Signed, Contract Expiration, Direct Bill, Pseudo, Rate Loading, Rep Name/Phone/Email, SharePoint ...) is one client's contract with one hotel. Code lives in repo `sales-bi-sync`:
- `api/suppliers-sync.js` (Vercel project sales-bi-sync, `https://sales-bi-sync.vercel.app/api/suppliers-sync`): POST `{sheet:"Hotel", rows:[...], dryRun:true|false}` with header `x-sync-key` = Vercel env `SUPPLIER_SYNC_KEY`. Default is a DRY RUN. It upserts ONE HubSpot company per hotel through the unique property `supplier_sheet_key` (`sabre:<id>`, else `name:<hotel>|<city>`), Type = VENDOR, never touches client companies, never deletes. Hotels shared by several clients are merged (soonest not-past expiry decides date + CSM). Excel dates may arrive as serial numbers (Power Automate) or text; text such as "Chainwide" / "Auto Renew" goes to `supplier_contract_expiry_note`, not the date. Hotel is linked (default company<->company association, type 450) to the client company named in Account; matching is exact name or `api/_supplier-aliases.js` (account name -> HubSpot company id). 30 of 51 accounts link; the other 21 are listed in `Supplier import follow-ups.xlsx` (not linked; hotels still import with the account name in text).
- 21 `supplier_*` company properties in group **Supplier contract** (created by `scripts/create-supplier-properties.mjs`, workflow *Set up supplier properties*): expiration date, status (Expired / Expiring in 90 days / Active / No date), CSM, client account(s), Sabre ID, city, rep contact, task stamps ...
- `scripts/supplier-tasks.mjs` + workflow **Supplier contract expiry tasks** (manual, dry run by default; the daily cron is COMMENTED OUT): 31-90 days to expiry -> one MEDIUM task (due +14d); 0-30 days -> one HIGH task (due +7d); expired -> no task; stamped once (`supplier_task_90_created` / `_30_created`); also refreshes `supplier_contract_status`. Task is attached to the hotel and its linked client(s).
- Import result 2026-10-14: 421 rows -> 408 hotel companies (407 new + Saskatoon Inn & Conference Centre adopted), 278 client links (verified: 0 wrong), HubSpot now has 422 Vendor companies. Expiry: 40 expired, 45 within 90 days (2 within 30), 30 later, 293 no date. 45 tasks are waiting (NOT created yet).
- **Bug found and fixed during the import:** HubSpot returns batch-upsert results in a different order than sent, so ids must be looked up again BY KEY; the first run linked hotels to the wrong clients and was repaired (links removed and rebuilt).
- **Still open:** (1) task owners: the HubSpot token lacks `crm.objects.owners.read` (403), so the CSM names (Badi / Jenna / Mira) cannot be mapped to HubSpot users; either an admin adds that scope to the private app, or give the three owner ids, then set GitHub repo variables `CSM_OWNER_IDS` (JSON, e.g. {"Badi":123,"Jenna":456,"Mira":789}) and `FALLBACK_OWNER_ID`, run the workflow with dry_run=false, and enable the cron. (2) Power Automate flow (not built yet): trigger on file modified or daily, Excel Online *List rows present in a table* (Hotel / Table1, turn on pagination, dates as ISO), HTTP POST the rows to the endpoint with the sync key header. Use dryRun:false only once the preview looks right. (3) 293 hotels have no expiry date and cannot be warned about. (4) Air sheet (16 airline contracts) is not imported yet (same structure; endpoint only supports "Hotel" for now). Lost Accounts and Expired sheets are intentionally not imported. (5) Column editing rule: fields the sync fills are overwritten from the Excel on every sync, so team edits to them in HubSpot are lost; edit the Excel.

### 3.4 Sales BI → HubSpot (`sales-bi-sync`)
**Added 2026-10-09 (Jos asked):** three more company properties: *Sales - Month to Date* (`sales__month_to_date`), *Margin - Month to Date* (`margin__month_to_date`, percent-formatted like the FYTD one, so store a fraction) and *Annual Contracted Sales Value* (`annual_contracted_sales_value`, from the report's measure `[Annual Contracted Sales Value]` in the Clients table, no date filter; its total, $75,316,786, matches the report). Month to date = the 1st of this month through yesterday, refreshed by the new **daily** job `.github/workflows/daily-mtd.yml` (`MODE=mtd`); the monthly job still owns Fiscal YTD. Contracted value is written by both jobs. `scripts/create-properties.mjs` + `setup-properties.yml` created the properties (idempotent). First live run: 82 companies; contracted value matched $48.9M of $75.3M, the rest are clients whose names do not match a HubSpot company (add aliases). New properties must also be added to the HubSpot company card layout by an admin to show on the record.

- GitHub Action on the **11th of each month** (after the 10th). Fiscal year = Sep 1 – Aug 31; reports the fiscal year to date through the end of the previous month.
- Writes HubSpot Company properties `sales__fiscal_ytd`, `margin__fiscal_ytd` (stored as a **fraction**, e.g. 0.0498; the property is percent-formatted so it shows 4.98%) and `sales_fytd_as_of`. Margin = the Power BI measure *Gross Comm Yield* (Jos: "the field is yield").
- Power BI access is through an Azure app "Sales BI Sync" (service principal, Member of the **Team Strategy** workspace). Workspace `00d17242-eb37-4e3f-9ffb-976c69c22b9e`, dataset `dd765585-ba6a-400c-9af5-a50830d4c6c6`. Regions counted: Concierge, Corporate TMC, Entourage, Zero Fee (page filters, Collected, USD).
- 94 clients matched by name, about 194 unmatched. Matching is exact, then ignoring Inc/LLC/Ltd, plus `config/aliases.json` (maps a Power BI client name to a HubSpot company id). Dashboard: `/sync-dashboard.html` lets you map unmatched clients. A manual CSV fallback exists at `/upload-sales.html`.
- **First run of the new fiscal year (Oct 11) resets last year's figures** (e.g. Monster Energy from about $15.1M to about $1.2M). Jos has not answered whether to keep last year's totals in a separate property.

### 3.5 Implementation → HubSpot (`implementation-hubspot-sync`)
- Smartsheet implementation plans (copies of "Template - Implementation 2026") feed the HubSpot company record: overall and per-phase %, dates, account info; each task becomes a HubSpot **Ticket**; a HubSpot UI-extension card (project `implementation-tasks-ui`) lists phases and tasks on the company record. Daily cron archives implementations 30 days after completion (re-verifies each before archiving). `register-client.html` onboards a new client.
- Dashboard currently shows only Premium Brands, Partners for Affordable Housing, Vecima Networks. See `HUBSPOT_HANDOFF.md` for property names, scopes and rotation steps. HubSpot plan limits (Professional: Tickets yes, Custom Objects and serverless no) drove the design.

### 3.6 Link Hub and Status board
- **Customer Success Templates (2026-10-15, Jos):** `reporting-request.html` is now titled *Customer Success Templates* (same URL, Link Hub link renamed). Tab 1 = the unchanged Corporate Reporting Request form; tab 2 = Rebate Templates (Visa card / bank transfer / threshold not met) with fill-ins for percent, months and card last 4, plus Copy. `#rebate` opens tab 2. Jos will send a third rebate template (wire info). Finance Request form also gained an "Email didn't open?" fallback (Outlook web link + copy text) after Lori's mailto failed.
- **Link Hub:** links stored in `links.json` in its repo; the page's Add/Remove buttons commit changes through the GitHub API. Logo and fonts match the Kensington brand. Includes a "Trackers" group (finance tracker xlsx, go-live tracker xlsx). **Not done:** adding the Link Hub's own link into the SharePoint "Links" folder (Team Client Service → Documents → Trackers – Financial and Quick Links → Links); SharePoint "Add shortcut" errors on external URLs.
- **Status board:** week-based schedule, projects with Complete/Reopen and descriptions, wishlist, resizable columns. Backed by Smartsheet via its own API function.

### 3.7 Email stats report (Sandra Marias, started 2026-10-14)
**Ask (Sandra, May 2026, low priority):** she pulls email data from the shared inboxes into Excel by hand (highlight the filed emails in each "COMPLETED EMAILS" folder, paste, pivot) for a daily Phone-and-Email stats message. Wanted: automate the email half. The phone half is auto-generated by the call system.

**Report layout she uses today:** a pivot, rows = agent (the Outlook colour-category tags agents put on an email, so combined tags such as "Ivana, Lori", "Orange Category" and blank rows exist), columns = queue (CA, Concierge, Entourage, US, blank), Count of Subject, grand totals. Headline text "EMAILS: 262 touched", then a phone queue table.

**Shared inboxes (from Sandra):** usa@, canada@, entourage@, dcm@, concierge@, calianvip@, traderjoes@ (all @kensingtoncorporate.com), plus nice-to-have corp.staff.travel@kensingtoncorporate.com and booking@ensembletravel.com. Agents reply from the shared inbox and file the email into a folder whose name contains "COMPLETED EMAILS" (real names differ per mailbox: Canada = `CA COMPLETED EMAILS`, US = `.US COMPLETED EMAILS`).

**Design:** one Power Automate flow per inbox. Trigger "When a new email arrives in a shared mailbox" (folder = that inbox's COMPLETED EMAILS) -> action "Add a row into a table" -> Excel file `Email Stats.xlsx` in Nehman's work OneDrive, table `EmailLog`, columns Received | Queue | Agent | Subject | From | Mailbox. Agent = `if(empty(triggerOutputs()?['body/categories']),'',join(triggerOutputs()?['body/categories'],','))`. A first version used `createArray()` with no arguments and failed on every untagged email (fixed). Local copy of the empty workbook: `Downloads/Email Stats.xlsx` (generated with openpyxl, table `EmailLog`).

**Status (2026-10-14):**
- LIVE: `Email Stats - Canada` (flow name is still the long Copilot prompt starting "When a new email arrives in the canada@..."; id `f7b8f8f3-936d-4319-aa99-2d5e5207da83`). 3 runs after the fix all succeeded.
- LIVE: `Email Stats - US` (id `f1bc4f5d-4432-4b2b-992d-e4f5bd931222`), mailbox usa@, folder `.US COMPLETED EMAILS`, Queue "US". Saved and switched on, had not run yet. The flow checker shows a warning that was not inspected.
- BLOCKED: Concierge, Entourage, DCM, CalianVIP, TraderJoes. **Nehman's account has no access to those five shared mailboxes** (Outlook on the web returns AccessDeniedException for each; usa@ opens fine). The Power Automate folder picker shows "No items" for them for the same reason. Nehman drafted a message asking Sandra/IT for **Full Access (read-only use)**; waiting on that.
- A second unsaved/off copy named "Email Stats - US" (id `8672c1d3-1882-4cdd-923b-75f133e72d87`) still points at the Canada mailbox. Reuse it for the next inbox or delete it.
- NOT BUILT: the report itself. Plan: let the flows collect a day of real rows, then build the pivot (agent rows x queue columns, grand total, date filter) as a sheet in a workbook Sandra opens, matching her layout. A web report page cannot read the OneDrive workbook (Graph/SharePoint consent is blocked in the tenant), so the pivot-in-Excel route is the simple one; a hosted page would need each flow to also POST rows to a store we host.
- Not yet done: corp.staff.travel@ and booking@ensembletravel.com (check access first).

**To finish (in order):** 1) get Full Access to the five mailboxes; 2) for each, open a copy of the Canada flow, change the trigger mailbox (type the address, pick it from the list), pick the inbox's COMPLETED EMAILS folder in the folder picker, set Queue and Mailbox text in the action, Save, Turn on; 3) verify each flow's first run shows Succeeded and a row lands in `EmailLog` (check Agent is filled for tagged emails); 4) build the pivot report; 5) tell Sandra where to look.

**Browser-pane lessons from this work:** keep the Claude browser pane visible and wide; when the pane is hidden or narrow, screenshots time out and clicks miss. Do not use `resize_window` emulation at 1280x900 here: ref/coordinate clicks land in the wrong place; use the pane's own size. In the Power Automate dynamic-content boxes type `/` then "Insert expression"; the Code view tab is read-only; Copilot could not set the column mappings. After "Save As", Enter confirms the dialog (it can create the copy twice if you also click Save). Always confirm a save on the flow's Details page (Modified time), not from the editor.

---

## 4. Key identifiers (not secret)

| Thing | ID |
|---|---|
| Group Travel intake sheet | `3569349083221892` |
| "1. LIVE Groups" (group master used by code) | `4820086761148292` |
| "LIVE GROUP MASTERSHEET" (older/smaller, 11 cols) | `1628238211141508` |
| 2. ENVOY Traveller MasterSheet | `8780932377956228` |
| Agent copy of traveller sheet (mirror) | `7213505705889668` |
| Arbonne sheet | `4224539799277444` |
| Azure tenant | `51cb5df4-df05-4e5b-b20c-17d576ab85e3` |
| Azure app "Kensington Forms Outlook Draft" (inactive route) | client id `774d5cbc-5253-4432-b7a7-9deccc2170ae`, SPA redirect `…/auth-redirect.html`, delegated `Mail.ReadWrite` |
| Azure app "Sales BI Sync" | client id `d5dc56d1-caec-4aa8-91c0-b85eecaf2157` |

---

## 5. Working agreements (how Nehman and Claude work together)
- Commit and push every code change to GitHub; no need to ask. `git pull --rebase` first (other sessions push to the same repos).
- Ask before pulling large company data or doing destructive work; never put secrets in chat or files.
- Smartsheet columns are **renamed or repurposed, not deleted** (reports and dashboards break otherwise).
- Say what was tested and what was *not* (never claim an Outlook or screenshot result that was not seen).
- Give all steps at once. Keep Teams drafts short.

---

## 6. Open items (owner in brackets)
0. **CVENT/Swoogo registrations missed Oct 7 11:15 → Oct 8 (Nehman / Power Automate flow owner):** the parser was offline (404), so Garada Villa, Maximo Zapata, Jose Robles, Anibal Beltran and Vince Pitocco (2 emails each, mailbox usa@) never reached the CVENT log, the Traveller MasterSheet or the agent copy. The parser is restored. In Power Automate open the CVENT parser flow → run history → failed runs since Oct 7 → Resubmit each (the parser skips duplicates, so re-running is safe). Then confirm all five appear on the master. Vince Pitocco has Group ID VQ9GMONFEB27CUN; the other four are "Reyes (West) FLO UFC 335 incentive" emails with no Group ID, so fill it by hand.
1. **Vera:** confirm archived groups stayed archived after the reconcile fix (never confirmed).
2. **Arbonne:** (a) prove a webhook fires on its own (type a note on their row 8, expect it in Client Notes without a manual run); (b) delete Envoy row 378 and clear their test row 8; (c) tell Vera it is live; (d) confirm the existing `sync-travellers` mirrors new Envoy rows to the agent copy; (e) confirm with Vera that Client Notes (not Additional Notes) is right and that In progress/Completed should flow ours → theirs.
3. **Remove the temporary `?peek=` route** from `api/reconcile-groups.js` (Nehman).
4. **Jos:** keep last fiscal year's totals? (first new-year run is Oct 11); aliases for big unmatched clients (e.g. CTM Admin, Mnp Llp, Frederick Travel) need their HubSpot company ids.
5. **Jenna / Jos (Go-Live form):** feedback on the form; US support hours/phones/email; Deem sign-in wording; confirm the SSO and loyalty sentences; send Nehman the actual `Go-Live Welcome Email.docx`. Decide whether "rename/remove a question" should come back.
6. **Reporting form:** confirm the "Request Type" options with Jos.
7. **Nehman:** add the Link Hub link to the SharePoint Links folder.
8. **Older, still open:** Monster Energy has 33 leftover task Tickets in HubSpot; corp.groups Smartsheet token ownership (Dragos); Departure City data-loss root cause; Amgine edit-mode bug.
10. **Email stats report (Nehman, blocked on Sandra/IT):** get Full Access to concierge@, entourage@, dcm@, calianvip@, traderjoes@; then finish the per-inbox flows and build the pivot. Full state in section 3.7.
9. **Ideas not built:** upload the implementation workbook to pre-fill the go-live form; prettier client email (hosted welcome page or PDF attachment).

---

## 7. Decisions and dead ends (do not redo)
- **Outlook can only take plain text from a web page.** Tried and rejected: clipboard + Ctrl+V (people will not paste), downloaded `.eml` draft (users did not want a download), Outlook-on-the-web compose link (Microsoft sign-in rejects the long URL, error AADSTS90015), Microsoft Graph draft through an Azure app (works in code, but the tenant blocks user consent: "approval required"; the manager does not want to ask an admin). The Graph code is still in git history; to revive it an admin must grant `Mail.ReadWrite` consent for the Azure app above, then the client id is set in the page.
- **No editor passcode** on the form settings (Nehman's call); writes are limited to the form's own origin and every save is undoable.
- **Tracker tab, Customize tab, header buttons and "Reopen" were removed** from the Go-Live form to keep it simple. Emails still log to Excel.
- **Per-traveller fields go to the traveller sheet, not LIVE Groups.** Vera was explicit that Arbonne data belongs in the Envoy Traveller MasterSheet.
- **Never record a pronoun for a person** in templates; use names or neutral wording.

---

## 8. Gotchas
- **Never run `git add -A` blindly in a repo that other sessions also push to. Always run `git status --short` and `git diff --cached --stat` first and look for deletions.** On 2026-10-07 11:15 a commit made this way deleted `api/parse-email.py` (plus `AMGINE_WEBHOOK_SPEC.txt` and two `.claude/` files); the CVENT/Swoogo parser then returned 404 for about a day until Vera noticed. Restored in commit `66feed1`. Safeguard added: `.github/workflows/api-health.yml` fails on any push that removes a required `api/` file and, every morning, checks the live parser, reconcile and Go-Live settings endpoints.
- Do not put backticks inside a double-quoted shell string (the shell runs them as commands). Use the file/edit tools for any text that contains backticks.
- Windows shell: big files with quotes break inline heredocs. Write files with an editor/file tool, then run a patch script. Use forward-slash absolute paths in node.
- `api/reconcile-groups.js` has CRLF line endings; normalise before multi-line text replacement.
- Smartsheet: adding several columns in one call needs the **same** `index` for all; the API token only exists in Vercel, so token-gated Smartsheet work is done through a deployed endpoint.
- The GitHub commit list can lag a few seconds after a write; do not trust its order right after saving.
- The browser preview used during development stalls on animated pages; verify with page state, not just screenshots.
- Webhooks only fire on real edits and auto-disable on repeated failures; re-register with `?arbonneHooks=1`.

---

## 9. Start-of-session checklist
1. Read this file, then the system you will touch.
2. `git pull --rebase` in the repo.
3. Check Section 6 for anything waiting on you.
4. Before saying something is "done", look at the live page / sheet, not just the code.
5. When you finish, update this file and push.
