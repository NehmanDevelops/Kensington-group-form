// TEMP one-shot admin endpoint — points the test traveller's group at the good
// (Generic) branch GUIDs and clears the traveller's Amgine cells for a re-test.
// DELETE after running.
const MASTER = '8780932377956228';
const GROUPS = '4820086761148292';
const RAYMOND_ROW = '7043114858119044'; // Raymond Davis test row
const GOOD_BRANCH = 'b58b59ea-fd74-4b25-85e4-f3620fc06982';
const GOOD_POLICY = 'a3497199-6936-4035-bc3c-8c911f7ebc83';

export default async function handler(req, res) {
  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  const api = (path, opts = {}) =>
    fetch(`https://api.smartsheet.com/2.0${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
    });
  const idx = (sheet) => {
    const byTitle = {};
    for (const c of sheet.columns) byTitle[c.title.trim().toLowerCase()] = c.id;
    const id = (t) => byTitle[t.trim().toLowerCase()];
    const val = (row, t) => {
      const c = (row.cells || []).find(x => x.columnId === id(t));
      return c ? (c.value ?? c.displayValue ?? '') : '';
    };
    return { id, val };
  };

  try {
    const out = {};

    // 1. Master: find Raymond Davis row, read its Group ID, clear Amgine cells.
    const master = await (await api(`/sheets/${MASTER}`)).json();
    const M = idx(master);
    const rRow = (master.rows || []).find(r => String(r.id) === RAYMOND_ROW);
    if (!rRow) return res.status(404).json({ error: 'Raymond Davis row not found' });
    const groupId = String(M.val(rRow, 'Group ID')).trim();
    out.groupId = groupId;

    const clearCells = [];
    for (const title of ['Amgine Itinerary ID', 'Amgine Status', 'Amgine Link', 'Amgine Note']) {
      if (M.id(title)) clearCells.push({ columnId: M.id(title), value: '' });
    }
    await api(`/sheets/${MASTER}/rows`, { method: 'PUT', body: JSON.stringify([{ id: rRow.id, cells: clearCells }]) });
    out.clearedTravellerCells = clearCells.length;

    // 2. Groups: find the matching group row, set good branch + policy GUIDs.
    const groups = await (await api(`/sheets/${GROUPS}`)).json();
    const G = idx(groups);
    const gRow = (groups.rows || []).find(r => String(G.val(r, 'GROUP ID')).trim().toLowerCase() === groupId.toLowerCase());
    if (!gRow) return res.status(404).json({ error: `group "${groupId}" not found in groups sheet`, groupId });

    const setCells = [];
    if (G.id('Amgine Branch GUID')) setCells.push({ columnId: G.id('Amgine Branch GUID'), value: GOOD_BRANCH });
    if (G.id('Amgine Policy GUID')) setCells.push({ columnId: G.id('Amgine Policy GUID'), value: GOOD_POLICY });
    await api(`/sheets/${GROUPS}/rows`, { method: 'PUT', body: JSON.stringify([{ id: gRow.id, cells: setCells }]) });
    out.updatedGroupRow = gRow.id;
    out.branch = GOOD_BRANCH;
    out.policy = GOOD_POLICY;

    return res.status(200).json({ ok: true, ...out });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
