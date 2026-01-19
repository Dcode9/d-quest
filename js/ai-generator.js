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
        const response = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Generation Failed");
        }

        updateStatus("Success! Quiz Saved.", "text-green-400");
        
        // Refresh the homepage list to show the new quiz
        setTimeout(() => {
            document.getElementById('topic-input').value = '';
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
