async function fetchQuizzes() {
    const grid = document.getElementById('quiz-grid');
    
    let allQuizzes = [];

    // 1. Fetch from Supabase
    try {
        if (!window.hasSupabaseConfig || !window.hasSupabaseConfig()) {
            console.warn('Supabase is not configured. Using local quizzes only.');
        } else {
            const { url } = window.getSupabaseConfig();
            const headers = window.getSupabaseHeaders();
            const response = await fetch(`${url}/rest/v1/quizzes?select=*&order=created_at.desc`, { headers });

            if (response.ok) {
                const supabaseQuizzes = await response.json();
                allQuizzes = allQuizzes.concat(supabaseQuizzes);
            } else {
                console.warn('Supabase fetch failed:', await response.text());
            }
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
            <div class="col-span-full text-center py-6">
                <div class="win-window" style="display: inline-block; text-align: left; min-width: 280px;">
                    <div class="win-titlebar">
                        <span class="win-titlebar-icon">ℹ️</span>
                        <span>Information</span>
                        <div class="win-ctrl-btns ml-auto">
                            <div class="win-ctrl-btn" style="width:14px;height:12px;font-size:8px;">✕</div>
                        </div>
                    </div>
                    <div class="win-window-body" style="padding: 12px; display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 28px;">💾</span>
                        <p style="font-size: 11px; color: #000;">No quizzes yet. Generate one using D&apos;Ai above!</p>
                    </div>
                    <div class="win-statusbar" style="justify-content: center;">
                        <button class="win-btn win-btn-primary" onclick="this.closest('.win-window').remove()">OK</button>
                    </div>
                </div>
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
        card.className = "quiz-card-new";
        
        const questionCount = quiz.questions ? quiz.questions.length : 0;
        
        // Extract metadata - use AI-generated emoji if available, otherwise fallback
        const metadata = quiz.metadata || {};
        const emoji = metadata.emoji || getQuizEmoji(quiz.title);
        const grade = metadata.grade ? (typeof metadata.grade === 'number' ? `Grade ${metadata.grade}` : metadata.grade) : 'All Grades';
        const difficulty = metadata.difficulty || 'Medium';
        const topic = metadata.topic || extractTopic(quiz.title);
        
        console.log(`[RENDER] Card ${index + 1} metadata:`, { emoji, grade, difficulty, topic });

        card.innerHTML = `
            <!-- Card Title Bar (Win2k style) -->
            <div class="card-titlebar">
                <span style="font-size: 14px; line-height: 1;">${emoji}</span>
                <span class="truncate" style="font-size: 11px; max-width: 160px;">${quiz.title}</span>
                <div class="ml-auto win-ctrl-btns">
                    <div class="win-ctrl-btn" style="width: 14px; height: 12px; font-size: 8px;">_</div>
                    <div class="win-ctrl-btn" style="width: 14px; height: 12px; font-size: 8px;">□</div>
                    <div class="win-ctrl-btn" style="width: 14px; height: 12px; font-size: 8px;">✕</div>
                </div>
            </div>

            <!-- Card Body -->
            <div class="card-body">
                <!-- Topic line -->
                <div class="flex items-center gap-1 mb-2" style="font-size: 10px; color: var(--win-text-grey);">
                    <i data-lucide="book-open" class="w-3 h-3"></i>
                    <span>${topic}</span>
                </div>

                <!-- Metadata -->
                <div class="grid grid-cols-3 gap-2 mb-3">
                    <div class="quiz-meta-cell">
                        <div class="meta-label">Grade</div>
                        <div class="meta-value">${grade}</div>
                    </div>
                    <div class="quiz-meta-cell">
                        <div class="meta-label">Difficulty</div>
                        <div class="meta-value">${difficulty}</div>
                    </div>
                    <div class="quiz-meta-cell">
                        <div class="meta-label">Questions</div>
                        <div class="meta-value">${questionCount}</div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex flex-wrap gap-2 mt-auto">
                    <button class="start-quiz-btn kbc-button flex-1 win-btn-primary" style="gap: 4px; font-size: 10px; padding: 3px 8px;">
                        <i data-lucide="play" class="w-3 h-3"></i>
                        <span>Start Quiz</span>
                    </button>
                    <button class="live-quiz-btn win-btn flex-1" style="gap: 4px; font-size: 10px; padding: 3px 8px;">
                        <i data-lucide="broadcast" class="w-3 h-3"></i>
                        <span>Live</span>
                    </button>
                    <button class="preview-btn win-btn" style="padding: 3px 8px; min-width: 32px;">
                        <i data-lucide="eye" class="w-3 h-3"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners
        const startBtn = card.querySelector('.start-quiz-btn');
        const previewBtn = card.querySelector('.preview-btn');
        const liveBtn = card.querySelector('.live-quiz-btn');
        
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

// Show preview modal (Win2k dialog style)
function showPreview(quiz) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.style.background = 'rgba(0,0,128,0.25)';
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    let questionsHTML = '';
    if (quiz.questions && quiz.questions.length > 0) {
        questionsHTML = quiz.questions.map((q, i) => {
            const correctIdx = parseInt(q.correctIndex, 10);
            return `
            <div class="mb-3 win-sunken" style="padding: 6px; background: #fff;">
                <div style="font-weight: bold; font-size: 11px; margin-bottom: 4px; color: #000080;">Q${i + 1}. ${q.question}</div>
                <div>
                    ${q.options.map((opt, idx) => `
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 2px; color: ${idx === correctIdx ? '#006400' : '#333'}; font-weight: ${idx === correctIdx ? 'bold' : 'normal'};">
                            <span style="font-family: Tahoma, Arial; min-width: 16px;">${String.fromCharCode(65 + idx)})</span>
                            <span>${opt}</span>
                            ${idx === correctIdx ? '<span style="margin-left: auto; color: #006400;">&#10003;</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `}).join('');
    }
    
    const content = document.createElement('div');
    content.className = 'win-window';
    content.style.cssText = 'width: 100%; max-width: 560px; max-height: 80vh; display: flex; flex-direction: column;';
    content.innerHTML = `
        <div class="win-titlebar">
            <div class="win-titlebar-text">
                <span class="win-titlebar-icon">🔍</span>
                <span>Preview: ${quiz.title}</span>
            </div>
            <div class="win-ctrl-btns">
                <div class="win-ctrl-btn close-btn">✕</div>
            </div>
        </div>
        <div class="win-window-body" style="overflow-y: auto; flex: 1;">
            <div style="font-size: 11px; color: #444; margin-bottom: 8px;">
                ${quiz.questions ? quiz.questions.length : 0} Questions &bull; Preview mode shows correct answers
            </div>
            ${questionsHTML}
        </div>
        <div class="win-statusbar">
            <div style="flex:1;"></div>
            <button class="close-btn win-btn win-btn-primary" style="margin-left: auto;">Close</button>
        </div>
    `;
    
    content.querySelectorAll('.close-btn').forEach(btn => {
        btn.onclick = () => modal.remove();
    });
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    if (window.lucide) window.lucide.createIcons();
}

// Make fetchQuizzes, renderQuizzes, and showPreview available globally
window.fetchQuizzes = fetchQuizzes;
window.renderQuizzes = renderQuizzes;
window.showPreview = showPreview;
