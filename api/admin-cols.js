// TEMP read-only — list column titles + IDs (and a sample row's values) for a
// sheet. Delete after use.
//   GET /api/admin-cols?sheetId=8780932377956228
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const sheetId = req.query?.sheetId || '8780932377956228';
  const want = (req.query?.contains || '').toLowerCase();
  try {
    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const sheet = await r.json();
    let cols = sheet.columns.map(c => ({ id: c.id, title: c.title, type: c.type }));
    if (want) cols = cols.filter(c => c.title.toLowerCase().includes(want));
    return res.status(200).json({ sheetName: sheet.name, columns: cols });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
