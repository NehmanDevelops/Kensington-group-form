// Agent quick-entry form -> writes a row into the Traveller Profile MasterSheet.
// Fields: Group ID, First Name, Last Name, Additional Agents.
//
// GET                       -> list of known Group IDs (LIVE GROUP MASTERSHEET), for
//                              the form's <datalist> autocomplete.
// GET  ?agents=1            -> agent roster [{ rowId, name, email }] from the
//                              Advisor Summary sheet — powers both the agentform.html
//                              dropdown and manage-agents.html.
// POST { action:'addAgent', name, email }    -> add a row to Advisor Summary.
// POST { action:'removeAgent', rowId }       -> delete a row from Advisor Summary.
// POST { groupId, agentAssigned, ... }       -> (no action field) existing
//                              traveller-entry write, unchanged in behavior.
const GROUP_SHEET_ID = '4820086761148292'; // LIVE GROUP MASTERSHEET
const GROUP_ID_COL = 671286488764292; // Group ID column on the group sheet

// Advisor Summary sheet doubles as the agent roster. Name + Email columns are
// what this feature reads/writes; the other columns (Total # of Bookings,
// MGMT/Self/Assigned, Ticketed) are Smartsheet COLUMN FORMULAS that Smartsheet
// auto-applies to any new row, so adding a row here doesn't need to touch them.
const ROSTER_SHEET_ID = '4629439471112068'; // Advisor Summary
const ROSTER_NAME_COL = 7481264075739012;   // "Advisor Assigned"
const ROSTER_EMAIL_COL = 626461532524420;   // "Email" (added 2026-09-08)

// Fallback only — used if a live roster fetch fails. Keep the roster sheet as
// the source of truth; this just prevents a full outage if Smartsheet read fails.
const FALLBACK_AGENT_EMAILS = {
  'Ivana Petrovic': 'ivana.petrovic@kensingtoncorporate.com',
  'Lori Bartella': 'lori.bartella@kensingtoncorporate.com',
  'Cheryl Scheckel': 'cheryl.scheckel@kensingtoncorporate.com',
  'Jennifer Cardwell': 'jennifer.cardwell@kensingtoncorporate.com',
  'John Driscoll': 'john.driscoll@kensingtoncorporate.com',
  'Liam Mckeown': 'liam.mckeown@kensingtoncorporate.com',
  'Melissa Sawicki': 'melissa.sawicki@kensingtoncorporate.com',
  'Rami Itani': 'rami.itani@kensingtoncorporate.com',
  'Grace Northrop': 'grace.northrop@kensingtoncorporate.com',
  'Vera Perisic': 'vera.perisic@kensingtoncorporate.com',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(503).json({ error: 'SMARTSHEET_API_TOKEN not configured' });

  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    }).then(r => r.json());

  async function getRoster() {
    const sheet = await api(`/sheets/${ROSTER_SHEET_ID}?columnIds=${ROSTER_NAME_COL},${ROSTER_EMAIL_COL}`);
    if (sheet.error || !sheet.rows) return null;
    return sheet.rows
      .map(row => {
        const nameCell = row.cells.find(c => c.columnId === ROSTER_NAME_COL);
        const emailCell = row.cells.find(c => c.columnId === ROSTER_EMAIL_COL);
        const name = nameCell && nameCell.value ? String(nameCell.value).trim() : '';
        const email = emailCell && emailCell.value ? String(emailCell.value).trim() : '';
        return name ? { rowId: row.id, name, email } : null;
      })
      .filter(Boolean);
  }

  if (req.method === 'GET') {
    if (req.query && req.query.agents === '1') {
      try {
        const roster = await getRoster();
        if (!roster) return res.status(502).json({ error: 'Could not read agent roster' });
        return res.status(200).json({ agents: roster });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
    try {
      const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${GROUP_SHEET_ID}?columnIds=${GROUP_ID_COL}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: data.message || 'Smartsheet read failed' });
      const groupIds = (data.rows || [])
        .map(row => (row.cells || []).find(c => c.columnId === GROUP_ID_COL))
        .map(c => c && c.value)
        .filter(Boolean);
      return res.status(200).json({ groupIds: [...new Set(groupIds)] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  // TEMPORARY — one-time backfill of the 10 known agent emails into the new
  // Email column (added 2026-09-08). Remove this block after running once.
  if (d.action === 'backfillKnownEmails') {
    const KNOWN_EMAILS = FALLBACK_AGENT_EMAILS;
    try {
      const roster = await getRoster();
      if (!roster) return res.status(502).json({ error: 'could not read roster' });
      const updates = roster
        .filter(a => KNOWN_EMAILS[a.name] && a.email !== KNOWN_EMAILS[a.name])
        .map(a => ({ id: a.rowId, cells: [{ columnId: ROSTER_EMAIL_COL, value: KNOWN_EMAILS[a.name] }] }));
      if (updates.length === 0) return res.status(200).json({ updated: 0, message: 'nothing to backfill' });
      const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${ROSTER_SHEET_ID}/rows`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: data.message || 'write failed', detail: data });
      return res.status(200).json({ updated: updates.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Admin: add an agent to the roster ─────────────────────────────────
  if (d.action === 'addAgent') {
    const name = String(d.name || '').trim();
    const email = String(d.email || '').trim().toLowerCase();
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That email address looks invalid.' });
    try {
      const roster = await getRoster();
      if (roster && roster.some(a => a.name.toLowerCase() === name.toLowerCase())) {
        return res.status(409).json({ error: `"${name}" is already on the roster.` });
      }
      const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${ROSTER_SHEET_ID}/rows`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          toBottom: true,
          cells: [
            { columnId: ROSTER_NAME_COL, value: name },
            { columnId: ROSTER_EMAIL_COL, value: email },
          ],
        }]),
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: data.message || 'Smartsheet write failed' });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Admin: remove an agent from the roster ────────────────────────────
  if (d.action === 'removeAgent') {
    const rowId = d.rowId;
    if (!rowId) return res.status(400).json({ error: 'rowId is required.' });
    try {
      const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${ROSTER_SHEET_ID}/rows?ids=${encodeURIComponent(rowId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: data.message || 'Smartsheet delete failed' });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Default: traveller-entry submission (unchanged) ───────────────────
  const MASTER_SHEET_ID = '8780932377956228'; // Traveller Profile MasterSheet
  const COL = {
    groupId:        5029597388509060, // Group ID
    agentAssigned:  4516209625436036, // Agent Assigned: (contact-list — value must be the agent's email)
    firstName:      5726513277472644, // First Name
    lastName:       7978313091157892, // Last Name
    agentNotes:     886668210245508,  // Agent Notes  (additional agents go here)
    source:         6155241207926660, // Source
    submissionDate: 2067338580234116, // Submission Date
  };

  try {
    // Resolve the agent's email from the live roster first (so a just-added
    // agent works immediately without a redeploy); fall back to the static
    // map only if the roster read fails.
    let agentEmail = null;
    const roster = await getRoster();
    if (roster) {
      const match = roster.find(a => a.name === d.agentAssigned);
      if (match && match.email) agentEmail = match.email;
    }
    if (!agentEmail) agentEmail = FALLBACK_AGENT_EMAILS[d.agentAssigned];

    if (!d.groupId || !agentEmail || !d.firstName || !d.lastName) {
      return res.status(400).json({ error: 'Group ID, Agent, and traveller First/Last Name are required.' });
    }
    const today = new Date().toISOString().split('T')[0];

    const cells = [
      { columnId: COL.groupId,        value: String(d.groupId).trim() },
      { columnId: COL.agentAssigned,  value: agentEmail },
      { columnId: COL.firstName,      value: String(d.firstName).trim() },
      { columnId: COL.lastName,       value: String(d.lastName).trim() },
      { columnId: COL.agentNotes,     value: d.additionalAgents ? `Additional agent notes: ${String(d.additionalAgents).trim()}` : '' },
      { columnId: COL.source,         value: 'Agent Form' },
      { columnId: COL.submissionDate, value: today },
    ].filter(c => c.value !== '');

    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${MASTER_SHEET_ID}/rows`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ toBottom: true, cells }]),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.message || 'Smartsheet write failed' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
