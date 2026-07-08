// Dedups contracted hotels against the existing Preferred Hotels (Booking Builder)
// rows. Power Automate reads both Excel tables and POSTs them here; this returns
// only the hotels that still need to be added, already mapped to the
// PreferredHotels LT_ column names. Keeps the fragile matching logic in code
// (normalized) instead of Power Automate's loose Excel typing.
//
// Request  body: { "contracted": [ {Account, HotelName, ChainCode, Propertyid, "Account DK", "City Code"}, ... ],
//                  "preferred":  [ {LT_HOD, ...}, ... ] }
// Response body: { "count": <int>, "newHotels": [ {LT_AccountNumber, LT_CityCode, LT_HotelChain, LT_HotelName, LT_HOD, LT_CompanyName}, ... ] }
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const contracted = Array.isArray(body.contracted) ? body.contracted : [];
    const preferred  = Array.isArray(body.preferred)  ? body.preferred  : [];

    // Just trim — preserves the original value (casing, etc.) for what we write.
    const clean = (v) => (v === null || v === undefined) ? '' : String(v).trim();
    // Match key for de-dup ONLY: leading-zero- and case-insensitive ("00488" == "488").
    const matchKey = (v) => {
      const s = clean(v);
      if (s === '') return '';
      return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.toLowerCase();
    };
    // HOD to WRITE: strip leading zeros if numeric, otherwise keep as-is.
    const hodOut = (v) => {
      const s = clean(v);
      return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
    };

    // Property IDs already in the Booking Builder / Preferred Hotels file.
    const existing = new Set(preferred.map(r => matchKey(r.LT_HOD)).filter(Boolean));

    const seen = new Set();      // de-dupe within this batch too
    const newHotels = [];
    for (const row of contracted) {
      const key = matchKey(row.Propertyid);
      if (!key) continue;            // no property id → can't go to Booking Builder
      if (existing.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      newHotels.push({
        LT_AccountNumber: clean(row['Account DK']),
        LT_CityCode:      clean(row['City Code']),
        LT_HotelChain:    clean(row.ChainCode),
        LT_HotelName:     clean(row.HotelName),
        LT_HOD:           hodOut(row.Propertyid),
        LT_CompanyName:   clean(row.Account),
      });
    }

    return res.status(200).json({ count: newHotels.length, newHotels });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
