export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const MANAGER_TRAVELLER = '8780932377956228';  // Traveller Profile MasterSheet
  const AGENT_TRAVELLER   = '7213505705889668';  // AGENT Traveller List

  // Matching columns between both sheets (same titles, different IDs)
  // Manager → Agent column mapping
  const COL_MAP = {
    // Manager col ID          → Agent col ID
    '1607343287865220': '6205526462730116',  // Row ID
    '5029597388509060': '3953726649044868',  // Group ID
    '6155241207926660': '8457326276415364',  // Source
    '5054810658475908': '294551951806340',   // Traveller Type
    '2797347930410884': '4798151579176836',  // Host Name
    '5726513277472644': '2546351765491588',  // First Name
    '3474713463787396': '7049951392862084',  // Middle Name
    '7978313091157892': '1420451858648964',  // Last Name
    '4516209625436036': '5924051486019460',  // Agent Assigned (CONTACT_LIST)
    '689867251289988':  '3672251672334212',  // Assigned (CHECKBOX)
    '5193466878660484': '8175851299704708',  // In progress (CHECKBOX)
    '2941667064975236': '857501905227652',   // Completed (CHECKBOX)
    '659963696680836':  '5361101532598148',  // Date of Birth
    '5163563324051332': '3109301718912900',  // Gender
    '2911763510366084': '7612901346283396',  // Nationality
    '7415363137736580': '1983401812070276',  // Email Address
    '1785863603523460': '6487001439440772',  // Phone Number
    '6289463230893956': '4235201625755524',  // Company Name
    '4037663417208708': '8738801253126020',  // Passport Number
    '8541263044579204': '5361101532598148',  // Passport Expiry Date — NOTE: will be handled separately
    '378488719970180':  '4657414090821508',  // Passport Country of Issue
    '4882088347340676': '2405614277136260',  // Departure City
    '2630288533655428': '6909213904506756',  // Seat Preference
    '7133888161025924': '1279714370293636',  // Meal Preference
    '1504388626812804': '5783313997664132',  // Special Assistance
    '6007988254183300': '3531514183978884',  // Airline Loyalty Programs
    '3756188440498052': '8035113811349380',  // Redress Number
    '652472233529220':  '5431470276775812',  // Global Entry Number (consolidated; was Known Traveller Number)
    '941438673391492':  '5220364044242820',  // Status
    '7696838114447236': '2968564230557572',  // Additional Notes
    '2067338580234116': '7472163857928068',  // Submission Date
  };

  // Key columns for dedup
  const MGR_ROW_ID  = 1607343287865220;  // Row ID on Manager
  const MGR_GROUP_ID = 5029597388509060; // Group ID on Manager
  const MGR_FIRST   = 5726513277472644;  // First Name on Manager
  const MGR_LAST    = 7978313091157892;  // Last Name on Manager
  const MGR_AGENT_ASSIGNED = 4516209625436036; // Agent Assigned (CONTACT_LIST)
  const MGR_ASSIGNED       = 689867251289988;  // Assigned (CHECKBOX)
  const MGR_IN_PROGRESS    = 5193466878660484;  // In progress (CHECKBOX)
  const MGR_COMPLETED      = 2941667064975236;  // Completed (CHECKBOX)

  const AGT_ROW_ID  = 6205526462730116;  // Row ID on Agent
  const AGT_GROUP_ID = 3953726649044868; // Group ID on Agent
  const AGT_FIRST   = 2546351765491588;  // First Name on Agent
  const AGT_LAST    = 1420451858648964;  // Last Name on Agent
  const AGT_AGENT_ASSIGNED = 5924051486019460; // Agent Assigned (CONTACT_LIST)
  const AGT_ASSIGNED       = 3672251672334212;  // Assigned (CHECKBOX)
  const AGT_IN_PROGRESS    = 8175851299704708;  // In progress (CHECKBOX)
  const AGT_COMPLETED      = 857501905227652;   // Completed (CHECKBOX)

  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    }).then(r => r.json());

  const cellVal = (row, colId) => {
    const c = row.cells?.find(c => c.columnId === colId);
    return c?.value ?? c?.displayValue ?? null;
  };

  try {
    // 1. Read both sheets
    const [mgrSheet, agtSheet] = await Promise.all([
      api(`/sheets/${MANAGER_TRAVELLER}`),
      api(`/sheets/${AGENT_TRAVELLER}`),
    ]);

    // 2. Build lookup of existing travellers in Agent sheet
    //    Key = "GroupID|FirstName|LastName" (case-insensitive) → Agent row
    const agentByKey = {};
    for (const row of agtSheet.rows) {
      const gid   = cellVal(row, AGT_GROUP_ID) || '';
      const first = cellVal(row, AGT_FIRST) || '';
      const last  = cellVal(row, AGT_LAST) || '';
      const key = `${gid}|${first}|${last}`.toLowerCase().trim();
      if (key !== '||') agentByKey[key] = row;
    }

    // 3. Separate into new rows vs existing rows that need updates
    const toSync = [];
    const toUpdate = [];

    // Fields that should always sync from Manager → Agent
    const SYNC_FIELDS = {
      [MGR_AGENT_ASSIGNED]: AGT_AGENT_ASSIGNED,  // Agent Assigned (CONTACT_LIST)
      [MGR_ASSIGNED]:       AGT_ASSIGNED,         // Assigned (CHECKBOX)
      [MGR_IN_PROGRESS]:    AGT_IN_PROGRESS,      // In progress (CHECKBOX)
      [MGR_COMPLETED]:      AGT_COMPLETED,         // Completed (CHECKBOX)
    };

    for (const row of mgrSheet.rows) {
      const gid   = cellVal(row, MGR_GROUP_ID) || '';
      const first = cellVal(row, MGR_FIRST) || '';
      const last  = cellVal(row, MGR_LAST) || '';
      const key = `${gid}|${first}|${last}`.toLowerCase().trim();
      if (key === '||') continue;

      const existingAgentRow = agentByKey[key];
      if (!existingAgentRow) {
        // New row — needs to be created
        toSync.push(row);
      } else {
        // Existing row — check if any sync fields changed
        const updateCells = [];
        for (const [mgrCol, agtCol] of Object.entries(SYNC_FIELDS)) {
          const mgrVal = cellVal(row, Number(mgrCol));
          const agtVal = cellVal(existingAgentRow, Number(agtCol));
          // Only push Manager value to Agent if Manager has a value and it differs
          if (mgrVal !== null && mgrVal !== undefined && mgrVal !== agtVal) {
            updateCells.push({ columnId: Number(agtCol), value: mgrVal });
          }
        }
        if (updateCells.length > 0) {
          toUpdate.push({ id: existingAgentRow.id, cells: updateCells });
        }
      }
    }

    let syncedCount = 0;
    let updatedCount = 0;

    // 4. Update existing rows with changed fields
    if (toUpdate.length > 0) {
      await api(`/sheets/${AGENT_TRAVELLER}/rows`, {
        method: 'PUT',
        body: JSON.stringify(toUpdate),
      });
      updatedCount = toUpdate.length;
    }

    // 5. Create new rows
    if (toSync.length > 0) {
      // Find last data row in Agent sheet for positioning
      let lastAgentRowId = null;
      for (const row of agtSheet.rows) {
        const first = cellVal(row, AGT_FIRST);
        const last  = cellVal(row, AGT_LAST);
        if (first || last) lastAgentRowId = row.id;
      }

      const newRows = toSync.map(row => {
        const cells = [];
        for (const [mgrColId, agtColId] of Object.entries(COL_MAP)) {
          const val = cellVal(row, Number(mgrColId));
          if (val !== null && val !== '' && val !== undefined) {
            cells.push({ columnId: Number(agtColId), value: val });
          }
        }

        const rowDef = { cells };
        if (lastAgentRowId) {
          rowDef.siblingId = lastAgentRowId;
        } else {
          rowDef.toBottom = true;
        }
        return rowDef;
      });

      await api(`/sheets/${AGENT_TRAVELLER}/rows`, {
        method: 'POST',
        body: JSON.stringify(newRows),
      });
      syncedCount = toSync.length;
    }

    if (syncedCount === 0 && updatedCount === 0) {
      return res.status(200).json({ synced: 0, updated: 0, message: 'All travellers already in sync' });
    }

    // 6. After syncing travellers, update advisor counts
    try {
      const baseUrl = req.headers?.host
        ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
        : 'https://kensington-group-form.vercel.app';
      await fetch(`${baseUrl}/api/update-advisor-counts`);
    } catch (e) {
      console.error('Advisor count update after traveller sync failed:', e.message);
    }

    return res.status(200).json({
      synced: syncedCount,
      updated: updatedCount,
      message: `Synced ${syncedCount} new, updated ${updatedCount} existing traveller(s)`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
