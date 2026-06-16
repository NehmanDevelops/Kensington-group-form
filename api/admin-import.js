// TEMP one-time bulk import into the Traveller Profile MasterSheet. Delete after.
//   POST { groupId, rows:[{last,first,type,gp,status,pnr,agent}] }
// Dedup key = groupId|first|last. Source set to "Excel Import".
const MASTER = '8780932377956228';
// Resolve columns by TITLE at runtime (hardcoded IDs keep getting deleted by
// agents editing the sheet). field -> column title on the master sheet.
const TITLES = {
  groupId: 'Group ID', source: 'Source',
  first: 'First Name', last: 'Last Name',
  title: 'Title', travellerType: 'Traveller Type',
  status: 'Reservation Status', pnr: 'PNR', agentNotes: 'Agent Notes',
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

    // Verify/cleanup helpers
    if (body.action === 'peek' || body.action === 'deleteRow') {
      const sheet0 = await (await api(`/sheets/${MASTER}`)).json();
      const cmap = {}; for (const c of sheet0.columns) cmap[c.id] = c.title;
      const gv = (row, title) => { const c = (row.cells||[]).find(x => cmap[x.columnId] === title); return c?.value ?? c?.displayValue ?? ''; };
      const match = (sheet0.rows||[]).filter(r => `${gv(r,'Group ID')}`.includes(body.q || 'VQ9GNTAAUG26'));
      if (body.action === 'deleteRow' && body.rowId) {
        const dr = await (await api(`/sheets/${MASTER}/rows?ids=${body.rowId}`, { method: 'DELETE' })).json();
        return res.status(200).json(dr);
      }
      return res.status(200).json({
        count: match.length,
        sample: match.slice(0, 6).map(r => ({ id: r.id, name: `${gv(r,'First Name')} ${gv(r,'Last Name')}`, type: gv(r,'Traveller Type'), title: gv(r,'Title'), pnr: gv(r,'PNR'), group: gv(r,'Group ID') })),
        testRow: match.filter(r => `${gv(r,'Last Name')}`.toLowerCase() === 'zzztest').map(r => r.id),
      });
    }

    const groupId = norm(body.groupId);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!groupId) return res.status(400).json({ error: 'missing groupId' });

    // Resolve column IDs by title from the live sheet
    const sheet = await (await api(`/sheets/${MASTER}`)).json();
    const byTitle = {};
    for (const col of sheet.columns) byTitle[col.title.trim().toLowerCase()] = col.id;
    const C = {};
    const missing = [];
    for (const [k, title] of Object.entries(TITLES)) {
      const id = byTitle[title.trim().toLowerCase()];
      if (id) C[k] = id; else missing.push(title);
    }
    if (!C.first || !C.last || !C.groupId) {
      return res.status(500).json({ error: 'core columns missing', missing });
    }

    // Dedup: read existing master rows for this group
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
        { columnId: C.first, value: first },
        { columnId: C.last, value: last },
      ];
      if (C.source) cells.push({ columnId: C.source, value: 'Excel Import' });
      const tt = travType(r.gp);
      if (tt && C.travellerType) cells.push({ columnId: C.travellerType, value: tt });
      if (norm(r.type) && C.title) cells.push({ columnId: C.title, value: norm(r.type) });
      if (norm(r.status) && C.status) cells.push({ columnId: C.status, value: norm(r.status) });
      if (norm(r.pnr) && C.pnr) cells.push({ columnId: C.pnr, value: norm(r.pnr) });
      if (norm(r.agent) && C.agentNotes) cells.push({ columnId: C.agentNotes, value: `Agent: ${norm(r.agent)}` });
      newRows.push({ toBottom: true, cells });
    }

    if (!newRows.length) return res.status(200).json({ written: 0, skipped, missing, message: 'nothing new' });

    const resp = await (await api(`/sheets/${MASTER}/rows`, { method: 'POST', body: JSON.stringify(newRows) })).json();
    return res.status(200).json({
      written: (resp.result || []).length,
      skipped,
      missingColumns: missing,
      message: resp.message,
      error: resp.message && resp.message !== 'SUCCESS' ? resp : undefined,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
