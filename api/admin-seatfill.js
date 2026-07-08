// TEMP one-shot admin — backfill Seat Preference + Departure City (and Return
// Trip when blank) on master rows from the CVENT sheet, matched by email +
// departure date (falls back to email when unambiguous). DELETE after.
const CVENT = '1658234917048196';
const MASTER = '8780932377956228';

const C = { email: 6621390836109188, seating: 5425122185088900, depTrip: 5988072138510212, retTrip: 8239871952195460, depTime: 1484472511139716 };
const M = { email: 7415363137736580, seatPref: 2630288533655428, depCity: 4882088347340676, retTrip: 3419943000641412, depTime: 6797642721169284 };

const norm = (s) => String(s == null ? '' : s).trim();
const depDate = (v) => { const m = norm(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''; };

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  }).then(r => r.json());
  const cell = (row, colId) => {
    const c = (row.cells || []).find(x => x.columnId === colId);
    return c ? (c.value ?? c.displayValue ?? '') : '';
  };

  try {
    const [cvent, master] = await Promise.all([ss(`/sheets/${CVENT}`), ss(`/sheets/${MASTER}`)]);
    // Index CVENT rows by email|depDate and by email alone (count for ambiguity)
    const byKey = {}, byEmail = {};
    for (const r of cvent.rows || []) {
      const e = norm(cell(r, C.email)).toLowerCase();
      if (!e) continue;
      byKey[e + '|' + depDate(cell(r, C.depTime))] = r;
      (byEmail[e] = byEmail[e] || []).push(r);
    }
    const fixes = [];
    for (const mr of master.rows || []) {
      const e = norm(cell(mr, M.email)).toLowerCase();
      if (!e) continue;
      let src = byKey[e + '|' + depDate(cell(mr, M.depTime))];
      if (!src && byEmail[e] && byEmail[e].length === 1) src = byEmail[e][0];
      if (!src) continue;
      const cells = [];
      const put = (mCol, val) => { if (val && !norm(cell(mr, mCol))) cells.push({ columnId: mCol, value: val }); };
      put(M.seatPref, norm(cell(src, C.seating)));
      put(M.depCity, norm(cell(src, C.depTrip)));
      put(M.retTrip, norm(cell(src, C.retTrip)));
      if (cells.length) fixes.push({ id: mr.id, cells });
    }
    let updated = 0; const errors = [];
    for (let i = 0; i < fixes.length; i += 100) {
      const batch = fixes.slice(i, i + 100);
      const r = await ss(`/sheets/${MASTER}/rows`, { method: 'PUT', body: JSON.stringify(batch) });
      if (r.message === 'SUCCESS') updated += batch.length; else errors.push(r);
    }
    return res.status(200).json({ updated, candidates: fixes.length, errors: errors.slice(0, 2) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
