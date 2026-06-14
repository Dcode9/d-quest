module.exports = async function handler(req, res) {
  const FALLBACK_SUPABASE_URL = 'https://gmwieijbrrztukqpfwkg.supabase.co';
  const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE';

  function normalizeSupabaseUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
      const normalized = new URL(rawUrl.trim());
      return normalized.origin;
    } catch {
      return null;
    }
  }

  function buildSupabaseCandidates() {
    const envUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const fallbackUrl = normalizeSupabaseUrl(FALLBACK_SUPABASE_URL);
    const candidates = [];

    if (envUrl && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      candidates.push({ source: 'env-service-role', url: envUrl, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
    }
    if (envUrl && process.env.SUPABASE_KEY) {
      candidates.push({ source: 'env-supabase-key', url: envUrl, key: process.env.SUPABASE_KEY });
    }
    if (envUrl && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      candidates.push({ source: 'env-anon', url: envUrl, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
    }

    if (fallbackUrl && FALLBACK_SUPABASE_ANON_KEY) {
      candidates.push({ source: 'fallback-anon', url: fallbackUrl, key: FALLBACK_SUPABASE_ANON_KEY });
    }

    const seen = new Set();
    return candidates.filter((candidate) => {
      const hash = `${candidate.url}::${candidate.key}`;
      if (seen.has(hash)) return false;
      seen.add(hash);
      return true;
    });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const candidates = buildSupabaseCandidates();

    if (!candidates.length) {
      return res.status(500).json({
        error: 'Supabase config missing',
        hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) in Vercel env'
      });
    }

    const { id, q, limit } = req.query || {};
    const params = new URLSearchParams();
    params.set('select', '*');

    if (id) {
      params.set('id', `eq.${id}`);
    }

    if (q) {
      const safeQuery = String(q)
        .replace(/[(),]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // PostgREST or filter must be wrapped in parentheses.
      params.set(
        'or',
        `(topic.ilike.*${safeQuery}*,content->>title.ilike.*${safeQuery}*,content->metadata->>topic.ilike.*${safeQuery}*)`
      );
    }

    if (limit) {
      params.set('limit', String(limit));
    }

    if (!id) {
      params.set('order', 'created_at.desc');
    }

    let lastFailure = null;

    for (const candidate of candidates) {
      try {
        const response = await fetch(`${candidate.url}/rest/v1/quizzes?${params.toString()}`, {
          method: 'GET',
          headers: {
            apikey: candidate.key,
            Authorization: `Bearer ${candidate.key}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const quizzes = await response.json();
          return res.status(200).json({ quizzes });
        }

        const details = await response.text();
        lastFailure = { status: response.status, details, source: candidate.source };
      } catch (error) {
        lastFailure = {
          status: 500,
          details: error?.message || 'fetch failed',
          source: candidate.source
        };
      }
    }

    return res.status(lastFailure?.status || 500).json({
      error: 'DB Fetch Failed',
      details: lastFailure?.details || 'Unable to reach Supabase',
      source: lastFailure?.source || 'unknown'
    });
  } catch (error) {
    console.error('Fetch quizzes error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch quizzes' });
  }
};
