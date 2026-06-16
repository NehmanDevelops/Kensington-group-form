// TEMP admin helper — list workspaces/folders and move a sheet into a workspace.
// Delete after use.
//
//   GET  /api/admin-move-sheet                      → list workspaces + the
//                                                      "Excel Uploads" sheet id
//   GET  /api/admin-move-sheet?workspaceId=123      → list that workspace's folders
//   POST /api/admin-move-sheet  { sheetId, destinationType, destinationId }
//        destinationType: "workspace" | "folder"

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'Missing token' });

  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    }).then(r => r.json());

  try {
    if (req.method === 'GET') {
      const wsId = req.query?.workspaceId;
      if (wsId) {
        const ws = await api(`/workspaces/${wsId}`);
        return res.status(200).json({
          workspace: ws.name,
          folders: (ws.folders || []).map(f => ({ id: f.id, name: f.name })),
          sheets: (ws.sheets || []).map(s => ({ id: s.id, name: s.name })),
        });
      }
      const wsList = await api('/workspaces?includeAll=true');
      const sheetList = await api('/sheets?includeAll=true');
      const excel = (sheetList.data || []).find(s => s.name === 'Excel Uploads');
      return res.status(200).json({
        workspaces: (wsList.data || []).map(w => ({ id: w.id, name: w.name })),
        excelUploadsSheet: excel ? { id: excel.id, name: excel.name } : null,
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { sheetId, destinationType, destinationId } = body;
      if (!sheetId || !destinationType || !destinationId) {
        return res.status(400).json({ error: 'Need sheetId, destinationType, destinationId' });
      }
      const result = await api(`/sheets/${sheetId}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationType, destinationId }),
      });
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'GET or POST' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
