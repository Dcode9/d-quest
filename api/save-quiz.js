export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { title, questions } = await req.json();

    if (!title || !questions || questions.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid data: title and questions required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ error: 'Supabase Config Missing' }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/quizzes`, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
            topic: title,
            content: { title, questions },
            created_at: new Date().toISOString()
        })
    });

    if (!response.ok) {
        const err = await response.text();
        console.error('Supabase error:', err);
        return new Response(JSON.stringify({ error: 'DB Save Failed', details: err }), { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ success: true, message: 'Quiz saved successfully' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Save quiz error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
