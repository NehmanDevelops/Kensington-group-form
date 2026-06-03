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

    // ── Find the last row WITH DATA so we can insert right after it ──────
    // (avoids placing the new row at the bottom past empty placeholder rows)
    let insertPayload = [{ toBottom: true, cells: masterCells }];

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
          const hasGroupId = groupIdCell && groupIdCell.value !== undefined && groupIdCell.value !== null && String(groupIdCell.value).trim() !== '';
          if (hasGroupId) lastDataRowId = row.id;
        }
        if (lastDataRowId) {
          insertPayload = [{ siblingId: lastDataRowId, cells: masterCells }];
        }
      }
    } catch (lookupErr) {
      console.error('Master row position lookup failed, falling back to toBottom:', lookupErr.message);
    }

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

    // ── Step 3: Mirror the same row into the KCG Agent copy ───────────────
    // "Copy of LIVE GROUP MASTERSHEET" lives in the KCG Agent workspace and is
    // an exact duplicate, but copying gave it new sheet + column IDs. We
    // translate each master cell's columnId to the copy's equivalent (matched
    // by column title) and write the same values. Best-effort; never blocks.
    const GROUP_COPY_SHEET_ID = '4758210073284484';
    const GROUP_ORIG_TO_COPY = {
      671286488764292:  5289756757102468, // GROUP ID
      8552585836662660: 3037956943417220, // Company Name
      5174886116134788: 7541556570787716, // Contact Name
      2923086302449540: 1912057036574596, // Contact E-mail
      2157300629671812: 6415656663945092, // Contact Phone
      6300786022977412: 4163856850259844, // Status
      4048986209292164: 6134181687234436, // Completed
      4893411139424132: 7260081594077060, // Travel Start Date
      2641611325738884: 1630582059863940, // Travel End Date
    };
    try {
      const copyCells = masterCells
        .map(c => ({ columnId: GROUP_ORIG_TO_COPY[c.columnId], value: c.value }))
        .filter(c => c.columnId);
      const copyRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${GROUP_COPY_SHEET_ID}/rows`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{ toBottom: true, cells: copyCells }])
      });
      if (!copyRes.ok) {
        const copyErr = await copyRes.json();
        console.error('KCG Agent group copy mirror failed:', copyErr.message);
      }
    } catch (copyErr) {
      console.error('KCG Agent group copy mirror error:', copyErr.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
