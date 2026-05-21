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
      companyName:        '1061015075983236',
      eventName:          '4438714796511108',
      arrivalDate:        '3699842982645636',
      departureDate:      '885093215539076',
      eventManagerName:   '5564614703353732',
      eventManagerEmail:  '3312814889668484',
      cabinClass:         '3136893029224324',
      approximatePassengers: '6037312193728388',
      economySeats:       '6565385116880772',
      premiumEconomySeats:'2800086341160836',
      businessClassSeats: '3424333530959748',
      firstClassSeats:    '8062704964546436',
    };

    // LIVE GROUP MASTERSHEET (sheet 4820086761148292) column IDs
    const MASTER = {
      companyName:   5174886116134788,
      groupName:     2923086302449540,
      status:        6300786022977412,
      completed:     4048986209292164,
      startDate:     4893411139424132,
      endDate:       2641611325738884,
      dateSubmitted: 5684353123520388,
    };

    const today = new Date().toISOString().split('T')[0];

    const masterCells = [
      { columnId: MASTER.companyName,   value: cellMap[INTAKE.companyName] || '' },
      { columnId: MASTER.groupName,     value: cellMap[INTAKE.eventName]   || '' },
      { columnId: MASTER.status,        value: 'New' },
      { columnId: MASTER.completed,     value: false },
      { columnId: MASTER.dateSubmitted, value: today },
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

    // ── Step 3: Send recap email via Resend ───────────────────────────────
    const recipientEmail = cellMap[INTAKE.eventManagerEmail];
    if (recipientEmail && process.env.RESEND_API_KEY) {
      const managerName  = cellMap[INTAKE.eventManagerName] || 'there';
      const eventName    = cellMap[INTAKE.eventName]        || '—';
      const companyName  = cellMap[INTAKE.companyName]      || '—';
      const arrivalDate  = cellMap[INTAKE.arrivalDate]      || '—';
      const departureDate= cellMap[INTAKE.departureDate]    || '—';
      const cabin        = cellMap[INTAKE.cabinClass]       || '—';
      const passengers   = cellMap[INTAKE.approximatePassengers] || '—';

      const cabinSummary = [];
      if (cellMap[INTAKE.economySeats])        cabinSummary.push(`Economy (${cellMap[INTAKE.economySeats]} seats)`);
      if (cellMap[INTAKE.premiumEconomySeats]) cabinSummary.push(`Premium Economy (${cellMap[INTAKE.premiumEconomySeats]} seats)`);
      if (cellMap[INTAKE.businessClassSeats])  cabinSummary.push(`Business Class (${cellMap[INTAKE.businessClassSeats]} seats)`);
      if (cellMap[INTAKE.firstClassSeats])     cabinSummary.push(`First Class (${cellMap[INTAKE.firstClassSeats]} seats)`);
      const cabinDisplay = cabinSummary.length ? cabinSummary.join(', ') : cabin;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f1e8;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border:1px solid #d9d2c2;">
    <div style="background:#1c1f24;padding:32px;text-align:center;">
      <p style="color:#b89968;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 8px;">Kensington Corporate</p>
      <h1 style="color:#f5f1e8;font-size:24px;margin:0;font-weight:400;">Group Travel Request Received</h1>
    </div>
    <div style="padding:40px 48px;">
      <p style="color:#2a2a28;font-size:15px;margin:0 0 24px;">Hi ${managerName},</p>
      <p style="color:#4a4a45;font-size:14px;line-height:1.7;margin:0 0 32px;">Your group travel request has been received. Your dedicated Kensington travel manager will be in contact within 24 business hours to finalize the details.</p>

      <div style="border:1px solid #d9d2c2;padding:24px;margin-bottom:32px;">
        <p style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#b89968;margin:0 0 16px;">Request Summary</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;width:45%;">Event / Group Name</td><td style="padding:6px 0;font-size:13px;font-weight:500;">${eventName}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Company</td><td style="padding:6px 0;font-size:13px;">${companyName}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Arrival Date</td><td style="padding:6px 0;font-size:13px;">${arrivalDate}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Departure Date</td><td style="padding:6px 0;font-size:13px;">${departureDate}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Approx. Passengers</td><td style="padding:6px 0;font-size:13px;">${passengers}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Cabin Class</td><td style="padding:6px 0;font-size:13px;">${cabinDisplay}</td></tr>
        </table>
      </div>

      <p style="color:#7d7a73;font-size:12px;line-height:1.6;margin:0;">If you need to make any changes or have questions, please contact your travel manager.</p>
    </div>
    <div style="background:#f5f1e8;padding:24px;text-align:center;border-top:1px solid #d9d2c2;">
      <p style="color:#7d7a73;font-size:12px;margin:0;">Kensington Corporate &nbsp;·&nbsp; groups@kensingtoncorporate.com</p>
    </div>
  </div>
</body>
</html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Kensington Corporate <onboarding@resend.dev>',
          to: [recipientEmail],
          subject: `Group Travel Request Received — ${eventName}`,
          html: emailHtml
        })
      }).catch(err => console.error('Email send failed:', err.message));
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
