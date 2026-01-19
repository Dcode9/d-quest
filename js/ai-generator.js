// CONFIGURATION
// No GitHub tokens needed here anymore as the backend handles Supabase saving.

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
    updateStatus("Consulting Cerebras AI & Saving...", "text-blue-400");
    
    try {
        // 1. Call Backend (handles AI generation + Supabase Save)
        const response = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic })
        });

        // 2. Handle Errors (Including 504 Timeouts)
        if (!response.ok) {
            // Check specifically for Vercel Timeout (504)
            if (response.status === 504) {
                throw new Error("Timeout: AI generation took too long. Please try again.");
            }

            // Try to parse error message from JSON, fallback to text if HTML
            let errorMsg = `Server Error (${response.status})`;
            try {
                const errData = await response.json();
                if (errData.error) errorMsg = errData.error;
            } catch (e) {
                // Response wasn't JSON (likely Vercel HTML error page)
                console.warn("Non-JSON error response received");
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || "AI Generation Failed");
        }

        // 3. Success!
        // The backend has already saved it to Supabase, so we just finish up.
        updateStatus("Success! Quiz Saved to Database.", "text-green-400");
        
        setTimeout(() => {
            const input = document.getElementById('topic-input');
            if(input) input.value = '';
            
            // Clear status
            if(statusDiv) statusDiv.innerHTML = '';
            
            // Refresh Homepage List (Function defined in app.js)
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
