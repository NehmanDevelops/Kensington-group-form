export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const d = req.body;

    const today = new Date().toISOString().split('T')[0];

    const cells = [
      { columnId: 2862616417701764, value: d.groupId || '' },
      { columnId: 7366216045072260, value: d.firstName || '' },
      { columnId: 820513382633348,  value: d.middleName || '' },
      { columnId: 1736716510859140, value: d.lastName || '' },
      { columnId: 6240316138229636, value: d.dateOfBirth || '' },
      { columnId: 3988516324544388, value: d.gender || '' },
      { columnId: 8492115951914884, value: d.nationality || '' },
      { columnId: 329341627305860,  value: d.emailAddress || '' },
      { columnId: 7785700769697668, value: d.alternateEmail || '' },
      { columnId: 4832941254676356, value: d.expenseAccount || '' },
      { columnId: 2581141440991108, value: d.phoneNumber || '' },
      { columnId: 5732469239484292, value: d.phoneWork || '' },
      { columnId: 6946165391396740, value: d.phoneHome || '' },
      { columnId: 5536271777959812, value: d.companyName || '' },
      { columnId: 7084741068361604, value: d.passportNumber || '' },
      { columnId: 1455241534148484, value: d.passportExpiryDate || '' },
      { columnId: 1493589921402756, value: d.passportIssueDate || '' },
      { columnId: 5958841161518980, value: d.passportCountryOfIssue || '' },
      { columnId: 3707041347833732, value: d.knownTravellerNumber || '' },
      { columnId: 8210640975204228, value: d.globalEntryNumber || '' },
      { columnId: 892291580727172,  value: d.redressNumber || '' },
      { columnId: 2936149848133508, value: d.visaStatus || '' },
      { columnId: 6751222462975876, value: d.visaDetails || '' },
      { columnId: 8572212360810372, value: d.departureCity || '' },
      { columnId: 5395891208097668, value: d.seatPreference || '' },
      { columnId: 6321106721214340, value: d.seatLocation || '' },
      { columnId: 3144091394412420, value: d.mealPreference || '' },
      { columnId: 7647691021782916, value: d.mealPreferenceOther || '' },
      { columnId: 2018191487569796, value: d.specialAssistance || '' },
      { columnId: 6521791114940292, value: d.specialAssistanceDetails || '' },
      { columnId: 4269991301255044, value: d.airlineLoyaltyPrograms || '' },
      { columnId: 8773590928625540, value: d.additionalNotes || '' },
      { columnId: 188604138950532,  value: today },
      // New fields
      { columnId: 6037312193728388, value: d.approximatePassengers || '' },
      { columnId: 7946633462714244, value: Array.isArray(d.cabinClass) ? d.cabinClass.join(', ') : (d.cabinClass || '') },
      { columnId: 6390053009133444, value: d.economySeats || '' },
      { columnId: 8957554393911172, value: d.premiumEconomySeats || '' },
      { columnId: 5432314493702020, value: d.businessClassSeats || '' },
      { columnId: 2408654296092548, value: d.firstClassSeats || '' },
    ].filter(c => c.value !== '');

    // ── Save to Smartsheet ──
    const ssRes = await fetch('https://api.smartsheet.com/2.0/sheets/298113280462724/rows', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ toTop: true, cells }])
    });

    const ssData = await ssRes.json();
    if (!ssRes.ok) return res.status(ssRes.status).json({ error: ssData.message || 'Smartsheet error' });

    // ── Send recap email via Resend ──
    const recipientEmail = d.emailAddress;
    if (recipientEmail && process.env.RESEND_API_KEY) {
      const cabinSummary = [];
      if (d.economySeats)        cabinSummary.push(`Economy (${d.economySeats} seats)`);
      if (d.premiumEconomySeats) cabinSummary.push(`Premium Economy (${d.premiumEconomySeats} seats)`);
      if (d.businessClassSeats)  cabinSummary.push(`Business Class (${d.businessClassSeats} seats)`);
      if (d.firstClassSeats)     cabinSummary.push(`First Class (${d.firstClassSeats} seats)`);

      const loyaltyText = d.airlineLoyaltyPrograms
        ? `<tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Loyalty Programs</td><td style="padding:6px 0;font-size:13px;">${d.airlineLoyaltyPrograms}</td></tr>`
        : '';

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f1e8;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border:1px solid #d9d2c2;">
    <div style="background:#1c1f24;padding:32px;text-align:center;">
      <p style="color:#b89968;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 8px;">Kensington Corporate</p>
      <h1 style="color:#f5f1e8;font-size:24px;margin:0;font-weight:400;">Traveller Profile Received</h1>
    </div>
    <div style="padding:40px 48px;">
      <p style="color:#2a2a28;font-size:15px;margin:0 0 24px;">Hi ${d.firstName || 'Traveller'},</p>
      <p style="color:#4a4a45;font-size:14px;line-height:1.7;margin:0 0 32px;">Your traveller profile has been received. Your Kensington travel agent will be in touch shortly to confirm your details.</p>

      <div style="border:1px solid #d9d2c2;padding:24px;margin-bottom:32px;">
        <p style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#b89968;margin:0 0 16px;">Profile Summary</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;width:45%;">Group ID</td><td style="padding:6px 0;font-size:13px;font-weight:500;">${d.groupId || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Full Name</td><td style="padding:6px 0;font-size:13px;">${[d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ')}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Passport</td><td style="padding:6px 0;font-size:13px;">${d.passportNumber || '—'} (exp. ${d.passportExpiryDate || '—'})</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Seat Preference</td><td style="padding:6px 0;font-size:13px;">${[d.seatPreference, d.seatLocation].filter(Boolean).join(', ') || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Meal Preference</td><td style="padding:6px 0;font-size:13px;">${d.mealPreference || '—'}${d.mealPreferenceOther ? ' — ' + d.mealPreferenceOther : ''}</td></tr>
          <tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Cabin Class</td><td style="padding:6px 0;font-size:13px;">${cabinSummary.length ? cabinSummary.join(', ') : '—'}</td></tr>
          ${d.approximatePassengers ? `<tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Approx. Passengers</td><td style="padding:6px 0;font-size:13px;">${d.approximatePassengers}</td></tr>` : ''}
          ${loyaltyText}
          ${d.specialAssistance ? `<tr><td style="padding:6px 0;color:#7d7a73;font-size:13px;">Special Assistance</td><td style="padding:6px 0;font-size:13px;">${d.specialAssistance}</td></tr>` : ''}
        </table>
      </div>

      <p style="color:#7d7a73;font-size:12px;line-height:1.6;margin:0;">If you need to make any changes, please contact your travel agent.</p>
    </div>
    <div style="background:#f5f1e8;padding:24px;text-align:center;border-top:1px solid #d9d2c2;">
      <p style="color:#7d7a73;font-size:12px;margin:0;">Kensington Corporate &nbsp;·&nbsp; nehman.rahimi@kensingtoncorporate.com</p>
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
          subject: `Traveller Profile Received — Group ${d.groupId || ''}`,
          html: emailHtml
        })
      }).catch(err => console.error('Email send failed:', err.message));
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
