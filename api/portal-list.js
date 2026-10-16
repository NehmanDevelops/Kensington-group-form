// Amgine Portal — file list. Lists every file in the repo via GitHub's Git
// Trees API (recursive), so the portal can show a file picker without the
// viewer needing to know anything about GitHub/git. Read-only.
//
// Env vars (Vercel): PORTAL_PASSWORD, PORTAL_GITHUB_TOKEN.

const REPO_OWNER = 'NehmanDevelops';
const REPO_NAME = 'Kensington-group-form';
const REPO_BRANCH = 'main';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (body.password !== process.env.PORTAL_PASSWORD) return res.status(401).json({ error: 'Wrong password' });

  const token = process.env.PORTAL_GITHUB_TOKEN;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.message || 'GitHub list failed' });
    const files = (j.tree || [])
      .filter((t) => t.type === 'blob')
      .map((t) => ({ path: t.path, size: t.size }))
      .sort((a, b) => a.path.localeCompare(b.path));
    return res.status(200).json({ ok: true, files });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
