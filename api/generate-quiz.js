export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { topic, count = 5 } = await req.json();

    if (!topic) return new Response(JSON.stringify({ error: 'Topic required' }), { status: 400 });

    const apiKey = process.env.CEREBRAS_API_KEY ? process.env.CEREBRAS_API_KEY.trim() : null;
    if (!apiKey) return new Response(JSON.stringify({ error: 'Missing API Key' }), { status: 500 });

    const systemPrompt = `
    You are a Quiz Generator. Output VALID JSON only.
    Structure: { "title": "Topic Title", "questions": [{ "question": "...", "options": ["A","B","C","D"], "correctIndex": 0 }] }
    Generate exactly ${count} questions.
    `;

    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama3.1-8b", 
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate a quiz about: ${topic}` }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
        const err = await response.text();
        return new Response(JSON.stringify({ error: `Cerebras Error: ${response.status}`, details: err }), { status: response.status });
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    return new Response(JSON.stringify({ quiz: JSON.parse(content) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
