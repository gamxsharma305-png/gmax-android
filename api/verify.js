/**
 * POST /api/verify
 * Body: { code, deviceId }
 * Success → 15 days unlock, max 2 per 30-day window (stackable → 30 days).
 */
const {
  getSecret,
  verifyCode,
  normalizeDeviceId,
  UNLOCK_MS,
  MAX_PER_WINDOW,
  WINDOW_MS,
} = require('../lib/arolinks-key');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function redis(cmd, ...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data && data.result !== undefined ? data.result : data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = getSecret();
  if (!secret) {
    return res.status(500).json({ ok: false, error: 'KEY_SECRET not configured' });
  }

  const body = await readBody(req);
  const code = String(body.code || '').replace(/\D/g, '');
  const deviceId = normalizeDeviceId(body.deviceId);

  if (!/^\d{12}$/.test(code)) {
    return res.status(400).json({ ok: false, error: 'Invalid code format (need 12 digits)' });
  }
  if (!body.deviceId || deviceId.length < 4) {
    return res.status(400).json({ ok: false, error: 'deviceId required' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const rlKey = `rl:verify:${ip}`;
  try {
    const n = await redis('INCR', rlKey);
    if (n === 1) await redis('EXPIRE', rlKey, 60);
    if (typeof n === 'number' && n > 5) {
      return res.status(429).json({ ok: false, error: 'Too many requests. Wait 1 min.' });
    }
  } catch {}

  const negKey = `invalid_key:${code}`;
  try {
    const neg = await redis('GET', negKey);
    if (neg) {
      return res.status(400).json({ ok: false, error: 'Invalid code' });
    }
  } catch {}

  const check = verifyCode(code, deviceId, secret);
  if (!check.ok) {
    try {
      await redis('SET', negKey, '1', 'EX', 90);
    } catch {}
    return res.status(400).json({ ok: false, error: 'Invalid code' });
  }

  const historyKey = `gmax:keyhist:${deviceId}`;
  const now = Date.now();
  let history = [];
  try {
    const raw = await redis('GET', historyKey);
    if (raw) {
      history = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(history)) history = [];
    }
  } catch {
    history = [];
  }
  const recent = history.filter((t) => now - Number(t) < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    const oldest = Math.min(...recent.map(Number));
    const waitDays = Math.ceil((WINDOW_MS - (now - oldest)) / (24 * 60 * 60 * 1000));
    return res.status(403).json({
      ok: false,
      error: `Limit: 2 keys / 30 days. Try again in ~${waitDays} days`,
    });
  }

  const accessKey = `gmax:access:${deviceId}`;
  let base = now;
  try {
    const existing = await redis('GET', accessKey);
    if (existing) {
      const parsed = typeof existing === 'string' ? JSON.parse(existing) : existing;
      if (parsed && parsed.until && Number(parsed.until) > now) {
        base = Number(parsed.until);
      }
    }
  } catch {}

  const until = base + UNLOCK_MS;
  const record = {
    until,
    plan: '15d',
    method: 'arolinks',
    deviceId,
    activatedAt: now,
  };

  try {
    await redis('SET', accessKey, JSON.stringify(record));
    const ttlSec = Math.ceil((until - now) / 1000) + 86400;
    await redis('EXPIRE', accessKey, ttlSec);
    const newHist = [...recent, now];
    await redis('SET', historyKey, JSON.stringify(newHist), 'EX', Math.ceil(WINDOW_MS / 1000));
  } catch {}

  return res.status(200).json({
    ok: true,
    until,
    hours: 15 * 24,
    days: 15,
    plan: '15d',
    method: 'arolinks',
  });
};
