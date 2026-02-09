module.exports = async function handler(req, res) {
  // Add CORS headers to all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Add timestamp to all logs
  const timestamp = new Date().toISOString();
  console.log(`[API ${timestamp}] ========== GENERATE QUIZ REQUEST ==========`);
  console.log('[API] Generate quiz handler called');
  console.log('[API] Method:', req.method);
  console.log('[API] URL:', req.url);
  console.log('[API] Headers:', JSON.stringify(req.headers));
  
  // Wrap entire handler in try-catch to prevent function crashes
  try {
    // Handle OPTIONS for CORS preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
      console.log('[API] Invalid method:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('[API] Parsing request body...');
    const body = req.body || {};
    console.log('[API] Request body:', JSON.stringify(body));
    
    if (!body || typeof body !== 'object') {
      console.log('[API] Invalid request body');
      return res.status(400).json({ error: 'Invalid request body' });
    }
    
    const { topic, count = 5 } = body;

    if (!topic) {
      console.log('[API] No topic provided');
      return res.status(400).json({ error: 'Topic required' });
    }

    console.log('[API] Checking for Cerebras API key...');
    console.log('[API] Environment variables available:', Object.keys(process.env).filter(k => k.includes('CEREBRAS') || k.includes('API')));
    const apiKey = process.env.CEREBRAS_API_KEY ? process.env.CEREBRAS_API_KEY.trim() : null;
    if (!apiKey) {
      console.log('[API] Cerebras API Key Missing in environment');
      console.log('[API] Please set CEREBRAS_API_KEY environment variable in Vercel');
      return res.status(500).json({ 
        error: 'Cerebras API Key Missing',
        hint: 'Set CEREBRAS_API_KEY in Vercel environment variables'
      });
    }
    console.log('[API] API key found, length:', apiKey.length);
    console.log('[API] API key prefix:', apiKey.substring(0, 10) + '...');

    const systemPrompt = `You are a Quiz Generator. Output VALID JSON only with the following structure:
{
  "title": "Topic Title",
  "metadata": {
    "grade": "1-12" (choose appropriate grade level as a number between 1 and 12),
    "topic": "Main subject area",
    "difficulty": "Easy/Medium/Hard",
    "emoji": "single emoji that represents the topic"
  },
  "questions": [
    {
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0
    }
  ]
}

Generate exactly ${count} questions.
Make questions challenging but fair.
Ensure the correctIndex is always a number between 0-3.
Choose an appropriate grade level (1-12) based on question difficulty.
Select ONE emoji that best represents the topic.
Do not include any markdown formatting or code blocks in your response.
Return only valid JSON.`;

    console.log('[API] Preparing Cerebras API request...');
    console.log('[API] User query:', topic);
    console.log('[API] Question count:', count);
    
    // Use the exact user query in the prompt
    const userPrompt = `Create a quiz based on this request: "${topic}"\n\nGenerate ${count} questions about this topic. Follow the JSON structure exactly.`;
    
    const apiRequestBody = {
      model: "llama3.1-8b", 
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 3000 // Increased for more questions
    };
    
    console.log('[API] Calling Cerebras API...');
    const startTime = Date.now();
    
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(apiRequestBody)
    });
    
    const apiCallDuration = Date.now() - startTime;
    console.log(`[API] Cerebras API responded in ${apiCallDuration}ms with status:`, response.status);

    if (!response.ok) {
      const err = await response.text();
      console.error('[API] Cerebras API error response:', err);
      return res.status(response.status).json({ 
        error: `Cerebras API Error: ${response.status}`, 
        details: err.substring(0, 200) 
      });
    }

    console.log('[API] Parsing Cerebras response...');
    const data = await response.json();
    console.log('[API] Response data structure:', JSON.stringify({
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length,
      hasMessage: !!data.choices?.[0]?.message,
      contentLength: data.choices?.[0]?.message?.content?.length
    }));
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[API] Invalid response structure from Cerebras API');
      throw new Error('Invalid response from Cerebras API');
    }
    
    let content = data.choices[0].message.content;
    console.log('[API] Raw AI response:', content);
    
    // Clean up any markdown code blocks
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    console.log('[API] Cleaned content:', content);

    console.log('[API] Parsing quiz JSON...');
    let quiz;
    try {
      quiz = JSON.parse(content);
      console.log('[API] Successfully parsed quiz:', JSON.stringify({
        title: quiz.title,
        hasMetadata: !!quiz.metadata,
        questionCount: quiz.questions?.length
      }));
    } catch (parseError) {
      console.error('[API] Failed to parse AI response:', content);
      console.error('[API] Parse error:', parseError.message);
      throw new Error('AI generated invalid JSON. Please try again.');
    }

    // Validate quiz structure
    console.log('[API] Validating quiz structure...');
    if (!quiz.title || !quiz.questions || !Array.isArray(quiz.questions)) {
      console.error('[API] Invalid quiz structure:', {
        hasTitle: !!quiz.title,
        hasQuestions: !!quiz.questions,
        isArray: Array.isArray(quiz.questions)
      });
      throw new Error('Invalid quiz structure from AI');
    }
    
    // Ensure metadata exists with defaults if not provided
    if (!quiz.metadata) {
      console.log('[API] Adding default metadata');
      quiz.metadata = {
        grade: 7, // Default to middle school grade as a number
        topic: topic,
        difficulty: "Medium",
        emoji: "🎯"
      };
    }
    
    console.log('[API] Quiz generated successfully!');
    console.log('[API] Final quiz:', JSON.stringify(quiz, null, 2));
    
    const totalDuration = Date.now() - startTime;
    console.log(`[API] Total generation time: ${totalDuration}ms`);

    return res.status(200).json({ quiz });

  } catch (error) {
    // Catch all errors
    console.error('[API] ========== ERROR OCCURRED ==========');
    console.error('[API] Generate quiz error:', error);
    console.error('[API] Error name:', error.name);
    console.error('[API] Error message:', error.message);
    console.error('[API] Error stack:', error.stack);
    console.error('[API] =======================================');
    return res.status(500).json({ 
      error: error.message || 'Failed to generate quiz',
      details: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}
