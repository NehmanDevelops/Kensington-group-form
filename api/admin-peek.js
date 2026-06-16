// TEMP read-only — show specific columns for rows matching a query. Delete after.
//   GET /api/admin-peek?sheetId=8780932377956228&q=potasi
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const sheetId = req.query?.sheetId || '8780932377956228';
  const q = (req.query?.q || '').toLowerCase();
  try {
    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const sheet = await r.json();
    const cols = {};
    for (const c of sheet.columns) cols[c.id] = c.title;
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
        'Departure Time': o['Departure Time'],
        'Departure Preference': o['Departure Preference'],
        'Return Time': o['Return Time'],
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
