// TEMP one-shot admin endpoint — adds two email columns to the Group Travel
// Form Sheet and returns their new column IDs. DELETE after running.
export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const SHEET = '3569349083221892'; // Group Travel Form Sheet (intake)
  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    });

  try {
    const sheet = await (await api(`/sheets/${SHEET}`)).json();
    const existing = {};
    for (const c of sheet.columns) existing[c.title.trim().toLowerCase()] = c.id;
    let idx = sheet.columns.length;

    const want = [
      'Confirmation CC Email(s)',
      'Reporting Recipient Email(s)',
    ];

    const results = {};
    for (const title of want) {
      const key = title.trim().toLowerCase();
      if (existing[key]) { results[title] = existing[key]; continue; }
      const r = await api(`/sheets/${SHEET}/columns`, {
        method: 'POST',
        body: JSON.stringify([{ title, type: 'TEXT_NUMBER', index: idx++ }]),
      });
      const j = await r.json();
      results[title] = j.result?.[0]?.id || j;
    }
    return res.status(200).json({ ok: true, columns: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
