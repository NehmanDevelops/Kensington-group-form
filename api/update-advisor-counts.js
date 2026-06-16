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
    const norm = x => String(x || '').trim().toLowerCase();
    const resolveAgent = (agent) => {
      if (!agent) return null;
      const raw = typeof agent === 'object' ? (agent.name || agent.email || '') : String(agent);
      const s = raw.trim();
      if (!s) return null;

      // 1. Direct match by name
      const directMatch = advisorNames.find(n => norm(n) === norm(s));
      if (directMatch) return directMatch;

      // Derive a first/last guess from an email local part ("grace.northrup")
      // or a plain "First Last" string.
      let firstG, lastG;
      if (s.includes('@')) {
        const parts = s.split('@')[0].split(/[._-]/).filter(Boolean);
        firstG = parts[0]; lastG = parts[parts.length - 1];
      } else {
        const parts = s.split(/\s+/).filter(Boolean);
        firstG = parts[0]; lastG = parts[parts.length - 1];
      }

      if (firstG && lastG) {
        const ff = norm(firstG), ll = norm(lastG);
        // 2. Exact first + last
        let m = advisorNames.find(n => {
          const w = n.split(/\s+/); if (w.length < 2) return false;
          return norm(w[0]) === ff && norm(w[w.length - 1]) === ll;
        });
        if (m) return m;
        // 3. First matches + last-name PREFIX overlaps (handles spelling
        //    variants like email "northrup" vs name "Northrop")
        m = advisorNames.find(n => {
          const w = n.split(/\s+/); if (w.length < 2) return false;
          const af = norm(w[0]), al = norm(w[w.length - 1]);
          const pfx = Math.min(4, al.length, ll.length);
          return af === ff && pfx >= 3 && al.slice(0, pfx) === ll.slice(0, pfx);
        });
        if (m) return m;
      }

      // 4. Unique first-name-only match
      if (firstG) {
        const fm = advisorNames.filter(n => norm(n.split(/\s+/)[0]) === norm(firstG));
        if (fm.length === 1) return fm[0];
      }

      // 5. Partial startsWith fallback
      const partialMatch = advisorNames.find(n => norm(n).startsWith(norm(s)));
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
