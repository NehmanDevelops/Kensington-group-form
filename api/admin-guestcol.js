// TEMP one-shot admin — add "Guest Name" column to the CVENT parser sheet
// (right after Last Name) and report the master's Guest Name column id if
// Vera has added it. DELETE after running.
const CVENT = '1658234917048196';
const MASTER = '8780932377956228';

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  }).then(r => r.json());

  try {
    const out = {};
    // Ensure Guest Name + Guest DOB columns on the CVENT parser sheet.
    const cvent = await ss(`/sheets/${CVENT}?pageSize=1`);
    const find = (cols, t) => (cols || []).find(c => c.title.trim().toLowerCase() === t);
    let cols = cvent.columns || [];
    for (const title of ['Guest Name', 'Guest DOB']) {
      const key = title.toLowerCase();
      let col = find(cols, key);
      if (!col) {
        const anchor = find(cols, key === 'guest dob' ? 'guest name' : 'last name');
        const idx = anchor ? anchor.index + 1 : cols.length;
        const r = await ss(`/sheets/${CVENT}/columns`, { method: 'POST', body: JSON.stringify([{ title, type: 'TEXT_NUMBER', index: idx }]) });
        col = r.result && r.result[0];
        const refreshed = await ss(`/sheets/${CVENT}?pageSize=1`);
        cols = refreshed.columns || cols;
      }
      out['cvent_' + title.replace(' ', '_')] = col ? col.id : 'FAILED';
    }
    // Report Vera's master column ids + types (type matters for date handling).
    const master = await ss(`/sheets/${MASTER}?pageSize=1`);
    for (const title of ['Guest Name', 'Guest DOB']) {
      const c = find(master.columns, title.toLowerCase());
      out['master_' + title.replace(' ', '_')] = c ? { id: c.id, type: c.type } : 'not found';
    }
    return res.status(200).json(out);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
