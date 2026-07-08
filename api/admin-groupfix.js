// TEMP one-shot admin — group-id backfill + missing-registration rescue. DELETE after.
//   ?action=fixcol    -> CVENT sheet: report Group ID col, try clearing its column
//                        formula, move it to first position.
//   ?action=groupfill -> fill blank Group IDs on master + CVENT rows using the
//                        event_code -> group id mapping learned from the emails.
//   ?action=rescue    -> insert CVENT rows missing from master, keyed by
//                        email+event_code (catches multi-event travellers like
//                        Angela Diaz's second registration).
const CVENT = '1658234917048196';
const MASTER = '8780932377956228';
const SOURCE_COL = 6155241207926660;

// Kensington group ids pasted into the emails ("Event ID:" / "Group ID:"),
// mapped from each event's Code so historical rows can be backfilled.
const EVENT_TO_GROUP = {
  'L7NCL6QDCG3': 'VQ9GCOKAUG26BOS',   // Coca-Cola United (West) Fast Start Incentive (Boston)
  'MPNBQ58C7WJ': 'VQ9GMONSEP26',      // United Coca-Cola Central Region Napa Incentive
};

const CVENT_MAP = {
  first_name: 5495490929266564, middle_name: 3243691115581316, last_name: 7747290742951812,
  date_of_birth: 2117791208738692, email_address: 6621390836109188, cc_email_address: 4369591022423940,
  company: 8873190649794436, title: 77097627586436, mobile_phone: 6832497068642180,
  event_code: 2891847394692996, event_title: 7395447022063492, request_name: 4017747301535620,
  gender: 4862172231667588, redress_number: 2610372417982340, departure_time: 1484472511139716,
  departure_trip: 5988072138510212, return_time: 3736272324824964, return_trip: 8239871952195460,
  ticket_type: 921522557718404, seating: 5425122185088900, special_requests: 2047422464561028,
  reservation_status: 6551022091931524, full_name: 358572604297092,
};
const MASTER_MAP = {
  first_name: 5726513277472644, middle_name: 3474713463787396, last_name: 7978313091157892,
  date_of_birth: 659963696680836, gender: 5163563324051332, email_address: 7415363137736580,
  mobile_phone: 1785863603523460, company: 6289463230893956, title: 5003239744638852,
  event_code: 7817989511745412, group_id: 5029597388509060, request_name: 8943889418588036,
  redress_number: 3756188440498052, departure_time: 6797642721169284, departure_trip: 1168143186956164,
  return_time: 5671742814326660, return_trip: 3419943000641412, ticket_type: 7923542628011908,
  special_requests: 7360592674590596, confidence_score: 7642067651301252,
};
const DATE_COLS = new Set([659963696680836]);

const norm = (s) => String(s == null ? '' : s).trim();
const toISO = (v) => {
  const s = norm(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = Date.parse(s);
  if (!isNaN(d)) { const dt = new Date(d); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`; }
  return '';
};

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const action = (req.query && req.query.action) || 'fixcol';
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  }).then(r => r.json());
  const cell = (row, colId) => {
    const c = (row.cells || []).find(x => x.columnId === colId);
    return c ? (c.value ?? c.displayValue ?? '') : '';
  };

  try {
    if (action === 'fixcol') {
      const sheet = await ss(`/sheets/${CVENT}?pageSize=1`);
      const col = (sheet.columns || []).find(c => c.title.trim().toLowerCase() === 'group id');
      if (!col) return res.status(404).json({ error: 'no Group ID column on CVENT sheet' });
      const out = { colId: col.id, hadFormula: !!col.formula, index: col.index };
      // Try to clear the column formula, then move to first data position.
      if (col.formula) {
        const r1 = await ss(`/sheets/${CVENT}/columns/${col.id}`, { method: 'PUT', body: JSON.stringify({ formula: '' }) });
        out.formulaClear = r1.message || r1;
      }
      const r2 = await ss(`/sheets/${CVENT}/columns/${col.id}`, { method: 'PUT', body: JSON.stringify({ index: 0 }) });
      out.moveToFront = r2.message || r2;
      const after = await ss(`/sheets/${CVENT}?pageSize=1`);
      const colAfter = (after.columns || []).find(c => c.id === col.id);
      out.nowHasFormula = !!(colAfter && colAfter.formula);
      out.nowIndex = colAfter && colAfter.index;
      return res.status(200).json(out);
    }

    if (action === 'groupfill') {
      const out = {};
      // Master: blank Group ID + known event code -> fill
      const master = await ss(`/sheets/${MASTER}`);
      // Fillable = blank OR still echoing the event code (artifact of the old
      // =[Event Code]@row column formula on the CVENT sheet).
      const fillable = (gid, ec) => !gid || gid.toUpperCase() === ec;
      const mFixes = (master.rows || []).filter(r => {
        const gid = norm(cell(r, MASTER_MAP.group_id));
        const ec = norm(cell(r, MASTER_MAP.event_code)).toUpperCase();
        return EVENT_TO_GROUP[ec] && fillable(gid, ec);
      }).map(r => ({ id: r.id, cells: [{ columnId: MASTER_MAP.group_id, value: EVENT_TO_GROUP[norm(cell(r, MASTER_MAP.event_code)).toUpperCase()] }] }));
      if (mFixes.length) await ss(`/sheets/${MASTER}/rows`, { method: 'PUT', body: JSON.stringify(mFixes) });
      out.masterFilled = mFixes.length;
      // CVENT: same, if the Group ID column is writable (formula cleared)
      const cvent = await ss(`/sheets/${CVENT}`);
      const gcol = (cvent.columns || []).find(c => c.title.trim().toLowerCase() === 'group id');
      if (gcol && !gcol.formula) {
        const cFixes = (cvent.rows || []).filter(r => {
          const gid = norm(cell(r, gcol.id));
          const ec = norm(cell(r, CVENT_MAP.event_code)).toUpperCase();
          return EVENT_TO_GROUP[ec] && fillable(gid, ec);
        }).map(r => ({ id: r.id, cells: [{ columnId: gcol.id, value: EVENT_TO_GROUP[norm(cell(r, CVENT_MAP.event_code)).toUpperCase()] }] }));
        if (cFixes.length) await ss(`/sheets/${CVENT}/rows`, { method: 'PUT', body: JSON.stringify(cFixes) });
        out.cventFilled = cFixes.length;
        out.cventGroupColId = gcol.id;
      } else {
        out.cventFilled = 'skipped — Group ID column still has a formula (clear it first via ?action=fixcol or the Smartsheet UI)';
      }
      return res.status(200).json(out);
    }

    if (action === 'rescue') {
      const [cvent, master] = await Promise.all([ss(`/sheets/${CVENT}`), ss(`/sheets/${MASTER}`)]);
      const masterColIds = new Set(master.columns.map(c => c.id));
      const key = (email, ec) => (norm(email).toLowerCase() + '|' + norm(ec).toUpperCase());
      const masterKeys = new Set((master.rows || []).map(r => key(cell(r, MASTER_MAP.email_address), cell(r, MASTER_MAP.event_code))));
      const seen = new Set();
      const missing = (cvent.rows || []).filter(r => {
        const email = norm(cell(r, CVENT_MAP.email_address));
        const ec = norm(cell(r, CVENT_MAP.event_code));
        if (!email) return false;
        const k = key(email, ec);
        if (masterKeys.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const newRows = missing.map(r => {
        const cells = [];
        for (const [field, mCol] of Object.entries(MASTER_MAP)) {
          if (!masterColIds.has(mCol) || field === 'group_id') continue;
          const cCol = CVENT_MAP[field];
          if (!cCol) continue;
          let v = norm(cell(r, cCol));
          if (v !== '' && DATE_COLS.has(mCol)) v = toISO(v);
          if (v !== '') cells.push({ columnId: mCol, value: v });
        }
        const ec = norm(cell(r, CVENT_MAP.event_code)).toUpperCase();
        if (EVENT_TO_GROUP[ec]) cells.push({ columnId: MASTER_MAP.group_id, value: EVENT_TO_GROUP[ec] });
        if (masterColIds.has(SOURCE_COL)) cells.push({ columnId: SOURCE_COL, value: 'CVENT' });
        return { toBottom: true, cells };
      });
      let created = 0; const errors = [];
      for (let i = 0; i < newRows.length; i += 100) {
        const batch = newRows.slice(i, i + 100);
        const r = await ss(`/sheets/${MASTER}/rows`, { method: 'POST', body: JSON.stringify(batch) });
        if (r.message === 'SUCCESS') created += batch.length; else errors.push(r);
      }
      return res.status(200).json({ action, created, candidates: missing.length, who: missing.slice(0, 10).map(r => `${norm(cell(r, CVENT_MAP.first_name))} ${norm(cell(r, CVENT_MAP.last_name))} @ ${norm(cell(r, CVENT_MAP.event_code))}`), errors: errors.slice(0, 2) });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
