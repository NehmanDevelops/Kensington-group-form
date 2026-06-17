// TEMP — fix Grace's Agent Assigned contacts so the COUNTIFS (matches by name)
// counts them. Adds display name "Grace Northrop" while keeping each cell's
// existing email. Delete after.
//   GET                 → list matching rows on master (id + current value)
//   POST { apply:true } → set objectValue CONTACT {name:'Grace Northrop', email}
const MASTER = '8780932377956228';
const AGENT_ASSIGNED = 4516209625436036; // "Agent Assigned:" CONTACT_LIST
const NEEDLE = 'northr'; // matches northrup / northrop
const DISPLAY = 'Grace Northrop';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });
  const api = (p, o = {}) => fetch(`https://api.smartsheet.com/2.0${p}`, { ...o, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...o.headers } }).then(r => r.json());

  try {
    const sheet = await api(`/sheets/${MASTER}`);
    const matches = [];
    for (const row of sheet.rows || []) {
      const c = (row.cells || []).find(x => x.columnId === AGENT_ASSIGNED);
      if (!c) continue;
      const disp = String(c.displayValue ?? c.value ?? '');
      const email = (c.value && String(c.value).includes('@')) ? String(c.value)
                   : (c.objectValue?.email || (typeof c.value === 'object' ? c.value?.email : '') || '');
      if (disp.toLowerCase().includes(NEEDLE) || (email || '').toLowerCase().includes(NEEDLE)) {
        matches.push({ rowId: row.id, current: disp, email: email || (String(c.value||'')) });
      }
    }

    if (req.method === 'GET') {
      if (req.query?.count) {
        const ASSIGNED_CB = 689867251289988;
        const tally = {};
        for (const row of sheet.rows || []) {
          const ac = (row.cells || []).find(x => x.columnId === AGENT_ASSIGNED);
          const cb = (row.cells || []).find(x => x.columnId === ASSIGNED_CB);
          const disp = ac ? String(ac.displayValue ?? ac.value ?? '') : '';
          if (!disp) continue;
          if (cb && (cb.value === true || cb.value === 'true')) tally[disp] = (tally[disp] || 0) + 1;
        }
        const sorted = Object.entries(tally).sort((a,b)=>b[1]-a[1]);
        return res.status(200).json({ masterAssignedTally: sorted });
      }
      return res.status(200).json({ count: matches.length, sample: matches.slice(0, 8), distinctEmails: [...new Set(matches.map(m => m.email))] });
    }

    // POST apply
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!body.apply) return res.status(400).json({ error: 'POST { apply:true } to apply', wouldUpdate: matches.length });
    const updates = matches.map(m => ({
      id: m.rowId,
      cells: [{ columnId: AGENT_ASSIGNED, objectValue: { objectType: 'CONTACT', name: DISPLAY, email: m.email || 'grace.northrup@kensingtoncorporate.com' } }],
    }));
    let updated = 0;
    for (let i = 0; i < updates.length; i += 100) {
      const chunk = updates.slice(i, i + 100);
      const r = await api(`/sheets/${MASTER}/rows`, { method: 'PUT', body: JSON.stringify(chunk) });
      if (r.message === 'SUCCESS') updated += chunk.length;
      else return res.status(200).json({ updated, error: r });
    }
    return res.status(200).json({ updated });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
