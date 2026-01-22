async function fetchQuizzes() {
    const grid = document.getElementById('quiz-grid');
    
    // Use your Supabase URL from your env/config
    const SUPABASE_URL = "https://nlajpvlxckbgrfjfphzd.supabase.co";
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sYWpwdmx4Y2tiZ3JmamZwaHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MDgyNDQsImV4cCI6MjA4NDM4NDI0NH0.LKPu7hfb7iNwPuIn-WqR37XDwnSnwdWAPfV_IgXKF6c";

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?select=*&order=created_at.desc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!response.ok) throw new Error("Failed to fetch from Supabase");

        const quizzes = await response.json();
        
        if (quizzes.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i data-lucide="inbox" class="w-16 h-16 text-slate-600 mx-auto mb-4"></i>
                    <p class="text-slate-400 text-lg">No quizzes yet. Generate one using AI above!</p>
                </div>
            `;
            if(window.lucide) window.lucide.createIcons();
            return;
        }
        
        renderQuizzes(quizzes);

    } catch (error) {
        console.error("Error loading quizzes:", error);
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i data-lucide="alert-circle" class="w-16 h-16 text-red-400 mx-auto mb-4"></i>
                <p class="text-red-400 text-lg font-semibold mb-2">Error loading quizzes</p>
                <p class="text-slate-400 text-sm">${error.message}</p>
                <button onclick="fetchQuizzes()" class="mt-4 px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors">
                    Retry
                </button>
            </div>
        `;
        if(window.lucide) window.lucide.createIcons();
    }
}

function renderQuizzes(quizzes) {
    const grid = document.getElementById('quiz-grid');
    grid.innerHTML = ''; 

    quizzes.forEach(item => {
        const quiz = item.content; // Your JSON content
        const card = document.createElement('div');
        card.className = "quiz-card p-6 rounded-2xl flex flex-col justify-between h-56 group cursor-pointer";
        
        // When playing, pass the Supabase ID
        card.onclick = () => {
            window.location.href = `player.html?id=${item.id}`;
        };

        const questionCount = quiz.questions ? quiz.questions.length : 0;

        card.innerHTML = `
            <div>
                <div class="flex items-center gap-2 mb-3">
                    <i data-lucide="trophy" class="w-5 h-5 text-yellow-400"></i>
                    <span class="text-yellow-400 text-xs font-bold uppercase tracking-wider">Quiz Challenge</span>
                </div>
                <h3 class="text-2xl font-bold text-white mb-3 line-clamp-2 group-hover:text-yellow-300 transition-colors">${quiz.title}</h3>
                <div class="flex items-center gap-4 text-slate-400 text-sm">
                    <span class="flex items-center gap-1">
                        <i data-lucide="list" class="w-4 h-4"></i>
                        ${questionCount} Questions
                    </span>
                    <span class="flex items-center gap-1">
                        <i data-lucide="calendar" class="w-4 h-4"></i>
                        ${new Date(item.created_at).toLocaleDateString()}
                    </span>
                </div>
            </div>
            <button class="w-full mt-4 kbc-button text-black font-bold py-3 rounded-xl transition-all transform group-hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                <i data-lucide="play" class="w-5 h-5"></i>
                <span class="text-lg tracking-wider">PLAY NOW</span>
            </button>
        `;
        grid.appendChild(card);
    });
    
    // Re-initialize Lucide icons for dynamically created content
    if(window.lucide) window.lucide.createIcons();
}

// Make fetchQuizzes available globally
window.fetchQuizzes = fetchQuizzes;
