// Fully-automatic Amgine branch onboarding — no email to Amgine required.
// Runs the 3-step Postman "OnBoarding" chain against the live API:
//   1. CreateBranch      (clones config from a source SEB) -> new branch GUID
//   2. CreatePolicyRule  (attaches a policy)               -> policy GUID
//   3. CreatePolicyGroup (wraps the policy)                -> policy-group GUID
// then writes the Branch GUID + Policy(-group) GUID onto the group's row in
// LIVE GROUP MASTERSHEET so bookings can use it immediately.
//
// POST body: { groupId?, name, addressLine1?, city?, provinceState?, postalCode?,
//   country?, emailDomains?, preferredAirlines?, excludeAirlines?, preferredAirports?,
//   hotelKeywords?, carVendors? }
//
// Env: AMGINE_* (same auth as booking) + optional AMGINE_SOURCE_SEB / AMGINE_TMC_ID /
// AMGINE_SOURCE_SE (default to the known Kensington onboarding IDs).

const GROUPS = '4820086761148292'; // LIVE GROUP MASTERSHEET
const SRC_SEB = Number(process.env.AMGINE_SOURCE_SEB || 1687);
const TMC_ID  = Number(process.env.AMGINE_TMC_ID || 116);
const SRC_SE  = Number(process.env.AMGINE_SOURCE_SE || 918);

const CREATE_BRANCH_URL = 'https://app.amgine.ai/publicapi/api/ClientOnboard/bulkUploadServicedEntityBranch?returnSuccess=true';
const policyUrl      = (guid) => `https://app.amgine.ai/publicapi/api/servicedEntity/0/Policy?servicedEntityBranchGuid=${guid}`;
const policyGroupUrl = (guid) => `https://app.amgine.ai/publicapi/api/servicedentity/0/TravelerGroup?servicedEntityBranchGuid=${guid}`;

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const name = norm(body.name);
  if (!name) return res.status(400).json({ error: 'name is required (client / branch name)' });
  const groupIdIn = norm(body.groupId);
  // Manager's call (2026-07-07): the branch NAME is the Group ID itself. Group IDs are
  // unique, so they satisfy Amgine's unique-name requirement. Fall back to the client
  // name + timestamp only when no Group ID was supplied.
  const uniqueName = groupIdIn ? groupIdIn : `${name} ${Date.now()}`;

  try {
    const token = await getToken();
    if (!token) return res.status(502).json({ error: 'Amgine token failed' });
    const amg = (url, payload) => fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // 1) CreateBranch
    const branchBody = [{
      name: uniqueName,
      sourceSEBIDForContentConfig: SRC_SEB,
      sourceSEBIDForNotificationRules: SRC_SEB,
      sourceSEBIDForGuestSetting: SRC_SEB,
      sourceSEBIDForCustomField: SRC_SEB,
      tmcId: TMC_ID,
      addressLine1: norm(body.addressLine1) || '225 W 34th Street',
      postalCode: norm(body.postalCode) || '10122',
      provinceState: norm(body.provinceState) || 'NY',
      servicedEntityId: SRC_SE,
      city: norm(body.city) || 'New York',
      country: norm(body.country) || 'US',
      emailDomainSync: splitList(body.emailDomains),
      hotelFilterKeywords: splitList(body.hotelKeywords),
      preferredCarVendors: splitList(body.carVendors),
      preferredCars: [''],
      preferredAirlines: splitList(body.preferredAirlines),
      excludeAirlines: norm(body.excludeAirlines) ? splitList(body.excludeAirlines) : ['NK', 'F9', 'SY'],
      preferredFlightFareBasisCode: [''],
      preferredAirports: splitList(body.preferredAirports),
    }];
    const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
    // Try the clean name first. Amgine returns a zero-GUID when it rejects the
    // branch — most often a bad Province/State or Country code, OR a duplicate
    // branch name. If the clean name collides, retry once with a unique suffix so
    // re-onboarding the same client never hard-fails.
    let finalName = uniqueName, branchGuid, branchJson, branchStatus;
    for (let attempt = 1; attempt <= 2; attempt++) {
      branchBody[0].name = finalName;
      const branchRes = await amg(CREATE_BRANCH_URL, branchBody);
      branchStatus = branchRes.status;
      branchJson = await branchRes.json().catch(() => ({}));
      branchGuid = deepFind(branchJson, 'guid');
      if (branchRes.ok && branchGuid && branchGuid !== ZERO_GUID) break;
      finalName = `${uniqueName} ${Date.now()}`; // collision → make it unique and retry
      branchGuid = null;
    }
    if (!branchGuid) {
      return res.status(502).json({
        step: 'CreateBranch', status: branchStatus, branchGuid,
        error: 'Branch was not created by Amgine. Most likely the Province/State or Country isn\'t a 2-letter code (e.g. ON, NY, CA, US).',
        raw: branchJson,
      });
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
    // so retry with a generous window (function maxDuration is raised to 60s).
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
      return res.status(502).json({ step: 'CreatePolicyRule', status: polStatus, error: 'no policy guid', branchGuid, raw: polJson });
    }

    // 3) CreatePolicyGroup (retry likewise)
    const groupBody = { groupName: finalName, description: name, policyGuid };
    let policyGroupGuid, pgJson, pgStatus, pgOk = false;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const pgRes = await amg(policyGroupUrl(branchGuid), groupBody);
      pgStatus = pgRes.status; pgOk = pgRes.ok;
      pgJson = await pgRes.json().catch(() => ({}));
      policyGroupGuid = deepFind(pgJson, 'guid') || policyGuid;
      if (pgRes.ok) break;
      await sleep(2500);
    }
    if (!pgOk) {
      return res.status(502).json({ step: 'CreatePolicyGroup', status: pgStatus, error: 'failed', branchGuid, policyGuid, raw: pgJson });
    }

    // 4) Write GUIDs onto the group row (if a groupId was supplied)
    let wroteToGroup = false;
    const groupId = norm(body.groupId);
    if (groupId) {
      const TOKEN = process.env.SMARTSHEET_API_TOKEN;
      const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
        ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
      });
      // Retry the group lookup a few times — a group row added moments before may
      // still be saving when we first read the sheet (avoids "no matching row").
      let gRow, colId;
      for (let attempt = 1; attempt <= 4 && !gRow; attempt++) {
        if (attempt > 1) await sleep(2000);
        const sheet = await (await ss(`/sheets/${GROUPS}`)).json();
        const idByTitle = {};
        for (const c of sheet.columns) idByTitle[c.title.trim().toLowerCase()] = c.id;
        colId = (t) => idByTitle[t.trim().toLowerCase()];
        const gidCol = colId('group id');
        gRow = (sheet.rows || []).find(r => {
          const c = (r.cells || []).find(x => x.columnId === gidCol);
          return c && norm(c.value ?? c.displayValue).toLowerCase() === groupId.toLowerCase();
        });
      }
      if (gRow) {
        const cells = [];
        if (colId('amgine branch guid')) cells.push({ columnId: colId('amgine branch guid'), value: branchGuid });
        if (colId('amgine policy guid')) cells.push({ columnId: colId('amgine policy guid'), value: policyGroupGuid });
        if (colId('amgine onboarded')) cells.push({ columnId: colId('amgine onboarded'), value: true });
        if (cells.length) { await ss(`/sheets/${GROUPS}/rows`, { method: 'PUT', body: JSON.stringify([{ id: gRow.id, cells }]) }); wroteToGroup = true; }
      }
    }

    return res.status(200).json({ ok: true, branchName: finalName, branchGuid, policyGuid, policyGroupGuid, wroteToGroup });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
