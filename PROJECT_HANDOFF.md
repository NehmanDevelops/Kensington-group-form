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
- **Link Hub:** links stored in `links.json` in its repo; the page's Add/Remove buttons commit changes through the GitHub API. Logo and fonts match the Kensington brand. Includes a "Trackers" group (finance tracker xlsx, go-live tracker xlsx). **Not done:** adding the Link Hub's own link into the SharePoint "Links" folder (Team Client Service → Documents → Trackers – Financial and Quick Links → Links); SharePoint "Add shortcut" errors on external URLs.
- **Status board:** week-based schedule, projects with Complete/Reopen and descriptions, wishlist, resizable columns. Backed by Smartsheet via its own API function.

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
