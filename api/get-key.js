/**
 * POST /api/get-key
 * Body: { deviceId }
 * Returns AroLinks shortUrl — raw code NEVER in response.
 */
const {
  getSecret,
  currentBucket,
  makeCode,
  normalizeDeviceId,
} = require('../lib/arolinks-key');

const GENERATE_BASE =
  process.env.CODE_REVEAL_BASE ||
  'https://auth.pwasmultiverse.workers.dev/generate?code=';

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = process.env.AROLINKS_TOKEN;
  const secret = getSecret();
  if (!token) {
    return res.status(500).json({ ok: false, error: 'AROLINKS_TOKEN not configured' });
  }
  if (!secret) {
    return res.status(500).json({ ok: false, error: 'KEY_SECRET not configured' });
  }

  const body = await readBody(req);
  const deviceId = normalizeDeviceId(body.deviceId);
  if (!body.deviceId || deviceId.length < 4) {
    return res.status(400).json({ ok: false, error: 'deviceId required' });
  }

  const bucket = currentBucket();
  const code = makeCode(deviceId, secret, bucket);

  const targetURL = GENERATE_BASE + encodeURIComponent(code);
  const apiUrl =
    'https://arolinks.com/api?api=' +
    encodeURIComponent(token) +
    '&url=' +
    encodeURIComponent(targetURL);

  try {
    const r = await fetch(apiUrl);
    const text = await r.text();
    let shortUrl = text.trim();
    try {
      const j = JSON.parse(text);
      shortUrl = j.shortenedUrl || j.shorturl || j.url || j.link || shortUrl;
    } catch {
      /* plain text URL */
    }
    if (!shortUrl || !/^https?:\/\//i.test(shortUrl)) {
      return res.status(502).json({
        ok: false,
        error: 'AroLinks failed',
        fallbackUrl: targetURL,
      });
    }
    return res.status(200).json({
      ok: true,
      shortUrl,
      fallbackUrl: targetURL,
      hours: 15 * 24,
      days: 15,
    });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: e instanceof Error ? e.message : 'AroLinks network error',
      fallbackUrl: targetURL,
    });
  }
};
