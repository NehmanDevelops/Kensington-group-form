// TEMP one-shot admin — blank any cell on the master / CVENT / agent-copy
// sheets whose value contains the CVENT footer sentence ("View more
// information about this invitee's itinerary"). DELETE after running.
const SHEETS = {
  master: '8780932377956228',
  cvent: '1658234917048196',
  agentCopy: '7213505705889668',
};
const JUNK = /view more information/i;

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  }).then(r => r.json());

  try {
    const out = {};
    for (const [name, id] of Object.entries(SHEETS)) {
      const sheet = await ss(`/sheets/${id}`);
      if (!sheet.columns) { out[name] = 'read failed'; continue; }
      const formulaCols = new Set(sheet.columns.filter(c => c.formula).map(c => c.id));
      const fixes = [];
      for (const row of sheet.rows || []) {
        const cells = (row.cells || [])
          .filter(c => !formulaCols.has(c.columnId) && typeof c.value === 'string' && JUNK.test(c.value))
          .map(c => ({ columnId: c.columnId, value: '' }));
        if (cells.length) fixes.push({ id: row.id, cells });
      }
      let updated = 0; const errors = [];
      for (let i = 0; i < fixes.length; i += 100) {
        const batch = fixes.slice(i, i + 100);
        const r = await ss(`/sheets/${id}/rows`, { method: 'PUT', body: JSON.stringify(batch) });
        if (r.message === 'SUCCESS') updated += batch.length; else errors.push(r.message || r);
      }
      out[name] = { rowsCleaned: updated, errors: errors.slice(0, 1) };
    }
    return res.status(200).json(out);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
