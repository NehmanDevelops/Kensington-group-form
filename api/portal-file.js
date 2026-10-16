// Amgine Portal — read one file's current content + sha (the sha is needed
// to save an edit back — GitHub's Contents API requires it to know you're
// not overwriting someone else's newer change). Read-only.
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
  const path = String(body.path || '').replace(/^\/+/, '');
  if (!path) return res.status(400).json({ error: 'path is required' });

  const token = process.env.PORTAL_GITHUB_TOKEN;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${REPO_BRANCH}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.message || 'GitHub read failed' });
    if (j.encoding !== 'base64') return res.status(200).json({ ok: false, error: 'Not a text file — cannot edit here' });
    const content = Buffer.from(j.content, 'base64').toString('utf8');
    return res.status(200).json({ ok: true, path, content, sha: j.sha });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
