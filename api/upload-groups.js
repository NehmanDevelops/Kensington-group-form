// Excel Group Upload endpoint.
//
// The browser (upload-excel.html) parses the filled-out Kensington Group
// template with SheetJS and POSTs clean JSON here. This endpoint:
//   1. Finds (or creates, first run only) the standing "Group Uploads" sheet
//      and appends every traveller row 1:1 with the Excel template.
//   2. Writes each traveller into the Traveller Profile MasterSheet
//      (same columns the Traveller Profile form uses).
//   3. Calls /api/sync-travellers, which mirrors the new master rows into the
//      KCG Agent copy and refreshes the advisor dashboard counts.
//
// Dedup key everywhere is GroupID|First|Last (case-insensitive), matching
// sync-travellers, so re-uploading the same template never doubles rows.

const STANDING_SHEET_NAME = 'Group Uploads';
const MASTER_SHEET_ID = '8780932377956228';

// Master (Traveller Profile MasterSheet) column IDs — verified against
// submit-profile.js and sync-travellers.js.
const M = {
  groupId:        5029597388509060,
  source:         6155241207926660,
  eventTitle:     2188489977532292,   // we store Group Name here
  firstName:      5726513277472644,
  middleName:     3474713463787396,
  lastName:       7978313091157892,
  dob:            659963696680836,
  email:          7415363137736580,
  phone:          1785863603523460,
  ktn:            8259788067868548,
  redress:        3756188440498052,
  airlineLoyalty: 6007988254183300,
  seat:           2630288533655428,
  additionalNotes:7696838114447236,
  assigned:       689867251289988,    // checkbox
  inProgress:     5193466878660484,   // checkbox
  completed:      2941667064975236,   // checkbox
  submissionDate: 2067338580234116,
};

// Columns for the standing "Group Uploads" sheet, created once on first run.
// Order mirrors the Excel template; First Name is the required primary column.
const STANDING_COLUMNS = [
  { title: 'First Name', type: 'TEXT_NUMBER', primary: true },
  { title: 'Middle Name', type: 'TEXT_NUMBER' },
  { title: 'Last Name', type: 'TEXT_NUMBER' },
  { title: 'Group Name', type: 'TEXT_NUMBER' },
  { title: 'Group ID', type: 'TEXT_NUMBER' },
  { title: 'Assigned Agent', type: 'TEXT_NUMBER' },
  { title: 'Assigned', type: 'CHECKBOX' },
  { title: 'In Progress', type: 'CHECKBOX' },
  { title: 'Complete', type: 'CHECKBOX' },
  { title: 'Date of Birth', type: 'DATE' },
  { title: 'Phone Number', type: 'TEXT_NUMBER' },
  { title: 'Email Address', type: 'TEXT_NUMBER' },
  { title: 'Known Traveller Number', type: 'TEXT_NUMBER' },
  { title: 'Redress Number', type: 'TEXT_NUMBER' },
  { title: 'Airline Loyalty', type: 'TEXT_NUMBER' },
  { title: 'Seat Preference', type: 'TEXT_NUMBER' },
  { title: 'Additional Notes', type: 'TEXT_NUMBER' },
  { title: 'Agent Notes', type: 'TEXT_NUMBER' },
  { title: 'Upload Date', type: 'DATE' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'Missing SMARTSHEET_API_TOKEN' });

  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    });

  const apiJson = (path, opts) => api(path, opts).then(r => r.json());

  const norm = s => (s == null ? '' : String(s)).replace(/​/g, '').trim();
  const key = t => `${norm(t.groupId)}|${norm(t.firstName)}|${norm(t.lastName)}`.toLowerCase();
  const cellVal = (row, colId) => {
    const c = row.cells?.find(c => c.columnId === colId);
    return c?.value ?? c?.displayValue ?? null;
  };
  const today = new Date().toISOString().slice(0, 10);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const groupName = norm(body.groupName);
    const groupId = norm(body.groupId);
    const travellers = (Array.isArray(body.travellers) ? body.travellers : [])
      .map(t => ({
        assignedAgent: norm(t.assignedAgent),
        assigned: !!t.assigned,
        inProgress: !!t.inProgress,
        complete: !!t.complete,
        firstName: norm(t.firstName),
        middleName: norm(t.middleName),
        lastName: norm(t.lastName),
        dob: norm(t.dob),
        phone: norm(t.phone),
        email: norm(t.email),
        ktn: norm(t.ktn),
        redress: norm(t.redress),
        airlineLoyalty: norm(t.airlineLoyalty),
        seat: norm(t.seat),
        additionalNotes: norm(t.additionalNotes),
        agentNotes: norm(t.agentNotes),
        groupName,
        groupId,
      }))
      // a row is only real if it has a name
      .filter(t => t.firstName || t.lastName);

    if (!groupId) return res.status(400).json({ error: 'Missing Group ID (cell B6 in the template).' });
    if (travellers.length === 0) return res.status(400).json({ error: 'No traveller rows found in the file.' });

    // ── 1. Find or create the standing "Group Uploads" sheet ──────────────
    const sheetList = await apiJson('/sheets?includeAll=true');
    let standing = (sheetList.data || []).find(s => s.name === STANDING_SHEET_NAME);
    if (!standing) {
      const created = await apiJson('/sheets', {
        method: 'POST',
        body: JSON.stringify({ name: STANDING_SHEET_NAME, columns: STANDING_COLUMNS }),
      });
      standing = created.result;
    }
    const standingSheetId = standing.id;

    // Resolve column IDs by title (robust to manual column edits later).
    const standingFull = await apiJson(`/sheets/${standingSheetId}`);
    const colByTitle = {};
    for (const c of standingFull.columns) colByTitle[c.title.trim().toLowerCase()] = c.id;
    const sc = t => colByTitle[t.trim().toLowerCase()];

    // ── 2. Dedup against existing rows in BOTH sheets ─────────────────────
    const standingKeys = new Set();
    for (const row of standingFull.rows || []) {
      const k = `${norm(cellVal(row, sc('Group ID')))}|${norm(cellVal(row, sc('First Name')))}|${norm(cellVal(row, sc('Last Name')))}`.toLowerCase();
      if (k !== '||') standingKeys.add(k);
    }

    const masterSheet = await apiJson(`/sheets/${MASTER_SHEET_ID}`);
    const masterKeys = new Set();
    for (const row of masterSheet.rows || []) {
      const k = `${norm(cellVal(row, M.groupId))}|${norm(cellVal(row, M.firstName))}|${norm(cellVal(row, M.lastName))}`.toLowerCase();
      if (k !== '||') masterKeys.add(k);
    }

    // ── 3. Build + write standing-sheet rows ──────────────────────────────
    const standingRows = [];
    for (const t of travellers) {
      if (standingKeys.has(key(t))) continue;
      const cells = [
        { columnId: sc('First Name'), value: t.firstName },
        { columnId: sc('Middle Name'), value: t.middleName },
        { columnId: sc('Last Name'), value: t.lastName },
        { columnId: sc('Group Name'), value: t.groupName },
        { columnId: sc('Group ID'), value: t.groupId },
        { columnId: sc('Assigned Agent'), value: t.assignedAgent },
        { columnId: sc('Assigned'), value: t.assigned },
        { columnId: sc('In Progress'), value: t.inProgress },
        { columnId: sc('Complete'), value: t.complete },
        { columnId: sc('Date of Birth'), value: t.dob },
        { columnId: sc('Phone Number'), value: t.phone },
        { columnId: sc('Email Address'), value: t.email },
        { columnId: sc('Known Traveller Number'), value: t.ktn },
        { columnId: sc('Redress Number'), value: t.redress },
        { columnId: sc('Airline Loyalty'), value: t.airlineLoyalty },
        { columnId: sc('Seat Preference'), value: t.seat },
        { columnId: sc('Additional Notes'), value: t.additionalNotes },
        { columnId: sc('Agent Notes'), value: t.agentNotes },
        { columnId: sc('Upload Date'), value: today },
      ].filter(c => c.columnId && c.value !== '' && c.value !== false && c.value != null);
      // keep checkboxes even when false so the column renders consistently
      for (const cbTitle of ['Assigned', 'In Progress', 'Complete']) {
        if (!cells.find(c => c.columnId === sc(cbTitle))) {
          cells.push({ columnId: sc(cbTitle), value: false });
        }
      }
      standingRows.push({ toBottom: true, cells });
    }

    let standingWritten = 0;
    if (standingRows.length) {
      const r = await apiJson(`/sheets/${standingSheetId}/rows`, {
        method: 'POST',
        body: JSON.stringify(standingRows),
      });
      standingWritten = (r.result || []).length || standingRows.length;
    }

    // ── 4. Build + write MasterSheet rows ─────────────────────────────────
    // Agent Assigned (CONTACT_LIST on the master) is intentionally NOT written
    // here — a plain name can fail validation and reject the whole row. The
    // assigned agent is preserved on the Group Uploads sheet; assign on the
    // dashboard as usual, or we can wire name→contact resolution later.
    const masterRows = [];
    for (const t of travellers) {
      if (masterKeys.has(key(t))) continue;
      const cells = [
        { columnId: M.groupId, value: t.groupId },
        { columnId: M.source, value: 'Excel Upload' },
        { columnId: M.eventTitle, value: t.groupName },
        { columnId: M.firstName, value: t.firstName },
        { columnId: M.middleName, value: t.middleName },
        { columnId: M.lastName, value: t.lastName },
        { columnId: M.dob, value: t.dob },
        { columnId: M.email, value: t.email },
        { columnId: M.phone, value: t.phone },
        { columnId: M.ktn, value: t.ktn },
        { columnId: M.redress, value: t.redress },
        { columnId: M.airlineLoyalty, value: t.airlineLoyalty },
        { columnId: M.seat, value: t.seat },
        { columnId: M.additionalNotes, value: t.additionalNotes },
        { columnId: M.assigned, value: t.assigned },
        { columnId: M.inProgress, value: t.inProgress },
        { columnId: M.completed, value: t.complete },
        { columnId: M.submissionDate, value: today },
      ].filter(c => c.value !== '' && c.value !== false && c.value != null);
      masterRows.push({ toTop: true, cells });
    }

    let masterWritten = 0;
    let masterError = null;
    if (masterRows.length) {
      const r = await apiJson(`/sheets/${MASTER_SHEET_ID}/rows`, {
        method: 'POST',
        body: JSON.stringify(masterRows),
      });
      if (r.message && r.message !== 'SUCCESS') masterError = r.message;
      else masterWritten = (r.result || []).length || masterRows.length;
    }

    // ── 5. Propagate to the KCG Agent copy + refresh dashboard counts ──────
    let syncResult = 'skipped';
    try {
      const baseUrl = req.headers?.host
        ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
        : 'https://kensington-group-form.vercel.app';
      const sr = await fetch(`${baseUrl}/api/sync-travellers`);
      syncResult = (await sr.json()).message || 'ok';
    } catch (e) {
      syncResult = `sync error: ${e.message}`;
    }

    return res.status(200).json({
      ok: true,
      group: { name: groupName, id: groupId },
      received: travellers.length,
      standing_sheet: { id: standingSheetId, written: standingWritten, skipped_duplicates: travellers.length - standingRows.length },
      master_sheet: { written: masterWritten, skipped_duplicates: travellers.length - masterRows.length, error: masterError },
      sync: syncResult,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
