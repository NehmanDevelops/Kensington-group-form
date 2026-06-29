// Amgine integration — single endpoint, two jobs:
//   1. SEND   (POST { rowId })          → build + fire a New Request for a traveller,
//                                          then write the itinerary id back to the row.
//   2. WEBHOOK (POST from Amgine)        → status update flows back onto the row.
//        (webhook half is stubbed until the vendor sends the payload spec.)
//
// Triggered by Power Automate when a traveller's "Ready to Book" is checked:
// PA calls  POST /api/amgine  { "rowId": <traveller row id> }.
//
// Env vars (Vercel): AMGINE_TOKEN_URL, AMGINE_CLIENT_ID, AMGINE_CLIENT_SECRET,
// AMGINE_GRANT_TYPE, AMGINE_SCOPE, AMGINE_USERNAME, AMGINE_PASSWORD,
// AMGINE_API_URL, AMGINE_TMC_GUID, AMGINE_HASH, SMARTSHEET_API_TOKEN.

const MASTER = '8780932377956228';      // Traveller Profile MasterSheet
const GROUPS = '4820086761148292';      // LIVE GROUP MASTERSHEET

// ── helpers ────────────────────────────────────────────────────────────────
const ss = (token) => (path, opts = {}) =>
  fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts.headers },
  });

// Build {title->id} + a getter for a specific row's values by column title.
function indexSheet(sheet) {
  const idByTitle = {};
  for (const c of sheet.columns) idByTitle[c.title.trim().toLowerCase()] = c.id;
  const id = (title) => idByTitle[title.trim().toLowerCase()];
  const val = (row, title) => {
    const c = (row.cells || []).find(x => x.columnId === id(title));
    return c ? (c.value ?? c.displayValue ?? '') : '';
  };
  return { id, val, idByTitle };
}

const norm = (s) => String(s == null ? '' : s).trim();

// "Male" -> "M", "Female" -> "F"
const toGender = (g) => {
  const s = norm(g).toLowerCase();
  if (s.startsWith('m')) return 'M';
  if (s.startsWith('f')) return 'F';
  return '';
};

// YYYY-MM-DD (or other common forms) -> DD-MM-YYYY  (Amgine wants DD-MM-YYYY)
const toDOB = (v) => {
  const s = norm(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}-${y}`; }
  return s;
};

// flight DepartureDate -> ISO (YYYY-MM-DDT00:00:00)
const toISODate = (v) => {
  const s = norm(v);
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}T00:00:00`; }
  // Month DD, YYYY
  const d = Date.parse(s);
  if (!isNaN(d)) { const dt = new Date(d); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}T00:00:00`; }
  return '';
};

// Pull a 3-letter IATA code. Uppercases first so "sna" works; prefers a (XXX)
// code, else a standalone 3-letter token. A clean "SNA" returns "SNA".
const toIATA = (v) => {
  const s = norm(v).toUpperCase();
  let m = s.match(/\(([A-Z]{3})\)/);
  if (m) return m[1];
  m = s.match(/\b([A-Z]{3})\b/);
  if (m) return m[1];
  return '';
};

async function getAmgineToken(mode) {
  const cid = process.env.AMGINE_CLIENT_ID;
  const secret = process.env.AMGINE_CLIENT_SECRET;
  const base = {
    grant_type: process.env.AMGINE_GRANT_TYPE,
    scope: process.env.AMGINE_SCOPE,
    username: process.env.AMGINE_USERNAME,
    password: process.env.AMGINE_PASSWORD,
  };
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  let fields = { ...base };
  if (mode === 'basic') {
    // client_secret_basic: client creds in Authorization header
    headers['Authorization'] = 'Basic ' + Buffer.from(`${cid}:${secret}`).toString('base64');
  } else {
    // client_secret_post: client creds in the body
    fields = { client_id: cid, client_secret: secret, ...base };
  }
  const r = await fetch(process.env.AMGINE_TOKEN_URL, {
    method: 'POST', headers, body: new URLSearchParams(fields).toString(),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !!j.access_token, token: j.access_token, status: r.status, detail: j };
}

// Build + fire a New Request for one traveller row, then write the itinerary id
// back. Returns a per-row result; never throws (so a batch keeps going).
async function sendOne({ api, amgToken, mrow, M, groups, G }) {
  const rowId = mrow.id;
  const t = {
    first: norm(M.val(mrow, 'First Name')), middle: norm(M.val(mrow, 'Middle Name')),
    last: norm(M.val(mrow, 'Last Name')), gender: toGender(M.val(mrow, 'Gender')),
    dob: toDOB(M.val(mrow, 'Date of Birth')), email: norm(M.val(mrow, 'Email Address')),
    phone: norm(M.val(mrow, 'Phone Number')), ktn: norm(M.val(mrow, 'Known Traveller Number')),
    redress: norm(M.val(mrow, 'Redress Number')), country: norm(M.val(mrow, 'Pass Country of Issue')),
    groupId: norm(M.val(mrow, 'Group ID')), depDate: M.val(mrow, 'Departure Date'),
    retDate: M.val(mrow, 'Return Date'), depIATA: norm(M.val(mrow, 'Departure Airport (IATA)')),
    arrIATA: norm(M.val(mrow, 'Arrival Airport (IATA)')),
    depTrip: norm(M.val(mrow, 'Departure Trip')) || norm(M.val(mrow, 'Departure City')),
    retTrip: norm(M.val(mrow, 'Return Trip/City')),
  };
  const who = `${t.first} ${t.last}`.trim();
  if (!t.first && !t.last) return { rowId, error: 'no name' };

  const grow = (groups.rows || []).find(r => norm(G.val(r, 'GROUP ID')).toLowerCase() === t.groupId.toLowerCase());
  if (!grow) return { rowId, traveller: who, error: `group "${t.groupId}" not found` };
  const branchGuid = norm(G.val(grow, 'Amgine Branch GUID'));
  const policyGuid = norm(G.val(grow, 'Amgine Policy GUID'));
  if (!branchGuid) return { rowId, traveller: who, error: `group "${t.groupId}" not onboarded` };

  const origin = toIATA(t.depIATA) || toIATA(t.depTrip.split(/->|→|—|-/)[0] || t.depTrip);
  const dest = toIATA(t.arrIATA) || toIATA(t.depTrip.split(/->|→|—|-/)[1] || '') || toIATA(t.retTrip);
  const intentNodes = [];
  if (origin && dest && toISODate(t.depDate)) intentNodes.push({ Flight: { From: origin, To: dest, DepartureDate: toISODate(t.depDate), stops: ['NonStop'] } });
  if (origin && dest && toISODate(t.retDate)) intentNodes.push({ Flight: { From: dest, To: origin, DepartureDate: toISODate(t.retDate), stops: ['NonStop'] } });

  const payload = {
    ExternalId: { Id: String(rowId), ThreadId: t.groupId || String(rowId) },
    TmcGuid: process.env.AMGINE_TMC_GUID, From: process.env.AMGINE_USERNAME, To: process.env.AMGINE_USERNAME,
    Subject: `(KCG) ${who} — ${t.groupId}`, Body: `Kensington group booking for ${who} (group ${t.groupId}).`,
    Hash: process.env.AMGINE_HASH,
    TravelerRequested: [{ AmgineTravelerId: -1, AmgineServicedEntityBranchGuid: branchGuid, TravelerFirstName: t.first, TravelerLastName: t.last, ...(policyGuid ? { AmginePolicyGuid: policyGuid } : {}) }],
    TravelerInformation: [{ GuestSettings: { GuestFieldSnapshots: [
      { FieldName: 'FirstName', Data: t.first || null }, { FieldName: 'MiddleName', Data: t.middle || null },
      { FieldName: 'LastName', Data: t.last || null }, { FieldName: 'Gender', Data: t.gender || null },
      { FieldName: 'DateOfBirth', Data: t.dob || null }, { FieldName: 'Email', Data: t.email || null },
      { FieldName: 'Phone', Data: t.phone || null }, { FieldName: 'KnownTravelerNumber', Data: t.ktn || null },
      { FieldName: 'RedressNumber', Data: t.redress || null }, { FieldName: 'CountryOfIssue', Data: t.country || null },
    ] } }],
    Intent: { Nodes: intentNodes }, DirectToAgent: false, BypassAgent: true,
  };

  const amgRes = await fetch(process.env.AMGINE_API_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${amgToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const amgJson = await amgRes.json().catch(() => ({}));
  if (!amgRes.ok) return { rowId, traveller: who, error: 'Amgine request failed', status: amgRes.status, detail: amgJson };

  const itinId = amgJson.itineraryId ?? amgJson.ItineraryId ?? '';
  const cells = [];
  if (M.id('Amgine Itinerary ID') && itinId !== '') cells.push({ columnId: M.id('Amgine Itinerary ID'), value: String(itinId) });
  if (M.id('Amgine Status')) cells.push({ columnId: M.id('Amgine Status'), value: 'Sent' });
  if (cells.length) await api(`/sheets/${MASTER}/rows`, { method: 'PUT', body: JSON.stringify([{ id: rowId, cells }]) });

  return { rowId, traveller: who, ok: true, itineraryId: itinId, flightLegs: intentNodes.length, airports: { origin, dest } };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const api = ss(TOKEN);
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  // ── WEBHOOK half (Amgine -> us) — stub until vendor sends the payload spec ──
  // Amgine's webhook posts a status change; it will include the ExternalId we
  // sent (the traveller row id). Once we know the field names, we match by that
  // id and write "Amgine Status". For now: accept + log so nothing 500s.
  if (!body.rowId && (body.externalId || body.ExternalId || body.state || body.itineraryId)) {
    console.log('Amgine webhook received (spec pending):', JSON.stringify(body).slice(0, 500));
    return res.status(200).json({ ok: true, note: 'webhook received; handler pending vendor spec' });
  }

  // ── SEND half (us -> Amgine) ────────────────────────────────────────────
  // Modes:
  //   { scan: true }                              → book every "Ready to Book" + not-yet-sent traveller
  //   { rowId }                                   → book that one row
  //   { email } / { firstName,lastName, groupId } → book a looked-up row (testing)
  try {
    const master = await (await api(`/sheets/${MASTER}`)).json();
    const M = indexSheet(master);
    const allRows = master.rows || [];
    const isTrue = (v) => v === true || v === 'true';

    let rows = [];
    if (body.scan === true || body.scan === 'true') {
      rows = allRows.filter(r => {
        const named = norm(M.val(r, 'First Name')) || norm(M.val(r, 'Last Name'));
        return isTrue(M.val(r, 'Ready to Book')) && !norm(M.val(r, 'Amgine Itinerary ID')) && named;
      });
    } else if (body.rowId) {
      const r = allRows.find(x => String(x.id) === String(body.rowId));
      if (r) rows = [r];
    } else if (body.email || (body.firstName && body.lastName)) {
      const wantEmail = norm(body.email).toLowerCase();
      const wantFirst = norm(body.firstName).toLowerCase();
      const wantLast = norm(body.lastName).toLowerCase();
      const wantGroup = norm(body.groupId).toLowerCase();
      const r = allRows.find(x => {
        if (wantGroup && norm(M.val(x, 'Group ID')).toLowerCase() !== wantGroup) return false;
        if (wantEmail) return norm(M.val(x, 'Email Address')).toLowerCase() === wantEmail;
        return norm(M.val(x, 'First Name')).toLowerCase() === wantFirst && norm(M.val(x, 'Last Name')).toLowerCase() === wantLast;
      });
      if (r) rows = [r];
    } else {
      return res.status(400).json({ error: 'Provide scan:true, rowId, email, or firstName+lastName' });
    }

    if (!rows.length) {
      return res.status(200).json({ ok: true, processed: 0, note: 'no matching travellers to book' });
    }

    // Token + groups sheet fetched once for the whole batch.
    let auth = await getAmgineToken('basic');
    if (!auth.ok) auth = await getAmgineToken('post');
    if (!auth.ok) return res.status(502).json({ error: 'Amgine token failed', detail: auth.detail });
    const groups = await (await api(`/sheets/${GROUPS}`)).json();
    const G = indexSheet(groups);

    const results = [];
    for (const mrow of rows) results.push(await sendOne({ api, amgToken: auth.token, mrow, M, groups, G }));
    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
