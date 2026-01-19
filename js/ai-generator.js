// CONFIGURATION
const CONFIG = {
    // 1. Get Token: GitHub -> Settings -> Developer Settings -> Personal Access Tokens (Classic) -> Generate -> Check 'repo'.
    // 2. Paste here:
    githubToken: "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", 
    githubOwner: "Dcode9",
    githubRepo: "d-quest",
};

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
    updateStatus("Consulting Cerebras AI...", "text-blue-400");
    
    try {
        // 1. Call YOUR Backend (api/generate-quiz.js)
        const response = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic })
        });

        if (!response.ok) throw new Error("AI Generation Failed");

        const data = await response.json();
        
        // 2. Extract content
        let jsonString = data.choices[0].message.content;
        
        // Clean markdown
        jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let quizObj;
        try {
            quizObj = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("JSON Parse Error:", jsonString);
            throw new Error("AI returned invalid JSON format");
        }

        // 3. Save to GitHub
        updateStatus("Saving to GitHub...", "text-yellow-400");
        
        const fileName = `${topic.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
        const contentBase64 = btoa(JSON.stringify(quizObj, null, 2));

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

        if (!gitResponse.ok) {
            if (gitResponse.status === 404) throw new Error("Repo not found (Check Owner/Repo in config)");
            if (gitResponse.status === 401) throw new Error("Auth failed (Check GitHub Token)");
            throw new Error("GitHub Commit Failed");
        }

        updateStatus("Success! Refreshing...", "text-green-400");
        
        setTimeout(() => {
            document.getElementById('topic-input').value = '';
            statusDiv.innerHTML = '';
            if (window.fetchQuizzes) window.fetchQuizzes();
        }, 1500);

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "text-red-500");
    }
}

function updateStatus(msg, colorClass) {
    if(statusDiv) {
        statusDiv.className = `mt-3 text-sm font-semibold h-5 animate-pulse ${colorClass}`;
        statusDiv.textContent = msg;
    }
}
