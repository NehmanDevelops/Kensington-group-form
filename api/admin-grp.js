// TEMP — inspect/clean LIVE GROUP MASTERSHEET. Delete after.
//   GET                       → rows with _rowId + key fields
//   POST { deleteRowIds:[..]} → delete those rows
const LIVE = '4820086761148292';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const api = (p, o = {}) => fetch(`https://api.smartsheet.com/2.0${p}`, { ...o, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...o.headers } }).then(r => r.json());
  try {
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const ids = (b.deleteRowIds || []).join(',');
      if (!ids) return res.status(400).json({ error: 'no ids' });
      const r = await api(`/sheets/${LIVE}/rows?ids=${ids}`, { method: 'DELETE' });
      return res.status(200).json(r);
    }
    const s = await api(`/sheets/${LIVE}`);
    const cmap = {}; for (const c of s.columns) cmap[c.id] = c.title;
    const g = (row, title) => { const c = (row.cells||[]).find(x => cmap[x.columnId] === title); return c?.value ?? c?.displayValue ?? ''; };
    const rows = (s.rows || []).map((r, i) => ({
      i, rowId: r.id,
      groupId: g(r, 'GROUP ID'), company: g(r, 'Company Name'), event: g(r, 'Event Name'),
      contact: g(r, 'Contact Name'), email: g(r, 'Contact E-mail'), status: g(r, 'Status'),
      signedUp: g(r, '# Signed Up'), contacted: g(r, '# Contacted'), ticketed: g(r, '# Ticketed'),
      cellCount: (r.cells || []).filter(c => (c.value ?? c.displayValue ?? '') !== '').length,
    }));
    return res.status(200).json({ totalRows: rows.length, rows });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
