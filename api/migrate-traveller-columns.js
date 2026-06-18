// ONE-TIME MIGRATION — consolidate duplicate columns on the Traveller MasterSheet.
// Additive + de-duplicating + idempotent: it only fills the KEPT (destination)
// columns by combining the retiring columns' values. It never clears or deletes
// anything, so it's safe to re-run and easy to roll back (a full backup copy was
// taken first). Trigger with GET /api/migrate-traveller-columns?confirm=YES
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.query.confirm !== 'YES') {
    return res.status(400).json({ error: 'Add ?confirm=YES to run the migration.' });
  }
  const token = process.env.SMARTSHEET_API_TOKEN;
  const SHEET = '8780932377956228';

  // dest ← [sources]  (text columns: combine + dedupe)
  const GROUPS = [
    { dest: 3982892954062724, srcs: [3982892954062724, 323718256824196, 2575518070509444] }, // Rewards Number 1 ← 1,2,3
    { dest: 652472233529220,  srcs: [652472233529220, 8259788067868548, 2294043093798788] }, // Global Entry ← GE, Known Traveller, Traveler #
    { dest: 7133888161025924, srcs: [7133888161025924, 5156071860899716, 2856993047220100] }, // Meal Preference ← Meal, Meal Other, Food Pref
    { dest: 4882088347340676, srcs: [4882088347340676, 1168143186956164] },                   // Departure City ← Departure City, Departure Trip
    { dest: 2630288533655428, srcs: [2630288533655428, 605193233534852] },                    // Seat Preference ← Seat Pref, Seating
    { dest: 1504388626812804, srcs: [1504388626812804, 2904272047214468] },                   // Special Assistance ← SA, SA Details
    { dest: 2911763510366084, srcs: [2911763510366084, 6129139651481476] },                   // Nationality ← Nationality, Passport Nationality
  ];
  const DATE_DEST = 2067338580234116; // Submission Date (DATE)
  const DATE_SRC  = 42243280113540;   // Request Date (text)

  const norm = (s) => String(s == null ? '' : s).trim();
  const toDate = (v) => {
    const s = norm(v); if (!s) return '';
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) { let y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
    return '';
  };

  try {
    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${SHEET}?level=0`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sheet = await r.json();
    const updates = [];
    let changed = 0;

    for (const row of sheet.rows || []) {
      const cellVal = (cid) => {
        const c = (row.cells || []).find((x) => x.columnId === cid);
        return c ? norm(c.displayValue != null ? c.displayValue : c.value) : '';
      };
      const cells = [];

      for (const g of GROUPS) {
        const seen = new Set();
        const parts = [];
        for (const cid of g.srcs) {
          const v = cellVal(cid);
          if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); parts.push(v); }
        }
        const combined = parts.join('; ');
        if (combined && combined !== cellVal(g.dest)) {
          cells.push({ columnId: g.dest, value: combined });
        }
      }

      // Submission Date: fill only if empty, from a parseable Request Date
      if (!cellVal(DATE_DEST)) {
        const d = toDate(cellVal(DATE_SRC));
        if (d) cells.push({ columnId: DATE_DEST, value: d });
      }

      if (cells.length) { updates.push({ id: row.id, cells }); changed++; }
    }

    // write in batches of 100
    let written = 0;
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      const wr = await fetch(`https://api.smartsheet.com/2.0/sheets/${SHEET}/rows`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!wr.ok) { const e = await wr.json(); return res.status(502).json({ error: e.message, writtenSoFar: written }); }
      written += batch.length;
    }

    return res.status(200).json({ ok: true, rowsScanned: (sheet.rows || []).length, rowsUpdated: changed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
