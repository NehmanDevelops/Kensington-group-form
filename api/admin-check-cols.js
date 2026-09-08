// TEMPORARY — read-only column verification. Delete after use.
export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const MASTER_SHEET_ID = '4820086761148292';
  const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${MASTER_SHEET_ID}?columnIds=`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const data = await r.json();
  const cols = (data.columns || []).map(c => ({ id: c.id, title: c.title, type: c.type }));
  return res.status(200).json({ cols });
}
