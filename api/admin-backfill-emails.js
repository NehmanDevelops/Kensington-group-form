// TEMPORARY — one-time backfill of known agent emails into the Advisor
// Summary sheet's new Email column. Delete after use.
const ROSTER_SHEET_ID = '4629439471112068';
const ROSTER_NAME_COL = 7481264075739012;
const ROSTER_EMAIL_COL = 626461532524420;

const KNOWN_EMAILS = {
  'Ivana Petrovic': 'ivana.petrovic@kensingtoncorporate.com',
  'Lori Bartella': 'lori.bartella@kensingtoncorporate.com',
  'Cheryl Scheckel': 'cheryl.scheckel@kensingtoncorporate.com',
  'Jennifer Cardwell': 'jennifer.cardwell@kensingtoncorporate.com',
  'John Driscoll': 'john.driscoll@kensingtoncorporate.com',
  'Liam Mckeown': 'liam.mckeown@kensingtoncorporate.com',
  'Melissa Sawicki': 'melissa.sawicki@kensingtoncorporate.com',
  'Rami Itani': 'rami.itani@kensingtoncorporate.com',
  'Grace Northrop': 'grace.northrop@kensingtoncorporate.com',
  'Vera Perisic': 'vera.perisic@kensingtoncorporate.com',
};

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(503).json({ error: 'no token' });

  const sheetRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${ROSTER_SHEET_ID}?columnIds=${ROSTER_NAME_COL},${ROSTER_EMAIL_COL}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const sheet = await sheetRes.json();
  if (sheet.error || !sheet.rows) return res.status(502).json({ error: 'could not read sheet', detail: sheet });

  const updates = [];
  const skipped = [];
  for (const row of sheet.rows) {
    const nameCell = row.cells.find(c => c.columnId === ROSTER_NAME_COL);
    const name = nameCell && nameCell.value ? String(nameCell.value).trim() : '';
    if (name && KNOWN_EMAILS[name]) {
      updates.push({ id: row.id, cells: [{ columnId: ROSTER_EMAIL_COL, value: KNOWN_EMAILS[name] }] });
    } else if (name) {
      skipped.push(name);
    }
  }

  if (updates.length === 0) return res.status(200).json({ updated: 0, skipped });

  const putRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${ROSTER_SHEET_ID}/rows`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const putData = await putRes.json();
  if (!putRes.ok) return res.status(502).json({ error: putData.message || 'write failed', detail: putData });

  return res.status(200).json({ updated: updates.length, skipped });
}
