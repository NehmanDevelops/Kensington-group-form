// TEMP admin — read columns/rows, rename columns, add a column. Delete after.
//   GET  ?cols=1                         → list columns (title,id,index,hidden)
//   GET  ?q=potasi                       → show departure/return cells for matches
//   POST { rename:[{id,title}] }         → rename columns
//   POST { addColumn:{title,type,index}} → add a column (returns new id)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const sheetId = req.query?.sheetId || '8780932377956228';
  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    }).then(r => r.json());

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const out = {};
      if (Array.isArray(body.rename)) {
        out.renamed = [];
        for (const r of body.rename) {
          const resp = await api(`/sheets/${sheetId}/columns/${r.id}`, {
            method: 'PUT', body: JSON.stringify({ title: r.title }),
          });
          out.renamed.push({ id: r.id, title: r.title, result: resp.message || resp.resultCode });
        }
      }
      if (body.addColumn) {
        const resp = await api(`/sheets/${sheetId}/columns`, {
          method: 'POST',
          body: JSON.stringify([{ title: body.addColumn.title, type: body.addColumn.type || 'TEXT_NUMBER', index: body.addColumn.index ?? 0 }]),
        });
        out.added = resp.result;
      }
      return res.status(200).json(out);
    }

    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const sheet = await r.json();
    if (req.query?.cols) {
      return res.status(200).json({
        sheetName: sheet.name,
        columns: sheet.columns.map((c, i) => ({ index: i, title: c.title, id: c.id, hidden: !!c.hidden })),
      });
    }
    const cols = {};
    for (const c of sheet.columns) cols[c.id] = c.title;
    const q = (req.query?.q || '').toLowerCase();
    const rows = (sheet.rows || []).map(row => {
      const o = {};
      for (const cell of row.cells || []) {
        const v = cell.value ?? cell.displayValue;
        if (v !== undefined && v !== null && v !== '') o[cols[cell.columnId]] = v;
      }
      return o;
    }).filter(o => !q || JSON.stringify(o).toLowerCase().includes(q));
    return res.status(200).json({
      sheetName: sheet.name,
      rows: rows.map(o => ({
        Name: `${o['First Name']||''} ${o['Last Name']||''}`.trim(),
        Group: o['Group ID'],
        'Departure Date': o['Departure Date'],
        'Departure Time': o['Departure Time'],
        'Return Date': o['Return Date'],
        'Return Time': o['Return Time'],
        KTN: o['Known Traveller Number'],
        Redress: o['Redress Number'],
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
