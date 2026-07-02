// TEMP one-shot admin — dedupes TESTPIPE01 group rows (keeps first, deletes rest)
// and clears the Amgine GUID cells on the kept row for a clean test. DELETE after.
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
    const gidCol = col('group id');

    const matches = (sheet.rows || []).filter(r => {
      const c = (r.cells || []).find(x => x.columnId === gidCol);
      return c && String(c.value ?? c.displayValue).trim().toLowerCase() === groupId.toLowerCase();
    });
    if (!matches.length) return res.status(404).json({ error: `no ${groupId} rows found` });

    const keep = matches[0];
    const dupes = matches.slice(1).map(r => r.id);

    // Delete duplicate rows
    let deleted = 0;
    if (dupes.length) {
      await ss(`/sheets/${GROUPS}/rows?ids=${dupes.join(',')}`, { method: 'DELETE' });
      deleted = dupes.length;
    }

    // Clear Amgine cells on the kept row
    const cells = [];
    for (const t of ['Amgine Branch GUID', 'Amgine Policy GUID', 'Amgine Onboarded']) {
      if (col(t)) cells.push({ columnId: col(t), value: '' });
    }
    if (cells.length) await ss(`/sheets/${GROUPS}/rows`, { method: 'PUT', body: JSON.stringify([{ id: keep.id, cells }]) });

    return res.status(200).json({ ok: true, groupId, keptRow: keep.id, deletedDupes: deleted, clearedCells: cells.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
