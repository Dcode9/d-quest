export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  // 1. Setup CORS Headers (Fixes potential browser blocking)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle Preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    let topic;
    try {
        const body = await req.json();
        topic = body.topic;
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
    }

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400, headers });
    }

    // 2. Get the Key from Environment
    const apiKey = process.env.CEREBRAS_API_KEY; 

    // Debug Log (Check Vercel Function Logs to see this)
    if (!apiKey) {
      console.error("CRITICAL: CEREBRAS_API_KEY is missing in Vercel Environment Variables.");
      return new Response(JSON.stringify({ error: 'Server Config Error: Missing API Key' }), { status: 500, headers });
    } else {
      console.log(`API Key detected. Starts with: ${apiKey.substring(0, 4)}...`);
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
        console.error("Cerebras API Failure:", response.status, errText);
        
        let userMessage = `Cerebras API Error (${response.status})`;
        if (response.status === 403 || response.status === 401) {
            userMessage = "Invalid Cerebras API Key. Please check your Vercel Environment Variables.";
        } else if (response.status === 429) {
            userMessage = "Rate limit exceeded. Try again later.";
        }

        return new Response(JSON.stringify({ 
            error: userMessage, 
            details: errText 
        }), {
            status: response.status, 
            headers 
        });
    }

    const data = await response.json();
    
    // 4. Send Data back to Frontend
    return new Response(JSON.stringify(data), {
      status: 200,
      headers,
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
