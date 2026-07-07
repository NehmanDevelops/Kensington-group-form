export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sendCopy, ...smartsheetPayload } = req.body;

    if (sendCopy) {
      smartsheetPayload.cells = smartsheetPayload.cells || [];
      smartsheetPayload.cells.push({ columnId: 3884169070677892, value: true });
    }

    // ── Force numeric answers to be stored as TEXT in Smartsheet ──────────
    //    Smartsheet auto-converts pure-numeric strings ("50") into numbers
    //    (50.0). Power Automate's GetSheetData connector then rejects the whole
    //    sheet read ("expected String but got Float"). Appending a zero-width
    //    space keeps the value text (so it returns as a string) while staying
    //    completely invisible in the sheet and in the recap email.
    const ZWSP = '​';
    if (Array.isArray(smartsheetPayload.cells)) {
      smartsheetPayload.cells = smartsheetPayload.cells.map(c => {
        if (c == null || typeof c.value !== 'string' && typeof c.value !== 'number') return c;
        const s = String(c.value);
        return /^\d+(\.\d+)?$/.test(s) ? { ...c, value: s + ZWSP } : c;
      });
    }

    // ── Step 1: Save to Group Travel intake sheet ──────────────────────────
    const intakeRes = await fetch('https://api.smartsheet.com/2.0/sheets/3569349083221892/rows', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(smartsheetPayload)
    });

    const intakeData = await intakeRes.json();

    if (!intakeRes.ok) {
      return res.status(intakeRes.status).json({ error: intakeData.message || 'Smartsheet error' });
    }

    // ── Step 2: Mirror key fields to LIVE GROUP MASTERSHEET ───────────────
    // Build a lookup map: columnId → value from the submitted cells
    const cells = smartsheetPayload.cells || [];
    const cellMap = {};
    for (const cell of cells) {
      cellMap[String(cell.columnId)] = cell.value;
    }

    // Intake sheet column IDs for the fields we want to mirror
    const INTAKE = {
      groupId:               '6412998301486980',
      companyName:           '1061015075983236',
      eventName:             '4438714796511108',
      arrivalDate:           '3699842982645636',
      departureDate:         '885093215539076',
      eventManagerName:      '5564614703353732',
      eventManagerEmail:     '3312814889668484',
      eventManagerPhone:     '7816414517038980',
      cabinClass:            '3136893029224324',
      approximatePassengers: '2782628976824196',
      economySeats:          '6565385116880772',
      premiumEconomySeats:   '2800086341160836',
      businessClassSeats:    '3424333530959748',
      firstClassSeats:       '8062704964546436',
    };

    // LIVE GROUP MASTERSHEET (sheet 4820086761148292) column IDs.
    // VERIFIED against the live sheet schema on 2026-06-03. The previous
    // contactName/contactEmail IDs did NOT exist on this sheet, so every
    // master write was rejected with 400 INVALID_COLUMN_ID and silently
    // dropped — submissions only ever reached the intake sheet.
    const MASTER_SHEET_ID = '4820086761148292';
    const MASTER = {
      groupId:       671286488764292,    // primary "GROUP ID" column
      companyName:   8552585836662660,   // "Company Name"
      contactName:   5174886116134788,   // "Contact Name"
      contactEmail:  2923086302449540,   // "Contact E-mail"
      contactPhone:  2157300629671812,   // "Contact Phone"
      status:        6300786022977412,   // "Status"
      completed:     4048986209292164,   // "Completed"
      startDate:     4893411139424132,   // "Travel Start Date"
      endDate:       2641611325738884,   // "Travel End Date"
    };

    const masterCells = [
      { columnId: MASTER.companyName,  value: cellMap[INTAKE.companyName]      || '' },
      { columnId: MASTER.contactName,  value: cellMap[INTAKE.eventManagerName] || '' },
      { columnId: MASTER.contactEmail, value: cellMap[INTAKE.eventManagerEmail]|| '' },
      { columnId: MASTER.contactPhone, value: cellMap[INTAKE.eventManagerPhone]|| '' },
      { columnId: MASTER.status,       value: 'New' },
      { columnId: MASTER.completed,    value: false },
      { columnId: 6289100570398596,    value: true },  // Auto-Synced — prevents sync loop
    ];

    // Group ID is the master's primary column. The form doesn't always send
    // one (it's generated on the intake sheet), so only include it if present.
    if (cellMap[INTAKE.groupId]) {
      masterCells.unshift({ columnId: MASTER.groupId, value: cellMap[INTAKE.groupId] });
    }

    if (cellMap[INTAKE.arrivalDate]) {
      masterCells.push({ columnId: MASTER.startDate, value: cellMap[INTAKE.arrivalDate] });
    }
    if (cellMap[INTAKE.departureDate]) {
      masterCells.push({ columnId: MASTER.endDate, value: cellMap[INTAKE.departureDate] });
    }

    // ── Find the last row WITH DATA so we can insert right after it, AND guard
    // against duplicates: if this GROUP ID already exists on the master, skip the
    // insert. Repeat/edited/double-fired submissions were creating dupe rows here
    // (submit.js was the only writer without a dedup check).
    let insertPayload = [{ toBottom: true, cells: masterCells }];
    const submittedGid = cellMap[INTAKE.groupId] ? String(cellMap[INTAKE.groupId]).trim().toLowerCase() : '';
    let masterHasGroup = false;

    try {
      const sheetRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${MASTER_SHEET_ID}`, {
        headers: { 'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}` }
      });
      if (sheetRes.ok) {
        const sheetData = await sheetRes.json();
        // Find the last row that has a real GROUP ID. Only check GROUP ID — not
        // other manual cells — because rows with stale Contact Emails but no
        // GROUP ID would otherwise push new submissions way down the sheet.
        const GROUP_ID_COL = 671286488764292;
        let lastDataRowId = null;
        for (const row of sheetData.rows) {
          const groupIdCell = row.cells?.find(c => c.columnId === GROUP_ID_COL);
          const gidVal = groupIdCell && groupIdCell.value != null ? String(groupIdCell.value).trim() : '';
          if (gidVal !== '') {
            lastDataRowId = row.id;
            if (submittedGid && gidVal.toLowerCase() === submittedGid) masterHasGroup = true;
          }
        }
        if (lastDataRowId) {
          insertPayload = [{ siblingId: lastDataRowId, cells: masterCells }];
        }
      }
    } catch (lookupErr) {
      console.error('Master row position lookup failed, falling back to toBottom:', lookupErr.message);
    }

    if (masterHasGroup) {
      console.log(`Skipped MASTER insert — group "${submittedGid}" already exists (dedup).`);
    } else {
      const masterRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${MASTER_SHEET_ID}/rows`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(insertPayload)
      });

      if (!masterRes.ok) {
        const masterErr = await masterRes.json();
        // Don't fail the whole request — intake row is already saved
        console.error('MASTER TRACKER write failed:', masterErr.message);
      }
    }

    // ── Step 3: Mirror the same row into KC AGENT GROUPS MASTERSHEET ───────
    // This is the agent-facing sheet in the KCG Agent workspace. We map each
    // master column to its agent-sheet equivalent and write the same values.
    // Auto-Synced is set to true so the sync automation doesn't re-copy it.
    const AGENT_SHEET_ID = '1453513052737412';
    const AGENT_GROUP_ID_COL = 3130417439084420;
    const MASTER_TO_AGENT = {
      671286488764292:  3130417439084420, // GROUP ID
      8552585836662660: 7634017066454916, // Company Name
      5174886116134788: 2004517532241796, // Contact Name
      2923086302449540: 6508117159612292, // Contact E-mail
      2157300629671812: 4256317345927044, // Contact Phone
      6300786022977412: 8759916973297540, // Status
      4048986209292164: 8056229531520900, // Completed
      4893411139424132: 5804429717835652, // Travel Start Date
      2641611325738884: 3552629904150404, // Travel End Date
    };
    if (masterHasGroup) {
      console.log('Skipped AGENT insert — group already exists (dedup).');
    } else try {
      const agentCells = masterCells
        .filter(c => MASTER_TO_AGENT[c.columnId])  // only mapped columns
        .map(c => ({ columnId: MASTER_TO_AGENT[c.columnId], value: c.value }));
      // Add Auto-Synced = true on Agent sheet to prevent sync loop
      agentCells.push({ columnId: 588135196299140, value: true });

      // Position after the last row with a GROUP ID
      let agentPayload = [{ toBottom: true, cells: agentCells }];
      try {
        const agentSheetRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${AGENT_SHEET_ID}`, {
          headers: { 'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}` }
        });
        if (agentSheetRes.ok) {
          const agentData = await agentSheetRes.json();
          let lastAgentRowId = null;
          for (const row of agentData.rows) {
            const gc = row.cells?.find(c => c.columnId === AGENT_GROUP_ID_COL);
            if (gc && gc.value !== undefined && gc.value !== null && String(gc.value).trim() !== '') {
              lastAgentRowId = row.id;
            }
          }
          if (lastAgentRowId) {
            agentPayload = [{ siblingId: lastAgentRowId, cells: agentCells }];
          }
        }
      } catch (posErr) {
        console.error('Agent row position lookup failed, using toBottom:', posErr.message);
      }

      const agentRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${AGENT_SHEET_ID}/rows`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(agentPayload)
      });
      if (!agentRes.ok) {
        const agentErr = await agentRes.json();
        console.error('KC Agent Groups mirror failed:', agentErr.message);
      }
    } catch (agentErr) {
      console.error('KC Agent Groups mirror error:', agentErr.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
