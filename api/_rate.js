// Usage guard for anonymous AI calls. Three layers, all of which fail open: if a counter cannot be
// reached the request is allowed, so normal use never breaks because of the guard.
//
// 1. Per-IP window: stops one visitor hammering the endpoint. Memory of one serverless instance.
// 2. Per-instance ceiling: stops a burst of many different IPs hitting one warm instance.
// 3. Shared daily budget (optional): counts every AI call in the existing Supabase project, so it is
//    a real cap across all instances. It switches on once the small `ai_usage` table exists (see
//    README, "AI usage guard") and stays off, without errors, until then.
const hits = new Map();
const instance = [];

const IP_LIMIT = { windowMs: 10 * 60 * 1000, max: 15 };
const INSTANCE_LIMIT = { windowMs: 60 * 60 * 1000, max: Number(process.env.AI_INSTANCE_HOURLY_LIMIT) || 300 };
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 1500;

const FALLBACK_URL = 'https://gmwieijbrrztukqpfwkg.supabase.co';
const FALLBACK_KEY = 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE';

function clientKey(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

function allow(req, { windowMs, max } = IP_LIMIT, bucket = 'ai') {
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

function instanceAllow() {
  const now = Date.now();
  while (instance.length && now - instance[0] >= INSTANCE_LIMIT.windowMs) instance.shift();
  if (instance.length >= INSTANCE_LIMIT.max) return { ok: false, retryAfterSec: Math.ceil((INSTANCE_LIMIT.windowMs - (now - instance[0])) / 1000) };
  instance.push(now);
  return { ok: true };
}

// Shared daily counter. Never throws; returns { ok: true } whenever anything is unclear.
const shared = { count: 0, day: '', checkedAt: 0, offUntil: 0 };

function sharedConfig() {
  const url = String(process.env.DVERSE_SUPABASE_URL || process.env.DQUEST_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
  const key = process.env.DVERSE_SUPABASE_SERVICE_ROLE_KEY || process.env.DQUEST_SUPABASE_SERVICE_ROLE_KEY
    || process.env.DVERSE_SUPABASE_KEY || process.env.DQUEST_SUPABASE_KEY || FALLBACK_KEY;
  return { url, key };
}

async function sharedFetch(path, init = {}) {
  const { url, key } = sharedConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    return await fetch(`${url}/rest/v1/${path}`, { ...init, signal: controller.signal, headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers || {}) } });
  } finally { clearTimeout(timer); }
}

// Never waits on the network: it decides from the last count it saw and refreshes in the background.
function refreshShared(day, now) {
  shared.checkedAt = now;
  sharedFetch(`ai_usage?select=id&day=eq.${day}&limit=1`, { headers: { Prefer: 'count=exact', Range: '0-0' } })
    .then((res) => {
      if (!res.ok) { shared.offUntil = Date.now() + 10 * 60 * 1000; return; }
      const total = Number(String(res.headers.get('content-range') || '').split('/')[1]);
      if (Number.isFinite(total)) shared.count = Math.max(shared.count, total);
    })
    .catch(() => { shared.offUntil = Date.now() + 5 * 60 * 1000; });
}

function sharedDailyAllow() {
  const now = Date.now();
  if (now < shared.offUntil) return { ok: true };
  try {
    const day = new Date(now).toISOString().slice(0, 10);
    if (shared.day !== day) { shared.day = day; shared.count = 0; shared.checkedAt = 0; }
    if (now - shared.checkedAt > 20000) refreshShared(day, now);
    if (shared.count >= DAILY_LIMIT) return { ok: false, retryAfterSec: 3600 };
    shared.count += 1;
    sharedFetch('ai_usage', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ day }) })
      .then((res) => { if (!res.ok) shared.offUntil = Date.now() + 10 * 60 * 1000; })
      .catch(() => {});
    return { ok: true };
  } catch {
    shared.offUntil = now + 5 * 60 * 1000;
    return { ok: true };
  }
}

// Returns { ok: true } or { ok: false, retryAfterSec, message }.
async function guard(req) {
  const ip = allow(req, IP_LIMIT);
  if (!ip.ok) return { ...ip, message: `Too many AI requests from this connection. Try again in ${Math.max(1, Math.ceil(ip.retryAfterSec / 60))} min.` };
  const inst = instanceAllow();
  if (!inst.ok) return { ...inst, message: 'D\'Quest is busy right now. Try again in a few minutes.' };
  const daily = sharedDailyAllow();
  if (!daily.ok) return { ...daily, message: 'The daily AI limit for D\'Quest has been reached. Try again tomorrow.' };
  return { ok: true };
}

module.exports = { allow, guard };
