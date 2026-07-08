// TEMP one-shot admin — DELETE after running. Actions via ?action=
//   setup     -> add "Company Profile ID" column to GROUPS if missing;
//                ensure the Smartsheet webhook on MASTER -> /api/amgine exists + enabled;
//                upsert PROFTEST01 group row.
//   traveller -> add a test traveller (Profile Test, PROFTEST01, Ready to Book ✓).
//   check     -> read the test traveller row + PROFTEST01 group row values.
const MASTER = '8780932377956228';
const GROUPS = '4820086761148292';
const CALLBACK = 'https://kensington-group-form.vercel.app/api/amgine';

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const action = (req.query && req.query.action) || 'setup';
  const ss = (path, opts = {}) => fetch(`https://api.smartsheet.com/2.0${path}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  const idx = (sheet) => {
    const byTitle = {};
    for (const c of sheet.columns) byTitle[c.title.trim().toLowerCase()] = c.id;
    const id = (t) => byTitle[t.trim().toLowerCase()];
    const val = (row, t) => {
      const c = (row.cells || []).find(x => x.columnId === id(t));
      return c ? (c.value ?? c.displayValue ?? '') : '';
    };
    return { id, val };
  };
  const norm = (s) => String(s == null ? '' : s).trim();

  try {
    const out = { action };

    if (action === 'setup') {
      // 1) Company Profile ID column on GROUPS
      const groups = await (await ss(`/sheets/${GROUPS}`)).json();
      const G = idx(groups);
      if (G.id('Company Profile ID')) out.companyCol = 'already exists';
      else {
        const r = await ss(`/sheets/${GROUPS}/columns`, { method: 'POST', body: JSON.stringify([{ title: 'Company Profile ID', type: 'TEXT_NUMBER', index: groups.columns.length }]) });
        const j = await r.json();
        out.companyCol = j.result ? 'created' : j;
      }

      // 2) Smartsheet webhook on MASTER -> /api/amgine
      const hooks = await (await ss(`/webhooks?includeAll=true`)).json();
      const list = hooks.data || [];
      let hook = list.find(h => String(h.scopeObjectId) === MASTER && (h.callbackUrl || '').startsWith(CALLBACK));
      out.existingWebhooks = list.map(h => ({ id: h.id, scopeObjectId: h.scopeObjectId, callbackUrl: h.callbackUrl, enabled: h.enabled, status: h.status }));
      if (!hook) {
        const cr = await ss(`/webhooks`, { method: 'POST', body: JSON.stringify({ name: 'Amgine auto-book', callbackUrl: CALLBACK, scope: 'sheet', scopeObjectId: Number(MASTER), events: ['*.*'], version: 1 }) });
        const cj = await cr.json();
        hook = cj.result;
        out.webhookCreated = !!hook;
        if (!hook) out.webhookCreateError = cj;
      }
      if (hook && !hook.enabled) {
        const er = await ss(`/webhooks/${hook.id}`, { method: 'PUT', body: JSON.stringify({ enabled: true }) });
        const ej = await er.json();
        out.webhookEnable = ej.result ? { enabled: ej.result.enabled, status: ej.result.status } : ej;
      } else if (hook) {
        out.webhookEnable = { enabled: hook.enabled, status: hook.status, note: 'already enabled' };
      }

      // 3) PROFTEST01 group row
      const gidCol = G.id('group id');
      const existing = (groups.rows || []).find(r => {
        const c = (r.cells || []).find(x => x.columnId === gidCol);
        return c && norm(c.value ?? c.displayValue).toLowerCase() === 'proftest01';
      });
      if (existing) out.group = 'PROFTEST01 already exists';
      else {
        const cells = [{ columnId: gidCol, value: 'PROFTEST01' }];
        if (G.id('company name')) cells.push({ columnId: G.id('company name'), value: 'Profile Test Co' });
        await ss(`/sheets/${GROUPS}/rows`, { method: 'POST', body: JSON.stringify([{ toBottom: true, cells }]) });
        out.group = 'PROFTEST01 created';
      }
      return res.status(200).json(out);
    }

    if (action === 'traveller') {
      const master = await (await ss(`/sheets/${MASTER}`)).json();
      const M = idx(master);
      const cells = [
        { columnId: M.id('Group ID'), value: 'PROFTEST01' },
        { columnId: M.id('First Name'), value: 'Profile' },
        { columnId: M.id('Last Name'), value: 'Test' },
        { columnId: M.id('Ready to Book'), value: true },
      ].filter(c => c.columnId);
      const r = await ss(`/sheets/${MASTER}/rows`, { method: 'POST', body: JSON.stringify([{ toBottom: true, cells }]) });
      const j = await r.json();
      out.travellerRowId = j.result && j.result[0] && j.result[0].id;
      return res.status(200).json(out);
    }

    if (action === 'check') {
      const master = await (await ss(`/sheets/${MASTER}`)).json();
      const M = idx(master);
      const trow = (master.rows || []).slice().reverse().find(r =>
        norm(M.val(r, 'Group ID')).toLowerCase() === 'proftest01' && norm(M.val(r, 'First Name')) === 'Profile');
      out.traveller = trow ? {
        itineraryId: M.val(trow, 'Amgine Itinerary ID'),
        status: M.val(trow, 'Amgine Status'),
        link: String(M.val(trow, 'Amgine Link')).slice(0, 60),
      } : 'not found';
      const groups = await (await ss(`/sheets/${GROUPS}`)).json();
      const G = idx(groups);
      const grow = (groups.rows || []).find(r => norm(G.val(r, 'GROUP ID')).toLowerCase() === 'proftest01');
      out.groupRow = grow ? {
        branchGuid: String(G.val(grow, 'Amgine Branch GUID')).slice(0, 12),
        policyGuid: String(G.val(grow, 'Amgine Policy GUID')).slice(0, 12),
        pcc: G.val(grow, 'PCC'),
        companyProfileId: G.val(grow, 'Company Profile ID'),
        groupProfileId: G.val(grow, 'Group Profile ID') || G.val(grow, 'Sabre Profile ID'),
        profiledTravellers: G.val(grow, 'Profiled Travellers'),
      } : 'not found';
      return res.status(200).json(out);
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
