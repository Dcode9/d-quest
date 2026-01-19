// Removed 'edge' runtime config to default to standard Node.js Serverless functions.
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

    // 2. Configuration Check
    const cerebrasKey = process.env.CEREBRAS_API_KEY ? process.env.CEREBRAS_API_KEY.trim() : null;
    const supabaseUrl = process.env.SUPABASE_URL; // e.g. https://xyz.supabase.co
    const supabaseKey = process.env.SUPABASE_KEY; // Service Role Key preferred

    if (!cerebrasKey) {
      console.error("CRITICAL: CEREBRAS_API_KEY is missing.");
      return new Response(JSON.stringify({ error: 'Server Config Error: Missing AI Key' }), { status: 500, headers });
    }
    
    if (!supabaseUrl || !supabaseKey) {
       console.error("CRITICAL: SUPABASE_URL or SUPABASE_KEY is missing.");
       // We won't block generation, but saving will fail.
    }

    // 3. System Prompt
    const systemPrompt = `
    You are a Quiz JSON Generator. 
    User will give a topic. 
    You must output ONLY valid JSON. 
    No markdown formatting, no explanations, no prologue. 
    Structure:
    {
      "id": "gen-${Date.now()}",
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

    // 4. Call Cerebras API (with Timeout to prevent hanging)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const aiResponse = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cerebrasKey}`,
        'User-Agent': 'QuizApp/1.0'
      },
      body: JSON.stringify({
        model: "llama3.1-8b", 
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate a quiz about: ${topic}` }
        ],
        temperature: 0.7,
        max_tokens: 4000
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("Cerebras API Failure:", aiResponse.status, errText);
        return new Response(JSON.stringify({ error: `AI Provider Error: ${aiResponse.status}` }), { status: aiResponse.status, headers });
    }

    const aiData = await aiResponse.json();
    
    // 5. Parse and Clean the JSON from AI
    let generatedContent = aiData.choices[0].message.content;
    // Remove markdown code blocks if present
    generatedContent = generatedContent.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let quizJson;
    try {
        quizJson = JSON.parse(generatedContent);
    } catch (e) {
        console.error("Failed to parse AI response:", generatedContent);
        return new Response(JSON.stringify({ error: 'AI generated invalid JSON. Please try again.' }), { status: 500, headers });
    }

    // 6. Save to Supabase (if configured)
    let savedRecord = null;
    if (supabaseUrl && supabaseKey) {
        try {
            const saveResponse = await fetch(`${supabaseUrl}/rest/v1/quizzes`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation' // Return the inserted row
                },
                body: JSON.stringify({
                    topic: topic,
                    content: quizJson, // Assumes column 'content' is type jsonb
                    created_at: new Date().toISOString()
                })
            });

            if (saveResponse.ok) {
                const savedData = await saveResponse.json();
                savedRecord = savedData[0];
            } else {
                console.error("Supabase Save Error:", await saveResponse.text());
            }
        } catch (dbError) {
            console.error("Supabase Connection Error:", dbError);
        }
    }

    // 7. Return Result
    // We return the parsed quizJson directly so the frontend doesn't need to parse string content
    return new Response(JSON.stringify({
        success: true,
        quiz: quizJson,
        saved: !!savedRecord,
        id: savedRecord ? savedRecord.id : quizJson.id
    }), {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error("Handler Exception:", error);
    return new Response(JSON.stringify({ 
        error: 'Internal Server Error', 
        details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
