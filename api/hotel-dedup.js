// Dedups contracted hotels against the existing Preferred Hotels (Booking Builder)
// rows. Power Automate reads both Excel tables and POSTs them here; this returns
// only the hotels that still need to be added, already mapped to the
// PreferredHotels LT_ column names. Keeps the fragile matching logic in code
// (String-normalized) instead of Power Automate's loose Excel typing — which is
// what caused the number/string dedup stragglers (e.g. 488, 1123).
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

    const norm = (v) => (v === null || v === undefined) ? '' : String(v).trim();

    // Property IDs already in the Booking Builder / Preferred Hotels file.
    const existing = new Set(preferred.map(r => norm(r.LT_HOD)).filter(Boolean));

    const seen = new Set();      // de-dupe within this batch too
    const newHotels = [];
    for (const row of contracted) {
      const hod = norm(row.Propertyid);
      if (!hod) continue;            // no property id → can't go to Booking Builder
      if (existing.has(hod)) continue;
      if (seen.has(hod)) continue;
      seen.add(hod);
      newHotels.push({
        LT_AccountNumber: norm(row['Account DK']),
        LT_CityCode:      norm(row['City Code']),
        LT_HotelChain:    norm(row.ChainCode),
        LT_HotelName:     norm(row.HotelName),
        LT_HOD:           hod,
        LT_CompanyName:   norm(row.Account),
      });
    }

    return res.status(200).json({ count: newHotels.length, newHotels });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
