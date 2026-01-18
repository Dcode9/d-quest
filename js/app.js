// CONFIGURATION - UPDATE THESE
const GITHUB_USERNAME = "YOUR_USERNAME"; // e.g., "john-doe"
const REPO_NAME = "YOUR_REPO_NAME";      // e.g., "my-quiz-app"
// NOTE: For a public website, listing contents via API is readable. 
// However, the rate limit is 60 requests/hr for unauthenticated IP addresses.
// Consider generating a 'manifest.json' if you hit limits, but API works for small scale.

const QUIZZES_PATH = "quizzes";

document.addEventListener('DOMContentLoaded', () => {
    fetchQuizzes();
});

async function fetchQuizzes() {
    const grid = document.getElementById('quiz-grid');
    
    try {
        // 1. Fetch file list from GitHub API
        const response = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${QUIZZES_PATH}`);
        
        if (!response.ok) {
            // Fallback for local development if API fails (e.g. repo doesn't exist yet)
            console.warn("GitHub API failed or repo not found. Showing demo data.");
            renderQuizzes([{ name: "demo.json", download_url: "quizzes/demo.json" }]); 
            return;
        }

        const files = await response.json();
        
        // Filter for JSON files and exclude the 'generated' folder itself if returned
        const quizFiles = files.filter(file => file.name.endsWith('.json'));
        
        renderQuizzes(quizFiles);

    } catch (error) {
        console.error("Error loading quizzes:", error);
        grid.innerHTML = `<p class="text-red-400">Error loading quizzes. Please check console.</p>`;
    }
}

async function renderQuizzes(files) {
    const grid = document.getElementById('quiz-grid');
    grid.innerHTML = ''; // Clear loaders

    if (files.length === 0) {
        grid.innerHTML = `<p class="text-slate-400">No quizzes found.</p>`;
        return;
    }

    // Process each file to get its Title (requires fetching the JSON content)
    // To save bandwidth, we'll just use the filename formatted nicely, 
    // or you can fetch each json file if list is small. 
    // Let's format the filename for speed.
    
    files.forEach(file => {
        const rawName = file.name.replace('.json', '').replace(/-/g, ' ');
        // Capitalize words
        const title = rawName.replace(/\b\w/g, l => l.toUpperCase());

        const card = document.createElement('div');
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
    window.location.href = `player.html?quiz=${filename}`;
}
