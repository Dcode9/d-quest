module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const incomingContent = body.content && typeof body.content === 'object' ? body.content : null;

    const title = body.title || incomingContent?.title;
    const questions = body.questions || incomingContent?.questions;
    const metadata = body.metadata || incomingContent?.metadata;

    if (!title || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Invalid data: title and questions required' });
    }

    const content = {
      title,
      questions,
      ...(metadata ? { metadata } : {})
    };

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: 'Supabase config missing',
        hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) in Vercel env'
      });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/quizzes`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        topic: title,
        content,
        created_at: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Supabase save error:', err);
      return res.status(response.status).json({ error: 'DB Save Failed', details: err });
    }

    const rows = await response.json();
    const saved = rows?.[0] || null;

    return res.status(200).json({
      success: true,
      message: 'Quiz saved successfully',
      quiz: saved
    });
  } catch (error) {
    console.error('Save quiz error:', error);
    return res.status(500).json({ error: error.message || 'Failed to save quiz' });
  }
};
