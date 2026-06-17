// TEMP read — dump KPI Summary sheet + tally LIVE GROUP statuses. Delete after.
//   GET ?kpi=1     → KPI Summary - Groups sheet rows/cols/formulas
//   GET ?status=1  → status tally on LIVE GROUP MASTERSHEET
const KPI = '1464420222848900';
const LIVE = '4820086761148292';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const api = (p) => fetch(`https://api.smartsheet.com/2.0${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then(r => r.json());
  try {
    if (req.query?.kpi) {
      const s = await api(`/sheets/${KPI}`);
      const cmap = {}; for (const c of s.columns) cmap[c.id] = c.title;
      const cols = s.columns.map(c => ({ title: c.title, id: c.id, formula: c.formula || null }));
      const rows = (s.rows || []).map(r => {
        const o = { _rowId: r.id };
        for (const cell of r.cells || []) {
          o[cmap[cell.columnId]] = { v: cell.value ?? cell.displayValue, f: cell.formula || null };
        }
        return o;
      });
      return res.status(200).json({ name: s.name, columns: cols, rows });
    }
    if (req.query?.status) {
      const s = await api(`/sheets/${LIVE}`);
      const statusCol = s.columns.find(c => /status/i.test(c.title));
      const cmap = {}; for (const c of s.columns) cmap[c.id] = c.title;
      const tally = {};
      for (const r of s.rows || []) {
        const cell = (r.cells || []).find(x => x.columnId === statusCol?.id);
        const v = (cell?.value ?? cell?.displayValue ?? '(blank)');
        tally[v] = (tally[v] || 0) + 1;
      }
      return res.status(200).json({ statusColumn: statusCol?.title, statusColumnId: statusCol?.id, totalRows: s.rows?.length, tally });
    }
    return res.status(400).json({ error: 'use ?kpi=1 or ?status=1' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
