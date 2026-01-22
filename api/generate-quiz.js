export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { topic, count = 5 } = await req.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.CEREBRAS_API_KEY ? process.env.CEREBRAS_API_KEY.trim() : null;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Cerebras API Key Missing' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = `You are a Quiz Generator. Output VALID JSON only.
Structure: { "title": "Topic Title", "questions": [{ "question": "...", "options": ["A","B","C","D"], "correctIndex": 0 }] }
Generate exactly ${count} questions about the topic.
Make questions challenging but fair.
Ensure the correctIndex is always a number between 0-3.
Do not include any markdown formatting or code blocks in your response.`;

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
        console.error('Cerebras API error:', err);
        return new Response(JSON.stringify({ 
          error: `Cerebras API Error: ${response.status}`, 
          details: err.substring(0, 200) 
        }), { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from Cerebras API');
    }
    
    let content = data.choices[0].message.content;
    // Clean up any markdown code blocks
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let quiz;
    try {
      quiz = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('AI generated invalid JSON. Please try again.');
    }

    // Validate quiz structure
    if (!quiz.title || !quiz.questions || !Array.isArray(quiz.questions)) {
      throw new Error('Invalid quiz structure from AI');
    }

    return new Response(JSON.stringify({ quiz }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Generate quiz error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to generate quiz'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
