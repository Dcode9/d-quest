// --- SEARCH & INSTANT QUIZ CREATION ---
// Handles search, AI generation, and displaying results

const TOPICS = [
    'Physics', 'Chemistry', 'Biology', 'Mathematics',
    'History', 'Geography', 'Literature', 'Computer Science',
    'General Knowledge', 'Sports', 'Music', 'Art'
];

let currentTopicIndex = 0;
let isAnimating = false;

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('main-search');
    const searchBtn = document.getElementById('search-btn');
    const backBtn = document.getElementById('back-btn');
    
    if (searchInput) {
        // Start placeholder animation
        startPlaceholderAnimation(searchInput);
        
        // Handle enter key
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }
    
    if (backBtn) {
        backBtn.addEventListener('click', showLanding);
    }
});

// Animated placeholder
function startPlaceholderAnimation(input) {
    setInterval(() => {
        if (!isAnimating && !input.value && document.activeElement !== input) {
            isAnimating = true;
            animateToNextTopic(input);
        }
    }, 3000);
}

function animateToNextTopic(input) {
    const nextIndex = (currentTopicIndex + 1) % TOPICS.length;
    const currentText = input.placeholder;
    const targetText = `Search for ${TOPICS[nextIndex]}`;
    
    // Fade out current text
    let opacity = 1;
    const fadeOut = setInterval(() => {
        opacity -= 0.1;
        input.style.setProperty('--placeholder-opacity', opacity);
        if (opacity <= 0) {
            clearInterval(fadeOut);
            // Change text
            input.placeholder = targetText;
            currentTopicIndex = nextIndex;
            // Fade in new text
            let opacityIn = 0;
            const fadeIn = setInterval(() => {
                opacityIn += 0.1;
                input.style.setProperty('--placeholder-opacity', opacityIn);
                if (opacityIn >= 1) {
                    clearInterval(fadeIn);
                    isAnimating = false;
                }
            }, 50);
        }
    }, 50);
    
    // Occasionally show "Create with AI instantly"
    if (Math.random() > 0.7) {
        setTimeout(() => {
            input.placeholder = "Create with AI instantly";
        }, 1500);
    }
}

// Main search handler
async function handleSearch() {
    const searchInput = document.getElementById('main-search');
    const statusDiv = document.getElementById('search-status');
    const query = searchInput.value.trim();
    
    if (!query) {
        showStatus(statusDiv, 'Please enter a topic or search query', 'text-red-400');
        return;
    }
    
    showStatus(statusDiv, 'Searching database...', 'text-blue-400');
    
    try {
        // Step 1: Search existing quizzes
        const existingQuizzes = await searchDatabase(query);
        
        if (existingQuizzes.length > 0) {
            // Show existing quizzes
            showStatus(statusDiv, `Found ${existingQuizzes.length} quiz(zes)!`, 'text-green-400');
            await delay(500);
            showResults(existingQuizzes);
            return;
        }
        
        // Step 2: No match found, generate with AI
        showStatus(statusDiv, 'No match found. Creating new quiz with AI...', 'text-yellow-400');
        const newQuiz = await generateQuizInstantly(query);
        
        if (newQuiz) {
            showStatus(statusDiv, 'Quiz created! Ready to play.', 'text-green-400');
            await delay(500);
            showResults([newQuiz]);
        }
        
    } catch (error) {
        console.error('Search error:', error);
        showStatus(statusDiv, `Error: ${error.message}`, 'text-red-500');
    }
}

// Search database for existing quizzes
async function searchDatabase(query) {
    const allQuizzes = [];
    
    // 1. Search local quizzes
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
                // Check if title matches query
                if (quizData.title.toLowerCase().includes(query.toLowerCase())) {
                    allQuizzes.push({
                        id: quizData.id || file.replace('.json', ''),
                        content: quizData,
                        created_at: '2024-01-01T00:00:00.000Z',
                        isLocal: true,
                        fileName: file
                    });
                }
            }
        } catch (error) {
            console.warn(`Could not load ${file}:`, error);
        }
    }
    
    // 2. Search Supabase (if available)
    try {
        const SUPABASE_URL = "https://nlajpvlxckbgrfjfphzd.supabase.co";
        const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sYWpwdmx4Y2tiZ3JmamZwaHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY5ODYwMDgsImV4cCI6MjA1MjU2MjAwOH0.N1zVpGKQK7w0z6C8RW8rQZGpL7z-OIc7v3v8E5J8s8U";
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?select=*&topic=ilike.*${query}*&order=created_at.desc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        if (response.ok) {
            const supabaseQuizzes = await response.json();
            allQuizzes.push(...supabaseQuizzes);
        }
    } catch (error) {
        console.warn('Supabase search failed:', error);
    }
    
    return allQuizzes;
}

// Generate quiz instantly with AI
async function generateQuizInstantly(topic) {
    try {
        const response = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                topic: topic,
                count: 5
            })
        });
        
        const text = await response.text();
        let data;
        
        try {
            data = JSON.parse(text);
        } catch (err) {
            console.error("AI Response:", text);
            throw new Error('AI generation failed. Please try again.');
        }
        
        if (!response.ok) {
            throw new Error(data.error || 'Generation failed');
        }
        
        // Return quiz in expected format
        return {
            id: `ai-${Date.now()}`,
            content: data.quiz,
            created_at: new Date().toISOString(),
            isAI: true,
            isTemp: true // Not saved to DB yet
        };
        
    } catch (error) {
        console.error('AI Generation error:', error);
        throw new Error('Failed to generate quiz. Please try a different topic.');
    }
}

// Show results section
function showResults(quizzes) {
    const landingSection = document.getElementById('landing-section');
    const resultsSection = document.getElementById('results-section');
    
    // Hide landing, show results
    landingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    
    // Render quiz cards
    if (window.renderQuizzes) {
        window.renderQuizzes(quizzes);
    }
    
    // Re-init icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Show landing section
function showLanding() {
    const landingSection = document.getElementById('landing-section');
    const resultsSection = document.getElementById('results-section');
    const searchInput = document.getElementById('main-search');
    
    resultsSection.classList.add('hidden');
    landingSection.classList.remove('hidden');
    
    // Clear search input
    if (searchInput) {
        searchInput.value = '';
    }
}

// Utility functions
function showStatus(el, msg, colorClass) {
    if (!el) return;
    el.textContent = msg;
    el.className = `mt-6 text-center text-sm min-h-6 ${colorClass} animate-pulse`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
