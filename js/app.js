// CONFIGURATION
const GITHUB_USERNAME = "DCode9"; 
const REPO_NAME = "d-quest";     
const QUIZZES_PATH = "quizzes";

document.addEventListener('DOMContentLoaded', () => {
    fetchQuizzes();
});

async function fetchQuizzes() {
    const grid = document.getElementById('quiz-grid');
    
    try {
        // Try fetching from GitHub API
        const response = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${QUIZZES_PATH}`);
        
        if (!response.ok) {
            // FALLBACK FOR DEMO / LOCAL USE
            console.warn("GitHub API fetch failed (likely config not set). Showing demo.");
            renderQuizzes([{ name: "demo-quiz.json" }]); 
            return;
        }

        const files = await response.json();
        const quizFiles = files.filter(file => file.name.endsWith('.json'));
        renderQuizzes(quizFiles);

    } catch (error) {
        console.error("Network error:", error);
        // Fallback on error too
        renderQuizzes([{ name: "demo-quiz.json" }]);
    }
}

function renderQuizzes(files) {
    const grid = document.getElementById('quiz-grid');
    grid.innerHTML = ''; // Clear loaders

    if (files.length === 0) {
        grid.innerHTML = `<p class="text-slate-400 col-span-3 text-center">No quizzes found.</p>`;
        return;
    }
    
    files.forEach(file => {
        const rawName = file.name.replace('.json', '').replace(/-/g, ' ');
        const title = rawName.replace(/\b\w/g, l => l.toUpperCase());

        const card = document.createElement('div');
        // This class string applies the CSS from css/style.css
        card.className = "quiz-card p-6 rounded-xl flex flex-col justify-between h-48 group cursor-pointer";
        card.onclick = () => playQuiz(file.name);

        card.innerHTML = `
            <div>
                <h3 class="text-xl font-bold text-yellow-500 mb-2 line-clamp-2 group-hover:text-yellow-400">${title}</h3>
                <div class="flex items-center text-slate-400 text-sm">
                    <i data-lucide="file-json" class="w-4 h-4 mr-2"></i>
                    <span>Ready to Play</span>
                </div>
            </div>
            <button class="w-full mt-4 bg-slate-700 group-hover:bg-yellow-500 group-hover:text-black text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                <i data-lucide="play" class="w-4 h-4"></i> PLAY
            </button>
        `;
        
        grid.appendChild(card);
    });
    
    if(window.lucide) window.lucide.createIcons();
}

function playQuiz(filename) {
    // If it's the demo fallback, don't pass a filename, game.js handles the default
    if (filename === 'demo-quiz.json') {
        window.location.href = `player.html`;
    } else {
        window.location.href = `player.html?quiz=${filename}`;
    }
}
