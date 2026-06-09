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
    assigned:       563822393069444,  // "# Assigned"
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

    // 2. Count "Assigned", "In progress" and "Completed" per agent
    //    Agent Assigned is a CONTACT_LIST — stores email but displays a name.
    //    We need to match against the Advisor Summary which uses display names
    //    like "Vera Perisic". Build a lookup from email → display name using the
    //    Advisor Summary names so we can match reliably.
    const counts = {}; // { agentName: { assigned: N, inProgress: N, completed: N } }

    // Read Advisor Summary to build email→name hints
    const advSheet = await api(`/sheets/${ADVISOR_SUMMARY_SHEET}`);
    const advisorNames = [];
    for (const row of advSheet.rows) {
      const n = cellVal(row, ADV.advisorName);
      if (n) advisorNames.push(String(n).trim());
    }

    // Helper: resolve a CONTACT_LIST cell value to the best matching advisor name
    const resolveAgent = (agent) => {
      if (!agent) return null;
      const raw = typeof agent === 'object' ? (agent.name || agent.email || '') : String(agent);
      const s = raw.trim();
      if (!s) return null;

      // Direct match by name
      const directMatch = advisorNames.find(n => n.toLowerCase() === s.toLowerCase());
      if (directMatch) return directMatch;

      // If it's an email like "vera.perisic@...", try to match "Vera Perisic"
      if (s.includes('@')) {
        const local = s.split('@')[0]; // "vera.perisic"
        const parts = local.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
        const guess = parts.join(' '); // "Vera Perisic"
        const emailMatch = advisorNames.find(n => n.toLowerCase() === guess.toLowerCase());
        if (emailMatch) return emailMatch;
      }

      // Partial match — if the value is a first name only, find advisor whose name starts with it
      const partialMatch = advisorNames.find(n => n.toLowerCase().startsWith(s.toLowerCase()));
      if (partialMatch) return partialMatch;

      return s; // Fallback to raw value
    };

    for (const row of travSheet.rows) {
      const agent = cellVal(row, TRAV.agentAssigned);
      const name = resolveAgent(agent);
      if (!name) continue;

      if (!counts[name]) counts[name] = { assigned: 0, inProgress: 0, completed: 0 };

      const asgn = cellVal(row, TRAV.assigned);
      const inProg = cellVal(row, TRAV.inProgress);
      const done = cellVal(row, TRAV.completed);

      if (asgn === true || asgn === 'true') counts[name].assigned++;
      if (inProg === true || inProg === 'true') counts[name].inProgress++;
      if (done === true || done === 'true') counts[name].completed++;
    }

    // 3. Update each advisor row with the correct counts
    const updateRows = [];
    for (const row of advSheet.rows) {
      const advisorName = cellVal(row, ADV.advisorName);
      if (!advisorName) continue;

      const name = String(advisorName).trim();
      const c = counts[name] || { assigned: 0, inProgress: 0, completed: 0 };

      updateRows.push({
        id: row.id,
        cells: [
          { columnId: ADV.assigned,       value: c.assigned },
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
