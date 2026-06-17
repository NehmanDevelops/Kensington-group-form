// TEMP read-only — find the source behind "Numbers By Advisor". Delete after.
//   GET ?list=1                 → list reports + sheets (id/name)
//   GET ?report=<id>            → dump a report (source sheets, columns, sample rows)
//   GET ?sheet=<id>&adv=1       → dump a sheet's columns (w/ formula) + advisor rows
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const api = (p) => fetch(`https://api.smartsheet.com/2.0${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then(r => r.json());
  try {
    if (req.query?.list) {
      const [reps, shts] = await Promise.all([api('/reports?includeAll=true'), api('/sheets?includeAll=true')]);
      const q = (req.query.q || '').toLowerCase();
      return res.status(200).json({
        reports: (reps.data || []).filter(r => !q || r.name.toLowerCase().includes(q)).map(r => ({ id: r.id, name: r.name })),
        sheets: (shts.data || []).filter(s => !q || s.name.toLowerCase().includes(q)).map(s => ({ id: s.id, name: s.name })),
      });
    }
    if (req.query?.report) {
      const rep = await api(`/reports/${req.query.report}?pageSize=200`);
      const cols = (rep.columns || []).map(c => c.title);
      const advCol = (rep.columns || []).find(c => /advisor|agent/i.test(c.title));
      const rows = (rep.rows || []).map(row => {
        const o = {};
        for (const cell of row.cells || []) {
          const col = (rep.columns || []).find(c => c.virtualId === cell.virtualColumnId || c.id === cell.columnId);
          if (col) o[col.title] = cell.value ?? cell.displayValue;
        }
        return o;
      });
      const graceRows = rows.filter(o => JSON.stringify(o).toLowerCase().includes('grace') || JSON.stringify(o).toLowerCase().includes('northr'));
      return res.status(200).json({ name: rep.name, sourceSheets: rep.sourceSheets?.map(s => ({ id: s.id, name: s.name })), columns: cols, totalRows: rep.totalRowCount, graceRows });
    }
    if (req.query?.sheet) {
      const s = await api(`/sheets/${req.query.sheet}`);
      const cols = s.columns.map(c => ({ title: c.title, id: c.id, formula: c.formula || null }));
      const cmap = {}; for (const c of s.columns) cmap[c.id] = c.title;
      const rows = (s.rows || []).map(r => {
        const o = {}; for (const cell of r.cells || []) { const v = cell.value ?? cell.displayValue; if (v != null && v !== '') o[cmap[cell.columnId]] = v; }
        return o;
      }).filter(o => JSON.stringify(o).toLowerCase().includes('grace') || JSON.stringify(o).toLowerCase().includes('northr'));
      return res.status(200).json({ name: s.name, columns: cols, graceRows: rows });
    }
    return res.status(400).json({ error: 'use ?list=1 or ?report=<id> or ?sheet=<id>' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
