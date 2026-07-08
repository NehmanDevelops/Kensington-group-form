// TEMP one-shot admin — CVENT -> Traveller MasterSheet rescue. DELETE after.
//   ?action=diag     -> which parser map column-ids are dead on the master +
//                       how many CVENT rows are missing from the master.
//   ?action=backfill -> insert the missing CVENT rows into the master
//                       (skipping dead columns so nothing is rejected).
const CVENT = '1658234917048196';
const MASTER = '8780932377956228';
const SOURCE_COL = 6155241207926660; // master "Source"

// field -> CVENT column id (from parse-email.py CVENT_COLUMN_MAP)
const CVENT_MAP = {
  first_name: 5495490929266564, middle_name: 3243691115581316, last_name: 7747290742951812,
  date_of_birth: 2117791208738692, email_address: 6621390836109188, cc_email_address: 4369591022423940,
  company: 8873190649794436, title: 77097627586436, work_phone: 4580697254956932,
  home_phone: 2328897441271684, mobile_phone: 6832497068642180, passport_nationality: 1202997534429060,
  passport_number: 5706597161799556, passport_expiration_date: 7958396975484804,
  guest_email: 640047581007748, guest_mobile_phone: 5143647208378244, event_code: 2891847394692996,
  event_title: 7395447022063492, event_date: 1765947487850372, event_time: 6269547115220868,
  request_name: 4017747301535620, request_date: 8521346928906116, gender: 4862172231667588,
  redress_number: 2610372417982340, departure_time: 1484472511139716, departure_trip: 5988072138510212,
  return_time: 3736272324824964, return_trip: 8239871952195460, ticket_type: 921522557718404,
  seating: 5425122185088900, food_preferences: 7676921998774148, special_requests: 2047422464561028,
  reservation_status: 6551022091931524, airline_preference_1: 4299222278246276,
  frequent_flyer_number_1: 8802821905616772, airline_preference_2: 217835115941764,
  frequent_flyer_number_2: 4721434743312260, airline_preference_3: 2469634929627012,
  frequent_flyer_number_3: 6973234556997508, confidence_score: 6410284603576196,
};

// field -> MASTER column id (from parse-email.py MASTER_COLUMN_MAP)
const MASTER_MAP = {
  first_name: 5726513277472644, middle_name: 3474713463787396, last_name: 7978313091157892,
  date_of_birth: 659963696680836, gender: 5163563324051332, nationality: 2911763510366084,
  email_address: 7415363137736580, cc_email_address: 8662414441877380, mobile_phone: 1785863603523460,
  work_phone: 2751439930953604, home_phone: 7255039558324100, company: 6289463230893956,
  title: 5003239744638852, passport_number: 4037663417208708, passport_expiration_date: 8541263044579204,
  passport_nationality: 6129139651481476, guest_email: 5566189698060164, guest_mobile_phone: 3314389884374916,
  event_code: 7817989511745412, event_title: 2188489977532292, event_date: 6692089604902788,
  event_time: 4440289791217540, group_id: 5029597388509060, request_name: 8943889418588036,
  request_date: 42243280113540, known_traveller_number: 8259788067868548, redress_number: 3756188440498052,
  departure_time: 6797642721169284, departure_time_pref: 2117685625524100, departure_trip: 1168143186956164,
  return_time: 5671742814326660, return_time_pref: 5554005685342084, return_trip: 3419943000641412,
  ticket_type: 7923542628011908, seating: 605193233534852, food_preferences: 2856993047220100,
  special_requests: 7360592674590596, reservation_status: 1731093140377476,
  airline_preference_1: 6234692767747972, frequent_flyer_number_1: 3982892954062724,
  airline_preference_2: 8486492581433220, frequent_flyer_number_2: 323718256824196,
  airline_preference_3: 4827317884194692, frequent_flyer_number_3: 2575518070509444,
  confidence_score: 7642067651301252,
};

const norm = (s) => String(s == null ? '' : s).trim();

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const action = (req.query && req.query.action) || 'diag';
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  }).then(r => r.json());

  try {
    const [cvent, master] = await Promise.all([ss(`/sheets/${CVENT}`), ss(`/sheets/${MASTER}`)]);
    if (!cvent.columns || !master.columns) return res.status(502).json({ error: 'sheet read failed' });

    const masterColIds = new Set(master.columns.map(c => c.id));
    const cventColIds = new Set(cvent.columns.map(c => c.id));

    // 1) Which parser map ids are DEAD (don't exist on the sheet)?
    const deadMaster = Object.entries(MASTER_MAP).filter(([, id]) => !masterColIds.has(id)).map(([f, id]) => `${f}:${id}`);
    const deadCvent = Object.entries(CVENT_MAP).filter(([, id]) => !cventColIds.has(id)).map(([f, id]) => `${f}:${id}`);

    const cell = (row, colId) => {
      const c = (row.cells || []).find(x => x.columnId === colId);
      return c ? (c.value ?? c.displayValue ?? '') : '';
    };
    const key = (email, first, last) => {
      const e = norm(email).toLowerCase();
      if (e) return 'e:' + e;
      const n = (norm(first) + '|' + norm(last)).toLowerCase();
      return n !== '|' ? 'n:' + n : '';
    };

    // 2) Master identity set (email or first+last)
    const masterKeys = new Set();
    for (const r of master.rows || []) {
      const k1 = key(cell(r, MASTER_MAP.email_address), '', '');
      const k2 = key('', cell(r, MASTER_MAP.first_name), cell(r, MASTER_MAP.last_name));
      if (k1) masterKeys.add(k1);
      if (k2) masterKeys.add(k2);
    }

    // 3) CVENT rows missing from master
    const cventGroupCol = (cvent.columns.find(c => c.title.trim().toLowerCase() === 'group id') || {}).id;
    const missing = [];
    for (const r of cvent.rows || []) {
      const email = cell(r, CVENT_MAP.email_address);
      const first = cell(r, CVENT_MAP.first_name);
      const last = cell(r, CVENT_MAP.last_name);
      if (!norm(email) && !norm(first) && !norm(last)) continue; // blank row
      const kE = key(email, '', '');
      const kN = key('', first, last);
      if ((kE && masterKeys.has(kE)) || (kN && masterKeys.has(kN))) continue;
      missing.push({ row: r, email: norm(email), name: `${norm(first)} ${norm(last)}`.trim(), groupId: cventGroupCol ? norm(cell(r, cventGroupCol)) : '' });
    }

    if (action === 'diag') {
      return res.status(200).json({
        action, cventRows: (cvent.rows || []).length, masterRows: (master.rows || []).length,
        deadMasterColumns: deadMaster, deadCventColumns: deadCvent,
        missingFromMaster: missing.length,
        sample: missing.slice(0, 15).map(m => `${m.name} <${m.email}> [${m.groupId}]`),
      });
    }

    if (action === 'backfill') {
      if (!missing.length) return res.status(200).json({ action, created: 0, note: 'nothing missing' });
      const newRows = missing.map(m => {
        const cells = [];
        for (const [field, mCol] of Object.entries(MASTER_MAP)) {
          if (!masterColIds.has(mCol)) continue;             // skip dead columns
          const cCol = CVENT_MAP[field];
          if (!cCol) continue;
          const v = norm(cell(m.row, cCol));
          if (v !== '') cells.push({ columnId: mCol, value: v });
        }
        if (m.groupId && masterColIds.has(MASTER_MAP.group_id)) cells.push({ columnId: MASTER_MAP.group_id, value: m.groupId });
        if (masterColIds.has(SOURCE_COL)) cells.push({ columnId: SOURCE_COL, value: 'CVENT' });
        return { toBottom: true, cells };
      });
      let created = 0; const errors = [];
      for (let i = 0; i < newRows.length; i += 100) {
        const batch = newRows.slice(i, i + 100);
        const r = await ss(`/sheets/${MASTER}/rows`, { method: 'POST', body: JSON.stringify(batch) });
        if (r.message === 'SUCCESS') created += batch.length; else errors.push(r);
      }
      return res.status(200).json({ action, created, of: missing.length, errors: errors.slice(0, 2) });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
