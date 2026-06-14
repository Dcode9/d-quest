async function fetchQuizzes() {
    const grid = document.getElementById('quiz-grid');

    const localQuizFiles = [
        'demo.json',
        'general-knowledge.json',
        'science.json',
        'history.json',
        'geography.json',
        'technology.json',
        'Improvement_in_Food_Resources.json',
        'ai-employability-skills.json',
        'communication-skills.json',
        'english-grammar-grade-10.json',
        'green-skills.json'
    ];

    let allQuizzes = [];

    // 1. Fetch from Supabase
    try {
        const response = await fetch('/api/quizzes');

        if (response.ok) {
            const payload = await response.json();
            const supabaseQuizzes = Array.isArray(payload.quizzes) ? payload.quizzes : [];
            allQuizzes = allQuizzes.concat(supabaseQuizzes);
        }
    } catch (error) {
        console.warn("Could not fetch from Supabase:", error);
    }

    // 2. Fetch from local quizzes folder
    for (const file of localQuizFiles) {
        try {
            const response = await fetch(`quizzes/${file}`);
            if (response.ok) {
                const quizData = await response.json();
                // Format local quiz to match Supabase structure
                // Use a fixed date for local quizzes to ensure consistent ordering
                allQuizzes.push({
                    id: quizData.id || file.replace('.json', ''),
                    content: quizData,
                    created_at: '2024-01-01T00:00:00.000Z',
                    isLocal: true,
                    fileName: file
                });
            }
        } catch (error) {
            console.warn(`Could not load ${file}:`, error);
        }
    }

    // 3. Include quizzes saved locally on this device
    if (typeof getCustomQuizzes === 'function') {
        allQuizzes = getCustomQuizzes().concat(allQuizzes);
    }

    // 4. Render all quizzes
    if (allQuizzes.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i data-lucide="inbox" class="w-16 h-16 text-slate-600 mx-auto mb-4"></i>
                <p class="text-slate-400 text-lg">No quizzes yet. Generate one using AI above!</p>
            </div>
        `;
        if(window.lucide) window.lucide.createIcons();
        return;
    }
    
    renderQuizzes(allQuizzes);
}

function renderQuizzes(quizzes) {
    const grid = document.getElementById('quiz-grid');
    grid.innerHTML = ''; 
    
    console.log('[RENDER] Rendering quizzes:', quizzes.length);

    quizzes.forEach((item, index) => {
        const quiz = item.content; // Your JSON content
        console.log(`[RENDER] Quiz ${index + 1}:`, {
            title: quiz.title,
            hasMetadata: !!quiz.metadata,
            metadata: quiz.metadata,
            questionCount: quiz.questions?.length
        });
        
        const card = document.createElement('div');
        card.className = "quiz-card-new p-6 rounded-2xl flex flex-col h-auto group relative overflow-hidden";
        
        const questionCount = quiz.questions ? quiz.questions.length : 0;
        
        // Extract metadata - use AI-generated emoji if available, otherwise fallback
        const metadata = quiz.metadata || {};
        const emoji = metadata.emoji || getQuizEmoji(quiz.title);
        const grade = metadata.grade ? (typeof metadata.grade === 'number' ? `Grade ${metadata.grade}` : metadata.grade) : 'All Grades';
        const difficulty = metadata.difficulty || 'Medium';
        const topic = metadata.topic || extractTopic(quiz.title);
        
        console.log(`[RENDER] Card ${index + 1} metadata:`, { emoji, grade, difficulty, topic });

        card.innerHTML = `
            <!-- Emoji Thumbnail -->
            <div class="flex items-center gap-4 mb-4">
                <div class="text-6xl flex-shrink-0 w-20 h-20 flex items-center justify-center bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-xl">
                    ${emoji}
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-2xl font-bold text-white mb-1 line-clamp-2 group-hover:text-yellow-300 transition-colors">${quiz.title}</h3>
                    <div class="flex items-center gap-2 text-slate-400 text-xs">
                        <span class="flex items-center gap-1">
                            <i data-lucide="book-open" class="w-3 h-3"></i>
                            ${topic}
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- Metadata -->
            <div class="grid grid-cols-3 gap-2 mb-4 text-xs">
                <div class="bg-slate-800/50 rounded-lg p-2 text-center">
                    <div class="text-slate-400 mb-1">Grade</div>
                    <div class="text-white font-bold">${grade}</div>
                </div>
                <div class="bg-slate-800/50 rounded-lg p-2 text-center">
                    <div class="text-slate-400 mb-1">Difficulty</div>
                    <div class="text-white font-bold">${difficulty}</div>
                </div>
                <div class="bg-slate-800/50 rounded-lg p-2 text-center">
                    <div class="text-slate-400 mb-1">Questions</div>
                    <div class="text-white font-bold">${questionCount}</div>
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div class="flex flex-wrap gap-2 mt-auto">
                <button class="start-quiz-btn flex-1 kbc-button text-black font-bold py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                    <i data-lucide="play" class="w-4 h-4"></i>
                    <span>Start Quiz</span>
                </button>
                <button class="live-quiz-btn flex-1 bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-yellow-500/30 shadow-lg">
                    <i data-lucide="radio" class="w-4 h-4"></i>
                    <span>Live Quiz</span>
                </button>
                <button class="edit-quiz-btn bg-blue-700 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center" title="Edit quiz">
                    <i data-lucide="pencil" class="w-4 h-4"></i>
                </button>
                <button class="preview-btn bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center" title="Preview quiz">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const startBtn = card.querySelector('.start-quiz-btn');
        const previewBtn = card.querySelector('.preview-btn');
        const liveBtn = card.querySelector('.live-quiz-btn');
        const editBtn = card.querySelector('.edit-quiz-btn');
        
        startBtn.onclick = (e) => {
            e.stopPropagation();
            console.log('[RENDER] Starting quiz:', quiz.title);
            if (item.isLocal) {
                window.location.href = `player.html?quiz=${item.fileName}`;
            } else {
                window.location.href = `player.html?id=${item.id}`;
            }
        };
        
        previewBtn.onclick = (e) => {
            e.stopPropagation();
            console.log('[RENDER] Previewing quiz:', quiz.title);
            showPreview(quiz);
        };

        if (editBtn) {
            editBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.openQuizBuilder) window.openQuizBuilder(quiz, { id: item.id, mode: item.isAI ? 'edit-ai' : 'edit' });
            };
        }

        if (liveBtn) {
            liveBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.startLiveHost) {
                    window.startLiveHost(item);
                } else {
                    alert('Live hosting is not available right now.');
                }
            };
        }
        
        grid.appendChild(card);
    });
    
    console.log('[RENDER] Re-initializing Lucide icons');
    // Re-initialize Lucide icons for dynamically created content
    if(window.lucide) window.lucide.createIcons();
}

// Get emoji based on quiz topic
function getQuizEmoji(title) {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('space') || titleLower.includes('planet')) return '🚀';
    if (titleLower.includes('science') || titleLower.includes('chemistry')) return '🔬';
    if (titleLower.includes('history')) return '📜';
    if (titleLower.includes('geography') || titleLower.includes('world')) return '🌍';
    if (titleLower.includes('technology') || titleLower.includes('computer')) return '💻';
    if (titleLower.includes('math')) return '🔢';
    if (titleLower.includes('biology')) return '🧬';
    if (titleLower.includes('physics')) return '⚛️';
    if (titleLower.includes('literature') || titleLower.includes('book')) return '📚';
    if (titleLower.includes('art')) return '🎨';
    if (titleLower.includes('music')) return '🎵';
    if (titleLower.includes('sports')) return '⚽';
    return '🎯'; // Default emoji
}

// Extract topic from title
function extractTopic(title) {
    const topics = ['Science', 'History', 'Geography', 'Technology', 'Mathematics', 
                    'Biology', 'Physics', 'Chemistry', 'Literature', 'General Knowledge'];
    for (const topic of topics) {
        if (title.toLowerCase().includes(topic.toLowerCase())) {
            return topic;
        }
    }
    return 'General';
}

// Show preview modal
function showPreview(quiz) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn';
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    const content = document.createElement('div');
    content.className = 'bg-slate-900 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto';
    
    let questionsHTML = '';
    if (quiz.questions && quiz.questions.length > 0) {
        questionsHTML = quiz.questions.map((q, i) => {
            const correctIdx = parseInt(q.correctIndex, 10);
            return `
            <div class="mb-4 p-4 bg-slate-800 rounded-lg">
                <div class="font-bold text-yellow-400 mb-2">Q${i + 1}. ${q.question}</div>
                <div class="space-y-2">
                    ${q.options.map((opt, idx) => `
                        <div class="flex items-center gap-2 text-sm">
                            <span class="${idx === correctIdx ? 'text-green-400' : 'text-slate-400'}">${String.fromCharCode(65 + idx)})</span>
                            <span class="${idx === correctIdx ? 'text-green-400 font-bold' : 'text-slate-300'}">${opt}</span>
                            ${idx === correctIdx ? '<span class="text-green-400 ml-auto">✓</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `}).join('');
    }
    
    content.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <h2 class="text-2xl font-bold text-yellow-400">${quiz.title}</h2>
            <button class="close-btn text-slate-400 hover:text-white">
                <i data-lucide="x" class="w-6 h-6"></i>
            </button>
        </div>
        <div class="text-slate-300 text-sm mb-4">
            ${quiz.questions ? quiz.questions.length : 0} Questions • Preview mode shows correct answers
        </div>
        ${questionsHTML}
    `;
    
    const closeBtn = content.querySelector('.close-btn');
    closeBtn.onclick = () => modal.remove();
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    if (window.lucide) window.lucide.createIcons();
}

// Make fetchQuizzes, renderQuizzes, and showPreview available globally
window.fetchQuizzes = fetchQuizzes;
window.renderQuizzes = renderQuizzes;
window.showPreview = showPreview;

// --- QUIZ BUILDER MODAL (manual + AI edit/publish/local) ---
const CUSTOM_QUIZZES_KEY = 'dquest_custom_quizzes';

function getCustomQuizzes() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_QUIZZES_KEY) || '[]'); } catch { return []; }
}

function setCustomQuizzes(quizzes) {
    localStorage.setItem(CUSTOM_QUIZZES_KEY, JSON.stringify(quizzes));
}

function upsertLocalQuiz(quiz, existingId = null) {
    const id = existingId || quiz.id || `local-${Date.now()}`;
    const item = {
        id,
        content: { ...quiz, id },
        created_at: new Date().toISOString(),
        isCustomLocal: true,
        isTemp: true
    };
    const quizzes = getCustomQuizzes().filter((q) => q.id !== id);
    quizzes.unshift(item);
    setCustomQuizzes(quizzes);
    sessionStorage.setItem(`quiz_${id}`, JSON.stringify(item.content));
    return item;
}

function buildEmptyQuiz() {
    return {
        title: 'My Quiz',
        metadata: { topic: 'Custom', difficulty: 'Medium', grade: 'All Grades', emoji: '✍️' },
        questions: [{ question: '', options: ['', '', '', ''], correctIndex: 0 }]
    };
}

function openQuizBuilder(quiz = null, options = {}) {
    const sourceQuiz = JSON.parse(JSON.stringify(quiz || buildEmptyQuiz()));
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fadeIn';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="bg-slate-950 border border-yellow-500/30 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div class="flex items-start justify-between gap-4 mb-5">
                <div>
                    <h2 class="text-2xl font-extrabold text-yellow-400">${options.mode === 'edit-ai' ? 'Edit AI Quiz' : 'Create Your Own Quiz'}</h2>
                    <p class="text-slate-400 text-sm mt-1">Build manually, edit AI drafts, then publish or keep it local only.</p>
                </div>
                <button type="button" class="builder-close text-slate-400 hover:text-white"><i data-lucide="x" class="w-6 h-6"></i></button>
            </div>
            <div id="builder-status" class="hidden mb-4 text-sm font-bold"></div>
            <label class="block text-sm font-bold text-slate-300 mb-2" for="builder-title">Quiz title</label>
            <input id="builder-title" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-yellow-500 outline-none mb-4" value="${escapeHtml(sourceQuiz.title || '')}" placeholder="Enter a quiz title">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
                <input id="builder-topic" class="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none" value="${escapeHtml(sourceQuiz.metadata?.topic || 'Custom')}" placeholder="Topic">
                <input id="builder-grade" class="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none" value="${escapeHtml(String(sourceQuiz.metadata?.grade || 'All Grades'))}" placeholder="Grade">
                <select id="builder-difficulty" class="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none">
                    ${['Easy','Medium','Hard'].map(d => `<option value="${d}" ${String(sourceQuiz.metadata?.difficulty || 'Medium') === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <input id="builder-emoji" class="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none" value="${escapeHtml(sourceQuiz.metadata?.emoji || '✍️')}" placeholder="Emoji">
            </div>
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-lg font-bold text-white">Questions</h3>
                <button type="button" id="builder-add-question" class="px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold border border-yellow-500/30 flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Add Question</button>
            </div>
            <div id="builder-questions" class="space-y-4"></div>
            <div class="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button type="button" id="builder-save-local" class="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-slate-600">Keep Local Only</button>
                <button type="button" id="builder-publish" class="px-5 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold">Publish Quiz</button>
                <button type="button" id="builder-play" class="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold">Save & Play</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    const questionsEl = modal.querySelector('#builder-questions');
    const renderBuilderQuestion = (q = { question: '', options: ['', '', '', ''], correctIndex: 0 }) => {
        const id = `builder-${Date.now()}-${Math.random()}`;
        const block = document.createElement('div');
        block.className = 'builder-question bg-slate-900 border border-slate-700 rounded-xl p-4';
        block.innerHTML = `
            <div class="flex justify-between items-center mb-3"><span class="font-bold text-yellow-400">Question</span><button type="button" class="remove-question text-red-400 hover:text-red-300"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>
            <input class="builder-q w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white mb-3 outline-none" value="${escapeHtml(q.question || '')}" placeholder="Question text">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                ${(q.options || ['', '', '', '']).slice(0, 4).map((opt, i) => `<label class="flex items-center gap-2"><input type="radio" name="${id}" value="${i}" ${Number(q.correctIndex || 0) === i ? 'checked' : ''} class="accent-green-500"><input class="builder-opt flex-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none" value="${escapeHtml(opt || '')}" placeholder="Option ${String.fromCharCode(65 + i)}"></label>`).join('')}
            </div>`;
        block.querySelector('.remove-question').onclick = () => block.remove();
        questionsEl.appendChild(block);
    };
    (sourceQuiz.questions?.length ? sourceQuiz.questions : buildEmptyQuiz().questions).forEach(renderBuilderQuestion);

    const status = (message, cls = 'text-green-400') => {
        const el = modal.querySelector('#builder-status');
        el.className = `mb-4 text-sm font-bold ${cls}`;
        el.textContent = message;
    };
    const collect = () => {
        const questions = Array.from(modal.querySelectorAll('.builder-question')).map((block) => ({
            question: block.querySelector('.builder-q').value.trim(),
            options: Array.from(block.querySelectorAll('.builder-opt')).map((input) => input.value.trim()),
            correctIndex: Number(block.querySelector('input[type="radio"]:checked')?.value || 0)
        })).filter((q) => q.question && q.options.some(Boolean));
        return {
            id: options.id || sourceQuiz.id,
            title: modal.querySelector('#builder-title').value.trim(),
            metadata: {
                topic: modal.querySelector('#builder-topic').value.trim() || 'Custom',
                grade: modal.querySelector('#builder-grade').value.trim() || 'All Grades',
                difficulty: modal.querySelector('#builder-difficulty').value,
                emoji: modal.querySelector('#builder-emoji').value.trim() || '✍️'
            },
            questions
        };
    };
    const validate = (quizData) => {
        if (!quizData.title) return 'Please add a quiz title.';
        if (!quizData.questions.length) return 'Please add at least one complete question.';
        if (quizData.questions.some((q) => q.options.length < 4 || q.options.some((opt) => !opt))) return 'Each question needs four answer options.';
        return null;
    };
    const saveLocal = () => {
        const quizData = collect();
        const error = validate(quizData);
        if (error) { status(error, 'text-red-400'); return null; }
        const item = upsertLocalQuiz(quizData, options.id || quizData.id);
        status('Saved locally on this device.', 'text-green-400');
        if (window.fetchQuizzes) window.fetchQuizzes();
        return item;
    };
    modal.querySelector('.builder-close').onclick = () => modal.remove();
    modal.querySelector('#builder-add-question').onclick = () => { renderBuilderQuestion(); if (window.lucide) window.lucide.createIcons(); };
    modal.querySelector('#builder-save-local').onclick = saveLocal;
    modal.querySelector('#builder-play').onclick = () => { const item = saveLocal(); if (item) window.location.href = `player.html?id=${item.id}`; };
    modal.querySelector('#builder-publish').onclick = async () => {
        const quizData = collect();
        const error = validate(quizData);
        if (error) { status(error, 'text-red-400'); return; }
        status('Publishing quiz...', 'text-yellow-400');
        try {
            const response = await fetch('/api/save-quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: quizData }) });
            if (!response.ok) throw new Error(await response.text());
            status('Quiz published successfully!', 'text-green-400');
            if (window.fetchQuizzes) window.fetchQuizzes();
        } catch (error) {
            status(`Publish failed: ${error.message}`, 'text-red-400');
        }
    };
    if (window.lucide) window.lucide.createIcons();
}

window.openQuizBuilder = openQuizBuilder;

document.addEventListener('DOMContentLoaded', () => {
    const createQuizBtn = document.getElementById('create-quiz-btn');
    if (createQuizBtn) {
        createQuizBtn.addEventListener('click', () => {
            if (window.openQuizBuilder) window.openQuizBuilder();
        });
    }
});
