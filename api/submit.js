export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Step 1: Save to Group Travel intake sheet ──────────────────────────
    const intakeRes = await fetch('https://api.smartsheet.com/2.0/sheets/3569349083221892/rows', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const intakeData = await intakeRes.json();

    if (!intakeRes.ok) {
      return res.status(intakeRes.status).json({ error: intakeData.message || 'Smartsheet error' });
    }

    // ── Step 2: Mirror key fields to LIVE GROUP MASTERSHEET ───────────────
    // Build a lookup map: columnId → value from the submitted cells
    const cells = req.body?.cells || [];
    const cellMap = {};
    for (const cell of cells) {
      cellMap[String(cell.columnId)] = cell.value;
    }

    // Intake sheet column IDs for the fields we want to mirror
    const INTAKE = {
      companyName:  '1061015075983236',
      eventName:    '4438714796511108',
      arrivalDate:  '3699842982645636',
      departureDate:'885093215539076',
    };

    // LIVE GROUP MASTERSHEET (sheet 4820086761148292) column IDs
    const MASTER = {
      companyName: 5174886116134788,
      groupName:   2923086302449540,
      status:      6300786022977412,
      completed:   4048986209292164,
      startDate:   4893411139424132,
      endDate:     2641611325738884,
    };

    const masterCells = [
      { columnId: MASTER.companyName, value: cellMap[INTAKE.companyName] || '' },
      { columnId: MASTER.groupName,   value: cellMap[INTAKE.eventName]   || '' },
      { columnId: MASTER.status,      value: 'New' },
      { columnId: MASTER.completed,   value: false },
    ];

    if (cellMap[INTAKE.arrivalDate]) {
      masterCells.push({ columnId: MASTER.startDate, value: cellMap[INTAKE.arrivalDate] });
    }
    if (cellMap[INTAKE.departureDate]) {
      masterCells.push({ columnId: MASTER.endDate, value: cellMap[INTAKE.departureDate] });
    }

    const masterRes = await fetch('https://api.smartsheet.com/2.0/sheets/4820086761148292/rows', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ cells: masterCells }])
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
