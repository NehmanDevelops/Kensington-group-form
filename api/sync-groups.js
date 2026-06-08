export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const MANAGER_SHEET = '4820086761148292';   // LIVE GROUP MASTERSHEET
  const AGENT_SHEET   = '1453513052737412';   // KC AGENT GROUPS MASTERSHEET

  // Column IDs on LIVE GROUP MASTERSHEET (Manager)
  const MGR = {
    groupId:    671286488764292,
    company:    8552585836662660,
    contactN:   5174886116134788,
    contactE:   2923086302449540,
    contactP:   2157300629671812,
    status:     6300786022977412,
    passengers: 2440692533333892,
    startDate:  4893411139424132,
    endDate:    2641611325738884,
    completed:  4048986209292164,
    launchDate: 8893411139424132,  // Expected Launch Date — will be looked up
    notes:      0,                 // Will be looked up
    autoSynced: 6289100570398596,
  };

  // Column IDs on KC AGENT GROUPS MASTERSHEET (Agent)
  const AGT = {
    groupId:    3130417439084420,
    company:    7634017066454916,
    contactN:   2004517532241796,
    contactE:   6508117159612292,
    contactP:   4256317345927044,
    status:     8759916973297540,
    passengers: 2426729997307780,
    startDate:  5804429717835652,
    endDate:    3552629904150404,
    completed:  8056229531520900,
    launchDate: 737880137043844,
    notes:      5241479764414340,
    autoSynced: 588135196299140,
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
    // 1. Read both sheets
    const [mgrSheet, agtSheet] = await Promise.all([
      api(`/sheets/${MANAGER_SHEET}`),
      api(`/sheets/${AGENT_SHEET}`),
    ]);

    // Build lookup of column IDs by title for Manager sheet (for columns we need to discover)
    const mgrColByTitle = {};
    for (const col of mgrSheet.columns) mgrColByTitle[col.title] = col.id;
    MGR.launchDate = mgrColByTitle['Expected Launch Date'] || MGR.launchDate;
    MGR.notes = mgrColByTitle['Notes'] || MGR.notes;

    // 2. Build set of GROUP IDs already in Agent sheet
    const agentGroupIds = new Set();
    for (const row of agtSheet.rows) {
      const gid = cellVal(row, AGT.groupId);
      if (gid) agentGroupIds.add(String(gid).trim());
    }

    // 3. Find unsynced Manager rows (have GROUP ID, not yet in Agent sheet)
    const toSync = [];
    for (const row of mgrSheet.rows) {
      const gid = cellVal(row, MGR.groupId);
      if (!gid || String(gid).trim() === '') continue;
      if (agentGroupIds.has(String(gid).trim())) continue; // Already exists in Agent
      toSync.push(row);
    }

    if (toSync.length === 0) {
      return res.status(200).json({ synced: 0, message: 'All groups already in sync' });
    }

    // 4. Create rows in Agent sheet
    const newRows = toSync.map(row => ({
      toBottom: true,
      cells: [
        { columnId: AGT.groupId,    value: cellVal(row, MGR.groupId) || '' },
        { columnId: AGT.company,    value: cellVal(row, MGR.company) || '' },
        { columnId: AGT.contactN,   value: cellVal(row, MGR.contactN) || '' },
        { columnId: AGT.contactE,   value: cellVal(row, MGR.contactE) || '' },
        { columnId: AGT.contactP,   value: cellVal(row, MGR.contactP) || '' },
        { columnId: AGT.status,     value: cellVal(row, MGR.status) || '' },
        { columnId: AGT.passengers, value: cellVal(row, MGR.passengers) || '' },
        { columnId: AGT.startDate,  value: cellVal(row, MGR.startDate) || '' },
        { columnId: AGT.endDate,    value: cellVal(row, MGR.endDate) || '' },
        { columnId: AGT.completed,  value: cellVal(row, MGR.completed) || false },
        { columnId: AGT.launchDate, value: cellVal(row, MGR.launchDate) || '' },
        { columnId: AGT.notes,      value: cellVal(row, MGR.notes) || '' },
        { columnId: AGT.autoSynced, value: true },
      ].filter(c => c.value !== ''),
    }));

    const insertRes = await api(`/sheets/${AGENT_SHEET}/rows`, {
      method: 'POST',
      body: JSON.stringify(newRows),
    });

    // 5. Mark synced rows on Manager sheet
    const updateRows = toSync.map(row => ({
      id: row.id,
      cells: [{ columnId: MGR.autoSynced, value: true }],
    }));

    await api(`/sheets/${MANAGER_SHEET}/rows`, {
      method: 'PUT',
      body: JSON.stringify(updateRows),
    });

    return res.status(200).json({
      synced: toSync.length,
      groups: toSync.map(r => cellVal(r, MGR.groupId)),
      message: `Synced ${toSync.length} group(s) from Manager → Agent`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
