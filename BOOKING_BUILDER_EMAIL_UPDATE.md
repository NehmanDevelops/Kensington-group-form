# Booking Builder notification — Kathy's 2 asks (2026-07-17)

Both changes are in the **Power Automate flow** ("Contracted Hotels → Booking Builder (Auto)"),
in/around the **Send an email (V2)** action. No Office Script change needed — the script already
returns `count` and `added[]`.

---

## Ask #1 — "I can't see what's different, and it doesn't look like the full list"
Fix: make the email say clearly that these are the NEW additions, show a count, and link the full file.

### New Subject
```
New contracted hotels ready for Booking Builder — @{outputs('Run_script')?['body/count']} added
```

### New Body (HTML) — paste into Send an email (V2) → Body (keep your existing list expression where marked)
```html
<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#3a2f3c;line-height:1.6;">
  <p style="font-size:16px;margin:0 0 4px;">
    <strong>✅ @{outputs('Run_script')?['body/count']} new hotel(s)</strong>
    were added to the Preferred Hotels list for Booking Builder today.
  </p>
  <p style="color:#767260;margin:0 0 12px;">
    These are the hotels newly added in this update — they were <strong>not</strong> on the list before:
  </p>

  <div style="border-left:4px solid #1a3e32;background:#f3eedf;padding:12px 16px;border-radius:6px;">
    <!-- KEEP YOUR EXISTING added-hotels list here. If you currently build it with a
         Select + join, paste that dynamic value on the next line: -->
    @{ ...your existing added-hotels list (join of "Name (HOD id) — Account")... }
  </div>

  <p style="margin:16px 0 0;">
    📎 The full Preferred Hotels list is <strong>attached to this email</strong> (see Ask #2 below).<br>
    🔗 Or open it directly: <a href="PASTE_PREFERRED_FILE_LINK_HERE">Preferred Hotels – Multiple Accounts</a>
  </p>
</div>
```
- `@{outputs('Run_script')?['body/count']}` — if your Run script action has a different name, swap `Run_script`.
- Replace `PASTE_PREFERRED_FILE_LINK_HERE` with the SharePoint link (see Ask #2, step C).

### (Optional) removed hotels
If/when auto-removal is turned on and the script returns `removed[]`, add under the count line:
```html
<p style="margin:0 0 12px;color:#b03a3a;"><strong>@{outputs('Run_script')?['body/removedCount']} removed</strong> (no longer contracted).</p>
```

---

## Ask #2 — "I need to share/download the file to send to Booking Builder; neither worked"
Fix: attach the actual Excel file to every notification email. Then Kathy just forwards the email —
no manual export, and no external-sharing block (attachment bypasses the link-sharing restriction).

### A. Add an action BEFORE "Send an email (V2)"
- **New step → SharePoint → Get file content using path**
  - **Site Address:** the `team-client-service` site (same site the flow writes to)
  - **File Path:** the path to `Preferred Hotels - Multiple Accounts_data.xlsx`
    (use the folder picker to select it)

### B. In "Send an email (V2)" → Show advanced options → Attachments
- **Attachments Name – 1:** `Preferred Hotels - Multiple Accounts_data.xlsx`
- **Attachments Content – 1:** `File Content` (dynamic content from *Get file content using path*)

### C. Get the share link for the body (optional but nice)
- In SharePoint, open the file's **… → Copy link**
- Set it to **"People in Kensington Corporate"** (not "specific people") so any internal recipient can open it
- Paste that URL into `PASTE_PREFERRED_FILE_LINK_HERE` in the body above
- (For an EXTERNAL Booking Builder vendor, rely on the attachment — external link sharing may be blocked by IT.)

---

## Result
Every daily 10 AM email now:
1. Leads with **"✅ N new hotels added"** so the change is obvious at a glance,
2. Clearly labels the list as the **new** additions (in a highlighted box),
3. **Attaches the full Preferred Hotels Excel** so Kathy can forward it straight to Booking Builder,
4. Links the file for one-click open.
