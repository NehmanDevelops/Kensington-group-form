// TEMP — append columns to a sheet (skips existing). Delete after.
//   POST { sheetId, columns:[{title,type}] }   type: TEXT_NUMBER | CHECKBOX | DATE
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const api = (p, o = {}) => fetch(`https://api.smartsheet.com/2.0${p}`, { ...o, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...o.headers } }).then(r => r.json());
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const sheet = await api(`/sheets/${b.sheetId}`);
    if (!sheet.columns) return res.status(404).json({ error: 'sheet not found', detail: sheet });
    const existing = new Set(sheet.columns.map(c => c.title.trim().toLowerCase()));
    let index = sheet.columns.length;
    const added = [], skipped = [];
    for (const col of (b.columns || [])) {
      if (existing.has(col.title.trim().toLowerCase())) { skipped.push(col.title); continue; }
      const r = await api(`/sheets/${b.sheetId}/columns`, {
        method: 'POST',
        body: JSON.stringify([{ title: col.title, type: col.type || 'TEXT_NUMBER', index }]),
      });
      if (r.message === 'SUCCESS') { added.push(col.title); index++; }
      else return res.status(200).json({ added, skipped, error: r });
    }
    return res.status(200).json({ added, skipped });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
