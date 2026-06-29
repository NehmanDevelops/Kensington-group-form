// TEMP — arm/check the Amgine test traveller row to verify the PA automation. Delete after.
//   POST { action:"arm" }   → set Ready to Book=true, clear Amgine Itinerary ID + Status (a sheet update)
//   POST { action:"check" } → read back Ready to Book / Itinerary ID / Status
const MASTER = '8780932377956228';
const EMAIL = 'test@kensingtoncorporate.com';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const api = (p, o = {}) => fetch(`https://api.smartsheet.com/2.0${p}`, { ...o, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...o.headers } }).then(r => r.json());
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const sheet = await api(`/sheets/${MASTER}`);
    const id = {}; for (const c of sheet.columns) id[c.title.trim().toLowerCase()] = c.id;
    const val = (row, t) => { const c = (row.cells || []).find(x => x.columnId === id[t.toLowerCase()]); return c ? (c.value ?? c.displayValue ?? '') : ''; };
    const row = (sheet.rows || []).find(r => String(val(r, 'email address')).trim().toLowerCase() === EMAIL);
    if (!row) return res.status(404).json({ error: 'test row not found' });
    if (b.action === 'arm') {
      const cells = [
        { columnId: id['ready to book'], value: true },
        { columnId: id['amgine itinerary id'], value: '' },
        { columnId: id['amgine status'], value: '' },
      ].filter(c => c.columnId);
      const r = await api(`/sheets/${MASTER}/rows`, { method: 'PUT', body: JSON.stringify([{ id: row.id, cells }]) });
      return res.status(200).json({ armed: r.message, rowId: row.id });
    }
    return res.status(200).json({
      rowId: row.id,
      readyToBook: val(row, 'ready to book'),
      itineraryId: val(row, 'amgine itinerary id'),
      status: val(row, 'amgine status'),
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
