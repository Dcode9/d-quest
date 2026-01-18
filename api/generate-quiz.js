export const config = {
  runtime: 'edge', // Optional: Use Edge runtime for speed, or remove for Node.js default
};

export default async function handler(req) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { topic } = await req.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Cerebras API Config
    // Ensure CEREBRAS_API_KEY is set in your Vercel Project Settings
    const apiKey = process.env.CEREBRAS_API_KEY; 

    if (!apiKey) {
      throw new Error("Missing Server-Side API Key");
    }

    const systemPrompt = `
    You are a Quiz JSON Generator. 
    User will give a topic. 
    You must output ONLY valid JSON. 
    No markdown formatting, no explanations. 
    Structure:
    {
      "id": "unique-id-string",
      "title": "Topic Title",
      "questions": [
        {
          "question": "Question text?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctIndex": 0 
        }
      ]
    }
    Generate 5 questions. Ensure "correctIndex" is a number 0-3.
    `;

    // 3. Call Cerebras
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama3.1-70b", // Or whichever model you prefer
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate a quiz about: ${topic}` }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    
    // 4. Return the result to the frontend
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Failed to generate quiz' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
