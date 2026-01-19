export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { title, questions } = await req.json();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ error: 'Supabase Config Missing' }), { status: 500 });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/quizzes`, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            topic: title, // Mapping 'title' to 'topic' column or 'title' column depending on your DB
            content: { title, questions }, // Storing full object in JSONB column
            created_at: new Date().toISOString()
        })
    });

    if (!response.ok) {
        const err = await response.text();
        return new Response(JSON.stringify({ error: 'DB Save Failed', details: err }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
