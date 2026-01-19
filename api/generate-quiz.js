// Removed 'edge' runtime config to default to standard Node.js Serverless functions.
// This often resolves 403 Forbidden issues related to IP reputation or header handling in Edge environments.

export default async function handler(req) {
  // 1. Setup CORS Headers
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

    // 2. Get the Key
    const apiKey = process.env.CEREBRAS_API_KEY ? process.env.CEREBRAS_API_KEY.trim() : null; 

    // ANALYTICS: Collect debug info to return if it fails
    const debugInfo = {
        keyConfigured: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        keyPrefix: apiKey ? apiKey.substring(0, 4) : 'N/A',
        model: "llama3.1-8b",
        timestamp: new Date().toISOString()
    };

    if (!apiKey) {
      console.error("CRITICAL: CEREBRAS_API_KEY is missing.");
      return new Response(JSON.stringify({ 
          error: 'Server Config Error: Missing API Key',
          debug: debugInfo
      }), { status: 500, headers });
    }

    // 3. System Prompt
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

    // 4. Call Cerebras API
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'QuizApp/1.0' // Explicit User-Agent
      },
      body: JSON.stringify({
        model: debugInfo.model, 
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
        
        // Populate debug info with upstream error
        debugInfo.upstreamStatus = response.status;
        debugInfo.upstreamStatusText = response.statusText;
        debugInfo.upstreamBody = errText; // This contains the RAW reason from Cerebras

        let userMessage = `Cerebras API Error (${response.status})`;
        if (response.status === 403) {
            userMessage = "403 Forbidden. Check the 'upstreamBody' in debug info. The key might be invalid, expired, or blocked from this IP.";
        }

        return new Response(JSON.stringify({ 
            error: userMessage, 
            debug: debugInfo 
        }), {
            status: response.status, 
            headers 
        });
    }

    const data = await response.json();
    
    // 5. Success
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
