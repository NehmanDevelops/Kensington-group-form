// Password-gated read of the Finance Request submission log. Returns every
// agent who has ever submitted the form, with their last-submitted time and
// total submission count -- pulled from the same Redis hash log-finance-
// submission.js writes to.
//
// POST { "password": "..." } -> { ok: true, submissions: [...] } or 401.
//
// Env vars required: KV_REST_API_URL, KV_REST_API_TOKEN, FINANCE_TRACKER_PASSWORD

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kv(...args) {
  const path = args.map((a) => encodeURIComponent(a)).join('/');
  const res = await fetch(`${KV_URL}/${path}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) throw new Error(`KV command failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const expected = process.env.FINANCE_TRACKER_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'FINANCE_TRACKER_PASSWORD not configured' });
  if (String(body.password || '') !== expected) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV not configured' });

  try {
    const flat = await kv('hgetall', 'finance_submissions'); // [field, value, field, value, ...]
    const submissions = [];
    for (let i = 0; i < (flat || []).length; i += 2) {
      try {
        submissions.push(JSON.parse(flat[i + 1]));
      } catch (_) { /* skip a malformed entry rather than fail the whole list */ }
    }
    submissions.sort((a, b) => new Date(b.lastSubmittedAt) - new Date(a.lastSubmittedAt));
    return res.status(200).json({ ok: true, submissions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
