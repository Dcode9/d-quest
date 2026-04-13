// Live quiz experience powered by Supabase realtime channels.
// Provides host and participant flows without requiring a bespoke backend.

(() => {
    const DEFAULT_EMOJIS = ['🧠', '🚀', '🦉', '🪐', '🎯', '🎸', '🐉', '🦾', '🧩', '🔥', '🌟', '🎮'];
    const LIVE_AUDIO = {
        intro: "assets/audio/Kaun Banega Crorepati Intro 2019.wav",
        questionIncoming: "assets/audio/KBC Question incoming.wav",
        timer30sec: "assets/audio/30 second tic tic kbc clock.mp3",
        correct: "assets/audio/Correct answer.mp3",
        wrong: "assets/audio/Wrong Ans.mp3"
    };

    const KBC_ASSETS = {
        questionBox: "assets/images/wide title and question.svg",
        timerBox: "assets/images/Timer.svg",
        optionNormal: "assets/images/normal option box.svg",
        optionGreen: "assets/images/option box green.svg",
        optionOrange: "assets/images/option box orange.svg",
        optionBlue: "assets/images/option box green.svg" // Using green as placeholder for blue
    };

    const state = {
        client: null,
        channel: null,
        role: null, // 'host' | 'player'
        roomCode: null,
        quizItem: null,
        questionIndex: 0,
        scores: {},
        players: {},
        answers: {},
        questionStart: null,
        currentQuestionPayload: null,
        timers: {
            question: null,
            heartbeat: null,
            intro: null
        },
        me: null,
        presence: {},
        status: 'idle',
        lastResults: null,
        questionPhase: 'none', // 'intro' | 'question-only' | 'options-reveal' | 'answer-reveal' | 'leaderboard'
        previousScores: {}
    };

    const audioRefs = {};

    function getTabSessionId() {
        const key = 'dquest_live_tab_id';
        let tabId = sessionStorage.getItem(key);
        if (!tabId) {
            const randomPart = Math.random().toString(36).slice(2, 10);
            tabId = `p-${crypto.randomUUID?.() || `${Date.now()}-${randomPart}`}`;
            sessionStorage.setItem(key, tabId);
        }
        return tabId;
    }

    function ensureClient() {
        if (!window.supabase) {
            alert("Supabase could not be loaded. Live quiz is unavailable.");
            return null;
        }
        if (!window.hasSupabaseConfig || !window.hasSupabaseConfig()) {
            alert("Supabase credentials are not configured. Set DQUEST_SUPABASE_URL and DQUEST_SUPABASE_KEY to enable live quizzes.");
            return null;
        }
        if (!state.client) {
            const { url, anonKey } = window.getSupabaseConfig();
            state.client = supabase.createClient(url, anonKey);
        }
        return state.client;
    }

    function loadIdentity() {
        const stored = localStorage.getItem('dquest_live_identity');
        const sessionId = getTabSessionId();
        if (stored) {
            try {
                const parsed = JSON.parse(stored) || {};
                state.me = {
                    id: sessionId,
                    name: parsed.name || 'Player',
                    emoji: parsed.emoji || '🧠'
                };
                return;
            } catch (err) {
                console.warn('Failed to parse stored identity', err);
            }
        }
        state.me = {
            id: sessionId,
            name: 'Player',
            emoji: '🧠'
        };
        localStorage.setItem('dquest_live_identity', JSON.stringify({
            name: state.me.name,
            emoji: state.me.emoji
        }));
    }

    function updateIdentity(partial) {
        state.me = { ...state.me, ...partial };
        localStorage.setItem('dquest_live_identity', JSON.stringify({
            name: state.me.name,
            emoji: state.me.emoji
        }));
    }

    function initAudio() {
        ['intro', 'questionIncoming', 'timer30sec', 'correct', 'wrong'].forEach((key) => {
            const audio = new Audio(LIVE_AUDIO[key]);
            audio.volume = key === 'intro' ? 0.9 : (key === 'timer30sec' ? 0.6 : 0.7);
            audioRefs[key] = audio;
        });
    }

    function playAudio(key) {
        const audio = audioRefs[key];
        if (!audio) return;
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }

    function stopAudio(key) {
        const audio = audioRefs[key];
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
    }

    function ensureOverlay() {
        let overlay = document.getElementById('live-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'live-overlay';
            overlay.className = 'fixed inset-0 z-50 flex items-center justify-center px-4 live-overlay';
            overlay.innerHTML = `
                <div class="absolute inset-0 opacity-80"></div>
                <div class="relative w-full max-w-5xl" id="live-overlay-shell"></div>
            `;
            document.body.appendChild(overlay);
        }
        return document.getElementById('live-overlay-shell');
    }

    function closeOverlay() {
        const overlay = document.getElementById('live-overlay');
        if (overlay) overlay.remove();
        state.status = 'idle';
        cleanupTimers();
        stopPlayerHeartbeat();
        leaveChannel();
        state.players = {};
        state.currentQuestionPayload = null;
    }

    function leaveChannel() {
        if (!state.channel) return;
        state.channel.unsubscribe().catch(() => {});
        state.channel = null;
        state.presence = {};
    }

    function cleanupTimers() {
        if (state.timers.question) clearInterval(state.timers.question);
        if (state.timers.intro) clearTimeout(state.timers.intro);
        state.timers.question = null;
        state.timers.intro = null;
        // Stop all audio when cleaning up
        stopAudio('intro');
        stopAudio('questionIncoming');
        stopAudio('timer30sec');
    }

    function stopPlayerHeartbeat() {
        if (state.timers.heartbeat) clearInterval(state.timers.heartbeat);
        state.timers.heartbeat = null;
    }

    function upsertPlayer(player) {
        if (!player || !player.id || player.role === 'host') return;

        const existing = state.players[player.id] || {};
        state.players[player.id] = {
            id: player.id,
            role: 'player',
            name: player.name || existing.name || 'Player',
            emoji: player.emoji || existing.emoji || '🎯'
        };

        if (typeof state.scores[player.id] !== 'number') {
            state.scores[player.id] = 0;
        }
    }

    function getPlayers() {
        const merged = {};

        Object.values(state.players).forEach((player) => {
            if (!player?.id) return;
            merged[player.id] = player;
        });

        Object.values(state.presence)
            .filter((entry) => entry.role === 'player' && entry.id)
            .forEach((entry) => {
                merged[entry.id] = {
                    id: entry.id,
                    role: 'player',
                    name: entry.name || merged[entry.id]?.name || 'Player',
                    emoji: entry.emoji || merged[entry.id]?.emoji || '🎯'
                };
            });

        return Object.values(merged);
    }

    function announcePlayerPresence(eventType = 'player-presence') {
        if (state.role !== 'player') return;
        broadcast({
            type: eventType,
            player: {
                id: state.me.id,
                role: 'player',
                name: state.me.name,
                emoji: state.me.emoji,
                status: state.status
            }
        });
    }

    function startPlayerHeartbeat() {
        if (state.role !== 'player') return;
        stopPlayerHeartbeat();

        announcePlayerPresence('player-joined');

        state.timers.heartbeat = setInterval(() => {
            // Presence heartbeats are only needed while waiting in lobby.
            // Sending them during active questions creates unnecessary broadcast load.
            if (state.status !== 'waiting') return;
            announcePlayerPresence('player-presence');
        }, 10000);
    }

    function renderHostLobby() {
        const shell = ensureOverlay();
        const participants = getPlayers();
        const totalQuestions = state.quizItem?.content?.questions?.length || 0;
        shell.innerHTML = `
            <div class="live-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none opacity-30" style="background: radial-gradient(circle at 30% 20%, rgba(234, 179, 8, 0.1), transparent 40%), radial-gradient(circle at 70% 80%, rgba(59, 130, 246, 0.15), transparent 35%);"></div>
                <div class="relative flex flex-col gap-6">
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <div class="text-slate-400 text-sm uppercase tracking-wide">Live Room</div>
                            <div class="flex items-center gap-3 mt-1">
                                <span class="text-4xl font-black text-yellow-400 tracking-[0.2em]">${state.roomCode}</span>
                                <button id="copy-room" class="px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 transition-colors border border-slate-700 flex items-center gap-1">
                                    <i data-lucide="copy" class="w-4 h-4"></i> Copy
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="live-chip flex items-center gap-2">
                                <i data-lucide="radio" class="w-4 h-4"></i>
                                Hosting ${totalQuestions} Qs
                            </span>
                            <button id="close-live" class="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors">
                                <i data-lucide="x" class="w-5 h-5"></i>
                            </button>
                        </div>
                    </div>

                    <div class="bg-slate-900/60 border border-slate-700 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center">
                        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500/30 to-orange-500/20 flex items-center justify-center text-3xl">${state.me.emoji}</div>
                        <div class="flex-1">
                            <div class="text-slate-300 text-sm">Hosting</div>
                            <div class="text-2xl font-bold">${state.quizItem?.content?.title || 'Quiz'}</div>
                            <div class="text-slate-400 text-sm mt-1">Share the code above. Players pick a name and emoji when joining.</div>
                        </div>
                        <button id="start-live-quiz" class="kbc-button text-black font-bold px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 hover:scale-105 transition-transform">
                            <i data-lucide="play" class="w-4 h-4"></i>
                            <span>Start Live Quiz</span>
                        </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                            <div class="flex items-center justify-between mb-3">
                                <div class="text-slate-300 font-semibold flex items-center gap-2">
                                    <i data-lucide="users" class="w-4 h-4"></i> Participants (${participants.length})
                                </div>
                                <div class="text-xs text-slate-500">Live presence</div>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" id="live-participant-list">
                                ${participants.map(p => renderParticipantChip(p)).join('') || '<div class="text-slate-500 text-sm">Waiting for players to join...</div>'}
                            </div>
                        </div>
                        <div class="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                            <div class="text-slate-300 font-semibold flex items-center gap-2 mb-3">
                                <i data-lucide="info" class="w-4 h-4"></i> How it works
                            </div>
                            <ul class="text-slate-400 text-sm space-y-2 list-disc list-inside">
                                <li>Share the 6-digit room code with players.</li>
                                <li>Players join from the home screen, choose a name + emoji.</li>
                                <li>Start when ready. We'll sync questions, timers and leaderboard.</li>
                                <li>Intro sound plays for you; players hear correct / wrong cues.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const copyBtn = document.getElementById('copy-room');
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard?.writeText(state.roomCode);
                copyBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Copied';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i data-lucide="copy" class="w-4 h-4"></i> Copy';
                    if (window.lucide) window.lucide.createIcons();
                }, 1200);
            };
        }

        const closeBtn = document.getElementById('close-live');
        if (closeBtn) closeBtn.onclick = closeOverlay;

        const startBtn = document.getElementById('start-live-quiz');
        if (startBtn) {
            startBtn.onclick = () => {
                if (participants.length === 0) {
                    const proceed = window.confirm('No participants detected yet. Start anyway?');
                    if (!proceed) return;
                }
                startBtn.disabled = true;
                startLiveSession();
            };
        }

        if (window.lucide) window.lucide.createIcons();
    }

    function renderParticipantChip(p) {
        const score = state.scores[p.id] || 0;
        return `
            <div class="live-participant rounded-xl p-3 flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-2xl">${p.emoji || '🎯'}</div>
                <div class="flex-1 min-w-0">
                    <div class="text-white font-semibold truncate">${p.name || 'Player'}</div>
                    <div class="text-xs text-slate-500">Score: ${score}</div>
                </div>
            </div>
        `;
    }

    function renderPlayerQuestionView(payload) {
        const shell = ensureOverlay();
        state.status = 'answering';
        cleanupTimers();

        // KBC-styled player question view - ONLY 4 ABCD buttons, NO question display
        // Full screen edge-to-edge buttons with fly-up animation
        shell.innerHTML = `
            <div class="w-full h-screen flex flex-col items-center justify-center p-2 gap-3">
                <!-- Options Grid - Full Screen ABCD Buttons ONLY -->
                <div class="w-full h-full flex flex-col gap-3" id="live-options">
                    ${payload.options.map((opt, idx) => `
                        <div data-idx="${idx}" class="kbc-svg-container kbc-option-box kbc-option-selectable flex-1 opacity-0 animate-slideUp"
                             style="background-image: url('${KBC_ASSETS.optionNormal}'); animation-delay: ${idx * 0.15}s; animation-fill-mode: forwards;">
                            <div class="kbc-svg-content">
                                <div class="flex items-center justify-center">
                                    <span class="text-5xl md:text-7xl font-black text-yellow-400">${String.fromCharCode(65 + idx)}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        const optionContainers = Array.from(document.querySelectorAll('#live-options .kbc-option-selectable'));
        optionContainers.forEach(container => {
            container.onclick = () => {
                if (state.status !== 'answering') return;
                const choice = parseInt(container.getAttribute('data-idx'), 10);
                sendAnswer(choice, payload);

                // Disable all options and highlight selected in locked yellow state
                optionContainers.forEach(c => {
                    c.classList.remove('kbc-option-selectable');
                    c.style.pointerEvents = 'none';
                });
                container.classList.add('kbc-option-selected');
                container.style.backgroundImage = `url('${KBC_ASSETS.optionOrange}')`;
            };
        });

        // No countdown timer display for players, but still track time
        startPlayerCountdown(payload);
    }

    function renderPlayerQuestionIntro(payload) {
        const shell = ensureOverlay();
        state.status = 'question-intro';

        // Player sees only question number while waiting for options
        shell.innerHTML = `
            <div class="w-full h-screen flex flex-col items-center justify-center p-4 md:p-8">
                <div class="text-center animate-fadeIn">
                    <div class="text-2xl uppercase tracking-[0.3em] text-yellow-400/70 mb-6">Question ${payload.questionIndex + 1}</div>
                    <div class="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-500/30 to-orange-500/20 flex items-center justify-center text-5xl animate-float mb-8">
                        ${state.me.emoji}
                    </div>
                    <div class="text-xl text-slate-300 animate-pulse">Get Ready...</div>
                </div>
            </div>
        `;
    }

    function renderHostQuestionIntro(question) {
        const shell = ensureOverlay();

        // Show only the question with dramatic intro (music will play until complete or skipped)
        shell.innerHTML = `
            <div class="w-full h-screen flex flex-col items-center justify-center p-4 md:p-8">
                <!-- Skip Button (Top Right) -->
                <div class="absolute top-4 right-4 z-50">
                    <button id="skip-intro-btn" class="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-yellow-500 hover:text-black hover:border-yellow-400 transition-all">
                        <i data-lucide="skip-forward" class="w-4 h-4 inline mr-1"></i>
                        Skip Intro
                    </button>
                </div>

                <div class="text-center mb-8 animate-fadeIn">
                    <div class="text-sm uppercase tracking-[0.3em] text-yellow-400/70 mb-3">Question ${state.questionIndex + 1} of ${state.quizItem.content.questions.length}</div>
                    <div class="w-16 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto"></div>
                </div>

                <div class="w-full max-w-5xl">
                    <div class="kbc-svg-container kbc-question-box animate-slideUp" style="background-image: url('${KBC_ASSETS.questionBox}');">
                        <div class="kbc-svg-content">
                            <div class="text-center">
                                <div class="text-2xl md:text-3xl lg:text-4xl font-bold text-white question-text animate-typeIn">${question.question}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mt-8 text-slate-400 text-sm flex items-center gap-2 animate-fadeIn" style="animation-delay: 1s;">
                    <i data-lucide="music" class="w-4 h-4"></i>
                    Options will appear shortly...
                </div>
            </div>
        `;

        const skipBtn = document.getElementById('skip-intro-btn');
        if (skipBtn) {
            skipBtn.onclick = () => {
                stopAudio('intro');
                if (state.timers.intro) {
                    clearTimeout(state.timers.intro);
                    state.timers.intro = null;
                }
                // Immediately show options
                revealQuestionOptions();
            };
        }

        if (window.lucide) window.lucide.createIcons();
    }

    function renderHostQuestionView(question) {
        const shell = ensureOverlay();

        // KBC-styled host view with responsive SVG containers and countdown
        shell.innerHTML = `
            <div class="w-full h-screen flex flex-col items-center justify-center p-4 md:p-8 gap-6">
                <!-- Header with Question Number and Controls -->
                <div class="w-full max-w-6xl flex items-center justify-between mb-4">
                    <div class="text-xs uppercase tracking-wide text-slate-400">
                        Question ${state.questionIndex + 1} / ${state.quizItem.content.questions.length}
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="live-chip flex items-center gap-2">
                            <i data-lucide="timer" class="w-4 h-4"></i>
                            <span id="host-countdown" class="kbc-countdown-pulse">30s</span>
                        </div>
                        <button id="end-question-btn" class="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-yellow-500 hover:text-black hover:border-yellow-400 transition-all">
                            <i data-lucide="skip-forward" class="w-4 h-4 inline mr-1"></i>
                            Reveal Now
                        </button>
                    </div>
                </div>

                <!-- Question Display with KBC SVG -->
                <div class="w-full max-w-5xl">
                    <div class="kbc-svg-container kbc-question-box" style="background-image: url('${KBC_ASSETS.questionBox}');">
                        <div class="kbc-svg-content">
                            <div class="text-center">
                                <div class="text-2xl md:text-3xl lg:text-4xl font-bold text-white question-text" style="
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    display: -webkit-box;
                                    -webkit-line-clamp: 2;
                                    -webkit-box-orient: vertical;
                                    word-wrap: break-word;
                                ">${question.question}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Options Grid with KBC SVG containers -->
                <div class="kbc-options-grid w-full max-w-6xl">
                    ${question.options.map((opt, idx) => `
                        <div class="kbc-svg-container kbc-option-box" style="background-image: url('${KBC_ASSETS.optionNormal}');">
                            <div class="kbc-svg-content">
                                <div class="flex items-center gap-4 px-4">
                                    <span class="text-2xl md:text-3xl font-black text-yellow-400">${String.fromCharCode(65 + idx)}</span>
                                    <span class="text-lg md:text-xl font-semibold text-white" style="
                                        overflow: hidden;
                                        text-overflow: ellipsis;
                                        display: -webkit-box;
                                        -webkit-line-clamp: 2;
                                        -webkit-box-orient: vertical;
                                        word-wrap: break-word;
                                    ">${opt}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-400 flex items-center gap-2 max-w-4xl">
                    <i data-lucide="activity" class="w-4 h-4"></i>
                    Live answers incoming. Reveal to show correct answer and leaderboard.
                </div>
            </div>
        `;

        const endBtn = document.getElementById('end-question-btn');
        if (endBtn) endBtn.onclick = () => finishQuestion(true);
        if (window.lucide) window.lucide.createIcons();
    }

    function renderLeaderboard(results, correctIndex, isFinal = false) {
        const shell = ensureOverlay();
        const sortedResults = [...results].sort((a, b) => b.total - a.total);

        // Calculate position changes from previous scores
        const resultsWithPositions = sortedResults.map((res, idx) => {
            const previousTotal = state.previousScores[res.id] || 0;
            const previousPosition = sortedResults.findIndex(r => r.total === previousTotal);
            let positionChange = 'same';
            if (previousPosition >= 0) {
                if (idx < previousPosition) positionChange = 'up';
                else if (idx > previousPosition) positionChange = 'down';
            }
            return { ...res, position: idx + 1, positionChange };
        });

        // For finale, show Top 3 with spotlight reveal
        if (isFinal) {
            renderFinale(resultsWithPositions.slice(0, 3));
            return;
        }

        // Show Top 5 for regular leaderboard
        const topFive = resultsWithPositions.slice(0, 5);
        const topThree = resultsWithPositions.slice(0, 3);

        // Get the current question to display correct answer (host only)
        const q = state.quizItem?.content?.questions?.[state.questionIndex];
        const showCorrectAnswer = state.role === 'host' && typeof correctIndex === 'number' && q;

        shell.innerHTML = `
            <div class="w-full h-screen flex flex-col items-center justify-center p-4 md:p-8 gap-6">
                <!-- Correct Answer Display (Host Only) -->
                ${showCorrectAnswer ? `
                    <div class="w-full max-w-5xl animate-fadeIn">
                        <div class="text-center text-sm uppercase tracking-[0.3em] text-blue-400/70 mb-3">Correct Answer</div>
                        <div class="kbc-svg-container kbc-option-box" style="background-image: url('${KBC_ASSETS.optionBlue}'); filter: hue-rotate(180deg);">
                            <div class="kbc-svg-content">
                                <div class="flex items-center gap-4 px-4">
                                    <span class="text-2xl md:text-3xl font-black text-blue-400">${String.fromCharCode(65 + correctIndex)}</span>
                                    <span class="text-lg md:text-xl font-semibold text-white" style="
                                        overflow: hidden;
                                        text-overflow: ellipsis;
                                        display: -webkit-box;
                                        -webkit-line-clamp: 2;
                                        -webkit-box-orient: vertical;
                                        word-wrap: break-word;
                                    ">${q.options[correctIndex]}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Header -->
                <div class="text-center animate-fadeIn">
                    <div class="text-sm uppercase tracking-[0.3em] text-yellow-400/70 mb-2">
                        ${!showCorrectAnswer && typeof correctIndex === 'number' ? `Correct Answer: ${String.fromCharCode(65 + correctIndex)}` : 'Leaderboard'}
                    </div>
                    <div class="text-3xl font-bold text-white">After Question ${state.questionIndex + 1}</div>
                </div>

                <!-- Top 3 Podium -->
                ${topThree.length >= 3 ? renderPodium(topThree) : ''}

                <!-- Top 5 List -->
                <div class="w-full max-w-4xl space-y-3 animate-slideUp" style="animation-delay: 0.3s;">
                    ${topFive.map((res, idx) => `
                        <div class="kbc-svg-container kbc-leaderboard-item animate-slideUp ${res.id === state.me?.id ? 'border-2 border-yellow-400' : ''}"
                             style="background-image: url('${idx < 3 ? KBC_ASSETS.optionGreen : KBC_ASSETS.optionNormal}'); animation-delay: ${0.4 + idx * 0.1}s;">
                            <div class="kbc-svg-content">
                                <div class="flex items-center gap-4 px-4">
                                    <!-- Position -->
                                    <div class="flex items-center gap-2">
                                        <span class="text-2xl font-black ${idx < 3 ? 'kbc-rank-' + (idx + 1) : 'text-yellow-400'}">#${res.position}</span>
                                        ${res.positionChange === 'up' ? '<i data-lucide="arrow-up" class="w-4 h-4 kbc-position-up"></i>' : ''}
                                        ${res.positionChange === 'down' ? '<i data-lucide="arrow-down" class="w-4 h-4 kbc-position-down"></i>' : ''}
                                    </div>
                                    <!-- Emoji -->
                                    <div class="text-3xl">${res.emoji || '🎯'}</div>
                                    <!-- Name and Score -->
                                    <div class="flex-1 min-w-0">
                                        <div class="text-lg font-bold text-white truncate">${res.name}</div>
                                        <div class="text-xs text-slate-300">+${res.delta} points • Total: ${res.total}</div>
                                    </div>
                                    <!-- Answer -->
                                    ${typeof res.choice === 'number' ? `
                                        <div class="flex items-center gap-2">
                                            <span class="text-lg font-bold ${res.isCorrect ? 'text-green-400' : 'text-rose-400'}">${String.fromCharCode(65 + res.choice)}</span>
                                            ${res.isCorrect ? '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-400"></i>' : '<i data-lucide="x-circle" class="w-5 h-5 text-rose-400"></i>'}
                                        </div>
                                    ` : '<span class="text-xs text-slate-500">No answer</span>'}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Host Controls -->
                ${state.role === 'host' ? `
                    <div class="flex gap-3 animate-fadeIn" style="animation-delay: 1s;">
                        <button id="next-question-btn" class="kbc-button text-black font-bold px-8 py-4 rounded-xl shadow-lg flex items-center gap-2 hover:scale-105 transition-transform">
                            <i data-lucide="${state.questionIndex + 1 >= state.quizItem.content.questions.length ? 'flag' : 'skip-forward'}" class="w-5 h-5"></i>
                            <span>${state.questionIndex + 1 >= state.quizItem.content.questions.length ? 'Show Finale' : 'Next Question'}</span>
                        </button>
                    </div>
                ` : `
                    <div class="text-slate-400 text-sm animate-fadeIn" style="animation-delay: 1s;">
                        Waiting for host to continue...
                    </div>
                `}
            </div>
        `;

        if (state.role === 'host') {
            const nextBtn = document.getElementById('next-question-btn');
            if (nextBtn) nextBtn.onclick = () => {
                if (state.questionIndex + 1 >= state.quizItem.content.questions.length) {
                    broadcastFinal(resultsWithPositions);
                } else {
                    state.questionIndex += 1;
                    sendQuestion();
                }
            };
        }

        if (window.lucide) window.lucide.createIcons();
    }

    function renderPodium(entries) {
        const places = ['🥉', '🥈', '🥇'];
        return `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                ${entries.map((res, idx) => `
                    <div class="podium-card rounded-2xl p-4 text-center ${idx === 2 ? 'podium-winner' : ''}" style="animation-delay:${idx * 0.1}s">
                        <div class="text-3xl">${places[idx] || ''}</div>
                        <div class="text-2xl font-bold text-white mt-1">${res.name}</div>
                        <div class="text-xl">${res.emoji || '🎯'}</div>
                        <div class="text-sm text-slate-300 mt-2">Score ${res.total}</div>
                    </div>
                `).reverse().join('')}
            </div>
        `;
    }

    function renderFinale(topThree) {
        const shell = ensureOverlay();

        // Cinematic finale with spotlight animation revealing Top 3 in order: 3rd → 2nd → 1st
        shell.innerHTML = `
            <div class="w-full h-screen flex flex-col items-center justify-center p-4 md:p-8">
                <!-- Title -->
                <div class="text-center mb-12 animate-fadeIn">
                    <div class="text-sm uppercase tracking-[0.5em] text-yellow-400/70 mb-3">Grand Finale</div>
                    <div class="text-5xl font-black text-yellow-400 tracking-wider">Hall of Champions</div>
                    <div class="w-32 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto mt-4"></div>
                </div>

                <!-- Top 3 Podium with Spotlight Reveals -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
                    <!-- 3rd Place (Reveals First) -->
                    ${topThree[2] ? `
                        <div class="kbc-spotlight-reveal kbc-spotlight-3rd opacity-0">
                            <div class="kbc-svg-container kbc-leaderboard-item" style="background-image: url('${KBC_ASSETS.optionGreen}');">
                                <div class="kbc-svg-content">
                                    <div class="text-center">
                                        <div class="text-6xl kbc-rank-3 mb-2">🥉</div>
                                        <div class="text-2xl font-black text-white">${topThree[2].name}</div>
                                        <div class="text-4xl my-2">${topThree[2].emoji || '🎯'}</div>
                                        <div class="text-xl text-yellow-400 font-bold">${topThree[2].total} points</div>
                                        <div class="text-sm text-slate-300 mt-1">3rd Place</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 2nd Place (Reveals Second) -->
                    ${topThree[1] ? `
                        <div class="kbc-spotlight-reveal kbc-spotlight-2nd opacity-0">
                            <div class="kbc-svg-container kbc-leaderboard-item" style="background-image: url('${KBC_ASSETS.optionGreen}');">
                                <div class="kbc-svg-content">
                                    <div class="text-center">
                                        <div class="text-6xl kbc-rank-2 mb-2">🥈</div>
                                        <div class="text-2xl font-black text-white">${topThree[1].name}</div>
                                        <div class="text-4xl my-2">${topThree[1].emoji || '🎯'}</div>
                                        <div class="text-xl text-yellow-400 font-bold">${topThree[1].total} points</div>
                                        <div class="text-sm text-slate-300 mt-1">2nd Place</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 1st Place (Reveals Last with Winner Animation) -->
                    ${topThree[0] ? `
                        <div class="kbc-spotlight-reveal kbc-spotlight-1st opacity-0">
                            <div class="kbc-svg-container kbc-leaderboard-item podium-winner" style="background-image: url('${KBC_ASSETS.optionGreen}');">
                                <div class="kbc-svg-content">
                                    <div class="text-center">
                                        <div class="text-6xl kbc-rank-1 mb-2">🥇</div>
                                        <div class="text-3xl font-black text-yellow-400">${topThree[0].name}</div>
                                        <div class="text-5xl my-3">${topThree[0].emoji || '🎯'}</div>
                                        <div class="text-2xl text-yellow-400 font-black">${topThree[0].total} points</div>
                                        <div class="text-lg text-yellow-300 mt-2 font-bold">🏆 Champion 🏆</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Return to Home -->
                ${state.role === 'host' ? `
                    <div class="mt-12 opacity-0 animate-fadeIn" style="animation-delay: 5s;">
                        <button id="end-quiz-btn" class="kbc-button text-black font-bold px-8 py-4 rounded-xl shadow-lg flex items-center gap-2 hover:scale-105 transition-transform">
                            <i data-lucide="home" class="w-5 h-5"></i>
                            <span>End Quiz</span>
                        </button>
                    </div>
                ` : `
                    <div class="mt-12 text-slate-400 text-sm opacity-0 animate-fadeIn" style="animation-delay: 5s;">
                        Congratulations to all players!
                    </div>
                `}
            </div>
        `;

        if (state.role === 'host') {
            const endBtn = document.getElementById('end-quiz-btn');
            if (endBtn) {
                // Delay button activation until animations complete
                setTimeout(() => {
                    endBtn.onclick = closeOverlay;
                }, 5000);
            }
        }

        if (window.lucide) window.lucide.createIcons();
    }

    async function startLiveHost(quizItem) {
        if (!ensureClient()) return;
        state.role = 'host';
        state.quizItem = quizItem;
        state.roomCode = String(Math.floor(100000 + Math.random() * 900000));
        state.questionIndex = 0;
        state.scores = {};
        state.players = {};
        state.answers = {};
        state.currentQuestionPayload = null;
        state.status = 'lobby';
        try {
            await trackChannel(state.roomCode);
            renderHostLobby();
        } catch (error) {
            console.error('Failed to start live room:', error);
            alert('Could not create live room. Please try again.');
            closeOverlay();
        }
    }

    async function trackChannel(code) {
        if (state.channel) {
            await state.channel.unsubscribe();
        }
        const client = ensureClient();
        if (!client) return;
        state.channel = client.channel(`live-${code}`, {
            config: {
                presence: { key: state.me.id }
            }
        });

        state.channel.on('presence', { event: 'sync' }, handlePresenceSync);
        state.channel.on('presence', { event: 'join' }, handlePresenceSync);
        state.channel.on('broadcast', { event: 'live' }, ({ payload }) => handleBroadcast(payload));

        await waitForSubscribed(state.channel);

        await state.channel.track({
            id: state.me.id,
            name: state.me.name,
            emoji: state.me.emoji,
            role: state.role,
            quizTitle: state.quizItem?.content?.title,
            totalQuestions: state.quizItem?.content?.questions?.length || 0
        });
    }

    function waitForSubscribed(channel) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('Timed out connecting to live room'));
            }, 10000);

            channel.subscribe((status) => {
                if (settled) return;
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    settled = true;
                    resolve();
                    return;
                }
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    clearTimeout(timeout);
                    settled = true;
                    reject(new Error(`Live connection failed: ${status}`));
                }
            });
        });
    }

    function handlePresenceSync() {
        const presence = state.channel.presenceState();
        const flattened = {};
        Object.keys(presence).forEach((key) => {
            const entries = presence[key];
            const latest = entries[entries.length - 1];
            if (latest) flattened[key] = latest;
        });
        state.presence = flattened;
        Object.values(flattened).forEach((entry) => {
            upsertPlayer(entry);
        });
        if (state.role === 'host') {
            renderHostLobby();
            broadcastRoomInfo();
        }
    }

    function broadcastRoomInfo() {
        if (state.role !== 'host') return;
        broadcast({
            type: 'room-info',
            roomCode: state.roomCode,
            title: state.quizItem?.content?.title,
            totalQuestions: state.quizItem?.content?.questions?.length || 0
        });
    }

    function handleBroadcast(payload) {
        if (!payload || !payload.type) return;

        // Ignore targeted payloads for other players.
        if (payload.targetId && payload.targetId !== state.me?.id) return;

        if ((payload.type === 'player-joined' || payload.type === 'player-presence') && state.role === 'host') {
            const playerMeta = payload.player || payload;
            upsertPlayer(playerMeta);

            if (state.status === 'lobby') {
                renderHostLobby();
            }

            // Resync only once for newly joined players.
            // Do not rebroadcast active question payload on heartbeat updates.
            if (
                payload.type === 'player-joined' &&
                state.currentQuestionPayload &&
                (state.currentQuestionPayload.type === 'question' || state.currentQuestionPayload.type === 'question-intro')
            ) {
                const joiningPlayerId = playerMeta?.id;
                if (joiningPlayerId) {
                    broadcast({
                        ...state.currentQuestionPayload,
                        targetId: joiningPlayerId,
                        isResync: true
                    });
                }
            }
            return;
        }

        if (payload.type === 'room-info' && state.role === 'player') {
            state.quizMeta = payload;
            if (state.status === 'waiting') renderWaitingRoom();
        }

        if (payload.type === 'question-intro' && state.role === 'player') {
            const isDuplicateIntro =
                state.currentQuestionPayload?.type === 'question-intro' &&
                state.currentQuestionPayload?.questionIndex === payload.questionIndex &&
                state.status === 'question-intro';

            if (isDuplicateIntro && !payload.isResync) return;

            cleanupTimers();
            state.status = 'question-intro';
            state.questionIndex = payload.questionIndex;
            state.currentQuestionPayload = payload;
            renderPlayerQuestionIntro(payload);
        }

        if (payload.type === 'question') {
            const isDuplicateQuestion =
                state.role === 'player' &&
                state.currentQuestionPayload?.type === 'question' &&
                state.currentQuestionPayload?.questionIndex === payload.questionIndex &&
                (state.status === 'answering' || state.status === 'locked' || state.status === 'question');

            if (isDuplicateQuestion && !payload.isResync) return;

            cleanupTimers();
            state.status = 'question';
            state.questionIndex = payload.questionIndex;
            state.questionStart = payload.startAt;
            state.currentQuestionPayload = payload;
            if (state.role === 'player') {
                renderPlayerQuestionView(payload);
            } else if (state.role === 'host') {
                renderHostQuestionView(state.quizItem.content.questions[state.questionIndex]);
            }
        }
        if (payload.type === 'answer' && state.role === 'host') {
            upsertPlayer(payload);
            collectAnswer(payload);
        }
        if (payload.type === 'leaderboard') {
            cleanupTimers();
            state.status = 'leaderboard';
            state.lastResults = payload.results;
            state.currentQuestionPayload = payload;
            if (state.role === 'player') {
                const mine = payload.results.find(r => r.id === state.me.id);
                if (mine) playAudio(mine.isCorrect ? 'correct' : 'wrong');
            }
            renderLeaderboard(payload.results, payload.correctIndex, false);
            if (payload.isFinal) {
                renderLeaderboard(payload.results, payload.correctIndex, true);
            }
        }
        if (payload.type === 'final') {
            cleanupTimers();
            state.status = 'final';
            state.currentQuestionPayload = payload;
            renderLeaderboard(payload.results, null, true);
        }
    }

    function startLiveSession() {
        state.status = 'in-progress';
        playAudio('intro');
        sendQuestion();
    }

    function sendQuestion() {
        cleanupTimers();
        const q = state.quizItem.content.questions[state.questionIndex];
        const correctIndex = Number.parseInt(q.correctIndex, 10);
        const normalizedCorrectIndex = Number.isNaN(correctIndex) ? q.correctIndex : correctIndex;

        // Store previous scores for position tracking
        state.previousScores = { ...state.scores };

        // Start with intro phase: play intro music, show only question
        state.questionPhase = 'intro';
        state.status = 'question-intro';

        const introPayload = {
            type: 'question-intro',
            questionIndex: state.questionIndex,
            question: q.question
        };
        state.currentQuestionPayload = introPayload;
        broadcast(introPayload);

        if (state.role === 'host') {
            playAudio('intro');
            renderHostQuestionIntro(q);
        }

        // After intro music completes or is skipped, reveal options
        state.timers.intro = setTimeout(() => {
            revealQuestionOptions();
        }, 5000);
    }

    function revealQuestionOptions() {
        const q = state.quizItem.content.questions[state.questionIndex];
        const correctIndex = Number.parseInt(q.correctIndex, 10);
        const normalizedCorrectIndex = Number.isNaN(correctIndex) ? q.correctIndex : correctIndex;

        // Play question incoming sound for host
        if (state.role === 'host') {
            playAudio('questionIncoming');
        }

        state.questionPhase = 'options-reveal';
        state.status = 'question';

        const payload = {
            type: 'question',
            questionIndex: state.questionIndex,
            question: q.question,
            options: q.options,
            correctIndex: normalizedCorrectIndex,
            startAt: Date.now()
        };

        state.currentQuestionPayload = payload;
        state.questionStart = payload.startAt;
        state.answers[state.questionIndex] = {};

        broadcast(payload);

        if (state.role === 'host') {
            // Wait for question incoming sound to finish, then show options with timer sound
            setTimeout(() => {
                renderHostQuestionView(q);
                playAudio('timer30sec');
                startHostCountdown();
            }, 2000); // 2 seconds for question incoming sound
        }
    }

    function startHostCountdown() {
        const countdownEl = document.getElementById('host-countdown');
        let remaining = 30;
        if (countdownEl) countdownEl.textContent = `${remaining}s`;
        state.timers.question = setInterval(() => {
            remaining -= 1;
            if (countdownEl) {
                countdownEl.textContent = `${remaining}s`;
                // Add urgent animation for last 5 seconds
                if (remaining <= 5 && remaining > 0) {
                    countdownEl.classList.remove('kbc-countdown-pulse');
                    countdownEl.classList.add('kbc-countdown-urgent');
                }
            }
            if (remaining <= 0) {
                stopAudio('timer30sec');
                finishQuestion(false);
            }
        }, 1000);
    }

    function startPlayerCountdown(payload) {
        // Players don't see the countdown, but we still track time for answer submission
        let remaining = 30;
        state.timers.question = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(state.timers.question);
                state.status = 'locked';
                const options = document.querySelectorAll('#live-options .kbc-option-selectable');
                options.forEach(opt => {
                    opt.classList.remove('kbc-option-selectable');
                    opt.style.pointerEvents = 'none';
                });
            }
        }, 1000);
    }

    function sendAnswer(choice, questionPayload) {
        state.status = 'locked';
        const elapsed = Date.now() - (questionPayload.startAt || Date.now());
        broadcast({
            type: 'answer',
            questionIndex: questionPayload.questionIndex,
            id: state.me.id,
            name: state.me.name,
            emoji: state.me.emoji,
            choice,
            elapsed
        });
    }

    function collectAnswer(payload) {
        if (!state.answers[payload.questionIndex]) {
            state.answers[payload.questionIndex] = {};
        }
        if (!state.answers[payload.questionIndex][payload.id]) {
            state.answers[payload.questionIndex][payload.id] = payload;
        }
    }

    function finishQuestion(forceReveal) {
        cleanupTimers();
        stopAudio('timer30sec');
        const q = state.quizItem.content.questions[state.questionIndex];
        const correctIndex = Number.parseInt(q.correctIndex, 10);
        const normalizedCorrectIndex = Number.isNaN(correctIndex) ? q.correctIndex : correctIndex;
        const answers = state.answers[state.questionIndex] || {};
        const results = [];
        const playersOnly = getPlayers();
        playersOnly.forEach((p) => {
            const response = answers[p.id];
            const isCorrect = response ? response.choice === normalizedCorrectIndex : false;
            const delta = isCorrect ? calculateScoreDelta(response?.elapsed || 30000) : 0;
            state.scores[p.id] = (state.scores[p.id] || 0) + delta;
            results.push({
                id: p.id,
                name: p.name,
                emoji: p.emoji,
                choice: response?.choice,
                isCorrect,
                delta,
                total: state.scores[p.id]
            });
        });
        results.sort((a, b) => b.total - a.total || b.delta - a.delta);
        broadcast({
            type: 'leaderboard',
            questionIndex: state.questionIndex,
            correctIndex: normalizedCorrectIndex,
            results
        });
        state.status = 'leaderboard';
        state.currentQuestionPayload = {
            type: 'leaderboard',
            questionIndex: state.questionIndex,
            correctIndex: normalizedCorrectIndex,
            results
        };
        renderLeaderboard(results, normalizedCorrectIndex, false);
        const isLast = state.questionIndex + 1 >= state.quizItem.content.questions.length;
        if (forceReveal && isLast) broadcastFinal(results);
    }

    function calculateScoreDelta(elapsedMs) {
        const speedFactor = Math.max(0, 1 - Math.min(elapsedMs, 30000) / 30000);
        return Math.max(150, Math.round(600 + 400 * speedFactor));
    }

    function broadcastFinal(results) {
        broadcast({
            type: 'final',
            results: results.sort((a, b) => b.total - a.total)
        });
        renderLeaderboard(results.sort((a, b) => b.total - a.total), null, true);
    }

    function broadcast(payload) {
        if (!state.channel) return;
        state.channel.send({ type: 'broadcast', event: 'live', payload });
    }

    function openJoinDialog(prefill = '') {
        const shell = ensureOverlay();
        state.role = 'player';
        state.status = 'join';
        shell.innerHTML = `
            <div class="live-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none opacity-25" style="background: radial-gradient(circle at 10% 15%, rgba(234, 179, 8, 0.15), transparent 45%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.2), transparent 35%);"></div>
                <div class="relative grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="space-y-4">
                        <div class="text-slate-300 text-sm uppercase tracking-wide">Join Live Room</div>
                        <div class="text-3xl font-extrabold text-white">Enter the 6-digit code</div>
                        <div class="text-slate-400 text-sm">Pick a fun name and emoji—your avatar on the leaderboard.</div>
                        <div class="space-y-2">
                            <label class="text-slate-400 text-sm">Room Code</label>
                            <input id="join-code" maxlength="6" value="${prefill || ''}" class="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white focus:border-yellow-400 outline-none" placeholder="123456" />
                        </div>
                        <div class="space-y-2">
                            <label class="text-slate-400 text-sm">Display Name</label>
                            <input id="join-name" value="${state.me.name || ''}" class="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white focus:border-yellow-400 outline-none" placeholder="Player One" />
                        </div>
                        <div class="space-y-2">
                            <label class="text-slate-400 text-sm">Pick an emoji</label>
                            <div class="grid grid-cols-6 gap-2 emoji-picker">
                                ${DEFAULT_EMOJIS.map(em => `
                                    <button data-emoji="${em}" class="rounded-xl bg-slate-900 px-2 py-2 ${state.me.emoji === em ? 'border-yellow-400' : ''}">
                                        <span class="text-2xl">${em}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="flex gap-3">
                            <button id="submit-join" class="kbc-button text-black font-bold px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 hover:scale-105 transition-transform">
                                <i data-lucide="log-in" class="w-4 h-4"></i>
                                Join Room
                            </button>
                            <button id="cancel-join" class="px-4 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</button>
                        </div>
                    </div>
                    <div class="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                        <div class="flex items-center gap-3">
                            <div id="live-preview-emoji" class="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center text-3xl">${state.me.emoji}</div>
                            <div>
                                <div class="text-slate-300 text-sm">You</div>
                                <div class="text-xl font-bold text-white" id="live-preview-name">${state.me.name}</div>
                            </div>
                        </div>
                        <div class="text-slate-400 text-sm leading-relaxed">
                            Wait on the lobby screen until the host starts. You'll hear sounds for correct and wrong answers, and see the leaderboard after each round.
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.querySelectorAll('.emoji-picker button').forEach(btn => {
            btn.onclick = () => {
                const em = btn.getAttribute('data-emoji');
                updateIdentity({ emoji: em });
                document.querySelectorAll('.emoji-picker button').forEach(b => b.classList.remove('border-yellow-400'));
                btn.classList.add('border-yellow-400');
                const avatar = document.getElementById('live-preview-emoji');
                if (avatar) avatar.textContent = em;
            };
        });

        const cancel = document.getElementById('cancel-join');
        if (cancel) cancel.onclick = closeOverlay;

        const nameInput = document.getElementById('join-name');
        if (nameInput) {
            nameInput.addEventListener('input', () => {
                const preview = document.getElementById('live-preview-name');
                if (preview) preview.textContent = nameInput.value || 'Player';
            });
        }

        const submit = document.getElementById('submit-join');
        if (submit) {
            submit.onclick = () => {
                const code = document.getElementById('join-code').value.trim();
                const name = document.getElementById('join-name').value.trim() || 'Player';
                updateIdentity({ name });
                if (code.length !== 6) {
                    alert('Enter a 6-digit code');
                    return;
                }
                joinAsPlayer(code);
            };
        }

        if (window.lucide) window.lucide.createIcons();
    }

    async function joinAsPlayer(code) {
        state.roomCode = code;
        state.role = 'player';
        state.status = 'waiting';
        state.scores = {};
        state.players = {};
        state.answers = {};
        state.currentQuestionPayload = null;
        try {
            await trackChannel(code);
            startPlayerHeartbeat();
            renderWaitingRoom();
        } catch (error) {
            console.error('Failed to join live room:', error);
            alert('Could not join this live room. Please verify the code and try again.');
            closeOverlay();
        }
    }

    function renderWaitingRoom() {
        const shell = ensureOverlay();
        shell.innerHTML = `
            <div class="live-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none opacity-20" style="background: radial-gradient(circle at 15% 15%, rgba(234, 179, 8, 0.12), transparent 45%), radial-gradient(circle at 85% 85%, rgba(59, 130, 246, 0.16), transparent 35%);"></div>
                <div class="relative flex flex-col gap-6 items-center text-center">
                    <div class="live-chip flex items-center gap-2">
                        <i data-lucide="radio" class="w-4 h-4"></i>
                        Room ${state.roomCode}
                    </div>
                    <div class="text-3xl md:text-4xl font-extrabold text-white">Waiting for host</div>
                    <div class="text-slate-400">Stay here. The host will move everyone to the question screen.</div>
                    <div class="flex items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl px-4 py-3">
                        <div class="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">${state.me.emoji}</div>
                        <div class="text-left">
                            <div class="text-sm text-slate-400">You</div>
                            <div class="text-lg font-semibold text-white">${state.me.name}</div>
                        </div>
                    </div>
                    <div class="text-xs text-slate-500">Host: ${state.quizMeta?.title || '...'} • ${state.quizMeta?.totalQuestions || '?'} questions</div>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    function attachEntryPoints() {
        const joinBtn = document.getElementById('join-live-btn');
        if (joinBtn) joinBtn.addEventListener('click', () => openJoinDialog());
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadIdentity();
        initAudio();
        attachEntryPoints();
    });

    // Expose entry for quiz cards
    window.startLiveHost = startLiveHost;
    window.openJoinLive = openJoinDialog;
})();
