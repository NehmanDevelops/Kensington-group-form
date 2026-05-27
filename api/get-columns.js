export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const sheetId = req.query.sheet || '8780932377956228';
  const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}/columns`, {
    headers: { 'Authorization': `Bearer ${process.env.SMARTSHEET_API_TOKEN}` }
  });
  const data = await r.json();
  return res.status(200).json(data);
}
