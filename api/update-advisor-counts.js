export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const AGENT_TRAVELLER_SHEET = '7213505705889668';
  const ADVISOR_SUMMARY_SHEET = '4629439471112068';

  // Column IDs on AGENT Traveller List
  const TRAV = {
    agentAssigned: 5924051486019460,  // "Agent Assigned:" (CONTACT_LIST)
    assigned:      3672251672334212,  // "Assigned" (CHECKBOX)
    inProgress:    8175851299704708,  // "In progress" (CHECKBOX)
    completed:     857501905227652,   // "Completed" (CHECKBOX)
  };

  // Column IDs on Advisor Summary
  const ADV = {
    advisorName:    7481264075739012, // "Advisor Assigned"
    inProgress:     2882053124427652, // "# In Progress"
    ticketedClosed: 6355364168896388, // "# Ticketed/Closed"
  };

  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    }).then(r => r.json());

  const cellVal = (row, colId) => {
    const c = row.cells?.find(c => c.columnId === colId);
    return c?.value ?? c?.displayValue ?? null;
  };

  try {
    // 1. Read the AGENT Traveller List
    const travSheet = await api(`/sheets/${AGENT_TRAVELLER_SHEET}`);

    // 2. Count "In progress" and "Completed" per agent
    const counts = {}; // { agentName: { inProgress: N, completed: N } }

    for (const row of travSheet.rows) {
      const agent = cellVal(row, TRAV.agentAssigned);
      if (!agent) continue;

      // Contact list cells can return an object or display name
      const name = typeof agent === 'object' ? agent.name || agent : String(agent).trim();
      if (!name) continue;

      if (!counts[name]) counts[name] = { inProgress: 0, completed: 0 };

      const inProg = cellVal(row, TRAV.inProgress);
      const done = cellVal(row, TRAV.completed);

      if (inProg === true || inProg === 'true') counts[name].inProgress++;
      if (done === true || done === 'true') counts[name].completed++;
    }

    // 3. Read the Advisor Summary sheet to get current rows
    const advSheet = await api(`/sheets/${ADVISOR_SUMMARY_SHEET}`);

    // 4. Update each advisor row with the correct counts
    const updateRows = [];
    for (const row of advSheet.rows) {
      const advisorName = cellVal(row, ADV.advisorName);
      if (!advisorName) continue;

      const name = String(advisorName).trim();
      const c = counts[name] || { inProgress: 0, completed: 0 };

      updateRows.push({
        id: row.id,
        cells: [
          { columnId: ADV.inProgress,     value: c.inProgress },
          { columnId: ADV.ticketedClosed, value: c.completed },
        ],
      });
    }

    if (updateRows.length > 0) {
      await api(`/sheets/${ADVISOR_SUMMARY_SHEET}/rows`, {
        method: 'PUT',
        body: JSON.stringify(updateRows),
      });
    }

    return res.status(200).json({
      updated: updateRows.length,
      counts,
      message: `Updated ${updateRows.length} advisor(s) in summary`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
