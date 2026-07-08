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
    const cvent = await ss(`/sheets/${CVENT}?pageSize=1`);
    const existing = (cvent.columns || []).find(c => c.title.trim().toLowerCase() === 'guest name');
    if (existing) {
      out.cventGuestCol = existing.id;
      out.note = 'already existed';
    } else {
      const lastName = (cvent.columns || []).find(c => c.title.trim().toLowerCase() === 'last name');
      const idx = lastName ? lastName.index + 1 : (cvent.columns || []).length;
      const r = await ss(`/sheets/${CVENT}/columns`, { method: 'POST', body: JSON.stringify([{ title: 'Guest Name', type: 'TEXT_NUMBER', index: idx }]) });
      out.cventGuestCol = r.result && r.result[0] && r.result[0].id;
      if (!out.cventGuestCol) out.error = r;
    }
    const master = await ss(`/sheets/${MASTER}?pageSize=1`);
    const mCol = (master.columns || []).find(c => c.title.trim().toLowerCase() === 'guest name');
    out.masterGuestCol = mCol ? mCol.id : 'not added yet (Vera to add)';
    return res.status(200).json(out);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
