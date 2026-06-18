// Relays a UDID Update Request straight to the finance Power Automate flow,
// which logs it into the finance Excel table (and stores the screenshot).
// No Smartsheet involved. The browser posts here (same-origin, so no CORS issue);
// this function forwards server-side to the PA HTTP trigger.
//
// Set FINANCE_FLOW_URL in Vercel → Project Settings → Environment Variables to the
// Power Automate "When an HTTP request is received" URL once the flow is built.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const FLOW_URL = process.env.FINANCE_FLOW_URL;
  if (!FLOW_URL) {
    // Not wired yet — tell the caller, but the form's ServiceNow email path is unaffected.
    return res.status(503).json({ error: 'FINANCE_FLOW_URL not configured' });
  }

  try {
    const flowRes = await fetch(FLOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    if (!flowRes.ok) {
      const detail = await flowRes.text().catch(() => '');
      return res.status(502).json({ error: 'Flow returned an error', detail: detail.slice(0, 300) });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
