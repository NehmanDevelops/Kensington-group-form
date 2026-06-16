// TEMP — clear "Agent: ..." values from Agent Notes for a group. Delete after.
//   POST { groupId }
const MASTER = '8780932377956228';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const groupId = (body.groupId || '').trim();
    if (!groupId) return res.status(400).json({ error: 'missing groupId' });
    const sheet = await (await api(`/sheets/${MASTER}`)).json();
    const byTitle = {}; for (const c of sheet.columns) byTitle[c.title.trim().toLowerCase()] = c.id;
    const gCol = byTitle['group id'], nCol = byTitle['agent notes'];
    if (!gCol || !nCol) return res.status(500).json({ error: 'columns not found' });
    const gv = (row, id) => { const c = (row.cells||[]).find(x => x.columnId === id); return c?.value ?? c?.displayValue ?? ''; };
    const updates = [];
    for (const row of sheet.rows || []) {
      if (`${gv(row, gCol)}`.trim() !== groupId) continue;
      const note = `${gv(row, nCol)}`;
      if (note.toLowerCase().startsWith('agent:')) {
        updates.push({ id: row.id, cells: [{ columnId: nCol, value: '' }] });
      }
    }
    if (!updates.length) return res.status(200).json({ cleared: 0 });
    // PUT in chunks of 100
    let cleared = 0;
    for (let i = 0; i < updates.length; i += 100) {
      const chunk = updates.slice(i, i + 100);
      const r = await (await api(`/sheets/${MASTER}/rows`, { method: 'PUT', body: JSON.stringify(chunk) })).json();
      if (r.message === 'SUCCESS') cleared += chunk.length;
      else return res.status(200).json({ cleared, error: r });
    }
    return res.status(200).json({ cleared });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
