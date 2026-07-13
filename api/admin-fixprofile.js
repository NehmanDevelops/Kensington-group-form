// TEMP one-shot admin — fix the typo'd Sabre Group Profile ID on the
// VQ9GTESTDEC26 group row (sent 944266507, real is 944319529 per Vera).
// GET ?dry=1 shows current values without writing. DELETE after running.
const GROUPS = '4820086761148292';
const GROUP_ID = 'VQ9GTESTDEC26';
const CORRECT_PROFILE = '944319529';

const norm = (s) => String(s == null ? '' : s).trim();

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const dry = req.query && req.query.dry === '1';
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  }).then(r => r.json());

  try {
    const sheet = await ss(`/sheets/${GROUPS}`);
    const byTitle = {};
    for (const c of sheet.columns) byTitle[c.title.trim().toLowerCase()] = c.id;
    const col = (t) => byTitle[t.trim().toLowerCase()];
    const cell = (row, t) => {
      const c = (row.cells || []).find(x => x.columnId === col(t));
      return c ? (c.value ?? c.displayValue ?? '') : '';
    };
    const row = (sheet.rows || []).find(r => norm(cell(r, 'GROUP ID')).toLowerCase() === GROUP_ID.toLowerCase());
    if (!row) return res.status(404).json({ error: `${GROUP_ID} not found` });

    const groupProfCol = col('group profile id') || col('sabre profile id');
    const current = {
      pcc: norm(cell(row, 'PCC')),
      companyProfileId: norm(cell(row, 'Company Profile ID')),
      groupProfileId: groupProfCol ? norm((row.cells.find(x => x.columnId === groupProfCol) || {}).value ?? '') : '(no column)',
      profiledTravellers: cell(row, 'Profiled Travellers'),
    };
    if (dry) return res.status(200).json({ dry: true, groupId: GROUP_ID, current });

    if (!groupProfCol) return res.status(500).json({ error: 'no Group Profile ID / Sabre Profile ID column' });
    await ss(`/sheets/${GROUPS}/rows`, { method: 'PUT', body: JSON.stringify([{ id: row.id, cells: [{ columnId: groupProfCol, value: CORRECT_PROFILE }] }]) });
    return res.status(200).json({ ok: true, groupId: GROUP_ID, was: current.groupProfileId, now: CORRECT_PROFILE, alsoOnRow: current });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
