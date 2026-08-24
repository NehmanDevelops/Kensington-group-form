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

// ── PCC / Queue / Connector endpoints (Raymond, 2026-08-13) ─────────────────
const getPCCsUrl  = () => `https://app.amgine.ai/publicapi/api/tmc/${TMC_ID}/TmcPcc?tmcId=${TMC_ID}&isActive=true`;
const pccByIdUrl  = (id) => `https://app.amgine.ai/publicapi/api/tmc/${TMC_ID}/TmcPcc/${id}?tmcId=${TMC_ID}&id=${id}`;
const connectorsUrl = () => `https://app.amgine.ai/publicapi/api/AccountDetails/fromTmc/${TMC_ID}/0?tmcId=${TMC_ID}&branchId=0`;
const connectorUrl  = (id) => `https://app.amgine.ai/publicapi/api/AccountDetails/${id}`;
const branchUrl = (id) => `https://app.amgine.ai/publicapi/api/ServicedEntityBranch/${id}?id=${id}`;
// Kensington's Sabre address defaults (matches CreatePCCs shape Raymond sent).
const PCC_DEFAULTS = {
  addressLine1: '2 Queen St E', cityName: 'Toronto', stateCode: 'ON', countryCode: 'CA', postalCode: 'M5C 3G7',
  agencyName: 'Kensington Corporate', agencyProfile: '', customerAppId: 'SWS1:SBR-CtntSerLgUI:1f06045fcf',
  domain: 'DEFAULT', itins: '200ITINS', provider: 'Sabre', gdsCode: 'Default', maxResults: 100, maxSessions: 50,
  maxProperties: 500, maxSearchRadius: 10, radiusMultiplier: 10,
  providerLoggingToElasticSearch: true, providerLoggingToFile: true, providerLoggingToFilePath: '/app/log-path',
};

async function getPCCs(amg) {
  const r = await amg(getPCCsUrl(), null, 'GET');
  return { ok: r.ok, list: await r.json().catch(() => []) };
}

// Creates a missing PCC (no queues attached — real Sabre queue numbers need to
// be set up manually by Amgine/GDS admin before SavePCCsInfoQueue can add
// them; we never invent queue numbers).
async function createPCC(amg, pcc, currency) {
  const body = { ...PCC_DEFAULTS, pcc, name: `${pcc}-Kensington-${currency}`, currency, isEnabled: false, tmcPccQueues: [] };
  const r = await amg(getPCCsUrl(), body, 'POST');
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, data: j };
}

async function getPCCQueueInfo(amg, id) {
  const r = await amg(pccByIdUrl(id), null, 'GET');
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, data: j };
}

// Adds queues to an existing PCC by re-sending the full record with an
// updated tmcPccQueues array (SavePCCsInfoQueue is a full-record PUT, not a
// partial patch — confirmed from Raymond's Postman example).
async function savePCCQueues(amg, pccRecord, queues) {
  const body = { ...pccRecord, tmcPccQueues: queues };
  const r = await amg(pccByIdUrl(pccRecord.id), body, 'PUT');
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, data: j };
}

async function getConnectors(amg) {
  const r = await amg(connectorsUrl(), null, 'GET');
  return { ok: r.ok, list: await r.json().catch(() => []) };
}

// Re-applies the correct Success/Fail queue ids to an already-created branch
// (2026-08-19): CreateBranch's own payload fields for these are silently
// ignored — every new branch inherits the generic template's queue (VQ9G's)
// regardless of what's sent at creation. Confirmed by reading the branch back
// right after creation: it showed VQ9G's queue ids even though we'd sent
// SY90's. A GET + full-record PUT to ServicedEntityBranch afterward is the
// only way that actually sticks. Required step for every branch now, not
// just a manual-override nicety.
async function fixBranchQueues(amg, branchId, successQueueId, failQueueId) {
  const getRes = await amg(branchUrl(branchId), null, 'GET');
  const branch = await getRes.json().catch(() => null);
  if (!getRes.ok || !branch) return { ok: false, error: 'could not read branch back' };
  const body = { ...branch, travelerPnrSuccessQueueId: successQueueId, travelerPnrFailQueueId: failQueueId };
  const putRes = await amg(branchUrl(branchId), body, 'PUT');
  const j = await putRes.json().catch(() => ({}));
  return { ok: putRes.ok, data: j };
}

// Appends a numeric branch id to a connector's branchIds and saves it back.
async function associateConnector(amg, connector, branchId) {
  if (connector.branchIds.includes(branchId)) return { ok: true, alreadyAssociated: true };
  const body = { ...connector, branchIds: [...connector.branchIds, branchId] };
  const r = await amg(connectorUrl(connector.accountDetailsId), body, 'PUT');
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, data: j };
}

// Removes a numeric branch id from a connector's branchIds and saves it back
// (2026-08-13: new branches auto-associate with a default connector — e.g.
// USA — at creation time regardless of the group's actual country, despite
// Raymond saying the generic template shouldn't associate with any email.
// We strip that default membership before associating the correct one, so
// the end result is right regardless of what Amgine's default turns out to be).
async function disassociateConnector(amg, connector, branchId) {
  if (!connector.branchIds.includes(branchId)) return { ok: true, alreadyAbsent: true };
  const body = { ...connector, branchIds: connector.branchIds.filter((id) => id !== branchId) };
  const r = await amg(connectorUrl(connector.accountDetailsId), body, 'PUT');
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, data: j };
}

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
    addressLine1: norm(inp.addressLine1) || PCC_DEFAULTS.addressLine1,
    postalCode: norm(inp.postalCode) || PCC_DEFAULTS.postalCode,
    provinceState: norm(inp.provinceState) || PCC_DEFAULTS.stateCode,
    servicedEntityId: SRC_SE,
    city: norm(inp.city) || PCC_DEFAULTS.cityName,
    country: norm(inp.country) || PCC_DEFAULTS.countryCode,
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
  const profilePccIn = norm(inp.profilePcc) || pccIn; // falls back to booking PCC when Profile PCC is blank
  // Raymond's PCC-code -> internal numeric id table (2026-08-05), for
  // Kensington's 8 onboarded PCCs. Lets every branch resolve its numeric ids
  // straight from the PCC code already on the group row — no manual numeric
  // entry needed for the common case.
  const KNOWN_PCC_IDS = { VQ9G: 492, SY90: 501, B3SG: 502, '1OEG': 503, W1AL: 504, VB6L: 505, I5BA: 506, B14G: 507 };
  const resolveId = (code) => KNOWN_PCC_IDS[code.toUpperCase()] != null ? String(KNOWN_PCC_IDS[code.toUpperCase()])
    : (/^\d+$/.test(code) ? code : '');

  // ── Live PCC validate/create + queue wiring (Raymond, 2026-08-13) ─────────
  // GetPCCs: confirm the group row's PCC(s) actually exist on Amgine's side —
  // catches a 9th client PCC we don't have in KNOWN_PCC_IDS yet. CreatePCCs:
  // create it if missing (queues left empty — real Sabre queue numbers need
  // Amgine/GDS admin setup first; we never invent them).
  const onboardNotes = [];
  const pccsResult = await getPCCs(amg);
  const pccList = pccsResult.ok && Array.isArray(pccsResult.list) ? pccsResult.list : [];
  // VQ9G has TWO entries sharing the same identifier — id 491 (isAuthenticator:
  // true, auth-only) and id 492 (the real booking PCC). Prefer the non-
  // authenticator match; only fall back to an auth-only one if that's all
  // there is (2026-08-13 bug: picking whichever came first silently grabbed
  // the auth-only PCC, which has no booking queues).
  const findPcc = (code) => {
    const matches = pccList.filter((p) => norm(p.identifier).toUpperCase() === code.toUpperCase());
    return matches.find((p) => !p.isAuthenticator) || matches[0];
  };
  const bookingCurrency = norm(inp.emailCountry).toLowerCase() === 'cad' ? 'CAD' : 'USD';
  async function resolvePccId(code) {
    if (!code) return '';
    const found = findPcc(code);
    if (found) return String(found.id);
    const known = resolveId(code); // GetPCCs call itself failed — fall back to the static table
    if (known) return known;
    const created = await createPCC(amg, code, bookingCurrency);
    const newId = deepFind(created.data, 'id');
    if (newId) { onboardNotes.push(`Created new PCC ${code} (id ${newId}) — no queues yet, needs manual Sabre queue setup.`); return String(newId); }
    onboardNotes.push(`Could not resolve or create PCC ${code}.`);
    return '';
  }
  const bookingFallback = await resolvePccId(pccIn);
  const profileFallback = profilePccIn === pccIn ? bookingFallback : await resolvePccId(profilePccIn);

  // Wire the booking PCC's Success/Fail queue ids onto the branch itself —
  // this (not a separate call) is what actually routes a booking's TAW line
  // to the right queue. A manual override on the group row (numeric queue id)
  // wins — for cases like duplicate-named queues where auto-matching by name
  // could grab the wrong one. Otherwise falls back to matching queues named
  // exactly "Success"/"Fail". Leaves OutOfPolicy fields alone (ambiguous
  // naming in the examples we've seen; confirm with Raymond before wiring).
  const successOverride = norm(inp.successQueueIdOverride);
  const failOverride = norm(inp.failQueueIdOverride);
  const resolvedQueueIds = {};
  if (bookingFallback) {
    const q = await getPCCQueueInfo(amg, bookingFallback);
    const queues = (q.ok && Array.isArray(q.data?.tmcPccQueues)) ? q.data.tmcPccQueues : [];
    const byName = (n) => queues.find((x) => norm(x.name).toLowerCase() === n);
    const success = successOverride && /^\d+$/.test(successOverride) ? { id: Number(successOverride) } : byName('success');
    const fail = failOverride && /^\d+$/.test(failOverride) ? { id: Number(failOverride) } : byName('fail');
    if (success) { branchBody[0].travelerPnrSuccessQueueId = success.id; resolvedQueueIds.successQueueIdOverride = success.id; }
    if (fail) { branchBody[0].travelerPnrFailQueueId = fail.id; resolvedQueueIds.failQueueIdOverride = fail.id; }
    if (!successOverride && !failOverride) {
      if (!queues.length) onboardNotes.push(`PCC ${pccIn} (id ${bookingFallback}) has no queues configured on Amgine's side yet.`);
      else if (!success || !fail) onboardNotes.push(`PCC ${pccIn} (id ${bookingFallback}) is missing a Success or Fail queue.`);
    }
  }
  // Per-function numeric PCC ids (Raymond, 2026-08-05): each Amgine function
  // can point at a DIFFERENT numeric PCC id. A per-field value on the group
  // row wins; otherwise PROFILE fields (where the traveler's GDS profile
  // actually lives) fall back to Profile PCC, and everything else (search/
  // booking/ticketing — where the trip is actually shopped/booked) falls
  // back to the booking PCC. Confirmed against Raymond's own example: he used
  // 506 (I5BA) for the profile fields and 501 (SY90) for the rest — mixing
  // them up is exactly what was pointing traveler-profile lookups at the
  // wrong PCC (2026-08-15 bug: all 10 fields wrongly fell back to booking PCC).
  // resolvedPccIds gets written back onto the group row below (buildWriteCells)
  // so the *PccId columns show the actual number sent, not just a blank slot —
  // no more guessing whether the lookup resolved without asking Amgine.
  const resolvedPccIds = {};
  const PROFILE_FIELDS = ['profilePccId', 'travelerProfilePccId', 'travelerProfileReadPccId'];
  const BOOKING_FIELDS = ['flightBookingPccId', 'hotelBookingPccId', 'carBookingPccId', 'ticketingPccId', 'flightSearchPccId', 'hotelSearchPccId', 'carSearchPccId'];
  for (const f of PROFILE_FIELDS) {
    const v = norm(inp[f]) || profileFallback;
    if (v && /^\d+$/.test(v)) { branchBody[0][f.charAt(0).toUpperCase() + f.slice(1)] = Number(v); resolvedPccIds[f] = Number(v); }
  }
  for (const f of BOOKING_FIELDS) {
    const v = norm(inp[f]) || bookingFallback;
    if (v && /^\d+$/.test(v)) { branchBody[0][f.charAt(0).toUpperCase() + f.slice(1)] = Number(v); resolvedPccIds[f] = Number(v); }
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
  // Numeric branch id (separate from the GUID) — needed for SetConnector's
  // branchIds array, which is numeric, not GUID-based.
  const branchId = deepFind(branchJson, 'id');

  // CreateBranch's own travelerPnrSuccessQueueId/FailQueueId fields are
  // silently ignored (2026-08-19 finding) — re-apply them now that the
  // branch actually exists, via GET + full-record PUT. Required, not optional.
  if (branchId && resolvedQueueIds.successQueueIdOverride && resolvedQueueIds.failQueueIdOverride) {
    const fix = await fixBranchQueues(amg, branchId, resolvedQueueIds.successQueueIdOverride, resolvedQueueIds.failQueueIdOverride);
    if (!fix.ok) onboardNotes.push(`Branch created, but re-applying the correct queue ids afterward failed — queue may still be wrong.`);
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

  // 4) SetConnector — associate the branch with the correct sending email
  // (Raymond, 2026-08-13): every new branch clones the generic template's
  // connector (128, noreply@amgine.ai) by default. Explicitly re-associate it
  // with Kensington's real Canada/US connector based on the group's Email
  // Country, so notifications stop coming from Amgine's own address.
  if (branchId) {
    const emailCountry = norm(inp.emailCountry).toLowerCase() === 'cad' ? 'cad' : 'us';
    const conn = await getConnectors(amg);
    const list = conn.ok && Array.isArray(conn.list) ? conn.list : [];
    const wanted = emailCountry === 'cad' ? 'canada@kensingtoncorporate.com' : 'usa@kensingtoncorporate.com';
    const connector = list.find((c) => norm(c.description).toLowerCase().replace(/\s+/g, '') === wanted);
    // Strip the branch out of every OTHER email connector it landed in by
    // default (128/noreply, and whichever of Canada/USA isn't the right one)
    // before associating the correct one — the webhook connector (143) is
    // left alone, every branch needs that one regardless of country.
    for (const c of list) {
      if (c.notificationChannel !== 'Email' || c === connector) continue;
      if (c.branchIds.includes(branchId)) {
        const d = await disassociateConnector(amg, c, branchId);
        if (!d.ok) onboardNotes.push(`Failed to disassociate branch from ${norm(c.description)}.`);
      }
    }
    if (connector) {
      const assoc = await associateConnector(amg, connector, branchId);
      if (!assoc.ok) onboardNotes.push(`Failed to associate branch with ${wanted} connector.`);
    } else {
      onboardNotes.push(`Could not find the ${wanted} connector in GetConnectors — email not associated.`);
    }
  }

  return { ok: true, finalName, branchGuid, branchId, policyGuid, policyGroupGuid, policyLink, resolvedPccIds,
    resolvedQueueIds, ...(onboardNotes.length ? { notes: onboardNotes } : {}) };
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
    // Write back the resolved numeric ids so the *PccId columns show proof of
    // what was actually sent (not just a blank override slot) — no more
    // guessing whether the PCC-code lookup resolved without asking Amgine.
    for (const [f, v] of Object.entries(r.resolvedPccIds || {})) {
      if (colId(f)) cells.push({ columnId: colId(f), value: v });
    }
    // Same visibility write-back for the queue ids actually used (whether from
    // an override or auto-matched by name) — titles have spaces, unlike the
    // *PccId columns, so mapped explicitly rather than by direct colId(field).
    const queueCols = { successQueueIdOverride: 'success queue id override', failQueueIdOverride: 'fail queue id override' };
    for (const [f, title] of Object.entries(queueCols)) {
      const v = (r.resolvedQueueIds || {})[f];
      if (v != null && colId(title)) cells.push({ columnId: colId(title), value: v });
    }
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
  const amg = (url, payload, method = 'POST') => fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }),
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
      profilePcc: norm(val(row, 'profile pcc')),
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
      flightBookingPccId: norm(val(row, 'flightbookingpccid')),
      hotelBookingPccId: norm(val(row, 'hotelbookingpccid')),
      carBookingPccId: norm(val(row, 'carbookingpccid')),
      ticketingPccId: norm(val(row, 'ticketingpccid')),
      profilePccId: norm(val(row, 'profilepccid')),
      flightSearchPccId: norm(val(row, 'flightsearchpccid')),
      hotelSearchPccId: norm(val(row, 'hotelsearchpccid')),
      carSearchPccId: norm(val(row, 'carsearchpccid')),
      travelerProfilePccId: norm(val(row, 'travelerprofilepccid')),
      travelerProfileReadPccId: norm(val(row, 'travelerprofilereadpccid')),
      emailCountry: norm(val(row, 'email country')),
      successQueueIdOverride: norm(val(row, 'success queue id override')),
      failQueueIdOverride: norm(val(row, 'fail queue id override')),
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
      ...(missing.length ? { missingColumns: missing } : {}), ...(r.notes ? { notes: r.notes } : {}) });
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

  // TEMP DEBUG (2026-08-21): find a branch's numeric id + connector status by guid. Remove after.
  if (req.query?.testFindByGuid) {
    const q = req.query.testFindByGuid.toLowerCase();
    const token = await getToken();
    const amg = (url, payload, method = 'POST') => fetch(url, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }),
    });
    let match = null;
    for (let page = 1; page <= 40; page++) {
      const r = await fetch(`https://app.amgine.ai/publicapi/api/ServicedEntityBranch?tmcId=${TMC_ID}&page=${page}&pageNumber=${page}&pageSize=100`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => null);
      const items = j?.items || [];
      if (!items.length) break;
      const found = items.find(b => (b.guid || '').toLowerCase().includes(q));
      if (found) { match = found; break; }
    }
    if (!match) return res.status(200).json({ match: null });
    const conn = await getConnectors(amg);
    const currentConnector = (conn.list || []).find(c => (c.branchIds || []).includes(match.id));
    return res.status(200).json({ match, currentConnector: currentConnector?.description || null });
  }

  // TEMP DEBUG (2026-08-21): audit which real (non-test) branches are still
  // stuck on the generic default connector. Read-only. Remove after.
  if (req.query?.testAuditConnectors === '1') {
    const token = await getToken();
    const amg = (url, payload, method = 'POST') => fetch(url, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }),
    });
    const conn = await getConnectors(amg);
    const generic = (conn.list || []).find(c => norm(c.description).toLowerCase().includes('amgine kensington'));
    // Pull the full branch list (paginated) to map id -> name.
    const branches = {};
    for (let page = 1; page <= 40; page++) {
      const r = await fetch(`https://app.amgine.ai/publicapi/api/ServicedEntityBranch?tmcId=${TMC_ID}&page=${page}&pageNumber=${page}&pageSize=100`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => null);
      const items = j?.items || [];
      if (!items.length) break;
      for (const b of items) branches[b.id] = b.name;
    }
    const stuck = (generic?.branchIds || []).filter(id => id !== 0).map(id => ({ id, name: branches[id] || '(unknown)' }));
    return res.status(200).json({ genericConnectorId: generic?.accountDetailsId, stuckCount: stuck.length, stuck });
  }



  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

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
    const amg = (url, payload, method = 'POST') => fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }),
    });

    const inp = {
      groupId: body.groupId, name: body.name,
      addressLine1: body.addressLine1, city: body.city, provinceState: body.provinceState,
      postalCode: body.postalCode, country: body.country, emailDomains: body.emailDomains,
      preferredAirlines: body.preferredAirlines, excludeAirlines: body.excludeAirlines,
      preferredAirports: body.preferredAirports, hotelKeywords: body.hotelKeywords, carVendors: body.carVendors,
      pcc: body.pcc, profilePcc: body.profilePcc, companyProfileId: body.companyProfileId, groupProfileId: body.groupProfileId,
      sabreProfileId: body.sabreProfileId,
      flightBookingPccId: body.flightBookingPccId, hotelBookingPccId: body.hotelBookingPccId,
      carBookingPccId: body.carBookingPccId, ticketingPccId: body.ticketingPccId,
      profilePccId: body.profilePccId, flightSearchPccId: body.flightSearchPccId,
      hotelSearchPccId: body.hotelSearchPccId, carSearchPccId: body.carSearchPccId,
      travelerProfilePccId: body.travelerProfilePccId, travelerProfileReadPccId: body.travelerProfileReadPccId,
      emailCountry: body.emailCountry,
      successQueueIdOverride: body.successQueueIdOverride,
      failQueueIdOverride: body.failQueueIdOverride,
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

    return res.status(200).json({ ok: true, branchName: r.finalName, branchGuid: r.branchGuid, branchId: r.branchId,
      policyGuid: r.policyGuid, policyGroupGuid: r.policyGroupGuid, policyLink: r.policyLink,
      wroteToGroup, ...(missingColumns.length ? { missingColumns } : {}), ...(r.notes ? { notes: r.notes } : {}) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
