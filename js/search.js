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
    const headerSearchBtn = document.getElementById('header-search-btn');
    const headerSearchInput = document.getElementById('header-search-input');
    
    if (searchInput) {
        startPlaceholderAnimation(searchInput);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
    }
    
    if (searchBtn) searchBtn.addEventListener('click', handleSearch);
    if (backBtn) backBtn.addEventListener('click', showLanding);

    // Header search bar events
    if (headerSearchBtn) {
        headerSearchBtn.addEventListener('click', () => {
            const q = headerSearchInput.value.trim();
            if (q) {
                document.getElementById('main-search').value = q;
                handleSearch();
            }
        });
    }
    if (headerSearchInput) {
        headerSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const q = headerSearchInput.value.trim();
                if (q) {
                    document.getElementById('main-search').value = q;
                    handleSearch();
                }
            }
        });
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
    const targetText = `Search for ${TOPICS[nextIndex]}`;
    
    let opacity = 1;
    const fadeOut = setInterval(() => {
        opacity -= 0.1;
        input.style.setProperty('--placeholder-opacity', opacity);
        if (opacity <= 0) {
            clearInterval(fadeOut);
            input.placeholder = targetText;
            currentTopicIndex = nextIndex;
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
    
    if (Math.random() > 0.7) {
        setTimeout(() => { input.placeholder = "Create with AI instantly"; }, 1500);
    }
}

// =============================================
// SEARCH TRANSITION: D'Quest → top-left, D'Ai fades, search → top-center
// =============================================
function transitionToHeaderSearch(query) {
    const landingSection = document.getElementById('landing-section');
    const branding = document.getElementById('branding');
    const subtitle = document.getElementById('landing-subtitle');
    const headerBrand = document.getElementById('header-brand');
    const headerSearchBar = document.getElementById('header-search-bar');
    const headerSearchInput = document.getElementById('header-search-input');
    const mainSearchContainer = document.getElementById('main-search-container');

    // 1. Fade out the "Powered by D'Ai" subtitle immediately
    if (subtitle) {
        subtitle.style.opacity = '0';
        subtitle.style.transition = 'opacity 0.3s ease';
    }

    // 2. Animate the center D'Quest title to shrink and move up-left, then disappear
    if (branding) {
        branding.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        branding.style.opacity = '0';
        branding.style.transform = 'translateY(-40px) scale(0.5)';
    }

    // 3. Show the fixed top-left D'Quest branding
    if (headerBrand) {
        setTimeout(() => {
            headerBrand.style.opacity = '1';
            headerBrand.style.transform = 'translateX(0)';
            headerBrand.style.pointerEvents = 'auto';
        }, 300);
    }

    // 4. Fade out the center search bar and show the header search bar
    if (mainSearchContainer) {
        mainSearchContainer.style.transition = 'all 0.5s ease';
        mainSearchContainer.style.opacity = '0';
        mainSearchContainer.style.transform = 'translateY(-30px) scale(0.9)';
    }

    if (headerSearchBar) {
        setTimeout(() => {
            headerSearchBar.style.opacity = '1';
            headerSearchBar.style.transform = 'translateY(0)';
            headerSearchBar.style.pointerEvents = 'auto';
            if (headerSearchInput) headerSearchInput.value = query;
        }, 400);
    }

    // 5. Shrink the landing section
    if (landingSection) {
        landingSection.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        landingSection.style.opacity = '0';
        landingSection.style.pointerEvents = 'none';
        setTimeout(() => {
            landingSection.style.display = 'none';
        }, 700);
    }
}

// =============================================
// SKELETON CARD: Show card-shaped skeleton during AI generation
// =============================================

// Reset skeleton card back to shimmer/loading state (clears stale data from previous search)
function resetSkeletonCard() {
    // Reset emoji area
    const emojiBox = document.getElementById('skel-emoji');
    if (emojiBox) {
        emojiBox.textContent = '\u00A0'; // &nbsp;
        emojiBox.style.fontSize = '';
        emojiBox.classList.remove('animate-typeIn');
        emojiBox.classList.add('skeleton-text');
    }

    // Reset text fields
    const fields = [
        { id: 'skel-title', placeholder: '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' },
        { id: 'skel-topic', placeholder: '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' },
        { id: 'skel-grade', placeholder: '\u00A0\u00A0\u00A0' },
        { id: 'skel-diff', placeholder: '\u00A0\u00A0\u00A0' },
        { id: 'skel-count', placeholder: '\u00A0\u00A0\u00A0' }
    ];
    fields.forEach(({ id, placeholder }) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = placeholder;
            el.style.color = '';
            el.classList.remove('animate-typeIn');
            el.classList.add('skeleton-text');
        }
    });

    // Reset play button to loading state
    const btn = document.getElementById('skel-play-btn');
    if (btn) {
        btn.onclick = null;
        btn.classList.add('opacity-80', 'cursor-default');
        btn.classList.remove('hover:scale-105', 'cursor-pointer');
        btn.innerHTML = `
            <div class="spin-loader"></div>
            <span class="text-sm">Generating with D'Ai</span>
        `;
    }

    // Reset preview button
    const skelPreviewBtn = document.getElementById('skel-preview-btn');
    if (skelPreviewBtn) {
        skelPreviewBtn.onclick = null;
        skelPreviewBtn.classList.add('opacity-50', 'cursor-default');
        skelPreviewBtn.classList.remove('hover:bg-slate-600', 'cursor-pointer');
    }
}

function showSkeletonCard() {
    const section = document.getElementById('skeleton-card-section');
    // Ensure landing section is out of the way
    const landingSection = document.getElementById('landing-section');
    if (landingSection) landingSection.style.display = 'none';

    if (section) {
        resetSkeletonCard();
        section.classList.remove('hidden');
        section.style.opacity = '0';
        requestAnimationFrame(() => {
            section.style.transition = 'opacity 0.5s ease';
            section.style.opacity = '1';
        });
        if (window.lucide) window.lucide.createIcons();
    }
}

function hideSkeletonCard() {
    const section = document.getElementById('skeleton-card-section');
    if (section) {
        section.style.transition = 'opacity 0.3s ease';
        section.style.opacity = '0';
        setTimeout(() => section.classList.add('hidden'), 300);
    }
}

// =============================================
// REVEAL: Fill skeleton card with real data, animate text left-to-right, morph button
// =============================================
function revealQuizInSkeleton(quizItem) {
    const quiz = quizItem.content;
    const metadata = quiz.metadata || {};
    const emoji = metadata.emoji || getQuizEmoji(quiz.title);
    const grade = metadata.grade ? (typeof metadata.grade === 'number' ? `Grade ${metadata.grade}` : metadata.grade) : 'All Grades';
    const difficulty = metadata.difficulty || 'Medium';
    const topic = metadata.topic || extractTopic(quiz.title);
    const questionCount = quiz.questions ? quiz.questions.length : 0;

    // Helper: replace skeleton-text with typed-in content
    function typeReveal(el, text) {
        if (!el) return;
        el.classList.remove('skeleton-text');
        el.textContent = text;
        el.style.color = '';
        el.classList.add('animate-typeIn');
    }

    // Fill the emoji area
    const emojiBox = document.getElementById('skel-emoji');
    if (emojiBox) {
        emojiBox.classList.remove('skeleton-text');
        emojiBox.textContent = emoji;
        emojiBox.classList.add('animate-typeIn');
        emojiBox.style.fontSize = '3.75rem';
    }

    // Stagger the reveals
    setTimeout(() => typeReveal(document.getElementById('skel-title'), quiz.title), 100);
    setTimeout(() => typeReveal(document.getElementById('skel-topic'), topic), 250);
    setTimeout(() => typeReveal(document.getElementById('skel-grade'), grade), 400);
    setTimeout(() => typeReveal(document.getElementById('skel-diff'), difficulty), 500);
    setTimeout(() => typeReveal(document.getElementById('skel-count'), String(questionCount)), 600);

    // Morph the button from loading → play
    setTimeout(() => {
        const btn = document.getElementById('skel-play-btn');
        if (btn) {
            btn.style.transition = 'all 0.4s ease';
            btn.classList.remove('opacity-80', 'cursor-default');
            btn.classList.add('hover:scale-105', 'cursor-pointer');
            btn.innerHTML = `
                <i data-lucide="play" class="w-4 h-4"></i>
                <span>Start Quiz</span>
            `;
            if (window.lucide) window.lucide.createIcons();

            // Wire up click
            btn.onclick = (e) => {
                e.stopPropagation();
                if (quizItem.isLocal) {
                    window.location.href = `player.html?quiz=${quizItem.fileName}`;
                } else {
                    window.location.href = `player.html?id=${quizItem.id}`;
                }
            };
        }

        // Wire up preview button on skeleton card
        const skelPreviewBtn = document.getElementById('skel-preview-btn');
        if (skelPreviewBtn) {
            skelPreviewBtn.classList.remove('opacity-50', 'cursor-default');
            skelPreviewBtn.classList.add('hover:bg-slate-600', 'cursor-pointer');
            skelPreviewBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.showPreview) window.showPreview(quiz);
            };
        }
    }, 800);
}

// =============================================
// MAIN SEARCH HANDLER
// =============================================
async function handleSearch() {
    const searchInput = document.getElementById('main-search');
    const query = searchInput.value.trim();
    
    if (!query) return;
    
    // Transition to header layout immediately (D'Quest → top-left, search → top)
    transitionToHeaderSearch(query);
    
    // Hide any previously visible results or skeleton from a prior search
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
        resultsSection.classList.add('hidden');
        resultsSection.classList.remove('fade-in', 'fade-out', 'fade-transition');
    }
    hideSkeletonCard();
    
    try {
        // Step 1: Search existing quizzes (fast)
        const existingQuizzes = await searchDatabase(query);
        
        if (existingQuizzes.length > 0) {
            // Found results → show them directly, no skeleton
            showResults(existingQuizzes);
            return;
        }
        
        // Step 2: No match → generate with AI. NOW show the skeleton card
        showSkeletonCard();
        
        const newQuiz = await generateQuizInstantly(query);
        
        if (newQuiz) {
            // Reveal data inside skeleton with streaming animation
            revealQuizInSkeleton(newQuiz);
        }
        
    } catch (error) {
        console.error('[SEARCH] Search error:', error);
        hideSkeletonCard();
        alert(`Error: ${error.message}`);
    }
}

// Search database for existing quizzes
async function searchDatabase(query) {
    const allQuizzes = [];
    
    const localQuizFiles = [
        'demo.json', 'general-knowledge.json', 'science.json',
        'history.json', 'geography.json', 'technology.json'
    ];
    
    // Fire all local fetches in parallel for speed
    const localPromises = localQuizFiles.map(async (file) => {
        try {
            const response = await fetch(`quizzes/${file}`);
            if (response.ok) {
                const quizData = await response.json();
                if (quizData.title.toLowerCase().includes(query.toLowerCase())) {
                    return {
                        id: quizData.id || file.replace('.json', ''),
                        content: quizData,
                        created_at: '2024-01-01T00:00:00.000Z',
                        isLocal: true,
                        fileName: file
                    };
                }
            }
        } catch (error) {
            console.warn(`Could not load ${file}:`, error);
        }
        return null;
    });

    const localResults = await Promise.all(localPromises);
    localResults.forEach(r => { if (r) allQuizzes.push(r); });
    
    // Search Supabase in parallel
    try {
        const SUPABASE_URL = "https://nlajpvlxckbgrfjfphzd.supabase.co";
        const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sYWpwdmx4Y2tiZ3JmamZwaHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MDgyNDQsImV4cCI6MjA4NDM4NDI0NH0.LKPu7hfb7iNwPuIn-WqR37XDwnSnwdWAPfV_IgXKF6c";
        
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
        let questionCount = 5;
        const countMatch = topic.match(/(\d+)\s*questions?/i);
        if (countMatch) {
            questionCount = Math.min(Math.max(parseInt(countMatch[1]), 1), 20);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        
        let response;
        try {
            response = await fetch('/api/generate-quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, count: questionCount }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS/1000} seconds.`);
            }
            throw new Error(`Network error: ${fetchError.message}`);
        }
        
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (err) {
            throw new Error('Failed to parse server response.');
        }
        
        if (!response.ok) throw new Error(data.error || 'Generation failed');
        if (!data.quiz) throw new Error('Invalid response structure from server');
        
        const formattedQuiz = {
            id: `ai-${Date.now()}`,
            content: data.quiz,
            created_at: new Date().toISOString(),
            isAI: true,
            isTemp: true
        };
        
        sessionStorage.setItem(`quiz_${formattedQuiz.id}`, JSON.stringify(data.quiz));
        return formattedQuiz;
        
    } catch (error) {
        throw new Error(`Failed to generate quiz: ${error.message}`);
    }
}

// =============================================
// SHOW RESULTS (for database matches)
// =============================================
function showResults(quizzes) {
    const resultsSection = document.getElementById('results-section');
    const landingSection = document.getElementById('landing-section');
    
    // Ensure landing section is out of the way immediately
    if (landingSection) landingSection.style.display = 'none';
    
    hideSkeletonCard();
    
    resultsSection.classList.remove('hidden');
    resultsSection.style.paddingTop = '5rem';
    resultsSection.classList.add('fade-transition', 'fade-in');
    
    if (window.renderQuizzes) window.renderQuizzes(quizzes);
    if (window.lucide) window.lucide.createIcons();
}

// =============================================
// SHOW LANDING (reset everything)
// =============================================
function showLanding() {
    const landingSection = document.getElementById('landing-section');
    const resultsSection = document.getElementById('results-section');
    const branding = document.getElementById('branding');
    const subtitle = document.getElementById('landing-subtitle');
    const mainSearchContainer = document.getElementById('main-search-container');
    const searchInput = document.getElementById('main-search');
    const headerBrand = document.getElementById('header-brand');
    const headerSearchBar = document.getElementById('header-search-bar');
    
    // Fade out results
    resultsSection.classList.add('fade-transition', 'fade-out');
    hideSkeletonCard();
    
    setTimeout(() => {
        resultsSection.classList.add('hidden');
        resultsSection.classList.remove('fade-out');
        resultsSection.style.paddingTop = '';
        
        // Hide header elements
        if (headerBrand) {
            headerBrand.style.opacity = '0';
            headerBrand.style.transform = 'translateX(-30px)';
            headerBrand.style.pointerEvents = 'none';
        }
        if (headerSearchBar) {
            headerSearchBar.style.opacity = '0';
            headerSearchBar.style.transform = 'translateY(-20px)';
            headerSearchBar.style.pointerEvents = 'none';
        }
        
        // Restore landing section
        if (landingSection) {
            landingSection.style.display = '';
            landingSection.style.opacity = '1';
            landingSection.style.pointerEvents = '';
        }
        
        // Reset branding
        if (branding) {
            branding.style.opacity = '1';
            branding.style.transform = '';
        }
        if (subtitle) {
            subtitle.style.opacity = '1';
        }
        
        // Reset search container
        if (mainSearchContainer) {
            mainSearchContainer.style.opacity = '1';
            mainSearchContainer.style.transform = '';
        }
        
        if (searchInput) searchInput.value = '';
    }, 500);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
