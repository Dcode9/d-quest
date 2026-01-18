// CONFIGURATION FOR AI & GITHUB
// WARNING: In a production static site, these keys are visible to users.
// For a personal project or demo, this is fine. For production, use a proxy server.

const CONFIG = {
    githubToken: "YOUR_GITHUB_PAT_TOKEN_HERE", // Must have 'repo' scope
    githubOwner: "YOUR_USERNAME",
    githubRepo: "YOUR_REPO_NAME",
    geminiKey: "YOUR_AI_API_KEY_HERE" // Or Cerebras Key
};

// --- SYSTEM PROMPT ---
const SYSTEM_PROMPT = `
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

const form = document.getElementById('ai-form');
const statusDiv = document.getElementById('generator-status');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const topic = document.getElementById('topic-input').value;
        if (!topic) return;
        
        await generateAndSaveQuiz(topic);
    });
}

async function generateAndSaveQuiz(topic) {
    updateStatus("Consulting AI...", "text-blue-400");
    
    try {
        // 1. CALL AI API (Gemini Example)
        // If using Cerebras, change URL to https://api.cerebras.ai/v1/chat/completions
        const aiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${CONFIG.geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${SYSTEM_PROMPT} Topic: ${topic}` }] }]
                })
            }
        );

        const aiData = await aiResponse.json();
        let jsonString = aiData.candidates[0].content.parts[0].text;
        
        // Clean markdown if AI ignored instructions
        jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
        const quizObj = JSON.parse(jsonString);

        // 2. PREPARE GITHUB COMMIT
        updateStatus("Saving to GitHub...", "text-yellow-400");
        
        const fileName = `${topic.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
        const contentBase64 = btoa(JSON.stringify(quizObj, null, 2)); // Encode to Base64

        // 3. CALL GITHUB API
        const gitUrl = `https://api.github.com/repos/${CONFIG.githubOwner}/${CONFIG.githubRepo}/contents/quizzes/${fileName}`;
        
        const gitResponse = await fetch(gitUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${CONFIG.githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `AI generated quiz: ${topic}`,
                content: contentBase64
            })
        });

        if (!gitResponse.ok) throw new Error("GitHub Commit Failed");

        updateStatus("Success! Refreshing...", "text-green-400");
        
        // Reload list
        setTimeout(() => {
            document.getElementById('topic-input').value = '';
            statusDiv.innerHTML = '';
            if (window.fetchQuizzes) window.fetchQuizzes();
        }, 1500);

    } catch (error) {
        console.error(error);
        updateStatus("Error: Check console/keys", "text-red-500");
    }
}

function updateStatus(msg, colorClass) {
    statusDiv.className = `mt-3 text-sm font-semibold h-5 animate-pulse ${colorClass}`;
    statusDiv.textContent = msg;
}
