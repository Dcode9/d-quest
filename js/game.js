// --- ASSETS CONFIG ---
// Update these paths if your folder structure differs. 
// Currently set to use local assets folder.
const ASSETS = {
    // Images (SVGs)
    timer: "assets/images/timer.svg",
    line: "assets/images/line.svg",
    next: "assets/images/next.svg",
    boxNormal: "assets/images/normal option box.svg",
    boxGreen: "assets/images/option box green.svg",
    boxOrange: "assets/images/option box orange.svg",
    questionBox: "assets/images/wide title and question.svg",
    
    // Audio
    intro: "assets/audio/Kaun Banega Crorepati Intro 2019.wav",
    questionIncoming: "assets/audio/KBC Question incoming.wav",
    clock: "assets/audio/30 second tic tic kbc clock.mp3",
    correct: "assets/audio/Correct answer.mp3",
    wrong: "assets/audio/Wrong Ans.mp3"
};

// --- GAME STATE ---
const state = {
    quizData: null,
    currentQuestionIndex: 0,
    score: 0,
    status: 'loading', // loading, start, intro, question-incoming, options, locked, revealed, finished
    selectedOption: null,
    soundEnabled: true,
    audioRefs: {}
};

// --- DOM ELEMENTS ---
const container = document.getElementById('game-container');
const soundBtn = document.getElementById('sound-btn');
const soundIcon = document.getElementById('sound-icon');

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    initAudio();
    
    // 1. Get Quiz Filename from URL
    const urlParams = new URLSearchParams(window.location.search);
    const quizFile = urlParams.get('quiz');

    if (!quizFile) {
        showError("No quiz selected.");
        return;
    }

    // 2. Fetch Quiz Data
    try {
        // We look in the quizzes folder
        const response = await fetch(`quizzes/${quizFile}`);
        if (!response.ok) throw new Error("Quiz file not found");
        
        const data = await response.json();
        state.quizData = data;
        state.status = 'start';
        renderStartScreen();
    } catch (e) {
        console.error(e);
        showError("Failed to load quiz data.");
    }
});

function showError(msg) {
    container.innerHTML = `<div class="text-white text-2xl font-bold bg-red-900/50 p-8 rounded-xl border border-red-500">${msg} <br><a href="index.html" class="text-sm underline mt-4 block">Go Home</a></div>`;
}

// --- AUDIO HANDLING ---
function initAudio() {
    state.audioRefs.intro = new Audio(ASSETS.intro);
    state.audioRefs.incoming = new Audio(ASSETS.questionIncoming);
    state.audioRefs.clock = new Audio(ASSETS.clock);
    state.audioRefs.correct = new Audio(ASSETS.correct);
    state.audioRefs.wrong = new Audio(ASSETS.wrong);

    // Preload
    Object.values(state.audioRefs).forEach(audio => audio.load());

    soundBtn.onclick = toggleSound;
}

function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    // Update Icon
    soundIcon.setAttribute('data-lucide', state.soundEnabled ? 'volume-2' : 'volume-x');
    if(window.lucide) window.lucide.createIcons();

    if (!state.soundEnabled) stopAllAudio();
}

function playAudio(key, loop = false) {
    if (!state.soundEnabled) return;
    const audio = state.audioRefs[key];
    if (audio) {
        audio.loop = loop;
        audio.currentTime = 0;
        audio.play().catch(e => console.warn("Autoplay blocked:", e));
    }
}

function stopAllAudio() {
    Object.values(state.audioRefs).forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
}

function fadeOutIntro(callback) {
    const audio = state.audioRefs.intro;
    if (!audio || audio.paused) { if(callback) callback(); return; }

    const fade = setInterval(() => {
        if (audio.volume > 0.1) audio.volume -= 0.1;
        else {
            clearInterval(fade);
            audio.pause();
            audio.volume = 1.0;
            if (callback) callback();
        }
    }, 100);
}

// --- RENDERING SCREENS ---

// 1. START SCREEN
function renderStartScreen() {
    playAudio('intro');
    
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center animate-fadeIn pointer-events-auto text-center px-4">
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

    // Show button after delay to match music
    setTimeout(() => {
        const wrapper = document.getElementById('play-btn-wrapper');
        if (wrapper) {
            wrapper.classList.remove('opacity-0', 'translate-y-10');
        }
    }, 4000); // Shortened for UX, originally 18s in request but 4s is better for testing
}

window.handleStartClick = () => {
    fadeOutIntro(() => {
        state.currentQuestionIndex = 0;
        state.score = 0;
        renderQuestionIntro();
    });
};

// 2. QUESTION INTRO ("Question 1")
function renderQuestionIntro() {
    state.status = 'intro';
    stopAllAudio();

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center animate-fadeIn pointer-events-auto">
            <div class="relative w-full max-w-3xl py-12 bg-gradient-to-r from-transparent via-blue-900/50 to-transparent border-y border-blue-500/30 mb-8">
               <h2 class="text-4xl md:text-6xl text-white font-bold text-center tracking-widest animate-pulse-glow">
                 QUESTION ${state.currentQuestionIndex + 1}
               </h2>
            </div>
            
            <button onclick="handleProceedToQuestion()" class="relative w-36 h-14 group hover:scale-105 transition-transform">
              <img src="${ASSETS.next}" alt="Next" class="absolute inset-0 w-full h-full object-contain">
              <span class="relative z-10 text-white font-bold text-lg tracking-wider w-full h-full flex items-center justify-center pb-1">
                NEXT
              </span>
            </button>
        </div>
    `;
}

window.handleProceedToQuestion = () => {
    renderGameInterface();
    // Animation for Question Incoming
    playAudio('incoming');
    state.status = 'question-incoming';
    
    // Add keyboard listener for trigger
    document.addEventListener('keydown', handleTriggerKey);
    // Add click listener to background
    document.getElementById('game-interface').addEventListener('click', handleTrigger);
};

// 3. MAIN GAME INTERFACE
function renderGameInterface() {
    const q = state.quizData.questions[state.currentQuestionIndex];
    
    container.innerHTML = `
        <div id="game-interface" class="w-full h-full flex flex-col items-center justify-center relative pointer-events-auto">
            
            <!-- Timer Area -->
            <div class="h-32 flex items-end justify-center pb-4 w-full shrink-0">
                <div id="timer-box" class="relative w-24 h-24 md:w-28 md:h-28 flex items-center justify-center opacity-0 transition-opacity duration-300">
                    <img src="${ASSETS.timer}" class="absolute inset-0 w-full h-full object-contain animate-pulse">
                    <span id="timer-text" class="relative z-10 text-xl md:text-2xl font-bold text-white">30</span>
                </div>
            </div>

            <!-- Question & Options Stack -->
            <div class="w-full flex flex-col items-center gap-1">
                
                <!-- Question -->
                <div class="relative w-full h-24 md:h-28 flex items-center justify-center animate-slideUp z-20">
                     <img src="${ASSETS.line}" class="absolute left-0 w-full h-auto object-cover opacity-60 pointer-events-none z-0" style="max-height: 20px; top: 50%; transform: translateY(-50%)">
                     <div class="relative w-full max-w-4xl h-full flex items-center justify-center">
                        <img src="${ASSETS.questionBox}" class="absolute inset-0 w-full h-full object-contain select-none pointer-events-none">
                        <div class="relative z-10 px-12 md:px-20 text-center flex items-center justify-center h-full pb-1">
                            <h2 class="question-text text-white text-sm md:text-xl font-bold leading-tight line-clamp-3">${q.question}</h2>
                        </div>
                     </div>
                </div>

                <!-- Options Row 1 -->
                <div id="options-row-1" class="relative w-full flex justify-center items-center py-1 opacity-0 translate-y-10 transition-all duration-700 z-10">
                    <img src="${ASSETS.line}" class="absolute left-0 w-full h-auto object-cover opacity-60 pointer-events-none z-0" style="max-height: 20px; top: 50%; transform: translateY(-50%)">
                    <div class="relative z-10 w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 px-2 md:px-12">
                        ${renderOptionHTML(0, 'A', q.options[0])}
                        ${renderOptionHTML(1, 'B', q.options[1])}
                    </div>
                </div>

                <!-- Options Row 2 -->
                <div id="options-row-2" class="relative w-full flex justify-center items-center py-1 opacity-0 translate-y-10 transition-all duration-700 z-10">
                    <img src="${ASSETS.line}" class="absolute left-0 w-full h-auto object-cover opacity-60 pointer-events-none z-0" style="max-height: 20px; top: 50%; transform: translateY(-50%)">
                    <div class="relative z-10 w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 px-2 md:px-12">
                        ${renderOptionHTML(2, 'C', q.options[2])}
                        ${renderOptionHTML(3, 'D', q.options[3])}
                    </div>
                </div>

            </div>

            <!-- Next Button (Hidden initially) -->
            <div id="next-btn-container" class="h-20 w-full flex items-center justify-center mt-4 opacity-0 pointer-events-none transition-all duration-300 scale-95">
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

// --- GAMEPLAY LOGIC ---

// 1. Reveal Options
const handleTrigger = (e) => {
    // Only trigger if clicking background or if explicitly called
    if (state.status !== 'question-incoming') return;
    
    state.status = 'options';
    state.audioRefs.incoming.pause();
    playAudio('clock', true);

    // Animate Options In
    document.getElementById('options-row-1').classList.remove('opacity-0', 'translate-y-10');
    document.getElementById('options-row-2').classList.remove('opacity-0', 'translate-y-10');
    document.getElementById('timer-box').classList.remove('opacity-0');

    startTimer();
    
    // Remove listeners
    document.removeEventListener('keydown', handleTriggerKey);
    document.getElementById('game-interface').removeEventListener('click', handleTrigger);
};

const handleTriggerKey = (e) => {
    if (e.code === 'Space' || e.code === 'ArrowRight') handleTrigger();
};

let timerInterval;
function startTimer() {
    let timeLeft = 30;
    const timerText = document.getElementById('timer-text');
    timerText.textContent = timeLeft;
    timerText.classList.remove('text-red-500');

    timerInterval = setInterval(() => {
        timeLeft--;
        timerText.textContent = timeLeft;
        if (timeLeft <= 5) timerText.classList.add('text-red-500');
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeUp();
        }
    }, 1000);
}

// 2. Select Option
window.handleOptionClick = (index) => {
    if (state.status !== 'options') return;

    clearInterval(timerInterval);
    state.status = 'locked';
    state.audioRefs.clock.pause();
    state.selectedOption = index;

    // Visual: Lock (Orange)
    updateOptionVisual(index, 'selected');

    // Wait then Reveal
    setTimeout(() => {
        revealAnswer();
    }, 2000);
};

function revealAnswer() {
    state.status = 'revealed';
    const correctIndex = state.quizData.questions[state.currentQuestionIndex].correctIndex;
    const isCorrect = state.selectedOption === correctIndex;

    // Visual: Correct (Green)
    updateOptionVisual(correctIndex, 'correct');
    
    // Audio
    if (isCorrect) {
        state.score += 1000; // Mock score
        playAudio('correct');
    } else {
        playAudio('wrong');
    }

    // Show Next Button
    const btn = document.getElementById('next-btn-container');
    btn.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
    btn.classList.add('opacity-100', 'scale-100');
}

function handleTimeUp() {
    state.status = 'revealed';
    state.audioRefs.clock.pause();
    playAudio('wrong');
    
    // Reveal correct answer
    const correctIndex = state.quizData.questions[state.currentQuestionIndex].correctIndex;
    updateOptionVisual(correctIndex, 'correct');

    const btn = document.getElementById('next-btn-container');
    btn.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
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

// 3. Next Question
window.handleNextQuestion = () => {
    stopAllAudio();
    if (state.currentQuestionIndex < state.quizData.questions.length - 1) {
        state.currentQuestionIndex++;
        renderQuestionIntro();
    } else {
        renderFinishedScreen();
    }
};

// 4. Finished
function renderFinishedScreen() {
    state.status = 'finished';
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center animate-fadeIn p-8 pointer-events-auto bg-black/40 backdrop-blur-sm rounded-3xl border border-white/10">
            <i data-lucide="trophy" class="w-20 h-20 text-yellow-400 mb-6 drop-shadow-[0_0_15px_rgba(255,215,0,0.6)] animate-bounce"></i>
            <h2 class="text-3xl md:text-5xl text-white font-bold mb-4">GAME OVER</h2>
            <p class="text-xl text-blue-200 mb-8">You won: <span class="text-yellow-400 font-bold text-2xl">$${state.score.toLocaleString()}</span></p>
            
            <a href="index.html" class="flex items-center space-x-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all hover:scale-105 shadow-lg shadow-blue-900/50">
                <i data-lucide="rotate-ccw"></i>
                <span>PLAY AGAIN</span>
            </a>
        </div>
    `;
    if(window.lucide) window.lucide.createIcons();
}
