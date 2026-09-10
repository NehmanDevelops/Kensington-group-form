// Logs a Finance Request form submission to Upstash Redis (via Vercel KV
// integration) so a manager can see who has submitted and when, regardless
// of which laptop/location they submitted from. Fire-and-forget from the
// browser -- never blocks the actual mailto submission flow.
//
// Storage: one Redis HASH ("finance_submissions"), keyed by a normalized
// agent name. Each field's value is a JSON blob: { agentName, requestType,
// company, lastSubmittedAt, submissionCount }. A hash naturally dedupes per
// agent and always holds their most recent submission.
//
// Env vars required (auto-set by the Vercel <-> Upstash integration):
//   KV_REST_API_URL, KV_REST_API_TOKEN

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

  if (!KV_URL || !KV_TOKEN) {
    // Fail silently-ish -- this is best-effort logging, never block the real submission.
    return res.status(200).json({ ok: false, reason: 'KV not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const agentName = String(body.agentName || '').trim();
    if (!agentName) return res.status(200).json({ ok: false, reason: 'no agentName' });

    const key = agentName.toLowerCase();
    const existingRaw = await kv('hget', 'finance_submissions', key);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;

    const entry = {
      agentName,
      requestType: String(body.requestType || '').trim(),
      company: String(body.company || '').trim(),
      lastSubmittedAt: new Date().toISOString(),
      submissionCount: (existing?.submissionCount || 0) + 1,
    };

    await kv('hset', 'finance_submissions', key, JSON.stringify(entry));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: false, reason: err.message });
  }
}
