// Amgine Portal — save an edit straight back to the real repo's main branch.
// This is the one write-capable endpoint in the portal: a successful call
// here is a real commit, and (since Vercel auto-deploys on push to main)
// the live site/API updates within ~30-60 seconds. No staging step, no
// review step — same as a direct push. Keep it that way deliberately
// (interim stopgap until IT transfers this repo to a company-owned
// account, see AMGINE_HANDOFF.md) rather than building a fake "safety"
// that isn't really there.
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
  const content = body.content;
  const sha = String(body.sha || '');
  const message = String(body.message || '').trim() || `Portal edit: ${path}`;
  if (!path || content == null || !sha) return res.status(400).json({ error: 'path, content, and sha are required' });

  const token = process.env.PORTAL_GITHUB_TOKEN;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `${message}\n\nCo-Authored-By: Amgine Portal <portal@kensingtoncorporate.com>`,
        content: Buffer.from(String(content), 'utf8').toString('base64'),
        sha,
        branch: REPO_BRANCH,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      // GitHub returns 409 when the sha you had is stale (someone/something
      // else changed the file since you loaded it) — surface that plainly.
      if (r.status === 409) return res.status(200).json({ ok: false, error: 'This file changed since you opened it — reload it and re-apply your edit.' });
      return res.status(200).json({ ok: false, error: j.message || 'GitHub save failed' });
    }
    return res.status(200).json({ ok: true, newSha: j.content?.sha, commitUrl: j.commit?.html_url });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
