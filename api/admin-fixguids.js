// TEMP one-shot admin — repair stale policy-group GUIDs. DELETE after running.
// For every LIVE GROUP MASTERSHEET row that has an Amgine Branch GUID, create a
// fresh policy + policy group ON THE EXISTING BRANCH (no new branch), capture
// the response's `groupGuid` (strict — no fallback), and write the corrected
// "Amgine Policy GUID" + "Amgine Policy Link" back to the row.
// GET ?dry=1 to list what would be fixed without touching Amgine/Smartsheet.
const GROUPS = '4820086761148292';
const policyUrl      = (guid) => `https://app.amgine.ai/publicapi/api/servicedEntity/0/Policy?servicedEntityBranchGuid=${guid}`;
const policyGroupUrl = (guid) => `https://app.amgine.ai/publicapi/api/servicedentity/0/TravelerGroup?servicedEntityBranchGuid=${guid}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s == null ? '' : s).trim();

function deepFind(obj, key) {
  if (obj == null || typeof obj !== 'object') return undefined;
  for (const k of Object.keys(obj)) if (k.toLowerCase() === key.toLowerCase() && obj[k]) return obj[k];
  for (const k of Object.keys(obj)) { const f = deepFind(obj[k], key); if (f) return f; }
  return undefined;
}

async function getToken() {
  const cid = process.env.AMGINE_CLIENT_ID, secret = process.env.AMGINE_CLIENT_SECRET;
  const fields = { grant_type: process.env.AMGINE_GRANT_TYPE, scope: process.env.AMGINE_SCOPE, username: process.env.AMGINE_USERNAME, password: process.env.AMGINE_PASSWORD };
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${cid}:${secret}`).toString('base64') };
  const r = await fetch(process.env.AMGINE_TOKEN_URL, { method: 'POST', headers, body: new URLSearchParams(fields).toString() });
  const j = await r.json().catch(() => ({}));
  return j.access_token;
}

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const dry = req.query && req.query.dry === '1';
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  }).then(r => r.json());

  try {
    const sheet = await ss(`/sheets/${GROUPS}`);
    const byTitle = {};
    for (const c of sheet.columns) byTitle[c.title.trim().toLowerCase()] = c.id;
    const col = (t) => byTitle[t.trim().toLowerCase()];
    const cell = (row, t) => {
      const c = (row.cells || []).find(x => x.columnId === col(t));
      return c ? (c.value ?? c.displayValue ?? '') : '';
    };
    const targets = (sheet.rows || []).filter(r => norm(cell(r, 'Amgine Branch GUID')));
    if (dry) {
      return res.status(200).json({ dry: true, targets: targets.map(r => ({ groupId: norm(cell(r, 'GROUP ID')), branch: norm(cell(r, 'Amgine Branch GUID')).slice(0, 12), oldPolicy: norm(cell(r, 'Amgine Policy GUID')).slice(0, 12) })) });
    }

    const amgToken = await getToken();
    if (!amgToken) return res.status(502).json({ error: 'Amgine token failed' });
    const amg = (url, payload) => fetch(url, {
      method: 'POST', headers: { Authorization: `Bearer ${amgToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });

    const results = [];
    for (const row of targets) {
      const groupId = norm(cell(row, 'GROUP ID'));
      const branchGuid = norm(cell(row, 'Amgine Branch GUID'));
      const stamp = Date.now();
      try {
        // 1) fresh policy rule on the existing branch (default economy in-policy)
        const policyBody = {
          policyName: `${groupId || 'group'} policy ${stamp}`,
          policyElements: [{
            policyInputs: [{ equalToNumeric: [2], equalToString: [], notEqualToNumeric: [], notEqualToString: [], equalToBool: [], notEqualToBool: [], attribute: 'FlightCabinClass', serviceType: 'FlightLeg' }],
            travelServiceType: 'FlightLeg', inPolicy: true,
          }],
        };
        let policyGuid;
        for (let a = 1; a <= 4 && !policyGuid; a++) {
          if (a > 1) await sleep(2000);
          const pr = await amg(policyUrl(branchGuid), policyBody);
          const pj = await pr.json().catch(() => ({}));
          if (pr.ok) policyGuid = deepFind(pj, 'policyGuid') || deepFind(pj, 'guid');
        }
        if (!policyGuid) { results.push({ groupId, error: 'no policy guid' }); continue; }

        // 2) fresh policy group — STRICT groupGuid, no fallback
        let groupGuid;
        for (let a = 1; a <= 4 && !groupGuid; a++) {
          if (a > 1) await sleep(2000);
          const gr = await amg(policyGroupUrl(branchGuid), { groupName: `${groupId || 'group'} ${stamp}`, description: groupId, policyGuid });
          const gj = await gr.json().catch(() => ({}));
          if (gr.ok) groupGuid = deepFind(gj, 'groupGuid');
        }
        if (!groupGuid) { results.push({ groupId, error: 'no groupGuid in response' }); continue; }

        // 3) write corrected values to the row
        const link = `https://app.amgine.ai/tmc-management/policy?policygroupguid=${groupGuid}`;
        const cells = [];
        if (col('amgine policy guid')) cells.push({ columnId: col('amgine policy guid'), value: groupGuid });
        if (col('amgine policy link')) cells.push({ columnId: col('amgine policy link'), value: link });
        await ss(`/sheets/${GROUPS}/rows`, { method: 'PUT', body: JSON.stringify([{ id: row.id, cells }]) });
        results.push({ groupId, fixed: true, groupGuid: groupGuid.slice(0, 12) + '…' });
      } catch (e) {
        results.push({ groupId, error: e.message });
      }
    }
    return res.status(200).json({ repaired: results.filter(r => r.fixed).length, of: targets.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
