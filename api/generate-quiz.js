export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  // 1. Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    let topic;
    try {
        const body = await req.json();
        topic = body.topic;
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
    }

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 });
    }

    // 2. Get the Key from Environment (Vercel)
    const apiKey = process.env.CEREBRAS_API_KEY; 

    if (!apiKey) {
      console.error("Missing CEREBRAS_API_KEY in environment variables");
      return new Response(JSON.stringify({ error: 'Server configuration error: Missing CEREBRAS_API_KEY in Vercel Settings' }), { status: 500 });
    }

    const systemPrompt = `
    You are a Quiz JSON Generator. 
    User will give a topic. 
    You must output ONLY valid JSON. 
    No markdown formatting, no explanations, no prologue. 
    Structure:
    {
      "id": "unique-id-${Date.now()}",
      "title": "Topic Title",
      "questions": [
        {
          "question": "Question text?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctIndex": 0 
        }
      ]
    }
    Generate exactly 5 questions. Ensure "correctIndex" is a number 0-3.
    `;

    // 3. Call Cerebras API
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama3.1-70b", 
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate a quiz about: ${topic}` }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("Cerebras API Error:", response.status, errText);
        // Return the actual upstream error to help debugging
        return new Response(JSON.stringify({ 
            error: `Cerebras API Error (${response.status})`, 
            details: errText 
        }), {
            status: response.status, // Forward 400/401/etc
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const data = await response.json();
    
    // 4. Send Data back to Frontend
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Quiz Generation Exception:", error);
    return new Response(JSON.stringify({ 
        error: 'Internal Server Error', 
        details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
