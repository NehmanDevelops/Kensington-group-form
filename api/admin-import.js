// TEMP one-time bulk import into the Traveller Profile MasterSheet. Delete after.
//   POST { groupId, rows:[{last,first,type,gp,status,pnr,agent}] }
// Dedup key = groupId|first|last. Source set to "Excel Import".
const MASTER = '8780932377956228';
const C = {
  groupId: 5029597388509060, source: 6155241207926660,
  first: 5726513277472644, last: 7978313091157892,
  title: 5003239744638852, travellerType: 5054810658475908,
  status: 1731093140377476, pnr: 8205017604722564, agentNotes: 886668210245508,
};

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

  const norm = s => (s == null ? '' : String(s)).trim();
  const travType = gp => {
    const g = norm(gp).toLowerCase();
    if (g.includes('guest')) return 'Guest';
    if (g.includes('profile')) return 'Profile';
    return '';
  };

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const groupId = norm(body.groupId);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!groupId) return res.status(400).json({ error: 'missing groupId' });

    // Dedup: read existing master rows for this group
    const sheet = await (await api(`/sheets/${MASTER}`)).json();
    const cellVal = (row, id) => { const c = row.cells?.find(c => c.columnId === id); return c?.value ?? c?.displayValue ?? ''; };
    const existing = new Set();
    for (const row of sheet.rows || []) {
      const k = `${norm(cellVal(row, C.groupId))}|${norm(cellVal(row, C.first))}|${norm(cellVal(row, C.last))}`.toLowerCase();
      if (k !== '||') existing.add(k);
    }

    const newRows = [];
    let skipped = 0;
    for (const r of rows) {
      const first = norm(r.first), last = norm(r.last);
      if (!first && !last) continue;
      const key = `${groupId}|${first}|${last}`.toLowerCase();
      if (existing.has(key)) { skipped++; continue; }
      const cells = [
        { columnId: C.groupId, value: groupId },
        { columnId: C.source, value: 'Excel Import' },
        { columnId: C.first, value: first },
        { columnId: C.last, value: last },
      ];
      const tt = travType(r.gp);
      if (tt) cells.push({ columnId: C.travellerType, value: tt });
      if (norm(r.type)) cells.push({ columnId: C.title, value: norm(r.type) });
      if (norm(r.status)) cells.push({ columnId: C.status, value: norm(r.status) });
      if (norm(r.pnr)) cells.push({ columnId: C.pnr, value: norm(r.pnr) });
      if (norm(r.agent)) cells.push({ columnId: C.agentNotes, value: `Agent: ${norm(r.agent)}` });
      newRows.push({ toBottom: true, cells });
    }

    if (!newRows.length) return res.status(200).json({ written: 0, skipped, message: 'nothing new' });

    const resp = await (await api(`/sheets/${MASTER}/rows`, { method: 'POST', body: JSON.stringify(newRows) })).json();
    return res.status(200).json({
      written: (resp.result || []).length,
      skipped,
      message: resp.message,
      error: resp.message && resp.message !== 'SUCCESS' ? resp : undefined,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
