// TEMP — add the two IATA columns to the Traveller MasterSheet and fill the
// test row (test@kensingtoncorporate.com) with HSV->SNA + dates. Delete after.
const MASTER = '8780932377956228';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const api = (p, o = {}) => fetch(`https://api.smartsheet.com/2.0${p}`, { ...o, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...o.headers } }).then(r => r.json());
  try {
    let sheet = await api(`/sheets/${MASTER}`);
    const titles = new Set(sheet.columns.map(c => c.title.trim().toLowerCase()));
    let index = sheet.columns.length;
    const added = [];
    for (const t of ['Departure Airport (IATA)', 'Arrival Airport (IATA)']) {
      if (!titles.has(t.toLowerCase())) {
        const r = await api(`/sheets/${MASTER}/columns`, { method: 'POST', body: JSON.stringify([{ title: t, type: 'TEXT_NUMBER', index: index++ }]) });
        if (r.message === 'SUCCESS') added.push(t); else return res.status(200).json({ error: r });
      }
    }
    // re-fetch for fresh column ids
    sheet = await api(`/sheets/${MASTER}`);
    const id = {}; for (const c of sheet.columns) id[c.title.trim().toLowerCase()] = c.id;
    const val = (row, title) => { const c = (row.cells || []).find(x => x.columnId === id[title.trim().toLowerCase()]); return c ? (c.value ?? c.displayValue ?? '') : ''; };
    const row = (sheet.rows || []).find(r => String(val(r, 'Email Address')).trim().toLowerCase() === 'test@kensingtoncorporate.com');
    if (!row) return res.status(404).json({ added, error: 'test row not found' });
    const cells = [
      { columnId: id['departure airport (iata)'], value: 'HSV' },
      { columnId: id['arrival airport (iata)'], value: 'SNA' },
      { columnId: id['departure date'], value: '2026-09-25' },
      { columnId: id['return date'], value: '2026-09-30' },
    ].filter(c => c.columnId);
    const upd = await api(`/sheets/${MASTER}/rows`, { method: 'PUT', body: JSON.stringify([{ id: row.id, cells }]) });
    return res.status(200).json({ added, rowUpdated: upd.message, rowId: row.id });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
