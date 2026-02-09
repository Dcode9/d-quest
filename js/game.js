// --- ASSETS CONFIG ---
const ASSETS = {
    // Images
    timer: "https://raw.githubusercontent.com/Dcode9/d-quest/d14f1e1d938d4223b36f005a0522fb5a7437a16e/assets/images/Timer.svg",
    line: "https://raw.githubusercontent.com/Dcode9/d-quest/8e1a563a58d1d2a4488ba570b2a264dd03cff577/line.svg",
    next: "https://raw.githubusercontent.com/Dcode9/d-quest/8e1a563a58d1d2a4488ba570b2a264dd03cff577/next.svg",
    boxNormal: "https://raw.githubusercontent.com/Dcode9/d-quest/8e1a563a58d1d2a4488ba570b2a264dd03cff577/normal%20option%20box.svg",
    boxGreen: "https://raw.githubusercontent.com/Dcode9/d-quest/8e1a563a58d1d2a4488ba570b2a264dd03cff577/option%20box%20green.svg",
    boxOrange: "https://raw.githubusercontent.com/Dcode9/d-quest/8e1a563a58d1d2a4488ba570b2a264dd03cff577/option%20box%20orange.svg",
    questionBox: "https://raw.githubusercontent.com/Dcode9/d-quest/8e1a563a58d1d2a4488ba570b2a264dd03cff577/wide%20title%20and%20question.svg",
    
    // Audio
    intro: "https://raw.githubusercontent.com/Dcode9/d-quest/d14f1e1d938d4223b36f005a0522fb5a7437a16e/assets/audio/Kaun%20Banega%20Crorepati%20Intro%202019.wav",
    questionIncoming: "https://raw.githubusercontent.com/Dcode9/d-quest/96b84aa6a0681c3b34cf9ac7ce5a918164a94530/KBC%20Question%20incoming.wav",
    clock: "https://raw.githubusercontent.com/Dcode9/d-quest/96b84aa6a0681c3b34cf9ac7ce5a918164a94530/30%20second%20tic%20tic%20kbc%20clock.mp3",
    correct: "https://raw.githubusercontent.com/Dcode9/d-quest/96b84aa6a0681c3b34cf9ac7ce5a918164a94530/Correct%20answer.mp3",
    wrong: "https://raw.githubusercontent.com/Dcode9/d-quest/96b84aa6a0681c3b34cf9ac7ce5a918164a94530/Wrong%20Ans.mp3"
};

// --- GAME STATE ---
const state = {
    quizData: null,
    currentQuestionIndex: 0,
    score: 0,
    status: 'loading',
    selectedOption: null,
    soundEnabled: true,
    audioRefs: {}
};

const container = document.getElementById('game-container');
const soundBtn = document.getElementById('sound-btn');
const soundIcon = document.getElementById('sound-icon');

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    initAudio();
    
    // 1. Get Quiz ID or Filename from URL
    const urlParams = new URLSearchParams(window.location.search);
    const quizId = urlParams.get('id');
    const quizFile = urlParams.get('quiz');
    const isPreview = urlParams.get('preview');

    // Preview mode: load from sessionStorage
    if (isPreview) {
        try {
            const previewData = sessionStorage.getItem('previewQuiz');
            if (!previewData) throw new Error("No preview data found");
            state.quizData = JSON.parse(previewData);
            state.status = 'start';
            renderStartScreen();
        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="text-white text-center p-8">
                <h2 class="text-2xl font-bold mb-2">No preview data</h2>
                <p class="text-gray-400">Go back and generate a quiz first.</p>
                <a href="index.html" class="inline-block mt-4 px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-500">Back to Home</a>
            </div>`;
        }
        return;
    }

    // MOCK DATA Fallback if no URL param (for testing)
    if (!quizId && !quizFile) {
        state.quizData = {
            title: "Demo Quiz",
            questions: [
                { question: "This is a demo question to test the player?", options: ["Option A", "Option B", "Option C", "Option D"], correctIndex: 0 }
            ]
        };
        state.status = 'start';
        renderStartScreen();
        return;
    }

    // 2. Fetch Quiz Data from Supabase if ID is provided
    if (quizId) {
        try {
            const SUPABASE_URL = "https://nlajpvlxckbgrfjfphzd.supabase.co";
            const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sYWpwdmx4Y2tiZ3JmamZwaHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MDgyNDQsImV4cCI6MjA4NDM4NDI0NH0.LKPu7hfb7iNwPuIn-WqR37XDwnSnwdWAPfV_IgXKF6c";
            
            const response = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}&select=*`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });

            if (!response.ok) throw new Error("Failed to fetch quiz from database");
            
            const data = await response.json();
            if (data.length === 0) throw new Error("Quiz not found");
            
            state.quizData = data[0].content;
            state.status = 'start';
            renderStartScreen();
        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="text-white text-center p-8">
                <i data-lucide="alert-circle" class="w-16 h-16 text-red-400 mx-auto mb-4"></i>
                <h2 class="text-2xl font-bold mb-2">Failed to load quiz</h2>
                <p class="text-gray-400">${e.message}</p>
                <a href="index.html" class="inline-block mt-4 px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-500">Back to Home</a>
            </div>`;
            if(window.lucide) window.lucide.createIcons();
        }
        return;
    }

    // 3. Fetch Quiz Data from local file if quiz param is provided
    if (quizFile) {
        try {
            const response = await fetch(`quizzes/${quizFile}`);
            if (!response.ok) throw new Error("Quiz file not found");
            
            const data = await response.json();
            state.quizData = data;
            state.status = 'start';
            renderStartScreen();
        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="text-white text-center">Failed to load quiz.<br>Check console.</div>`;
        }
    }
});

// --- AUDIO HANDLING ---
function initAudio() {
    // We explicitly encode URI components to handle spaces in filenames
    state.audioRefs.intro = new Audio(encodeURI(ASSETS.intro));
    state.audioRefs.incoming = new Audio(encodeURI(ASSETS.questionIncoming));
    state.audioRefs.clock = new Audio(encodeURI(ASSETS.clock));
    state.audioRefs.correct = new Audio(encodeURI(ASSETS.correct));
    state.audioRefs.wrong = new Audio(encodeURI(ASSETS.wrong));

    state.audioRefs.clock.loop = true;

    // Robust Loading
    Object.values(state.audioRefs).forEach(audio => {
        audio.crossOrigin = "anonymous"; // Helps with some CDN/CORS issues
        audio.preload = "auto";
        audio.addEventListener('error', (e) => {
            console.warn("Audio load error:", audio.src, e);
        });
        audio.load();
    });

    if(soundBtn) soundBtn.onclick = toggleSound;
}

function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    if(soundIcon) soundIcon.setAttribute('data-lucide', state.soundEnabled ? 'volume-2' : 'volume-x');
    if(window.lucide) window.lucide.createIcons();
    if (!state.soundEnabled) stopAllAudio();
}

function stopAllAudio() {
    Object.values(state.audioRefs).forEach(audio => {
        fadeOutAudio(audio, 500);
    });
}

function playAudio(key, loop = false) {
    if (!state.soundEnabled) return;
    const audio = state.audioRefs[key];
    
    if (!audio) return;

    audio.loop = loop;
    audio.currentTime = 0;
    audio.volume = 1.0;
    
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(e => {
            console.warn(`Audio '${key}' error:`, e.name);
            // If it's the Intro, we ALWAYS show the overlay on failure
            if (key === 'intro') {
                showStartOverlay();
            }
        });
    }
}

function showStartOverlay() {
    if (document.getElementById('start-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'start-overlay';
    overlay.className = "absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md pointer-events-auto cursor-pointer animate-fadeIn";
    overlay.innerHTML = `
        <div class="text-center group">
            <div class="w-20 h-20 rounded-full bg-yellow-500 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-[0_0_30px_rgba(234,179,8,0.5)]">
                <i data-lucide="play" class="w-10 h-10 text-black fill-current ml-1"></i>
            </div>
            <h3 class="text-white text-2xl font-bold tracking-widest">TAP TO START</h3>
            <p class="text-blue-200 text-sm mt-2">Enable Audio Experience</p>
        </div>
    `;
    
    overlay.onclick = () => {
        // Re-trigger intro on user click
        const audio = state.audioRefs.intro;
        if(audio) {
            audio.volume = 1.0;
            audio.load(); // Force reload in case of previous error
            audio.play().catch(e => console.error("Manual play failed:", e));
        }
        overlay.remove();
    };
    
    document.body.appendChild(overlay);
    if(window.lucide) window.lucide.createIcons();
}

// Generic fade out for any audio element (tracks active fades to prevent overlap)
const activeFades = new WeakMap();
function fadeOutAudio(audio, durationMs, callback) {
    if (!audio || audio.paused) { if(callback) callback(); return; }

    // Clear any existing fade on this audio element
    if (activeFades.has(audio)) {
        clearInterval(activeFades.get(audio));
    }

    const steps = 10;
    const interval = durationMs / steps;
    const volumeStep = audio.volume / steps;

    const fade = setInterval(() => {
        if (audio.volume > volumeStep + 0.01) {
            audio.volume = Math.max(0, audio.volume - volumeStep);
        } else {
            clearInterval(fade);
            activeFades.delete(audio);
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 1.0;
            if (callback) callback();
        }
    }, interval);

    activeFades.set(audio, fade);
}

function fadeOutIntro(callback) {
    fadeOutAudio(state.audioRefs.intro, 1000, callback);
}

// --- RENDER FUNCTIONS ---

function renderStartScreen() {
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center animate-fadeIn pointer-events-auto text-center px-4 w-full">
            <h1 class="text-5xl md:text-7xl text-white font-extrabold mb-8 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600">
                ${state.quizData.title ? state.quizData.title.toUpperCase() : 'QUIZ'}
            </h1>
            
            <div id="play-btn-wrapper" class="opacity-0 translate-y-10 transition-all duration-1000">
                <button onclick="handleStartClick()" class="relative w-48 h-20 group hover:scale-105 transition-transform duration-300">
                    <img src="${ASSETS.next}" alt="Play" class="absolute inset-0 w-full h-full object-contain">
                    <div class="relative z-10 w-full h-full flex items-center justify-center pb-2 pl-1">
                        <span class="text-white font-bold text-2xl tracking-widest drop-shadow-md">PLAY</span>
                    </div>
                </button>
            </div>
        </div>
    `;

    // Try to play intro music, but show overlay if it fails
    setTimeout(() => {
        const wrapper = document.getElementById('play-btn-wrapper');
        if (wrapper) wrapper.classList.remove('opacity-0', 'translate-y-10');
        
        // Attempt to play intro music after button appears
        playAudio('intro');
    }, 1000); 
}

window.handleStartClick = () => {
    fadeOutIntro(() => {
        state.currentQuestionIndex = 0;
        state.score = 0;
        renderQuestionIntro();
    });
};

function renderQuestionIntro() {
    state.status = 'intro';
    stopAllAudio();

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center animate-fadeIn pointer-events-auto w-full">
            <div class="relative w-full max-w-4xl py-16 bg-gradient-to-r from-transparent via-blue-900/70 to-transparent border-y-2 border-yellow-400/50 mb-12 shadow-2xl">
               <h2 class="text-5xl md:text-7xl text-white font-extrabold text-center tracking-widest" style="text-shadow: 0 0 20px rgba(234,179,8,0.8), 0 0 40px rgba(234,179,8,0.4);">
                 QUESTION ${state.currentQuestionIndex + 1}
               </h2>
            </div>
            
            <button onclick="handleProceedToQuestion()" class="relative w-48 h-16 group hover:scale-110 transition-transform duration-300 shadow-xl hover:shadow-yellow-500/50">
              <img src="${ASSETS.next}" alt="Next" class="absolute inset-0 w-full h-full object-contain">
              <span class="relative z-10 text-white font-bold text-xl tracking-wider w-full h-full flex items-center justify-center pb-1 drop-shadow-lg">
                NEXT
              </span>
            </button>
        </div>
    `;
}

window.handleProceedToQuestion = () => {
    renderGameInterface();
    playAudio('incoming');
    state.status = 'question-incoming';
    
    // Fade out question incoming sound after 1 second
    setTimeout(() => {
        fadeOutAudio(state.audioRefs.incoming, 1000);
    }, 1000);
    
    document.addEventListener('keydown', handleTriggerKey);
    const gameInterface = document.getElementById('game-interface');
    if(gameInterface) gameInterface.addEventListener('click', handleTrigger);
};

function renderGameInterface() {
    const q = state.quizData.questions[state.currentQuestionIndex];
    
    container.innerHTML = `
        <div id="game-interface" class="w-full h-full flex flex-col items-center justify-center relative pointer-events-auto">
            
            <div class="h-24 md:h-32 flex items-end justify-center pb-4 w-full shrink-0">
                <div id="timer-box" class="relative w-20 h-20 md:w-28 md:h-28 flex items-center justify-center opacity-0 transition-opacity duration-300">
                    <img src="${ASSETS.timer}" class="absolute inset-0 w-full h-full object-contain animate-pulse">
                    <span id="timer-text" class="relative z-10 text-lg md:text-2xl font-bold text-white">30</span>
                </div>
            </div>

            <div class="w-full flex flex-col items-center gap-1">
                <div class="relative w-full h-20 md:h-28 flex items-center justify-center z-20">
                     <img src="${ASSETS.line}" class="absolute left-0 w-full h-auto object-cover opacity-60 pointer-events-none z-0 hidden md:block" style="max-height: 20px; top: 50%; transform: translateY(-50%)">
                     <div class="relative w-full max-w-4xl h-full flex items-center justify-center">
                        <img src="${ASSETS.questionBox}" class="absolute inset-0 w-full h-full object-contain select-none pointer-events-none">
                        <div class="relative z-10 px-8 md:px-20 text-center flex items-center justify-center h-full pb-1">
                            <h2 class="question-text text-white text-xs md:text-xl font-bold leading-tight line-clamp-3">${q.question}</h2>
                        </div>
                     </div>
                </div>

                <div id="options-container" class="relative w-full flex flex-col items-center gap-1 opacity-0 translate-y-10 transition-all duration-700 z-10">
                    <img src="${ASSETS.line}" class="absolute left-0 w-full h-auto object-cover opacity-60 pointer-events-none z-0 hidden md:block" style="max-height: 20px; top: 25%; transform: translateY(-50%)">
                    <img src="${ASSETS.line}" class="absolute left-0 w-full h-auto object-cover opacity-60 pointer-events-none z-0 hidden md:block" style="max-height: 20px; top: 75%; transform: translateY(-50%)">
                    <div class="relative z-10 w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 px-2 md:px-12">
                        ${renderOptionHTML(0, 'A', q.options[0])}
                        ${renderOptionHTML(1, 'B', q.options[1])}
                        ${renderOptionHTML(2, 'C', q.options[2])}
                        ${renderOptionHTML(3, 'D', q.options[3])}
                    </div>
                </div>
            </div>

            <div id="next-btn-container" class="h-16 md:h-20 w-full flex items-center justify-center mt-2 md:mt-4 opacity-0 pointer-events-none transition-all duration-300 scale-95">
                <button onclick="handleNextQuestion()" class="relative w-36 h-14 group hover:scale-105 transition-transform">
                  <img src="${ASSETS.next}" alt="Next" class="absolute inset-0 w-full h-full object-contain">
                  <span class="relative z-10 text-white font-bold text-lg tracking-wider w-full h-full flex items-center justify-center pb-1">NEXT</span>
                </button>
            </div>
        </div>
    `;
}

function renderOptionHTML(index, label, text) {
    return `
        <div id="option-${index}" onclick="handleOptionClick(${index})" class="relative w-full h-14 md:h-16 flex items-center justify-center cursor-pointer transition-transform duration-100 hover:scale-[1.02] active:scale-95">
            <img id="bg-option-${index}" src="${ASSETS.boxNormal}" class="absolute inset-0 w-full h-full object-contain select-none pointer-events-none">
            <div id="text-option-${index}" class="relative z-10 flex w-full px-10 md:px-14 items-center text-white pb-1">
                <span class="font-bold text-yellow-400 text-lg md:text-xl mr-3 drop-shadow-sm">${label}:</span>
                <span class="font-semibold text-sm md:text-lg leading-none drop-shadow-sm truncate">${text}</span>
            </div>
        </div>
    `;
}

const handleTrigger = (e) => {
    if (state.status !== 'question-incoming') return;
    
    state.status = 'options';
    fadeOutAudio(state.audioRefs.incoming, 500);
    playAudio('clock', true);

    document.getElementById('options-container').classList.remove('opacity-0', 'translate-y-10');
    document.getElementById('timer-box').classList.remove('opacity-0');

    startTimer();
    
    document.removeEventListener('keydown', handleTriggerKey);
    const gameInterface = document.getElementById('game-interface');
    if(gameInterface) gameInterface.removeEventListener('click', handleTrigger);
};

const handleTriggerKey = (e) => {
    if (e.code === 'Space' || e.code === 'ArrowRight') handleTrigger();
};

let timerInterval;
function startTimer() {
    let timeLeft = 30;
    const timerText = document.getElementById('timer-text');
    if(timerText) {
        timerText.textContent = timeLeft;
        timerText.classList.remove('text-red-500');
    }

    timerInterval = setInterval(() => {
        timeLeft--;
        if(timerText) timerText.textContent = timeLeft;
        if (timeLeft <= 5 && timerText) timerText.classList.add('text-red-500');
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeUp();
        }
    }, 1000);
}

window.handleOptionClick = (index) => {
    if (state.status !== 'options') return;

    clearInterval(timerInterval);
    state.status = 'locked';
    fadeOutAudio(state.audioRefs.clock, 300);
    state.selectedOption = index;

    updateOptionVisual(index, 'selected');

    setTimeout(revealAnswer, 2000);
};

function revealAnswer() {
    state.status = 'revealed';
    const correctIndex = state.quizData.questions[state.currentQuestionIndex].correctIndex;
    const isCorrect = state.selectedOption === correctIndex;

    updateOptionVisual(correctIndex, 'correct');
    
    if (isCorrect) {
        state.score += 1000;
        playAudio('correct');
    } else {
        playAudio('wrong');
    }

    const btn = document.getElementById('next-btn-container');
    if(btn) {
        btn.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        btn.classList.add('opacity-100', 'scale-100');
    }
}

function handleTimeUp() {
    state.status = 'revealed';
    fadeOutAudio(state.audioRefs.clock, 300);
    playAudio('wrong');
    
    const correctIndex = state.quizData.questions[state.currentQuestionIndex].correctIndex;
    updateOptionVisual(correctIndex, 'correct');

    const btn = document.getElementById('next-btn-container');
    if(btn) btn.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
}

function updateOptionVisual(index, status) {
    const bg = document.getElementById(`bg-option-${index}`);
    const text = document.getElementById(`text-option-${index}`);
    
    if (status === 'selected') {
        bg.src = ASSETS.boxOrange;
        text.classList.remove('text-white');
        text.classList.add('text-black');
    } else if (status === 'correct') {
        bg.src = ASSETS.boxGreen;
        text.classList.remove('text-black');
        text.classList.add('text-white');
    }
}

window.handleNextQuestion = () => {
    stopAllAudio();
    if (state.currentQuestionIndex < state.quizData.questions.length - 1) {
        state.currentQuestionIndex++;
        renderQuestionIntro();
    } else {
        renderFinishedScreen();
    }
};

function renderFinishedScreen() {
    state.status = 'finished';
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center animate-fadeIn p-10 pointer-events-auto bg-gradient-to-br from-slate-900/80 to-blue-900/80 backdrop-blur-md rounded-3xl border-2 border-yellow-400/50 shadow-2xl max-w-2xl">
            <i data-lucide="trophy" class="w-24 h-24 text-yellow-400 mb-8 drop-shadow-[0_0_30px_rgba(234,179,8,0.8)] animate-bounce"></i>
            <h2 class="text-4xl md:text-6xl text-white font-extrabold mb-6 text-center kbc-title">CONGRATULATIONS!</h2>
            <div class="text-center mb-8">
                <p class="text-xl text-blue-200 mb-3">Final Score:</p>
                <p class="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 animate-pulse-glow">
                    ₹${state.score.toLocaleString()}
                </p>
            </div>
            
            <div class="flex gap-4">
                <a href="index.html" class="flex items-center space-x-2 px-8 py-4 kbc-button text-black rounded-xl font-bold transition-all transform hover:scale-105 shadow-xl">
                    <i data-lucide="home"></i>
                    <span class="text-lg">HOME</span>
                </a>
                <a href="player.html" class="flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl font-bold transition-all transform hover:scale-105 shadow-xl shadow-blue-900/50">
                    <i data-lucide="rotate-ccw"></i>
                    <span class="text-lg">PLAY AGAIN</span>
                </a>
            </div>
        </div>
    `;
    if(window.lucide) window.lucide.createIcons();
}
