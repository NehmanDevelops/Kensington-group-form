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

    // LIVE GROUP MASTERSHEET (sheet 4820086761148292) column IDs
    const MASTER_SHEET_ID = '4820086761148292';
    const MASTER = {
      companyName:   5174886116134788,
      groupName:     2923086302449540,
      contactName:   7426685929820036,
      contactEmail:  1797186395606916,
      contactPhone:  2157300629671812,
      status:        6300786022977412,
      completed:     4048986209292164,
      startDate:     4893411139424132,
      endDate:       2641611325738884,
    };

    const masterCells = [
      { columnId: MASTER.companyName,  value: cellMap[INTAKE.companyName]      || '' },
      { columnId: MASTER.groupName,    value: cellMap[INTAKE.eventName]        || '' },
      { columnId: MASTER.contactName,  value: cellMap[INTAKE.eventManagerName] || '' },
      { columnId: MASTER.contactEmail, value: cellMap[INTAKE.eventManagerEmail]|| '' },
      { columnId: MASTER.contactPhone, value: cellMap[INTAKE.eventManagerPhone]|| '' },
      { columnId: MASTER.status,       value: 'New' },
      { columnId: MASTER.completed,    value: false },
    ];

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
        // Find the last row where any cell has a non-empty value
        let lastDataRowId = null;
        for (const row of sheetData.rows) {
          const hasData = row.cells?.some(c => c.value !== undefined && c.value !== null && c.value !== '');
          if (hasData) lastDataRowId = row.id;
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

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
