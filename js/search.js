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
    const headerSearchInput = document.getElementById('header-search-input');
    const headerSearchBtn = document.getElementById('header-search-btn');
    
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

    // Header search handlers
    if (headerSearchInput) {
        headerSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleHeaderSearch();
            }
        });
    }

    if (headerSearchBtn) {
        headerSearchBtn.addEventListener('click', handleHeaderSearch);
    }
});

// Handle header search
async function handleHeaderSearch() {
    const headerInput = document.getElementById('header-search-input');
    const query = headerInput.value.trim();
    
    if (!query) return;
    
    // Update main search input and trigger search
    const mainInput = document.getElementById('main-search');
    if (mainInput) {
        mainInput.value = query;
        await handleSearch();
    }
}

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
    const skeletonLoader = document.getElementById('skeleton-loader');
    const query = searchInput.value.trim();
    
    console.log('[SEARCH] Query:', query);
    console.log('[SEARCH] Timestamp:', new Date().toISOString());
    
    if (!query) {
        console.log('[SEARCH] Empty query, aborting');
        return;
    }
    
    // Transition center search bar up to become header
    transitionToHeaderSearch(query);
    
    // Show "Generating with D'Ai" text
    if (skeletonLoader) {
        skeletonLoader.classList.remove('hidden');
        skeletonLoader.classList.add('fade-in');
        if (window.lucide) window.lucide.createIcons();
    }
    
    console.log('[SEARCH] Step 1: Searching database...');
    
    try {
        // Step 1: Search existing quizzes
        const searchStartTime = Date.now();
        const existingQuizzes = await searchDatabase(query);
        const searchDuration = Date.now() - searchStartTime;
        
        console.log(`[SEARCH] Database search completed in ${searchDuration}ms`);
        console.log('[SEARCH] Found quizzes:', existingQuizzes.length);
        
        if (existingQuizzes.length > 0) {
            console.log('[SEARCH] Displaying existing quizzes');
            console.log('[SEARCH] Quiz titles:', existingQuizzes.map(q => q.content.title));
            showResults(existingQuizzes);
            console.log('[SEARCH] ========== SEARCH COMPLETED (EXISTING QUIZ) ==========');
            return;
        }
        
        // Step 2: No match found, generate with AI
        console.log('[SEARCH] No existing quizzes found');
        console.log('[SEARCH] Step 2: Generating new quiz with AI...');
        
        const genStartTime = Date.now();
        const newQuiz = await generateQuizInstantly(query);
        const genDuration = Date.now() - genStartTime;
        
        console.log(`[SEARCH] Quiz generation completed in ${genDuration}ms`);
        
        if (newQuiz) {
            console.log('[SEARCH] Quiz created successfully!');
            console.log('[SEARCH] Quiz title:', newQuiz.content.title);
            console.log('[SEARCH] Quiz has metadata:', !!newQuiz.content.metadata);
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
        
        // Hide generating text on error
        if (skeletonLoader) {
            skeletonLoader.classList.add('hidden');
            skeletonLoader.classList.remove('fade-out', 'fade-in');
        }
        
        alert(`Error: ${error.message}`);
        console.log('[SEARCH] ========== SEARCH FAILED ==========');
    }
}

// Phase 2: Transition search bar to header by animating the center bar upward
function transitionToHeaderSearch(query) {
    const landingSection = document.getElementById('landing-section');
    const branding = document.getElementById('branding');
    const mainSearchContainer = document.getElementById('main-search-container');
    const skeletonLoader = document.getElementById('skeleton-loader');
    
    // Fade out branding
    if (branding) {
        branding.style.opacity = '0';
        branding.style.transform = 'translateY(-20px)';
        branding.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    }
    
    // Animate landing section from centered to top
    if (landingSection) {
        landingSection.style.transition = 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
        landingSection.style.alignItems = 'flex-start';
        landingSection.style.justifyContent = 'flex-start';
        landingSection.style.paddingTop = '1rem';
        landingSection.style.paddingBottom = '0';
        landingSection.style.position = 'fixed';
        landingSection.style.top = '0';
        landingSection.style.left = '0';
        landingSection.style.right = '0';
        landingSection.style.zIndex = '40';
        landingSection.style.flex = 'none';
        landingSection.style.minHeight = 'auto';
        landingSection.style.background = 'rgba(15, 23, 42, 0.95)';
        landingSection.style.backdropFilter = 'blur(12px)';
        landingSection.style.borderBottom = '1px solid rgba(51, 65, 85, 0.7)';
    }
    
    // Shrink search bar for header mode
    if (mainSearchContainer) {
        mainSearchContainer.style.transition = 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
        const innerPill = mainSearchContainer.querySelector('.flex.items-center');
        if (innerPill) {
            innerPill.style.transition = 'all 0.5s ease';
            innerPill.style.padding = '0.5rem 1.5rem';
        }
        // Hide the glow effect behind search bar in header mode
        const glow = mainSearchContainer.querySelector('.blur-xl');
        if (glow) glow.style.display = 'none';
    }

    // Hide the skeleton in the animated header area (it'll show only during generation)
    // The skeleton/generating text is managed separately in handleSearch
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
        
        // Store AI-generated quiz in sessionStorage so it can be loaded by player
        console.log('[SEARCH] Storing AI quiz in sessionStorage for player access');
        sessionStorage.setItem(`quiz_${formattedQuiz.id}`, JSON.stringify(data.quiz));
        
        return formattedQuiz;
        
    } catch (error) {
        console.error('[SEARCH] AI Generation error:', error);
        console.error('[SEARCH] Error name:', error.name);
        console.error('[SEARCH] Error message:', error.message);
        console.error('[SEARCH] Error stack:', error.stack);
        throw new Error(`Failed to generate quiz: ${error.message}`);
    }
}

// Show results section with 2-second fade
function showResults(quizzes) {
    const landingSection = document.getElementById('landing-section');
    const resultsSection = document.getElementById('results-section');
    const landingContent = document.getElementById('landing-content');
    const skeletonLoader = document.getElementById('skeleton-loader');
    
    // Hide skeleton/generating text
    if (skeletonLoader) {
        skeletonLoader.classList.add('hidden');
        skeletonLoader.classList.remove('fade-in', 'fade-out');
    }
    
    // Hide the branding completely now
    const branding = document.getElementById('branding');
    if (branding) {
        branding.style.display = 'none';
    }
    
    // Show results with padding to avoid header overlap
    resultsSection.classList.remove('hidden');
    resultsSection.style.paddingTop = '6rem'; // space below the fixed search header
    resultsSection.classList.add('fade-transition', 'fade-in');
    
    // Render quiz cards
    if (window.renderQuizzes) {
        window.renderQuizzes(quizzes);
    }
    
    // Re-init icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Show landing section with reset
function showLanding() {
    const landingSection = document.getElementById('landing-section');
    const resultsSection = document.getElementById('results-section');
    const landingContent = document.getElementById('landing-content');
    const branding = document.getElementById('branding');
    const mainSearchContainer = document.getElementById('main-search-container');
    const searchInput = document.getElementById('main-search');
    const skeletonLoader = document.getElementById('skeleton-loader');
    
    // Fade out results
    resultsSection.classList.add('fade-transition', 'fade-out');
    
    setTimeout(() => {
        resultsSection.classList.add('hidden');
        resultsSection.classList.remove('fade-out');
        resultsSection.style.paddingTop = '';
        
        // Reset landing section back to centered layout
        if (landingSection) {
            landingSection.style.transition = 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
            landingSection.style.alignItems = '';
            landingSection.style.justifyContent = '';
            landingSection.style.paddingTop = '';
            landingSection.style.paddingBottom = '';
            landingSection.style.position = '';
            landingSection.style.top = '';
            landingSection.style.left = '';
            landingSection.style.right = '';
            landingSection.style.zIndex = '';
            landingSection.style.flex = '';
            landingSection.style.minHeight = '';
            landingSection.style.background = '';
            landingSection.style.backdropFilter = '';
            landingSection.style.borderBottom = '';
        }
        
        // Reset branding
        if (branding) {
            branding.style.display = '';
            branding.style.opacity = '1';
            branding.style.transform = 'translateY(0)';
        }
        
        // Reset search container
        if (mainSearchContainer) {
            mainSearchContainer.style.transform = '';
            mainSearchContainer.style.opacity = '';
            const innerPill = mainSearchContainer.querySelector('.flex.items-center');
            if (innerPill) {
                innerPill.style.padding = '';
            }
            const glow = mainSearchContainer.querySelector('.blur-xl');
            if (glow) glow.style.display = '';
        }
        
        // Reset and show landing content
        if (landingContent) {
            landingContent.classList.remove('fade-out');
            landingContent.classList.add('fade-in');
        }
        
        // Clear search input
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Hide skeleton loader
        if (skeletonLoader) {
            skeletonLoader.classList.add('hidden');
            skeletonLoader.classList.remove('fade-in', 'fade-out');
        }
    }, 500);
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
