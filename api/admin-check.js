// TEMP read-only diagnostic — list rows on a sheet matching a group/name.
// Delete after use.
//   GET /api/admin-check?sheetId=8780932377956228&q=1OEGLOASEP26
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });

  const sheetId = req.query?.sheetId || '8780932377956228';
  const q = (req.query?.q || '').toLowerCase();

  try {
    // Delete a row:  POST { sheetId, deleteRowId }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.sheetId && body.deleteRowId) {
        const dr = await fetch(`https://api.smartsheet.com/2.0/sheets/${body.sheetId}/rows?ids=${body.deleteRowId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        return res.status(200).json(await dr.json());
      }
      return res.status(400).json({ error: 'need sheetId + deleteRowId' });
    }

    // Search all sheets by name substring:  ?find=traveller
    if (req.query?.find) {
      const sr = await fetch('https://api.smartsheet.com/2.0/sheets?includeAll=true', {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const all = await sr.json();
      const needle = req.query.find.toLowerCase();
      return res.status(200).json({
        total: (all.data || []).length,
        matches: (all.data || [])
          .filter(s => s.name.toLowerCase().includes(needle))
          .map(s => ({ id: s.id, name: s.name })),
      });
    }

    // List a folder's sheets:  ?folder=393314542348164
    if (req.query?.folder) {
      const fr = await fetch(`https://api.smartsheet.com/2.0/folders/${req.query.folder}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const folder = await fr.json();
      return res.status(200).json({
        folder: folder.name,
        sheets: (folder.sheets || []).map(s => ({ id: s.id, name: s.name })),
        reports: (folder.reports || []).map(r => ({ id: r.id, name: r.name })),
        subfolders: (folder.folders || []).map(f => ({ id: f.id, name: f.name })),
      });
    }

    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const sheet = await r.json();
    const cols = {};
    for (const c of sheet.columns) cols[c.id] = c.title;

    const rows = (sheet.rows || []).map(row => {
      const o = { _rowId: row.id };
      for (const cell of row.cells || []) {
        const v = cell.value ?? cell.displayValue;
        if (v !== undefined && v !== null && v !== '') o[cols[cell.columnId]] = v;
      }
      return o;
    });

    const filtered = q
      ? rows.filter(o => JSON.stringify(o).toLowerCase().includes(q))
      : rows;

    return res.status(200).json({
      sheetName: sheet.name,
      sheetId,
      totalRows: sheet.totalRowCount ?? rows.length,
      matched: filtered.length,
      rows: filtered.map(o => ({
        _rowId: o._rowId,
        First: o['First Name'], Last: o['Last Name'],
        Group: o['Group ID'], Email: o['Email Address'],
        Phone: o['Phone Number'] || o['Mobile Phone'],
        Departure: o['Departure Time'] || o['Departure Date'],
        Return: o['Return Time'] || o['Return Date'],
        Source: o['Source'],
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
