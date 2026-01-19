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
        renderQuizzes(quizzes);

    } catch (error) {
        console.error("Error loading quizzes:", error);
        grid.innerHTML = `<p class="text-red-400">Error loading quizzes.</p>`;
    }
}

function renderQuizzes(quizzes) {
    const grid = document.getElementById('quiz-grid');
    grid.innerHTML = ''; 

    quizzes.forEach(item => {
        const quiz = item.content; // Your JSON content
        const card = document.createElement('div');
        card.className = "quiz-card p-6 rounded-xl flex flex-col justify-between h-48 group cursor-pointer";
        
        // When playing, pass the Supabase ID
        card.onclick = () => {
            window.location.href = `player.html?id=${item.id}`;
        };

        card.innerHTML = `
            <div>
                <h3 class="text-xl font-bold text-yellow-500 mb-2 line-clamp-2">${quiz.title}</h3>
                <p class="text-slate-400 text-sm">Created: ${new Date(item.created_at).toLocaleDateString()}</p>
            </div>
            <button class="w-full mt-4 bg-slate-700 text-white font-bold py-2 rounded-lg group-hover:bg-yellow-500 group-hover:text-black transition-colors">
                PLAY
            </button>
        `;
        grid.appendChild(card);
    });
}
