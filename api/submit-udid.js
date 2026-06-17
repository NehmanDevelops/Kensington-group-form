export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // "UDID Update Requests" sheet in the KCG MANAGER workspace.
  const SHEET_ID = '137792326684548';
  const COL = {
    agentName:   915513936220036,
    companyName: 5419113563590532,
    branchPcc:   3167313749905284,
    pnrInvoice:  7670913377275780,
    reason:      2041413843062660,
    pnr:         6545013470433156,
    invoice:     4293213656747908,
    udidNum:     8796813284118404,
    udidOld:     211826494443396,
    udidNew:     4715426121813892,
    submittedAt: 2463626308128644,
    status:      6967225935499140,
  };
  const token = process.env.SMARTSHEET_API_TOKEN;

  try {
    const b = req.body || {};

    const cells = [
      { columnId: COL.agentName,   value: String(b.agentName   || '') },
      { columnId: COL.companyName, value: String(b.companyName || '') },
      { columnId: COL.branchPcc,   value: String(b.branchPcc   || '') },
      { columnId: COL.pnrInvoice,  value: String(b.pnrInvoice  || '') },
      { columnId: COL.reason,      value: String(b.reason      || '') },
      { columnId: COL.pnr,         value: String(b.pnr         || '') },
      { columnId: COL.invoice,     value: String(b.invoice     || '') },
      { columnId: COL.udidNum,     value: String(b.udidNum     || '') },
      { columnId: COL.udidOld,     value: String(b.udidOld     || '') },
      { columnId: COL.udidNew,     value: String(b.udidNew     || '') },
      { columnId: COL.submittedAt, value: String(b.submittedAt || '') },
      { columnId: COL.status,      value: 'New' },
    ].filter(c => c.value !== '');

    // ── Write the request row ──
    const rowRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${SHEET_ID}/rows`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ toBottom: true, cells }]),
    });
    const rowData = await rowRes.json();
    if (!rowRes.ok) {
      return res.status(502).json({ error: rowData.message || 'Smartsheet write failed' });
    }
    const rowId = rowData.result && rowData.result[0] && rowData.result[0].id;

    // ── Attach the screenshot to the row (best-effort; never blocks) ──
    if (rowId && b.screenshot && b.screenshot.dataUrl) {
      try {
        const m = /^data:([^;]+);base64,(.*)$/.exec(b.screenshot.dataUrl);
        if (m) {
          const mime = m[1];
          const buf = Buffer.from(m[2], 'base64');
          const safeName = String(b.screenshot.name || 'screenshot.png').replace(/[^\w.\-]/g, '_');
          await fetch(`https://api.smartsheet.com/2.0/sheets/${SHEET_ID}/rows/${rowId}/attachments`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': mime,
              'Content-Disposition': `attachment; filename="${safeName}"`,
              'Content-Length': String(buf.length),
            },
            body: buf,
          });
        }
      } catch (attErr) {
        console.error('UDID screenshot attach failed:', attErr.message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
