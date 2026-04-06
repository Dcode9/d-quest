module.exports = async function handler(req, res) {
  const FALLBACK_SUPABASE_URL = 'https://apshufcfkoervmpizvoq.supabase.co';
  const FALLBACK_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwc2h1ZmNma29lcnZtcGl6dm9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDQxOTgsImV4cCI6MjA5MDYyMDE5OH0.71IdaYCvXdudadPOyE_M2dCNAz830AHuRQFXWITCd7g';

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
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      FALLBACK_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
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

    const response = await fetch(`${supabaseUrl}/rest/v1/quizzes?${params.toString()}`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(response.status).json({ error: 'DB Fetch Failed', details });
    }

    const quizzes = await response.json();
    return res.status(200).json({ quizzes });
  } catch (error) {
    console.error('Fetch quizzes error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch quizzes' });
  }
};
