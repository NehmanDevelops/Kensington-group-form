// Fully-automatic Amgine branch onboarding — no email to Amgine required.
// Runs the 3-step Postman "OnBoarding" chain against the live API:
//   1. CreateBranch      (clones config from a source SEB) -> new branch GUID
//   2. CreatePolicyRule  (attaches a policy)               -> policy GUID
//   3. CreatePolicyGroup (wraps the policy)                -> policy-group GUID
// then writes the Branch GUID + Policy(-group) GUID onto the group's row in
// LIVE GROUP MASTERSHEET so bookings can use it immediately.
//
// THREE ways in:
//   A. Direct POST  { groupId?, name, address..., pcc?, companyProfileId?, groupProfileId?, ... }
//                   (the branch-request form / manual / Postman path).
//   B. Smartsheet webhook challenge (header Smartsheet-Hook-Challenge) -> echo it.
//   C. Smartsheet webhook change event { scope:'sheet', events:[...] } -> the
//      instant a "Create Amgine Branch" checkbox is ticked on the group sheet,
//      Smartsheet calls us; we read that row's inputs (Group ID, PCC, Company
//      Profile ID, Group Profile ID, address/policy fields), run the chain, and
//      write the GUIDs + Sabre linkage back onto the same row. Register the hook
//      once against LIVE GROUP MASTERSHEET pointing at /api/create-branch.
//
// Env: AMGINE_* (same auth as booking) + optional AMGINE_SOURCE_SEB / AMGINE_TMC_ID /
// AMGINE_SOURCE_SE (default to the known Kensington onboarding IDs) + SMARTSHEET_API_TOKEN.

const GROUPS = '4820086761148292'; // LIVE GROUP MASTERSHEET
const SRC_SEB = Number(process.env.AMGINE_SOURCE_SEB || 1687);
const TMC_ID  = Number(process.env.AMGINE_TMC_ID || 116);
const SRC_SE  = Number(process.env.AMGINE_SOURCE_SE || 918);

// Titles (lower-cased) that flag a row for onboarding. First match wins.
const TRIGGER_TITLES = ['create amgine branch', 'onboard to amgine', 'create branch'];

const CREATE_BRANCH_URL = 'https://app.amgine.ai/publicapi/api/ClientOnboard/bulkUploadServicedEntityBranch?returnSuccess=true';
const policyUrl      = (guid) => `https://app.amgine.ai/publicapi/api/servicedEntity/0/Policy?servicedEntityBranchGuid=${guid}`;
const policyGroupUrl = (guid) => `https://app.amgine.ai/publicapi/api/servicedentity/0/TravelerGroup?servicedEntityBranchGuid=${guid}`;

const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s == null ? '' : s).trim();
const splitList = (v) => norm(v) ? norm(v).split(',').map(x => x.trim()).filter(Boolean) : [''];

// Recursively hunt for the first value of `key` anywhere in a response.
function deepFind(obj, key) {
  if (obj == null || typeof obj !== 'object') return undefined;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === key.toLowerCase() && obj[k]) return obj[k];
  }
  for (const k of Object.keys(obj)) {
    const found = deepFind(obj[k], key);
    if (found) return found;
  }
  return undefined;
}

async function getToken() {
  const cid = process.env.AMGINE_CLIENT_ID, secret = process.env.AMGINE_CLIENT_SECRET;
  const fields = {
    grant_type: process.env.AMGINE_GRANT_TYPE, scope: process.env.AMGINE_SCOPE,
    username: process.env.AMGINE_USERNAME, password: process.env.AMGINE_PASSWORD,
  };
  const attempt = async (basic) => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    let body = { ...fields };
    if (basic) headers['Authorization'] = 'Basic ' + Buffer.from(`${cid}:${secret}`).toString('base64');
    else body = { client_id: cid, client_secret: secret, ...fields };
    const r = await fetch(process.env.AMGINE_TOKEN_URL, { method: 'POST', headers, body: new URLSearchParams(body).toString() });
    const j = await r.json().catch(() => ({}));
    return j.access_token;
  };
  return (await attempt(true)) || (await attempt(false));
}

// ── The 3-step onboarding chain ─────────────────────────────────────────────
// `inp` is a normalized input object (same shape whether it came from a POST
// body or a group-sheet row). Returns { ok:true, finalName, branchGuid,
// policyGuid, policyGroupGuid, policyLink } or { ok:false, step, status, error, raw }.
async function onboard(amg, inp) {
  // Manager's call (2026-07-07): the branch NAME is the Group ID itself (unique,
  // satisfies Amgine's unique-name requirement). Fall back to client name + ts.
  const groupIdIn = norm(inp.groupId);
  const uniqueName = groupIdIn ? groupIdIn : `${norm(inp.name) || 'Kensington'} ${Date.now()}`;

  const branchBody = [{
    name: uniqueName,
    sourceSEBIDForContentConfig: SRC_SEB,
    sourceSEBIDForNotificationRules: SRC_SEB,
    sourceSEBIDForGuestSetting: SRC_SEB,
    sourceSEBIDForCustomField: SRC_SEB,
    tmcId: TMC_ID,
    addressLine1: norm(inp.addressLine1) || '225 W 34th Street',
    postalCode: norm(inp.postalCode) || '10122',
    provinceState: norm(inp.provinceState) || 'NY',
    servicedEntityId: SRC_SE,
    city: norm(inp.city) || 'New York',
    country: norm(inp.country) || 'US',
    emailDomainSync: splitList(inp.emailDomains),
    hotelFilterKeywords: splitList(inp.hotelKeywords),
    preferredCarVendors: splitList(inp.carVendors),
    preferredCars: [''],
    preferredAirlines: splitList(inp.preferredAirlines),
    excludeAirlines: norm(inp.excludeAirlines) ? splitList(inp.excludeAirlines) : ['NK', 'F9', 'SY'],
    preferredFlightFareBasisCode: [''],
    preferredAirports: splitList(inp.preferredAirports),
  }];

  // Sabre/GDS linkage (per Amgine: provided at branch creation).
  // The branch-level *PccId fields are INTEGER internal Amgine ids (a raw Sabre
  // PCC like "AB1C" is rejected with "Could not convert string to integer").
  // Only set them when a numeric internal id was provided; a raw PCC code is
  // still written to the group row below, where it drives the per-booking
  // BookingProfile (which is what actually pulls the Sabre profiles).
  const pccIn = norm(inp.pcc);
  if (pccIn && /^\d+$/.test(pccIn)) {
    for (const f of ['flightBookingPccId','hotelBookingPccId','carBookingPccId','ticketingPccId','profilePccId','flightSearchPccId','hotelSearchPccId','carSearchPccId','travelerProfilePccId','travelerProfileReadPccId']) {
      branchBody[0][f] = Number(pccIn);
    }
  }
  // Two account-level Sabre profiles (Vera 2026-07-08): the COMPANY profile ID and
  // the GROUP profile ID. sabreProfileId kept as a back-compat alias for the group
  // one. The branch-level gdsProfileIDNumber gets the company profile (falls back
  // to group). Individual traveller profiles are pulled by email.
  const companyIn = norm(inp.companyProfileId);
  const groupProfIn = norm(inp.groupProfileId) || norm(inp.sabreProfileId);
  if (companyIn || groupProfIn) branchBody[0].gdsProfileIDNumber = companyIn || groupProfIn;

  // 1) CreateBranch — try the clean name first. Amgine returns a zero-GUID when
  // it rejects the branch (bad Province/State or Country code, OR a duplicate
  // name). If the clean name collides, retry once with a unique suffix so
  // re-onboarding the same client never hard-fails.
  let finalName = uniqueName, branchGuid, branchJson, branchStatus;
  for (let attempt = 1; attempt <= 2; attempt++) {
    branchBody[0].name = finalName;
    const branchRes = await amg(CREATE_BRANCH_URL, branchBody);
    branchStatus = branchRes.status;
    branchJson = await branchRes.json().catch(() => ({}));
    branchGuid = deepFind(branchJson, 'guid');
    if (branchRes.ok && branchGuid && branchGuid !== ZERO_GUID) break;
    finalName = `${uniqueName} ${Date.now()}`;
    branchGuid = null;
  }
  if (!branchGuid) {
    return { ok: false, step: 'CreateBranch', status: branchStatus, branchGuid,
      error: 'Branch was not created by Amgine. Most likely the Province/State or Country isn\'t a 2-letter code (e.g. ON, NY, CA, US).',
      raw: branchJson };
  }

  // 2) CreatePolicyRule (default: economy in-policy — refine once client rules are set)
  const policyBody = {
    policyName: finalName,
    policyElements: [{
      policyInputs: [{
        equalToNumeric: [2], equalToString: [], notEqualToNumeric: [], notEqualToString: [],
        equalToBool: [], notEqualToBool: [], attribute: 'FlightCabinClass', serviceType: 'FlightLeg',
      }],
      travelServiceType: 'FlightLeg', inPolicy: true,
    }],
  };
  // A brand-new branch can take several seconds to be ready for the policy call,
  // so retry with a generous window (function maxDuration is 60s).
  let policyGuid, polJson, polStatus;
  for (let attempt = 1; attempt <= 10; attempt++) {
    await sleep(attempt === 1 ? 2000 : 3000);
    const polRes = await amg(policyUrl(branchGuid), policyBody);
    polStatus = polRes.status;
    polJson = await polRes.json().catch(() => ({}));
    policyGuid = deepFind(polJson, 'policyGuid') || deepFind(polJson, 'guid');
    if (polRes.ok && policyGuid) break;
  }
  if (!policyGuid) {
    return { ok: false, step: 'CreatePolicyRule', status: polStatus, error: 'no policy guid', branchGuid, raw: polJson };
  }

  // 3) CreatePolicyGroup (retry likewise)
  const groupBody = { groupName: finalName, description: norm(inp.name) || finalName, policyGuid };
  let policyGroupGuid, pgJson, pgStatus, pgOk = false;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const pgRes = await amg(policyGroupUrl(branchGuid), groupBody);
    pgStatus = pgRes.status; pgOk = pgRes.ok;
    pgJson = await pgRes.json().catch(() => ({}));
    // The response's `groupGuid` is THE policy-group guid — it's what both the
    // booking payload's AmginePolicyGuid and the Policy Tool URL expect
    // (Raymond, 2026-07-09). NO FALLBACK on purpose: silently substituting the
    // policy-RULE guid is exactly the bug that broke Vera's test bookings — if
    // `groupGuid` is missing we fail loudly instead of storing a wrong value.
    policyGroupGuid = deepFind(pgJson, 'groupGuid');
    if (pgRes.ok && policyGroupGuid) break;
    await sleep(2500);
  }
  if (!pgOk || !policyGroupGuid) {
    return { ok: false, step: 'CreatePolicyGroup', status: pgStatus, branchGuid, policyGuid,
      error: pgOk ? 'response had no groupGuid — refusing to store a wrong value (contact Amgine)' : 'failed', raw: pgJson };
  }

  const policyLink = `https://app.amgine.ai/tmc-management/policy?policygroupguid=${policyGroupGuid}`;
  return { ok: true, finalName, branchGuid, policyGuid, policyGroupGuid, policyLink };
}

// Build the group-row cells to write after onboarding. `colId(title)` returns a
// column id or undefined. Columns that don't exist are reported in `missing`
// (never a hard failure — a missing column costs that one field, not the row).
function buildWriteCells(colId, inp, r) {
  const cells = [];
  const missing = [];
  if (r.ok) {
    if (colId('amgine branch guid')) cells.push({ columnId: colId('amgine branch guid'), value: r.branchGuid });
    if (colId('amgine policy guid')) cells.push({ columnId: colId('amgine policy guid'), value: r.policyGroupGuid });
    if (colId('amgine policy link')) cells.push({ columnId: colId('amgine policy link'), value: r.policyLink });
    if (colId('amgine onboarded')) cells.push({ columnId: colId('amgine onboarded'), value: true });
    // Sabre linkage: PCC + COMPANY profile ID + GROUP profile ID drive the
    // per-booking Corporate BookingProfiles in amgine.js. PCC + a profile = opt
    // the group into profiled travellers, so tick that flag too.
    const pccIn = norm(inp.pcc), companyIn = norm(inp.companyProfileId);
    const groupProfIn = norm(inp.groupProfileId) || norm(inp.sabreProfileId);
    if (pccIn) { if (colId('pcc')) cells.push({ columnId: colId('pcc'), value: pccIn }); else missing.push('PCC'); }
    if (companyIn) { if (colId('company profile id')) cells.push({ columnId: colId('company profile id'), value: companyIn }); else missing.push('Company Profile ID'); }
    if (groupProfIn) {
      const gp = colId('group profile id') || colId('sabre profile id');
      if (gp) cells.push({ columnId: gp, value: groupProfIn }); else missing.push('Group Profile ID');
    }
    if (pccIn && (companyIn || groupProfIn) && colId('profiled travellers')) cells.push({ columnId: colId('profiled travellers'), value: true });
  }
  // A human-readable outcome, if the sheet has a status column.
  const statusCol = colId('amgine onboard status');
  if (statusCol) {
    const msg = r.ok ? '✓ Onboarded' : `✗ ${r.step}: ${r.error}`;
    cells.push({ columnId: statusCol, value: msg.slice(0, 4000) });
  }
  return { cells, missing };
}

// ── Smartsheet webhook: a "Create Amgine Branch" checkbox was ticked ─────────
async function handleGroupWebhook(events, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(200).json({ ok: false, error: 'no Smartsheet token' });
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  });

  const sheet = await (await ss(`/sheets/${GROUPS}`)).json();
  const idByTitle = {};
  for (const c of sheet.columns) idByTitle[c.title.trim().toLowerCase()] = c.id;
  const colId = (t) => idByTitle[t.trim().toLowerCase()];
  const val = (row, t) => {
    const c = (row.cells || []).find(x => x.columnId === colId(t));
    return c ? (c.value ?? c.displayValue ?? '') : '';
  };

  const triggerCol = TRIGGER_TITLES.map(colId).find(Boolean);
  if (!triggerCol) return res.status(200).json({ ok: true, processed: 0, note: 'no trigger column on the group sheet' });

  // Only do work when the trigger column changed or a row was created — mirrors
  // amgine.js. (Any other edit just returns fast.)
  const relevant = events.some(e => e.columnId === triggerCol || (e.objectType === 'row' && e.eventType === 'created'));
  if (!relevant) return res.status(200).json({ ok: true, processed: 0, note: 'no trigger change' });

  // Eligible = trigger ticked AND not already onboarded (Branch GUID empty).
  // The Branch-GUID guard is the idempotency lock: a duplicate/re-fired webhook,
  // or leaving the box checked, never creates a second branch.
  const isChecked = (row) => {
    const c = (row.cells || []).find(x => x.columnId === triggerCol);
    return !!(c && (c.value === true || c.value === 'true'));
  };
  const eligible = (sheet.rows || []).filter(r => isChecked(r) && !norm(val(r, 'amgine branch guid')));
  if (!eligible.length) return res.status(200).json({ ok: true, processed: 0, note: 'no eligible rows (already onboarded or unchecked)' });

  const token = await getToken();
  if (!token) return res.status(200).json({ ok: false, error: 'Amgine token failed' });
  const amg = (url, payload) => fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // Process sequentially. Each chain can take ~40s, so in practice this is one
  // row per tick; if several are queued at once the later ones may run in a
  // follow-up invocation (they stay eligible until their Branch GUID is set).
  const results = [];
  for (const row of eligible) {
    const inp = {
      groupId: norm(val(row, 'group id')),
      name: norm(val(row, 'client name')) || norm(val(row, 'client')) || norm(val(row, 'group name'))
        || norm(val(row, 'account name')) || norm(val(row, 'group id')),
      pcc: norm(val(row, 'pcc')),
      companyProfileId: norm(val(row, 'company profile id')),
      groupProfileId: norm(val(row, 'group profile id')) || norm(val(row, 'sabre profile id')),
      preferredAirlines: norm(val(row, 'preferred airlines')),
      excludeAirlines: norm(val(row, 'exclude airlines')),
      preferredAirports: norm(val(row, 'preferred airports')),
      addressLine1: norm(val(row, 'address line 1')) || norm(val(row, 'address')),
      city: norm(val(row, 'city')),
      provinceState: norm(val(row, 'province/state')) || norm(val(row, 'province')) || norm(val(row, 'state')),
      postalCode: norm(val(row, 'postal code')) || norm(val(row, 'zip')),
      country: norm(val(row, 'country')),
    };

    let r;
    try {
      r = await onboard(amg, inp);
    } catch (err) {
      r = { ok: false, step: 'exception', error: err.message };
    }

    const { cells, missing } = buildWriteCells(colId, inp, r);
    if (cells.length) {
      await ss(`/sheets/${GROUPS}/rows`, { method: 'PUT', body: JSON.stringify([{ id: row.id, cells }]) });
    }
    results.push({ rowId: row.id, groupId: inp.groupId, ok: r.ok, branchGuid: r.branchGuid || null,
      policyGroupGuid: r.policyGroupGuid || null, ...(r.ok ? {} : { step: r.step, error: r.error }),
      ...(missing.length ? { missingColumns: missing } : {}) });
  }

  return res.status(200).json({ ok: true, processed: results.length, results });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Smartsheet webhook verification challenge ───────────────────────────
  // On enable, Smartsheet sends a challenge header; echo it back or the hook
  // never activates. (Same handshake amgine.js uses.)
  const hookChallenge = req.headers['smartsheet-hook-challenge'];
  if (hookChallenge) {
    res.setHeader('Smartsheet-Hook-Response', hookChallenge);
    return res.status(200).json({ smartsheetHookResponse: hookChallenge });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  // TEMP audit (remove after use).
  if (norm(body.__audit) === 'kcg-audit-2026') {
    const TOKEN = process.env.SMARTSHEET_API_TOKEN;
    const sheetId = norm(body.sheet) || '8780932377956228';
    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}?pageSize=1`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const sheet = await r.json().catch(() => ({}));
    return res.status(200).json({ ok: true, columns: (sheet.columns || []).map(c => ({ index: c.index, id: c.id, title: c.title, type: c.type, formula: c.formula || null })) });
  }

  // ── Smartsheet webhook change event ─────────────────────────────────────
  // Always returns 200 (even on failure) so Smartsheet doesn't retry and double-
  // onboard; outcomes land in the row's status column + the JSON response.
  if (Array.isArray(body.events)) {
    try {
      return await handleGroupWebhook(body.events, res);
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // ── Direct POST (branch-request form / manual / Postman) ─────────────────
  const name = norm(body.name);
  if (!name) return res.status(400).json({ error: 'name is required (client / branch name)' });

  try {
    const token = await getToken();
    if (!token) return res.status(502).json({ error: 'Amgine token failed' });
    const amg = (url, payload) => fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const inp = {
      groupId: body.groupId, name: body.name,
      addressLine1: body.addressLine1, city: body.city, provinceState: body.provinceState,
      postalCode: body.postalCode, country: body.country, emailDomains: body.emailDomains,
      preferredAirlines: body.preferredAirlines, excludeAirlines: body.excludeAirlines,
      preferredAirports: body.preferredAirports, hotelKeywords: body.hotelKeywords, carVendors: body.carVendors,
      pcc: body.pcc, companyProfileId: body.companyProfileId, groupProfileId: body.groupProfileId,
      sabreProfileId: body.sabreProfileId,
    };
    const r = await onboard(amg, inp);
    if (!r.ok) return res.status(502).json(r);

    // Write GUIDs onto the group row (if a groupId was supplied). Retry the
    // lookup a few times — a group row added moments before may still be saving.
    let wroteToGroup = false;
    let missingColumns = [];
    const groupId = norm(body.groupId);
    if (groupId) {
      const TOKEN = process.env.SMARTSHEET_API_TOKEN;
      const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
        ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
      });
      let gRow, colId;
      for (let attempt = 1; attempt <= 4 && !gRow; attempt++) {
        if (attempt > 1) await sleep(2000);
        const sheet = await (await ss(`/sheets/${GROUPS}`)).json();
        const idByTitle = {};
        for (const c of sheet.columns) idByTitle[c.title.trim().toLowerCase()] = c.id;
        colId = (t) => idByTitle[t.trim().toLowerCase()];
        const gidCol = colId('group id');
        gRow = (sheet.rows || []).find(rw => {
          const c = (rw.cells || []).find(x => x.columnId === gidCol);
          return c && norm(c.value ?? c.displayValue).toLowerCase() === groupId.toLowerCase();
        });
      }
      if (gRow) {
        const built = buildWriteCells(colId, inp, r);
        missingColumns = built.missing;
        if (built.cells.length) {
          await ss(`/sheets/${GROUPS}/rows`, { method: 'PUT', body: JSON.stringify([{ id: gRow.id, cells: built.cells }]) });
          wroteToGroup = true;
        }
      }
    }

    return res.status(200).json({ ok: true, branchName: r.finalName, branchGuid: r.branchGuid,
      policyGuid: r.policyGuid, policyGroupGuid: r.policyGroupGuid, policyLink: r.policyLink,
      wroteToGroup, ...(missingColumns.length ? { missingColumns } : {}) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
