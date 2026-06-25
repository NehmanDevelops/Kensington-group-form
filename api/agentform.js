// Agent quick-entry form -> writes a row into the Traveller Profile MasterSheet.
// Fields: Group ID, First Name, Last Name, Additional Agents.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(503).json({ error: 'SMARTSHEET_API_TOKEN not configured' });

  const MASTER_SHEET_ID = '8780932377956228'; // Traveller Profile MasterSheet
  const COL = {
    groupId:        5029597388509060, // Group ID
    firstName:      5726513277472644, // First Name
    lastName:       7978313091157892, // Last Name
    agentNotes:     886668210245508,  // Agent Notes  (additional agents go here)
    source:         6155241207926660, // Source
    submissionDate: 2067338580234116, // Submission Date
  };

  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!d.groupId || !d.firstName || !d.lastName) {
      return res.status(400).json({ error: 'Group ID, First Name and Last Name are required.' });
    }
    const today = new Date().toISOString().split('T')[0];

    const cells = [
      { columnId: COL.groupId,        value: String(d.groupId).trim() },
      { columnId: COL.firstName,      value: String(d.firstName).trim() },
      { columnId: COL.lastName,       value: String(d.lastName).trim() },
      { columnId: COL.agentNotes,     value: d.additionalAgents ? `Additional agent notes: ${String(d.additionalAgents).trim()}` : '' },
      { columnId: COL.source,         value: 'Agent Form' },
      { columnId: COL.submissionDate, value: today },
    ].filter(c => c.value !== '');

    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${MASTER_SHEET_ID}/rows`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ toBottom: true, cells }]),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.message || 'Smartsheet write failed' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
