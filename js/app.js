async function fetchQuizzes() {
    const grid = document.getElementById('quiz-grid');
    
    // Use your Supabase URL from your env/config
    const SUPABASE_URL = "https://nlajpvlxckbgrfjfphzd.supabase.co";
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sYWpwdmx4Y2tiZ3JmamZwaHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MDgyNDQsImV4cCI6MjA4NDM4NDI0NH0.LKPu7hfb7iNwPuIn-WqR37XDwnSnwdWAPfV_IgXKF6c";

    let allQuizzes = [];

    // 1. Fetch from Supabase
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?select=*&order=created_at.desc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (response.ok) {
            const supabaseQuizzes = await response.json();
            allQuizzes = allQuizzes.concat(supabaseQuizzes);
        }
    } catch (error) {
        console.warn("Could not fetch from Supabase:", error);
    }

    // 2. Fetch from local quizzes folder
    const localQuizFiles = [
        'demo.json',
        'general-knowledge.json',
        'science.json',
        'history.json',
        'geography.json',
        'technology.json'
    ];

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

    // 3. Render all quizzes
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
            <div class="flex gap-2 mt-auto">
                <button class="start-quiz-btn flex-1 kbc-button text-black font-bold py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                    <i data-lucide="play" class="w-4 h-4"></i>
                    <span>Start Quiz</span>
                </button>
                <button class="preview-btn bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const startBtn = card.querySelector('.start-quiz-btn');
        const previewBtn = card.querySelector('.preview-btn');
        
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
        
        grid.appendChild(card);
    });
    
    console.log('[RENDER] Re-initializing Lucide icons');
    // Re-initialize Lucide icons for dynamically created content
    if(window.lucide) window.lucide.createIcons();
}
                <button class="preview-btn bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const startBtn = card.querySelector('.start-quiz-btn');
        const previewBtn = card.querySelector('.preview-btn');
        
        startBtn.onclick = (e) => {
            e.stopPropagation();
            if (item.isLocal) {
                window.location.href = `player.html?quiz=${item.fileName}`;
            } else {
                window.location.href = `player.html?id=${item.id}`;
            }
        };
        
        previewBtn.onclick = (e) => {
            e.stopPropagation();
            showPreview(quiz);
        };
        
        grid.appendChild(card);
    });
    
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
        questionsHTML = quiz.questions.map((q, i) => `
            <div class="mb-4 p-4 bg-slate-800 rounded-lg">
                <div class="font-bold text-yellow-400 mb-2">Q${i + 1}. ${q.question}</div>
                <div class="space-y-2">
                    ${q.options.map((opt, idx) => `
                        <div class="flex items-center gap-2 text-sm">
                            <span class="${idx === q.correctIndex ? 'text-green-400' : 'text-slate-400'}">${String.fromCharCode(65 + idx)})</span>
                            <span class="${idx === q.correctIndex ? 'text-green-400 font-bold' : 'text-slate-300'}">${opt}</span>
                            ${idx === q.correctIndex ? '<span class="text-green-400 ml-auto">✓</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
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

// Make fetchQuizzes available globally
window.fetchQuizzes = fetchQuizzes;
