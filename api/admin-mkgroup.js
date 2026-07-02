// TEMP one-shot admin endpoint — adds a test group row to LIVE GROUP MASTERSHEET.
// DELETE after running. GET ?id=TESTPIPE01 (defaults to TESTPIPE01).
const GROUPS = '4820086761148292';
export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const groupId = (req.query && req.query.id) ? String(req.query.id) : 'TESTPIPE01';
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  try {
    const sheet = await (await ss(`/sheets/${GROUPS}`)).json();
    const byTitle = {};
    for (const c of sheet.columns) byTitle[c.title.trim().toLowerCase()] = c.id;
    const col = (t) => byTitle[t.trim().toLowerCase()];

    // already exists?
    const gidCol = col('group id');
    const existing = (sheet.rows || []).find(r => {
      const c = (r.cells || []).find(x => x.columnId === gidCol);
      return c && String(c.value ?? c.displayValue).trim().toLowerCase() === groupId.toLowerCase();
    });
    if (existing) return res.status(200).json({ ok: true, note: 'group already exists', groupId, rowId: existing.id });

    const cells = [];
    if (col('group id')) cells.push({ columnId: col('group id'), value: groupId });
    if (col('group status')) cells.push({ columnId: col('group status'), value: 'Live' });
    if (col('event name')) cells.push({ columnId: col('event name'), value: 'Pipeline Test Group' });
    const r = await ss(`/sheets/${GROUPS}/rows`, { method: 'POST', body: JSON.stringify([{ toBottom: true, cells }]) });
    const j = await r.json();
    return res.status(200).json({ ok: r.ok, groupId, result: j });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
