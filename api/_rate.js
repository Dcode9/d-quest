// Best-effort per-IP rate limit for anonymous AI calls. State lives in the memory of one
// serverless instance, so it slows down abuse but is not a hard cap across instances.
const hits = new Map();

function clientKey(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

function allow(req, { windowMs, max }, bucket = 'ai') {
  const now = Date.now();
  const key = `${bucket}:${clientKey(req)}`;
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true };
}

module.exports = { allow };
