// --- QUIZ CREATOR LOGIC ---
// Handles Manual Entry, AI Generation (Populating UI), and Supabase Saving.

// Endpoints
const API_GENERATE_URL = '/api/generate-quiz'; // Returns JSON only
const API_SAVE_URL = '/api/save-quiz';         // Saves JSON to DB

document.addEventListener('DOMContentLoaded', () => {
    // Bind buttons if they exist in the DOM
    const genBtn = document.getElementById('creator-generate-btn');
    const saveBtn = document.getElementById('creator-save-btn');
    const addBtn = document.getElementById('add-question-btn');
    
    if (genBtn) genBtn.addEventListener('click', handleAIGeneration);
    if (saveBtn) saveBtn.addEventListener('click', handleDatabaseSave);
    if (addBtn) addBtn.addEventListener('click', () => renderQuestionBlock());
});

// --- 1. AI GENERATION (Populates UI) ---
async function handleAIGeneration(e) {
    e.preventDefault();
    const topicInput = document.getElementById('creator-topic');
    const countInput = document.getElementById('creator-count');
    const statusDiv = document.getElementById('creator-status');

    if (!topicInput || !topicInput.value) {
        showStatus(statusDiv, "Please enter a topic first.", "text-red-400");
        return;
    }

    showStatus(statusDiv, "AI is drafting your quiz...", "text-blue-400");
    setLoading(true);

    try {
        const res = await fetch(API_GENERATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                topic: topicInput.value,
                count: parseInt(countInput?.value || 5)
            })
        });

        // Robust JSON parsing to catch Vercel HTML errors
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (err) {
            console.error("Raw response:", text);
            throw new Error(`Server Error: ${text.substring(0, 40)}...`);
        }

        if (!res.ok) throw new Error(data.error || "Generation failed");

        // Success - Populate the form
        populateQuizForm(data.quiz);
        showStatus(statusDiv, "Draft generated! You can edit below.", "text-green-400");

    } catch (err) {
        console.error(err);
        showStatus(statusDiv, `Error: ${err.message}`, "text-red-500");
    } finally {
        setLoading(false);
    }
}

// --- 2. UI MANIPULATION ---
function populateQuizForm(quizData) {
    // 1. Set Title
    const titleInput = document.getElementById('quiz-title');
    if (titleInput && quizData.title) titleInput.value = quizData.title;

    // 2. Clear existing questions
    const container = document.getElementById('questions-container');
    if (container) container.innerHTML = '';

    // 3. Render Question Blocks
    if (quizData.questions && Array.isArray(quizData.questions)) {
        quizData.questions.forEach(q => renderQuestionBlock(q));
    }
}

function renderQuestionBlock(data = null) {
    const container = document.getElementById('questions-container');
    if (!container) return;

    const id = Date.now() + Math.random(); // Unique ID for radio groups
    const div = document.createElement('div');
    div.className = "bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4 animate-fadeIn relative group";
    
    // Default values
    const qText = data ? data.question : "";
    const opts = data ? data.options : ["", "", "", ""];
    const correct = data ? data.correctIndex : 0;

    div.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <h4 class="text-slate-400 text-sm font-bold uppercase">Question</h4>
            <button type="button" onclick="this.closest('.relative').remove()" class="text-red-400 hover:text-red-300 transition-colors p-1">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
        <input type="text" class="q-input w-full bg-slate-900 border border-slate-600 rounded p-2 text-white mb-3 focus:border-yellow-500 outline-none" placeholder="Enter question text..." value="${escapeHtml(qText)}">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            ${opts.map((opt, i) => `
                <div class="flex items-center gap-2">
                    <input type="radio" name="correct-${id}" value="${i}" ${i === correct ? 'checked' : ''} class="accent-green-500 w-4 h-4 cursor-pointer" title="Mark as correct answer">
                    <input type="text" class="opt-input w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm focus:border-blue-500 outline-none" placeholder="Option ${String.fromCharCode(65+i)}" value="${escapeHtml(opt)}">
                </div>
            `).join('')}
        </div>
    `;

    container.appendChild(div);
    if (window.lucide) window.lucide.createIcons();
}

// --- 3. SAVING TO SUPABASE ---
async function handleDatabaseSave(e) {
    e.preventDefault();
    const statusDiv = document.getElementById('creator-status');
    const title = document.getElementById('quiz-title').value;
    
    if (!title) {
        showStatus(statusDiv, "Please enter a quiz title above.", "text-red-400");
        return;
    }

    // Scrape Data from DOM
    const questions = [];
    const blocks = document.querySelectorAll('#questions-container > div');
    
    blocks.forEach(block => {
        const qText = block.querySelector('.q-input').value;
        const optInputs = block.querySelectorAll('.opt-input');
        const correctRadio = block.querySelector('input[type="radio"]:checked');
        
        const options = Array.from(optInputs).map(i => i.value);
        // Default to 0 if none selected
        const correctIndex = correctRadio ? parseInt(correctRadio.value) : 0;

        // Only add if question has text
        if (qText.trim()) {
            questions.push({
                question: qText,
                options,
                correctIndex
            });
        }
    });

    if (questions.length === 0) {
        showStatus(statusDiv, "Add at least one question.", "text-red-400");
        return;
    }

    showStatus(statusDiv, "Saving to Supabase...", "text-yellow-400");

    try {
        const payload = {
            title,
            questions,
            id: `manual-${Date.now()}` // Backend should overwrite/handle ID
        };

        const res = await fetch(API_SAVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
             const errText = await res.text();
             throw new Error(errText);
        }

        showStatus(statusDiv, "Quiz Published Successfully!", "text-green-400");
        
        // Refresh list after delay
        setTimeout(() => {
            if (window.fetchQuizzes) window.fetchQuizzes();
            // Optional: scroll to list
            document.getElementById('quiz-grid')?.scrollIntoView({ behavior: 'smooth' });
        }, 1500);

    } catch (err) {
        console.error(err);
        showStatus(statusDiv, "Save Error: " + err.message, "text-red-500");
    }
}

// Helpers
function showStatus(el, msg, color) {
    if (!el) return;
    el.textContent = msg;
    el.className = `mt-3 text-sm font-bold ${color} animate-pulse`;
}

function setLoading(isLoading) {
    const btn = document.getElementById('creator-generate-btn');
    if (btn) {
        btn.disabled = isLoading;
        btn.style.opacity = isLoading ? '0.5' : '1';
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
