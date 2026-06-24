// TEMP read-only — dump LIVE GROUP MASTERSHEET groups + values, and reports. Delete after.
//   GET ?sheet=1   → LIVE GROUP MASTERSHEET rows (Group ID, Status, counts)
//   GET ?report=ID → a report's rows (Group ID + numeric cells)
const LIVE = '4820086761148292';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const api = (p) => fetch(`https://api.smartsheet.com/2.0${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then(r => r.json());
  try {
    if (req.query?.report) {
      const rep = await api(`/reports/${req.query.report}?pageSize=500`);
      const cols = (rep.columns || []);
      const rows = (rep.rows || []).map(row => {
        const o = {};
        for (const cell of row.cells || []) {
          const col = cols.find(c => c.virtualId === cell.virtualColumnId || c.id === cell.columnId);
          if (col) o[col.title] = cell.value ?? cell.displayValue;
        }
        return o;
      });
      return res.status(200).json({ name: rep.name, totalRows: rep.totalRowCount, columns: cols.map(c => c.title), rows });
    }
    const s = await api(`/sheets/${LIVE}`);
    const cmap = {}; for (const c of s.columns) cmap[c.id] = c.title;
    const rows = (s.rows || []).map((r, i) => {
      const o = { _i: i };
      for (const cell of r.cells || []) { const v = cell.value ?? cell.displayValue; if (v != null && v !== '') o[cmap[cell.columnId]] = v; }
      return o;
    });
    return res.status(200).json({ name: s.name, columns: s.columns.map(c => c.title), totalRows: rows.length, rows });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
