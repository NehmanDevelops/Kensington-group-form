// Finance Request submission tracker -- one function handling both the
// (public, fire-and-forget) write and the (password-gated) read, combined
// into a single file to stay under Vercel's 12-function cap on this project.
//
// POST { action: "log", agentName, requestType, company }
//   -> logs/updates this agent's most recent submission. No password needed
//      (called automatically by the form itself on every submit).
// POST { password: "..." }
//   -> { ok: true, submissions: [...] } if correct, 401 otherwise.
//
// Storage: one Redis HASH ("finance_submissions") via the Vercel KV
// (Upstash) integration, keyed by normalized agent name -- naturally dedupes
// per agent and always holds their most recent submission.
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

async function handleLog(body, res) {
  if (!KV_URL || !KV_TOKEN) return res.status(200).json({ ok: false, reason: 'KV not configured' });
  try {
    const agentName = String(body.agentName || '').trim();
    if (!agentName) return res.status(200).json({ ok: false, reason: 'no agentName' });

    const key = agentName.toLowerCase();
    const existingRaw = await kv('hget', 'finance_submissions', key);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;

    const entry = {
      agentName,
      requestType: String(body.requestType || '').trim(),
      company: String(body.company || '').trim(),
      recipient: String(body.recipient || '').trim(),
      details: String(body.details || ''),
      lastSubmittedAt: new Date().toISOString(),
      submissionCount: (existing?.submissionCount || 0) + 1,
    };

    await kv('hset', 'finance_submissions', key, JSON.stringify(entry));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: false, reason: err.message });
  }
}

async function handleRead(body, res) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (body.action === 'log') return handleLog(body, res);
  if (body.action === '__temp_delete') {
    // TEMP: one-off test-entry cleanup, remove this branch after use.
    if (String(body.password || '') !== process.env.FINANCE_TRACKER_PASSWORD) return res.status(401).end();
    const r = await kv('hdel', 'finance_submissions', body.key);
    return res.status(200).json({ deleted: r });
  }
  return handleRead(body, res);
}
