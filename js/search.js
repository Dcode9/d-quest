// --- SEARCH & INSTANT QUIZ CREATION ---
// Handles search, AI generation, and displaying results

// Constants
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

const TOPICS = [
    'Physics', 'Chemistry', 'Biology', 'Mathematics',
    'History', 'Geography', 'Literature', 'Computer Science',
    'General Knowledge', 'Sports', 'Music', 'Art',
    '10 questions about Space', '5 questions about Ancient Rome'
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
    console.log('[SEARCH] ========== NEW SEARCH INITIATED ==========');
    const searchInput = document.getElementById('main-search');
    const statusDiv = document.getElementById('search-status');
    const query = searchInput.value.trim();
    
    console.log('[SEARCH] Query:', query);
    console.log('[SEARCH] Timestamp:', new Date().toISOString());
    
    if (!query) {
        console.log('[SEARCH] Empty query, aborting');
        showStatus(statusDiv, 'Please enter a topic or search query', 'text-red-400');
        return;
    }
    
    console.log('[SEARCH] Step 1: Searching database...');
    showStatus(statusDiv, 'Searching database...', 'text-blue-400');
    
    try {
        // Step 1: Search existing quizzes
        const searchStartTime = Date.now();
        const existingQuizzes = await searchDatabase(query);
        const searchDuration = Date.now() - searchStartTime;
        
        console.log(`[SEARCH] Database search completed in ${searchDuration}ms`);
        console.log('[SEARCH] Found quizzes:', existingQuizzes.length);
        
        if (existingQuizzes.length > 0) {
            // Show existing quizzes
            console.log('[SEARCH] Displaying existing quizzes');
            console.log('[SEARCH] Quiz titles:', existingQuizzes.map(q => q.content.title));
            showStatus(statusDiv, `Found ${existingQuizzes.length} quiz(zes)!`, 'text-green-400');
            await delay(500);
            showResults(existingQuizzes);
            console.log('[SEARCH] ========== SEARCH COMPLETED (EXISTING QUIZ) ==========');
            return;
        }
        
        // Step 2: No match found, generate with AI
        console.log('[SEARCH] No existing quizzes found');
        console.log('[SEARCH] Step 2: Generating new quiz with AI...');
        showStatus(statusDiv, `⏳ Creating quiz with AI... (this may take 5-${REQUEST_TIMEOUT_MS/1000} seconds)`, 'text-yellow-400');
        
        const genStartTime = Date.now();
        const newQuiz = await generateQuizInstantly(query);
        const genDuration = Date.now() - genStartTime;
        
        console.log(`[SEARCH] Quiz generation completed in ${genDuration}ms`);
        
        if (newQuiz) {
            console.log('[SEARCH] Quiz created successfully!');
            console.log('[SEARCH] Quiz title:', newQuiz.content.title);
            console.log('[SEARCH] Quiz has metadata:', !!newQuiz.content.metadata);
            showStatus(statusDiv, '✅ Quiz created! Ready to play.', 'text-green-400');
            await delay(500);
            showResults([newQuiz]);
            console.log('[SEARCH] ========== SEARCH COMPLETED (NEW QUIZ) ==========');
        }
        
    } catch (error) {
        console.error('[SEARCH] Search error:', error);
        console.error('[SEARCH] Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        showStatus(statusDiv, `❌ Error: ${error.message}`, 'text-red-500');
        console.log('[SEARCH] ========== SEARCH FAILED ==========');
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
    console.log('[SEARCH] Starting AI quiz generation for topic:', topic);
    console.log('[SEARCH] Timestamp:', new Date().toISOString());
    
    try {
        // Parse question count from topic if specified (e.g., "5 questions about physics")
        let questionCount = 5; // default
        let cleanTopic = topic;
        
        const countMatch = topic.match(/(\d+)\s*questions?/i);
        if (countMatch) {
            questionCount = parseInt(countMatch[1]);
            questionCount = Math.min(Math.max(questionCount, 1), 20); // Limit 1-20
            console.log('[SEARCH] Detected question count from query:', questionCount);
        }
        
        console.log('[SEARCH] Preparing fetch request to /api/generate-quiz');
        const requestBody = { 
            topic: topic, // Send the full user query
            count: questionCount
        };
        console.log('[SEARCH] Request body:', JSON.stringify(requestBody));
        
        const startTime = Date.now();
        console.log('[SEARCH] Sending request at:', startTime);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.error(`[SEARCH] Request timeout after ${REQUEST_TIMEOUT_MS/1000} seconds, aborting...`);
            controller.abort();
        }, REQUEST_TIMEOUT_MS);
        
        console.log(`[SEARCH] Timeout set to ${REQUEST_TIMEOUT_MS/1000} seconds`);
        
        let response;
        try {
            response = await fetch('/api/generate-quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            console.log('[SEARCH] Request completed, timeout cleared');
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                console.error('[SEARCH] Fetch aborted due to timeout');
                throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS/1000} seconds. The AI service may be slow or unavailable.`);
            }
            console.error('[SEARCH] Fetch error:', fetchError);
            throw new Error(`Network error: ${fetchError.message}`);
        }
        
        const fetchDuration = Date.now() - startTime;
        console.log(`[SEARCH] Fetch completed in ${fetchDuration}ms`);
        console.log('[SEARCH] Response status:', response.status);
        console.log('[SEARCH] Response ok:', response.ok);
        console.log('[SEARCH] Response headers:', Object.fromEntries(response.headers.entries()));
        
        const text = await response.text();
        console.log('[SEARCH] Response text length:', text.length);
        console.log('[SEARCH] Response text preview:', text.substring(0, 200));
        
        let data;
        
        try {
            console.log('[SEARCH] Attempting to parse response as JSON...');
            data = JSON.parse(text);
            console.log('[SEARCH] Successfully parsed JSON');
            console.log('[SEARCH] Response structure:', Object.keys(data));
        } catch (err) {
            console.error('[SEARCH] JSON parse error:', err.message);
            console.error('[SEARCH] Raw response that failed to parse:', text);
            throw new Error('Failed to parse server response. Server may have returned an error.');
        }
        
        if (!response.ok) {
            console.error('[SEARCH] Server returned error status:', response.status);
            console.error('[SEARCH] Error data:', data);
            throw new Error(data.error || 'Generation failed');
        }
        
        console.log('[SEARCH] Checking quiz data structure...');
        if (!data.quiz) {
            console.error('[SEARCH] Response missing quiz property');
            console.error('[SEARCH] Available properties:', Object.keys(data));
            throw new Error('Invalid response structure from server');
        }
        
        console.log('[SEARCH] Quiz received successfully!');
        console.log('[SEARCH] Quiz title:', data.quiz.title);
        console.log('[SEARCH] Question count:', data.quiz.questions?.length);
        console.log('[SEARCH] Has metadata:', !!data.quiz.metadata);
        if (data.quiz.metadata) {
            console.log('[SEARCH] Metadata:', JSON.stringify(data.quiz.metadata));
        }
        
        const totalDuration = Date.now() - startTime;
        console.log(`[SEARCH] Total time for quiz generation: ${totalDuration}ms`);
        
        // Return quiz in expected format
        const formattedQuiz = {
            id: `ai-${Date.now()}`,
            content: data.quiz,
            created_at: new Date().toISOString(),
            isAI: true,
            isTemp: true // Not saved to DB yet
        };
        
        console.log('[SEARCH] Returning formatted quiz:', JSON.stringify(formattedQuiz, null, 2));
        return formattedQuiz;
        
    } catch (error) {
        console.error('[SEARCH] AI Generation error:', error);
        console.error('[SEARCH] Error name:', error.name);
        console.error('[SEARCH] Error message:', error.message);
        console.error('[SEARCH] Error stack:', error.stack);
        throw new Error(`Failed to generate quiz: ${error.message}`);
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
