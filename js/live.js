// Live quiz experience powered by Supabase realtime channels.
// Provides host and participant flows without requiring a bespoke backend.

(() => {
    const DEFAULT_EMOJIS = ['🧠', '🚀', '🦉', '🪐', '🎯', '🎸', '🐉', '🦾', '🧩', '🔥', '🌟', '🎮'];
    const LIVE_AUDIO = {
        intro: "assets/audio/Kaun Banega Crorepati Intro 2019.wav",
        incoming: "assets/audio/KBC Question incoming.wav",
        countdown: "assets/audio/30 second tic tic kbc clock.mp3",
        suspense: "assets/audio/KBC 10 sec timer.wav",
        correct: "assets/audio/Correct answer.mp3",
        wrong: "assets/audio/Wrong Ans.mp3"
    };
    const QUESTION_PREP_MS = 6000;
    const ANSWER_WINDOW_MS = 30000;

    const state = {
        client: null,
        channel: null,
        role: null, // 'host' | 'player'
        roomCode: null,
        quizItem: null,
        questionIndex: 0,
        scores: {},
        prevRanks: {},
        players: {},
        answers: {},
        expectedAnswerPlayerIds: {},
        questionStart: null,
        currentQuestionPayload: null,
        pendingResults: null,
        revealTriggered: false,
        introStarted: false,
        timers: {
            question: null,
            questionTick: null,
            heartbeat: null,
            phase: null,
            finale: null
        },
        me: null,
        presence: {},
        status: 'idle',
        lastResults: null
    };

    const audioRefs = {};
    let activeAudioKey = null;
    let lobbyRenderFrame = null;

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
        Object.keys(LIVE_AUDIO).forEach((key) => {
            const audio = new Audio(LIVE_AUDIO[key]);
            audio.volume = key === 'intro' ? 0.85 : 0.7;
            audioRefs[key] = audio;
        });
    }

    function playAudio(key) {
        if (state.role === 'player' && key !== 'correct' && key !== 'wrong') return;
        const audio = audioRefs[key];
        if (!audio) return;
        audio.currentTime = 0;
        activeAudioKey = key;
        audio.play().catch(() => {});
    }

    function playManagedAudio(key) {
        if (state.role === 'player' && key !== 'correct' && key !== 'wrong') return Promise.resolve();
        const audio = audioRefs[key];
        if (!audio) return Promise.resolve();

        audio.currentTime = 0;
        activeAudioKey = key;

        return new Promise((resolve) => {
            const finish = () => {
                if (activeAudioKey === key) {
                    activeAudioKey = null;
                }
                resolve();
            };

            audio.onended = finish;
            audio.play().catch(() => finish());
        });
    }

    function fadeOutAudioKey(key, durationMs = 2000) {
        const audio = audioRefs[key];
        if (!audio || audio.paused) return Promise.resolve();

        const startVolume = audio.volume;
        const steps = 20;
        const stepDuration = Math.max(20, Math.floor(durationMs / steps));
        let currentStep = 0;

        return new Promise((resolve) => {
            const interval = setInterval(() => {
                currentStep += 1;
                const nextVolume = Math.max(0, startVolume * (1 - currentStep / steps));
                audio.volume = nextVolume;

                if (currentStep >= steps) {
                    clearInterval(interval);
                    audio.pause();
                    audio.currentTime = 0;
                    audio.volume = startVolume;
                    if (activeAudioKey === key) {
                        activeAudioKey = null;
                    }
                    resolve();
                }
            }, stepDuration);
        });
    }

    async function fadeOutAnyActiveAudio(durationMs = 2000) {
        if (!activeAudioKey) return;
        await fadeOutAudioKey(activeAudioKey, durationMs);
    }

    function silencePlayerAmbientAudio() {
        if (state.role !== 'player') return;
        ['intro', 'incoming', 'countdown', 'suspense'].forEach((key) => {
            const audio = audioRefs[key];
            if (!audio) return;
            audio.pause();
            audio.currentTime = 0;
        });
        if (activeAudioKey && activeAudioKey !== 'correct' && activeAudioKey !== 'wrong') {
            activeAudioKey = null;
        }
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

    function setOverlayMode(mode) {
        const overlay = document.getElementById('live-overlay');
        const shell = document.getElementById('live-overlay-shell');
        if (!overlay || !shell) return;

        const fullscreen = mode === 'fullscreen';
        overlay.classList.toggle('live-overlay-fullscreen', fullscreen);
        shell.classList.toggle('live-shell-fullscreen', fullscreen);
        shell.classList.toggle('max-w-5xl', !fullscreen);
    }

    function getQuizMetadata() {
        const metadata = state.quizItem?.content?.metadata || {};
        return {
            grade: metadata.grade || state.quizItem?.content?.grade || 'All',
            difficulty: metadata.difficulty || state.quizItem?.content?.difficulty || 'Mixed',
            totalQuestions: state.quizItem?.content?.questions?.length || state.currentQuestionPayload?.totalQuestions || 0
        };
    }

    function getQuestionTrackerLabel() {
        const { totalQuestions } = getQuizMetadata();
        const current = Math.min(totalQuestions || (state.questionIndex + 1), state.questionIndex + 1);
        return `Question ${current} / ${totalQuestions || '?'}`;
    }

    function formatPoints(value) {
        return Number(value || 0).toLocaleString();
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function getLiveOptionTextClass(optionText) {
        const length = String(optionText || '').trim().length;
        if (length > 90) return 'is-long-option';
        if (length > 55) return 'is-medium-option';
        return '';
    }

    function renderLiveTimer(initialSeconds = Math.round(ANSWER_WINDOW_MS / 1000)) {
        return `
            <div class="live-timer-wrap">
                <div class="live-timer-box">
                    <img src="assets/images/Timer.svg" alt="Timer" class="live-timer-art" />
                    <span id="live-timer-text" class="live-timer-text">${initialSeconds}</span>
                </div>
            </div>
            <div class="live-main-progress-wrap" aria-hidden="true">
                <div id="live-main-progress" class="live-main-progress-fill"></div>
            </div>
        `;
    }

    function renderStageTopbar() {
        const tracker = getQuestionTrackerLabel();

        if (state.role === 'host') {
            return `
                <header class="live-stage-topbar">
                    <div class="live-stage-topbar-left">
                        <span class="live-chip">PIN ${state.roomCode || '------'}</span>
                        <button id="toggle-live-fullscreen" class="live-ghost-btn" title="Toggle fullscreen">
                            <i data-lucide="maximize-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                    <div class="live-stage-topbar-center">${tracker}</div>
                    <div class="live-stage-topbar-right">
                        <button id="end-live-session-btn" class="live-danger-btn">End Quiz</button>
                    </div>
                </header>
            `;
        }

        const myScore = state.scores[state.me?.id] || 0;
        return `
            <header class="live-stage-topbar">
                <div class="live-stage-topbar-left">
                    <div class="live-player-pill">
                        <span class="text-2xl">${state.me?.emoji || '🎯'}</span>
                        <span>${escapeHtml(state.me?.name || 'Player')}</span>
                    </div>
                </div>
                <div class="live-stage-topbar-center">${tracker}</div>
                <div class="live-stage-topbar-right">
                    <span class="live-chip">Points ${formatPoints(myScore)}</span>
                </div>
            </header>
        `;
    }

    function toggleBrowserFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
            return;
        }
        document.exitFullscreen?.().catch(() => {});
    }

    function wireStageTopbarActions() {
        const fullscreenBtn = document.getElementById('toggle-live-fullscreen');
        if (fullscreenBtn) {
            fullscreenBtn.onclick = () => toggleBrowserFullscreen();
        }

        const endBtn = document.getElementById('end-live-session-btn');
        if (endBtn) {
            endBtn.onclick = () => {
                const shouldEnd = window.confirm('End the live quiz for everyone?');
                if (!shouldEnd) return;
                broadcast({ type: 'end-session' });
                closeOverlay();
            };
        }
    }

    function renderStageViewport(contentHtml, stageClass = '') {
        const shell = ensureOverlay();
        setOverlayMode('fullscreen');
        shell.innerHTML = `
            <div class="live-stage-screen ${stageClass}">
                ${renderStageTopbar()}
                <main class="live-stage-content">${contentHtml}</main>
            </div>
        `;
        wireStageTopbarActions();
        if (window.lucide) window.lucide.createIcons();
    }

    function closeOverlay() {
        const overlay = document.getElementById('live-overlay');
        if (overlay) overlay.remove();
        if (lobbyRenderFrame) {
            cancelAnimationFrame(lobbyRenderFrame);
            lobbyRenderFrame = null;
        }
        state.status = 'idle';
        cleanupTimers();
        stopPlayerHeartbeat();
        Object.keys(audioRefs).forEach((key) => {
            const audio = audioRefs[key];
            if (!audio) return;
            audio.pause();
            audio.currentTime = 0;
        });
        activeAudioKey = null;
        leaveChannel();
        state.players = {};
        state.currentQuestionPayload = null;
        state.pendingResults = null;
        state.revealTriggered = false;
    }

    function leaveChannel() {
        if (!state.channel) return;
        state.channel.unsubscribe().catch(() => {});
        state.channel = null;
        state.presence = {};
    }

    function cleanupTimers() {
        if (state.timers.question) clearTimeout(state.timers.question);
        if (state.timers.questionTick) clearInterval(state.timers.questionTick);
        if (state.timers.phase) clearTimeout(state.timers.phase);
        if (state.timers.finale) clearTimeout(state.timers.finale);
        state.timers.question = null;
        state.timers.questionTick = null;
        state.timers.phase = null;
        state.timers.finale = null;
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

    function scheduleHostLobbyRender() {
        if (state.role !== 'host' || state.status !== 'lobby') return;
        if (lobbyRenderFrame) return;

        lobbyRenderFrame = requestAnimationFrame(() => {
            lobbyRenderFrame = null;
            if (state.role === 'host' && state.status === 'lobby') {
                renderHostLobby();
                broadcastRoomInfo();
            }
        });
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
            if (state.status === 'idle') return;
            announcePlayerPresence('player-presence');
        }, 3000);
    }

    function renderHostLobby() {
        const shell = ensureOverlay();
        setOverlayMode('modal');
        const participants = getPlayers();
        const { totalQuestions, grade, difficulty } = getQuizMetadata();
        const joinLink = `${window.location.origin}${window.location.pathname}?livePin=${state.roomCode}`;
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinLink)}`;
        shell.innerHTML = `
            <div class="live-panel live-host-lobby relative overflow-hidden p-0">
                <div class="live-host-pane">
                    <div class="live-host-pane-left">
                        <div class="live-host-avatar">${state.me.emoji}</div>
                        <div>
                            <div class="text-xs uppercase tracking-[0.2em] text-slate-400">Host Console</div>
                            <div class="text-2xl font-black text-white">${escapeHtml(state.me.name)}</div>
                            <div class="text-slate-400 text-sm">${escapeHtml(state.quizItem?.content?.title || 'Quiz Show')}</div>
                        </div>
                    </div>
                    <div class="live-host-pane-right">
                        <div class="live-meta-chip"><span>Questions</span><strong>${totalQuestions}</strong></div>
                        <div class="live-meta-chip"><span>Grade</span><strong>${escapeHtml(grade)}</strong></div>
                        <div class="live-meta-chip"><span>Difficulty</span><strong>${escapeHtml(difficulty)}</strong></div>
                        <button id="close-live" class="live-ghost-btn" title="Close">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>

                <div class="p-6 md:p-8">
                    <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
                        <div class="flex items-center gap-3">
                            <span class="text-slate-400 text-sm uppercase tracking-wide">Game PIN</span>
                            <span class="text-3xl font-black text-yellow-400 tracking-[0.18em]">${state.roomCode}</span>
                            <button id="copy-room" class="live-ghost-btn text-xs">
                                <i data-lucide="copy" class="w-4 h-4"></i> Copy
                            </button>
                        </div>
                        <button id="start-live-quiz" class="kbc-button text-black font-bold px-6 py-3 shadow-lg flex items-center gap-2 transition-transform hover:scale-[1.02]">
                            <i data-lucide="play" class="w-4 h-4"></i>
                            <span data-start-label>Start Live Quiz</span>
                            <span data-start-spinner class="hidden spin-loader"></span>
                        </button>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <section class="live-lobby-section">
                            <div class="flex items-center justify-between mb-3">
                                <div class="text-slate-200 font-semibold flex items-center gap-2">
                                    <i data-lucide="users" class="w-4 h-4"></i>
                                    Participants (${participants.length})
                                </div>
                                <span class="text-xs text-slate-500">Hover to remove</span>
                            </div>
                            <div id="live-participant-list" class="live-participant-scroll">
                                ${participants.map((p) => renderParticipantChip(p)).join('') || '<div class="text-slate-500 text-sm">No players yet. Share your pin and QR.</div>'}
                            </div>
                        </section>

                        <section class="live-lobby-section">
                            <div class="text-slate-200 font-semibold flex items-center gap-2 mb-3">
                                <i data-lucide="qr-code" class="w-4 h-4"></i>
                                How To Join
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
                                <ol class="text-slate-300 text-sm space-y-2 list-decimal list-inside">
                                    <li>Open <strong>quest.dverse.fun</strong> or scan the QR code.</li>
                                    <li>Tap <strong>Join Live Quiz</strong>.</li>
                                    <li>Enter PIN <strong>${state.roomCode}</strong> and your nickname.</li>
                                    <li>Tap <strong>Join Room</strong>.</li>
                                </ol>
                                <img src="${qrSrc}" alt="Join QR code" class="w-28 h-28 bg-white p-1 border border-slate-700" />
                            </div>
                            <div class="mt-3 text-xs text-slate-500 break-all">${joinLink}</div>
                        </section>
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
                const label = startBtn.querySelector('[data-start-label]');
                const spinner = startBtn.querySelector('[data-start-spinner]');
                if (label) label.textContent = 'Starting...';
                if (spinner) spinner.classList.remove('hidden');
                startLiveSession();
            };
        }

        document.querySelectorAll('[data-kick-player]').forEach((kickBtn) => {
            kickBtn.onclick = () => {
                const playerId = kickBtn.getAttribute('data-kick-player');
                if (!playerId) return;
                const target = participants.find((p) => p.id === playerId);
                const shouldKick = window.confirm(`Remove ${target?.name || 'this player'} from the lobby?`);
                if (!shouldKick) return;
                delete state.players[playerId];
                delete state.scores[playerId];
                broadcast({
                    type: 'kick-player',
                    targetId: playerId,
                    reason: 'Removed by host'
                });
                renderHostLobby();
            };
        });

        if (window.lucide) window.lucide.createIcons();
    }

    function renderParticipantChip(p) {
        const score = state.scores[p.id] || 0;
        return `
            <div class="live-participant p-3 flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-2xl">${p.emoji || '🎯'}</div>
                <div class="flex-1 min-w-0">
                    <div class="text-white font-semibold truncate">${escapeHtml(p.name || 'Player')}</div>
                    <div class="text-xs text-slate-500">Score: ${score}</div>
                </div>
                <button data-kick-player="${p.id}" class="live-kick-btn" title="Remove player">
                    <i data-lucide="user-minus" class="w-4 h-4"></i>
                </button>
            </div>
        `;
    }

    function renderTitleIntro(payload) {
        const isHost = state.role === 'host';
        renderStageViewport(`
            <section class="live-title-stage">
                <div class="text-xs uppercase tracking-[0.24em] text-slate-400">Welcome To The Live Quiz</div>
                <div class="kbc-title-frame mx-auto max-w-5xl w-full p-6 md:p-10 mt-4">
                    <h2 class="text-2xl md:text-5xl font-black text-yellow-300 text-center">${escapeHtml(payload.title)}</h2>
                </div>
                <p class="text-slate-300 mt-4 text-lg">Get ready for Question ${payload.questionIndex + 1}.</p>
                ${isHost ? `
                    <div class="live-bottom-actions">
                        <button id="title-next-btn" class="kbc-button text-black font-bold px-7 py-3 shadow-lg">Start!</button>
                    </div>
                ` : '<p class="text-slate-400 mt-6">Your host is about to begin. Stay ready.</p>'}
            </section>
        `, 'stage-title');

        if (isHost) {
            const nextBtn = document.getElementById('title-next-btn');
            if (nextBtn) nextBtn.onclick = () => handleTitleNext();
        }
    }

    function getQuestionTextSizeClass(questionText) {
        const length = (questionText || '').trim().length;
        if (length > 190) return 'is-long';
        if (length > 120) return 'is-medium';
        return 'is-short';
    }

    function renderQuestionOnlyView(payload) {
        const isHost = state.role === 'host';

        if (!isHost) {
            renderStageViewport(`
                <section class="live-player-pending-stage">
                    <div class="live-chip inline-flex items-center gap-2">
                        <i data-lucide="zap" class="w-4 h-4"></i>
                        Get Ready
                    </div>
                    <p class="text-slate-300 text-sm md:text-base mt-4">Options are about to open.</p>
                </section>
            `, 'stage-question-only');
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const question = {
            question: payload.question,
            options: state.quizItem?.content?.questions?.[payload.questionIndex]?.options || []
        };
        const textSizeClass = getQuestionTextSizeClass(question.question);

        renderStageViewport(`
            <section class="live-question-stage-wrap is-prep" id="live-question-prep-stage">
                ${renderLiveTimer()}
                <div class="kbc-title-frame live-focus-question live-question-frame" id="live-focus-question">
                    <div class="live-question-text ${textSizeClass}">${escapeHtml(question.question)}</div>
                </div>
                <div id="host-prep-countdown" class="live-prep-countdown text-slate-100">${Math.round(QUESTION_PREP_MS / 1000)}s to options</div>
                <div class="live-options-stage" id="live-options">
                    ${renderLiveOptionRow(question, 0, false)}
                    ${renderLiveOptionRow(question, 2, false)}
                </div>
                <div class="live-bottom-actions">
                    <button id="end-question-btn" class="live-warning-btn">Skip & Reveal</button>
                </div>
            </section>
        `, 'stage-question-only');

        const endBtn = document.getElementById('end-question-btn');
        if (endBtn) endBtn.onclick = () => finishQuestion(true);
    }

    function renderLiveOptionRow(question, startIdx, interactive = false) {
        const options = [startIdx, startIdx + 1]
            .filter((idx) => idx < question.options.length)
            .map((idx) => {
                const label = String.fromCharCode(65 + idx);
                const optionText = escapeHtml(question.options[idx]);
                const optionSizeClass = getLiveOptionTextClass(question.options[idx]);
                if (interactive) {
                    return `
                        <button data-idx="${idx}" id="live-option-${idx}" class="live-option-btn kbc-option-frame live-option-tile px-4 py-5 text-left text-slate-100 flex gap-3 items-center" type="button">
                            <span class="text-yellow-300 font-black text-xl md:text-2xl">${label}</span>
                            <span class="live-option-text font-semibold text-sm md:text-lg ${optionSizeClass}">${optionText}</span>
                        </button>
                    `;
                }
                return `
                    <div id="live-option-${idx}" data-host-option="${idx}" class="live-option-btn kbc-option-frame live-option-tile px-4 py-5 text-left text-slate-100 flex gap-3 items-center">
                        <span class="text-yellow-300 font-black text-xl md:text-2xl">${label}</span>
                        <span class="live-option-text font-semibold text-sm md:text-lg ${optionSizeClass}">${optionText}</span>
                    </div>
                `;
            })
            .join('');

        return `
            <div class="live-option-row" id="live-option-row-${startIdx}">
                <div class="live-option-grid">${options}</div>
            </div>
        `;
    }

    function startQuestionRevealAnimation() {
        const prepStage = document.getElementById('live-question-prep-stage');
        if (prepStage) prepStage.classList.remove('is-prep');

        const questionFrame = document.getElementById('live-focus-question');
        if (questionFrame) {
            questionFrame.classList.add('is-lifted');
        }

        document.querySelectorAll('.live-option-row').forEach((row, idx) => {
            row.style.transitionDelay = `${idx * 70}ms`;
            row.classList.add('is-visible');
        });
    }

    function renderPlayerQuestionView(payload) {
        state.status = 'answering';
        cleanupTimers();
        const question = {
            question: payload.question,
            options: payload.options
        };

        const elapsed = Math.max(0, Date.now() - (payload.startAt || Date.now()));
        const initialRemaining = Math.max(0, Math.ceil((ANSWER_WINDOW_MS - elapsed) / 1000));
        const textSizeClass = getQuestionTextSizeClass(question.question);

        renderStageViewport(`
            <section class="live-player-options-stage">
                ${renderLiveTimer(initialRemaining)}
                <div class="kbc-title-frame live-question-frame live-player-question-frame">
                    <div class="live-question-text ${textSizeClass}">${escapeHtml(question.question)}</div>
                </div>
                <div class="live-options-stage live-options-stage-player" id="live-options">
                    ${renderLiveOptionRow(question, 0, true)}
                    ${renderLiveOptionRow(question, 2, true)}
                </div>
            </section>
        `, 'stage-question-player');

        document.querySelectorAll('.live-option-row').forEach((row, idx) => {
            row.style.transitionDelay = `${idx * 70}ms`;
            row.classList.add('is-visible');
        });

        startPlayerCountdown(payload.startAt);

        const optionButtons = Array.from(document.querySelectorAll('#live-options button[data-idx]'));
        optionButtons.forEach(btn => {
            btn.onclick = () => {
                if (state.status !== 'answering') return;
                const choice = parseInt(btn.getAttribute('data-idx'), 10);
                sendAnswer(choice, payload);
                optionButtons.forEach(b => b.disabled = true);
                btn.classList.add('is-selected');
            };
        });
    }

    function renderHostQuestionView(question) {
        const prepStage = document.getElementById('live-question-prep-stage');
        if (prepStage) {
            const questionText = prepStage.querySelector('.live-question-text');
            if (questionText) {
                questionText.textContent = question.question;
                questionText.className = `live-question-text ${getQuestionTextSizeClass(question.question)}`;
            }

            question.options.forEach((optionText, idx) => {
                const optionNode = prepStage.querySelector(`#live-option-${idx}`);
                if (!optionNode) return;
                const textNode = optionNode.querySelector('span:last-child');
                if (textNode) textNode.textContent = optionText;
            });
        } else {
            const textSizeClass = getQuestionTextSizeClass(question.question);
            renderStageViewport(`
                <section class="live-question-stage-wrap" id="live-question-prep-stage">
                    ${renderLiveTimer()}
                    <div class="kbc-title-frame live-focus-question live-question-frame" id="live-focus-question">
                        <div class="live-question-text ${textSizeClass}">${escapeHtml(question.question)}</div>
                    </div>
                    <div class="live-options-stage">
                        ${renderLiveOptionRow(question, 0, false)}
                        ${renderLiveOptionRow(question, 2, false)}
                    </div>
                    <div class="live-bottom-actions">
                        <button id="end-question-btn" class="live-warning-btn">Skip & Reveal</button>
                    </div>
                </section>
            `, 'stage-question-host');
        }

        startQuestionRevealAnimation();

        const endBtn = document.getElementById('end-question-btn');
        if (endBtn) endBtn.onclick = () => finishQuestion(true);
    }

    function renderLeaderboard(results, correctIndex, isFinal = false) {
        const sorted = [...results]
            .sort((a, b) => (a.rank || 999) - (b.rank || 999) || b.total - a.total);
        const topThree = sorted.slice(0, 3);
        const topFive = sorted.slice(0, 5);
        const previousOrder = [...topFive]
            .sort((a, b) => (a.prevRank || a.rank || 999) - (b.prevRank || b.rank || 999));

        renderStageViewport(`
            <section class="live-leaderboard-stage">
                <div class="text-xs uppercase tracking-[0.2em] text-slate-400">${isFinal ? 'Final Board' : 'Leaderboard'}</div>
                <h2 class="text-2xl md:text-4xl font-black text-white mt-2">${isFinal ? 'Final Standings' : `After Question ${state.questionIndex + 1}`}</h2>
                <div class="live-top3-grid mt-5">
                    ${topThree.map((res, idx) => `
                        <article class="live-top3-card ${idx === 0 ? 'is-winner' : ''}">
                            <div class="text-2xl">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</div>
                            <div class="text-2xl">${res.emoji || '🎯'}</div>
                            <div class="text-lg font-black text-white truncate">${escapeHtml(res.name)}</div>
                            <div class="text-slate-300 text-sm">${formatPoints(res.total)} pts</div>
                        </article>
                    `).join('')}
                </div>
                <div id="leaderboard-list" class="live-leaderboard-list mt-5"></div>
                ${state.role === 'host' && !isFinal ? `
                    <div class="live-bottom-actions">
                        <button id="next-question-btn" class="kbc-button text-black font-bold px-6 py-3 shadow-lg flex items-center gap-2">
                            <i data-lucide="${state.questionIndex + 1 >= state.quizItem.content.questions.length ? 'flag' : 'skip-forward'}" class="w-4 h-4"></i>
                            <span>${state.questionIndex + 1 >= state.quizItem.content.questions.length ? 'Finish Quiz' : 'Next Question'}</span>
                        </button>
                    </div>
                ` : ''}
            </section>
        `, 'stage-leaderboard');

        const list = document.getElementById('leaderboard-list');
        if (list) {
            list.innerHTML = topFive.map((res, idx) => `
                <div class="leaderboard-card live-rank-row is-current" data-player-id="${res.id}">
                    <div class="text-slate-300 font-bold w-8">${idx + 1}</div>
                    <div class="w-10 h-10 bg-slate-800 flex items-center justify-center text-xl">${res.emoji || '🎯'}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-white font-semibold truncate">${escapeHtml(res.name)}</div>
                        <div class="text-slate-400 text-sm">${formatPoints(res.total)} pts</div>
                    </div>
                    ${res.rankRise > 0 ? '<div class="text-emerald-400 font-black">↑</div>' : '<div class="w-3"></div>'}
                </div>
            `).join('');

            const previousIndexById = new Map(previousOrder.map((res, idx) => [res.id, idx]));
            const rows = Array.from(list.querySelectorAll('.live-rank-row'));
            const rowGap = 10;
            const rowHeight = rows[0] ? rows[0].getBoundingClientRect().height + rowGap : 64;

            rows.forEach((row, nextIndex) => {
                row.style.transition = 'transform 650ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease';
                const playerId = row.getAttribute('data-player-id');
                const prevIndex = previousIndexById.has(playerId) ? previousIndexById.get(playerId) : nextIndex;
                const deltaY = (prevIndex - nextIndex) * rowHeight;
                if (deltaY !== 0) {
                    row.style.transform = `translateY(${deltaY}px)`;
                }
            });

            requestAnimationFrame(() => {
                rows.forEach((row) => {
                    row.style.transform = 'translateY(0)';
                });
            });
        }

        if (state.role === 'host') {
            const nextBtn = document.getElementById('next-question-btn');
            if (nextBtn) nextBtn.onclick = () => {
                if (state.questionIndex + 1 >= state.quizItem.content.questions.length) {
                    broadcastFinal(results);
                } else {
                    state.questionIndex += 1;
                    state.pendingResults = null;
                    sendQuestion();
                }
            };
        }
    }

    function renderPodium(entries) {
        const places = ['🥇', '🥈', '🥉'];
        return `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                ${entries.map((res, idx) => `
                    <div class="podium-card rounded-2xl p-4 text-center ${idx === 0 ? 'podium-winner' : ''}" style="animation-delay:${idx * 0.1}s">
                        <div class="text-3xl">${places[idx] || ''}</div>
                        <div class="text-2xl font-bold text-white mt-1">${escapeHtml(res.name)}</div>
                        <div class="text-xl">${res.emoji || '🎯'}</div>
                        <div class="text-sm text-slate-300 mt-2">Score ${res.total}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderAnswerReveal(payload) {
        const mine = payload.results.find((r) => r.id === state.me.id);

        if (state.role === 'host') {
            const optionEls = Array.from(document.querySelectorAll('[data-host-option]'));
            if (optionEls.length) {
                optionEls.forEach((el) => {
                    el.classList.remove('is-correct');
                    const idx = Number.parseInt(el.getAttribute('data-host-option'), 10);
                    if (!Number.isNaN(idx) && idx === payload.correctIndex) {
                        el.classList.add('is-correct', 'live-correct-flash');
                    }
                });

                const bottomActions = document.querySelector('.live-bottom-actions');
                if (bottomActions) {
                    bottomActions.innerHTML = `
                        <button id="to-leaderboard-btn" class="kbc-button text-black font-bold px-6 py-3 shadow-lg">Next: Leaderboard</button>
                    `;
                }

                const skipBtn = document.getElementById('end-question-btn');
                if (skipBtn) skipBtn.remove();

                const toLeaderboardBtnInline = document.getElementById('to-leaderboard-btn');
                if (toLeaderboardBtnInline) {
                    toLeaderboardBtnInline.onclick = () => showLeaderboardStage();
                }
                return;
            }

            const q = state.quizItem.content.questions[state.questionIndex];
            renderStageViewport(`
                <section class="live-answer-reveal-stage">
                    <h3 class="text-2xl font-black text-white text-center">Correct answer revealed</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
                        ${q.options.map((opt, idx) => `
                            <div class="kbc-option-frame ${idx === payload.correctIndex ? 'is-correct' : ''} px-4 py-4 text-white font-semibold">
                                <span class="text-yellow-300 mr-2">${String.fromCharCode(65 + idx)}</span>${escapeHtml(opt)}
                            </div>
                        `).join('')}
                    </div>
                    <div class="live-bottom-actions">
                        <button id="to-leaderboard-btn" class="kbc-button text-black font-bold px-6 py-3 shadow-lg">Next: Leaderboard</button>
                    </div>
                </section>
            `, 'stage-answer-reveal');
            const btn = document.getElementById('to-leaderboard-btn');
            if (btn) btn.onclick = () => showLeaderboardStage();
            return;
        }

        if (mine) {
            state.scores[state.me.id] = mine.total;
        }

        const noAnswer = !mine || mine.choice === undefined || mine.choice === null;
        const gained = mine?.delta || 0;
        renderStageViewport(`
            <section class="live-player-result-stage">
                <div class="text-center">
                    <div class="text-7xl mb-4">${noAnswer ? '⏰' : mine?.isCorrect ? '✅' : '❌'}</div>
                    <div class="text-3xl md:text-4xl font-black text-white mb-2">${noAnswer ? 'Time Up' : mine?.isCorrect ? 'Correct!' : 'Wrong Answer'}</div>
                    <div class="text-slate-300 text-lg">${noAnswer ? 'No answer locked this round.' : `+${gained} points`}</div>
                    <div class="text-slate-400 mt-3">Next question is coming soon.</div>
                </div>
            </section>
        `, 'stage-player-result');
    }

    function computeRankMeta(sortedResults) {
        return sortedResults.map((res, idx, arr) => {
            const rank = idx + 1;
            const prevRank = state.prevRanks[res.id] || rank;
            const rankRise = Math.max(0, prevRank - rank);
            const distanceAhead = idx > 0 ? arr[idx - 1].total - res.total : null;

            return {
                ...res,
                rank,
                prevRank,
                rankRise,
                distanceAhead
            };
        });
    }

    function updatePreviousRanks(resultsWithMeta) {
        const updated = {};
        resultsWithMeta.forEach((res) => {
            updated[res.id] = res.rank;
        });
        state.prevRanks = updated;
    }

    function renderFinaleSpotlight(results) {
        const topThree = [...results].sort((a, b) => b.total - a.total).slice(0, 3);
        const revealOrder = [2, 1, 0].filter((index) => topThree[index]);

        let step = 0;
        const reveal = () => {
            const idx = revealOrder[step];
            const contestant = topThree[idx];
            const title = idx === 2 ? 'Third Place' : idx === 1 ? 'Second Place' : 'Champion';

            renderStageViewport(`
                <section class="text-center w-full max-w-3xl">
                    <div class="text-slate-400 uppercase tracking-[0.2em] text-xs mb-4">Grand Finale</div>
                    <div class="text-3xl md:text-5xl font-black text-yellow-300 mb-6">${title}</div>
                    <div class="podium-card max-w-xl mx-auto p-6 md:p-8">
                        <div class="text-6xl mb-2">${contestant?.emoji || '🏆'}</div>
                        <div class="text-3xl font-black text-white">${escapeHtml(contestant?.name || '')}</div>
                        <div class="text-slate-300 mt-2">${contestant?.total || 0} pts</div>
                    </div>
                </section>
            `, 'stage-finale');

            step += 1;
            if (step < revealOrder.length) {
                state.timers.finale = setTimeout(reveal, 2200);
            } else {
                state.timers.finale = setTimeout(() => {
                    renderStageViewport(`
                        <section class="text-center w-full max-w-4xl">
                            <div class="text-slate-400 uppercase tracking-[0.2em] text-xs mb-4">Final Rankings</div>
                            ${renderPodium(topThree)}
                            <div class="mt-6">
                                ${state.role === 'host'
                                    ? '<button id="end-quiz-btn" class="kbc-button text-black font-bold px-6 py-3 rounded-xl shadow-lg">End Quiz</button>'
                                    : '<div class="text-slate-300">Waiting for host to end quiz...</div>'}
                            </div>
                        </section>
                    `, 'stage-finale-final');

                    if (state.role === 'host') {
                        const endBtn = document.getElementById('end-quiz-btn');
                        if (endBtn) {
                            endBtn.onclick = () => {
                                broadcast({ type: 'end-session' });
                                closeOverlay();
                            };
                        }
                    }
                }, 2000);
            }
        };

        reveal();
    }

    async function startLiveHost(quizItem) {
        if (!ensureClient()) return;
        state.role = 'host';
        state.quizItem = quizItem;
        state.roomCode = String(Math.floor(100000 + Math.random() * 900000));
        state.questionIndex = 0;
        state.scores = {};
        state.prevRanks = {};
        state.players = {};
        state.answers = {};
        state.expectedAnswerPlayerIds = {};
        state.currentQuestionPayload = null;
        state.pendingResults = null;
        state.introStarted = false;
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
        if (state.role === 'host' && state.status === 'lobby') {
            scheduleHostLobbyRender();
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

        if (state.role === 'host' && payload.isResync) {
            return;
        }

        if (state.role === 'player' && payload.targetId && payload.targetId !== state.me.id) {
            return;
        }

        if (state.role === 'player' && payload.type !== 'answer-reveal') {
            silencePlayerAmbientAudio();
        }

        if ((payload.type === 'player-joined' || payload.type === 'player-presence') && state.role === 'host') {
            upsertPlayer(payload.player || payload);

            if (state.status === 'lobby') {
                scheduleHostLobbyRender();
            }

            // Re-sync only for the newly joined player to avoid re-rendering everyone else.
            if (payload.type === 'player-joined' && state.status !== 'lobby' && state.currentQuestionPayload) {
                const joinedPlayerId = payload.player?.id || payload.id;
                if (joinedPlayerId) {
                    broadcast({
                        ...state.currentQuestionPayload,
                        targetId: joinedPlayerId,
                        isResync: true
                    });
                }
            }
            return;
        }

        if (payload.type === 'kick-player' && state.role === 'player') {
            alert(payload.reason || 'Host removed you from this room.');
            closeOverlay();
            return;
        }

        if (payload.type === 'room-info' && state.role === 'player') {
            state.quizMeta = payload;
            if (state.status === 'waiting') renderWaitingRoom();
        }
        if (payload.type === 'quiz-title') {
            state.currentQuestionPayload = payload;
            if (typeof payload.questionIndex === 'number') {
                state.questionIndex = payload.questionIndex;
            }
            state.status = 'title';
            renderTitleIntro(payload);
        }
        if (payload.type === 'question-only') {
            const isDuplicateQuestionOnly =
                state.role === 'player' &&
                state.currentQuestionPayload?.type === 'question-only' &&
                state.currentQuestionPayload?.questionIndex === payload.questionIndex &&
                state.status === 'question-only';
            if (isDuplicateQuestionOnly) return;

            state.currentQuestionPayload = payload;
            if (typeof payload.questionIndex === 'number') {
                state.questionIndex = payload.questionIndex;
            }
            state.status = 'question-only';
            renderQuestionOnlyView(payload);
        }
        if (payload.type === 'options-open') {
            const isDuplicateOptionsOpen =
                state.role === 'player' &&
                state.currentQuestionPayload?.type === 'options-open' &&
                state.currentQuestionPayload?.questionIndex === payload.questionIndex &&
                (state.status === 'answering' || state.status === 'locked' || state.status === 'question');
            if (isDuplicateOptionsOpen) return;

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
        if (payload.type === 'answer-reveal') {
            renderAnswerReveal(payload);
            if (state.role === 'player') {
                const mine = payload.results.find((r) => r.id === state.me.id);
                if (mine) {
                    state.scores[state.me.id] = mine.total;
                    playAudio(mine.isCorrect ? 'correct' : 'wrong');
                }
            }
        }
        if (payload.type === 'leaderboard') {
            cleanupTimers();
            state.lastResults = payload.results;
            if (state.role === 'host') {
                renderLeaderboard(payload.results, payload.correctIndex, false);
                if (payload.isFinal) {
                    renderLeaderboard(payload.results, payload.correctIndex, true);
                }
            }
        }
        if (payload.type === 'final') {
            cleanupTimers();
            renderFinaleSpotlight(payload.results);
        }
        if (payload.type === 'end-session') {
            closeOverlay();
        }
    }

    function startLiveSession() {
        state.status = 'title';
        state.introStarted = true;
        const totalQuestions = state.quizItem?.content?.questions?.length || 0;
        const titlePayload = {
            type: 'quiz-title',
            title: state.quizItem?.content?.title || 'Quiz Show',
            questionIndex: state.questionIndex,
            totalQuestions
        };
        state.currentQuestionPayload = titlePayload;
        broadcast(titlePayload);
        renderTitleIntro(titlePayload);

        playManagedAudio('intro').then(() => {
            if (state.status === 'title') {
                renderTitleIntro(titlePayload);
            }
        });
    }

    async function handleTitleNext() {
        if (state.status !== 'title' && state.status !== 'in-progress') return;
        state.status = 'title';
        await fadeOutAudioKey('intro', 2000);
        sendQuestion();
    }

    function sendQuestion() {
        cleanupTimers();
        const q = state.quizItem.content.questions[state.questionIndex];
        const questionOnlyPayload = {
            type: 'question-only',
            questionIndex: state.questionIndex,
            question: q.question,
            totalQuestions: state.quizItem.content.questions.length
        };

        state.pendingResults = null;
        state.currentQuestionPayload = questionOnlyPayload;
        state.status = 'question-only';
        broadcast(questionOnlyPayload);
        renderQuestionOnlyView(questionOnlyPayload);

        playManagedAudio('incoming').catch(() => {});

        if (state.role === 'host') {
            let prepRemaining = Math.round(QUESTION_PREP_MS / 1000);
            const paintPrepCountdown = () => {
                const chip = document.getElementById('host-prep-countdown');
                if (!chip) return;
                chip.textContent = `${prepRemaining}s to options`;
                chip.classList.toggle('text-yellow-300', prepRemaining <= 3);
                chip.classList.toggle('text-slate-100', prepRemaining > 3);
            };

            paintPrepCountdown();

            state.timers.questionTick = setInterval(() => {
                prepRemaining = Math.max(0, prepRemaining - 1);
                paintPrepCountdown();
                if (prepRemaining <= 0 && state.timers.questionTick) {
                    clearInterval(state.timers.questionTick);
                    state.timers.questionTick = null;
                }
            }, 1000);
        }

        state.timers.phase = setTimeout(() => {
            if (state.role === 'host' && state.status === 'question-only') {
                openOptionsForCurrentQuestion();
            }
        }, QUESTION_PREP_MS);

        state.answers[state.questionIndex] = {};
        state.expectedAnswerPlayerIds[state.questionIndex] = [];
        state.revealTriggered = false;
    }

    function openOptionsForCurrentQuestion() {
        if (state.status !== 'question-only') return;
        cleanupTimers();

        const q = state.quizItem.content.questions[state.questionIndex];
        const correctIndex = Number.parseInt(q.correctIndex, 10);
        const normalizedCorrectIndex = Number.isNaN(correctIndex) ? q.correctIndex : correctIndex;
        const payload = {
            type: 'options-open',
            questionIndex: state.questionIndex,
            question: q.question,
            options: q.options,
            correctIndex: normalizedCorrectIndex,
            startAt: Date.now()
        };

        state.status = 'question';
        state.currentQuestionPayload = payload;
        state.questionStart = payload.startAt;

        // Lock expected responders for this question so reveal waits for everyone in-session.
        const expectedIds = Array.from(new Set([
            ...Object.keys(state.players || {}),
            ...getPlayers().map((player) => player.id).filter(Boolean)
        ]));
        state.expectedAnswerPlayerIds[state.questionIndex] = expectedIds;

        broadcast(payload);
        renderHostQuestionView(q);
        playAudio('countdown');
        startHostCountdown();
    }

    function startHostCountdown() {
        if (state.timers.question) clearTimeout(state.timers.question);
        if (state.timers.questionTick) clearInterval(state.timers.questionTick);

        const totalSeconds = Math.round(ANSWER_WINDOW_MS / 1000);
        let remaining = totalSeconds;

        const paintCountdown = () => {
            const timerText = document.getElementById('live-timer-text');
            if (timerText) {
                timerText.textContent = String(remaining);
                timerText.classList.toggle('text-red-400', remaining <= 5);
                timerText.classList.toggle('text-white', remaining > 5);
            }

            const progressFill = document.getElementById('live-main-progress');
            if (progressFill) {
                const elapsed = Math.max(0, totalSeconds - remaining);
                const progress = (elapsed / totalSeconds) * 100;
                progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
            }
        };

        const progressFill = document.getElementById('live-main-progress');
        if (progressFill) {
            progressFill.style.width = '0%';
            progressFill.style.transition = 'width 1s linear';
        }

        paintCountdown();

        state.timers.questionTick = setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            paintCountdown();
            if (remaining <= 0 && state.timers.questionTick) {
                clearInterval(state.timers.questionTick);
                state.timers.questionTick = null;
            }
        }, 1000);

        state.timers.question = setTimeout(() => {
            finishQuestion(false);
        }, ANSWER_WINDOW_MS);
    }

    function startPlayerCountdown(startAt) {
        if (state.timers.questionTick) clearInterval(state.timers.questionTick);

        const elapsed = Math.max(0, Date.now() - (startAt || Date.now()));
        let remaining = Math.max(0, Math.ceil((ANSWER_WINDOW_MS - elapsed) / 1000));
        const totalSeconds = Math.round(ANSWER_WINDOW_MS / 1000);
        const paintCountdown = () => {
            const timerText = document.getElementById('live-timer-text');
            if (timerText) {
                timerText.textContent = String(remaining);
                timerText.classList.toggle('text-red-400', remaining <= 5);
                timerText.classList.toggle('text-white', remaining > 5);
            }

            const progressFill = document.getElementById('live-main-progress');
            if (progressFill) {
                const elapsedSeconds = Math.max(0, totalSeconds - remaining);
                const progress = (elapsedSeconds / totalSeconds) * 100;
                progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
            }
        };

        const progressFill = document.getElementById('live-main-progress');
        if (progressFill) {
            progressFill.style.width = '0%';
            progressFill.style.transition = 'width 1s linear';
        }

        paintCountdown();

        state.timers.questionTick = setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            paintCountdown();

            if (remaining <= 0) {
                clearInterval(state.timers.questionTick);
                state.timers.questionTick = null;
                if (state.role === 'player' && state.status === 'answering') {
                    state.status = 'locked';
                    showPlayerTimeUpState();
                }
            }
        }, 1000);
    }

    function showPlayerTimeUpState() {
        document.querySelectorAll('#live-options button[data-idx]').forEach((btn) => {
            btn.disabled = true;
            btn.classList.add('opacity-70');
        });

        const existing = document.getElementById('player-timeup-overlay');
        if (existing) return;

        const optionsStage = document.querySelector('.live-options-stage');
        if (!optionsStage) return;

        const overlay = document.createElement('div');
        overlay.id = 'player-timeup-overlay';
        overlay.className = 'live-timeup-overlay';
        overlay.innerHTML = `
            <div class="live-timeup-card">
                <div class="text-4xl">⏰</div>
                <div class="text-xl font-black text-white mt-2">Time Up</div>
                <div class="text-slate-300 text-sm mt-1">No worries, wait for the reveal.</div>
            </div>
        `;
        optionsStage.appendChild(overlay);
    }

    function sendAnswer(choice, questionPayload) {
        state.status = 'locked';
        if (state.timers.questionTick) {
            clearInterval(state.timers.questionTick);
            state.timers.questionTick = null;
        }
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
        if (payload.questionIndex !== state.questionIndex) return;

        if (!state.answers[payload.questionIndex]) {
            state.answers[payload.questionIndex] = {};
        }
        if (!state.answers[payload.questionIndex][payload.id]) {
            state.answers[payload.questionIndex][payload.id] = payload;
        }

        const answerMap = state.answers[payload.questionIndex] || {};
        const expectedAtOpen = state.expectedAnswerPlayerIds[payload.questionIndex] || [];
        const fallbackExpected = Array.from(new Set([
            ...Object.keys(state.players || {}),
            ...getPlayers().map((player) => player.id).filter(Boolean)
        ]));
        const expectedIds = expectedAtOpen.length ? expectedAtOpen : fallbackExpected;
        const totalExpected = expectedIds.length;
        const answeredExpected = expectedIds.filter((id) => Boolean(answerMap[id])).length;

        if (totalExpected > 0 && answeredExpected >= totalExpected && !state.revealTriggered) {
            finishQuestion(false);
        }
    }

    function finishQuestion(forceReveal) {
        if (state.revealTriggered) return;
        state.revealTriggered = true;
        cleanupTimers();
        fadeOutAudioKey('countdown', 500).catch(() => {});
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
        const withMeta = computeRankMeta(results);
        updatePreviousRanks(withMeta);

        const revealPayload = {
            type: 'answer-reveal',
            questionIndex: state.questionIndex,
            correctIndex: normalizedCorrectIndex,
            correctOption: q.options?.[normalizedCorrectIndex],
            options: q.options,
            results: withMeta
        };

        state.pendingResults = withMeta;

        broadcast(revealPayload);
        renderAnswerReveal(revealPayload);
    }

    function showLeaderboardStage() {
        const q = state.quizItem.content.questions[state.questionIndex];
        const correctIndex = Number.parseInt(q.correctIndex, 10);
        const normalizedCorrectIndex = Number.isNaN(correctIndex) ? q.correctIndex : correctIndex;
        const results = state.pendingResults || [];

        broadcast({
            type: 'leaderboard',
            questionIndex: state.questionIndex,
            correctIndex: normalizedCorrectIndex,
            results
        });
        renderLeaderboard(results, normalizedCorrectIndex, false);
    }

    function calculateScoreDelta(elapsedMs) {
        const speedFactor = Math.max(0, 1 - Math.min(elapsedMs, 30000) / 30000);
        return Math.max(150, Math.round(600 + 400 * speedFactor));
    }

    function broadcastFinal(results) {
        cleanupTimers();
        broadcast({
            type: 'final',
            results: results.sort((a, b) => b.total - a.total)
        });
        renderFinaleSpotlight(results.sort((a, b) => b.total - a.total));
    }

    function broadcast(payload) {
        if (!state.channel) return;
        state.channel.send({ type: 'broadcast', event: 'live', payload });
    }

    function openJoinDialog(prefill = '') {
        const shell = ensureOverlay();
        setOverlayMode('modal');
        state.role = 'player';
        state.status = 'join';
        shell.innerHTML = `
            <div class="live-panel p-6 md:p-8 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none opacity-25" style="background: radial-gradient(circle at 10% 15%, rgba(234, 179, 8, 0.15), transparent 45%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.2), transparent 35%);"></div>
                <div class="relative max-w-2xl mx-auto space-y-5 text-center">
                    <div class="text-slate-300 text-sm uppercase tracking-wide">Join Live Room</div>
                    <div class="text-3xl md:text-4xl font-extrabold text-white">Enter PIN and your nickname</div>
                    <div class="text-slate-400 text-sm">Pick your avatar and jump into the game.</div>

                    <div class="flex items-center justify-center gap-3">
                        <div id="live-preview-emoji" class="w-16 h-16 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center text-3xl">${state.me.emoji}</div>
                        <div class="text-left">
                            <div class="text-slate-300 text-sm">You</div>
                            <div class="text-xl font-bold text-white" id="live-preview-name">${escapeHtml(state.me.name)}</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                        <div class="space-y-2">
                            <label class="text-slate-400 text-sm">Room Code</label>
                            <input id="join-code" maxlength="6" value="${escapeHtml(prefill || '')}" class="w-full bg-slate-900 border border-slate-700 px-4 py-3 text-white focus:border-yellow-400 outline-none" placeholder="123456" />
                        </div>
                        <div class="space-y-2">
                            <label class="text-slate-400 text-sm">Display Name</label>
                            <input id="join-name" value="${escapeHtml(state.me.name || '')}" class="w-full bg-slate-900 border border-slate-700 px-4 py-3 text-white focus:border-yellow-400 outline-none" placeholder="Player One" />
                        </div>
                    </div>

                    <div class="space-y-2 text-left">
                        <label class="text-slate-400 text-sm">Pick an emoji</label>
                        <div class="grid grid-cols-6 gap-2 emoji-picker">
                            ${DEFAULT_EMOJIS.map(em => `
                                <button data-emoji="${em}" class="bg-slate-900 px-2 py-2 ${state.me.emoji === em ? 'border-yellow-400' : ''}">
                                    <span class="text-2xl">${em}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <div class="flex items-center justify-center gap-3 pt-2">
                        <button id="submit-join" class="kbc-button text-black font-bold px-7 py-3 shadow-lg flex items-center gap-2 transition-transform hover:scale-[1.02]">
                            <i data-lucide="log-in" class="w-4 h-4"></i>
                            <span data-join-label>Join Room</span>
                            <span data-join-spinner class="hidden spin-loader"></span>
                        </button>
                        <button id="cancel-join" class="px-4 py-3 border border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</button>
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
            submit.onclick = async () => {
                const code = document.getElementById('join-code').value.trim();
                const name = document.getElementById('join-name').value.trim() || 'Player';
                updateIdentity({ name });
                if (code.length !== 6) {
                    alert('Enter a 6-digit code');
                    return;
                }

                submit.disabled = true;
                const label = submit.querySelector('[data-join-label]');
                const spinner = submit.querySelector('[data-join-spinner]');
                if (label) label.textContent = 'Joining...';
                if (spinner) spinner.classList.remove('hidden');
                await joinAsPlayer(code);
            };
        }

        if (window.lucide) window.lucide.createIcons();
    }

    async function joinAsPlayer(code) {
        state.roomCode = code;
        state.role = 'player';
        state.status = 'waiting';
        state.scores = {};
        state.prevRanks = {};
        state.players = {};
        state.answers = {};
        state.expectedAnswerPlayerIds = {};
        state.currentQuestionPayload = null;
        state.pendingResults = null;
        state.introStarted = false;
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
        setOverlayMode('modal');
        shell.innerHTML = `
            <div class="live-panel p-6 md:p-8 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none opacity-20" style="background: radial-gradient(circle at 15% 15%, rgba(234, 179, 8, 0.12), transparent 45%), radial-gradient(circle at 85% 85%, rgba(59, 130, 246, 0.16), transparent 35%);"></div>
                <div class="relative flex flex-col gap-6 items-center text-center">
                    <div class="live-chip flex items-center gap-2">
                        <i data-lucide="radio" class="w-4 h-4"></i>
                        Room ${state.roomCode}
                    </div>
                    <div class="text-3xl md:text-4xl font-extrabold text-white">You are in. Wait for your host to start.</div>
                    <div class="text-slate-400">Keep this screen open and get ready to answer fast.</div>
                    <div class="flex items-center gap-3 bg-slate-900/60 border border-slate-800 px-4 py-3">
                        <div class="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">${state.me.emoji}</div>
                        <div class="text-left">
                            <div class="text-sm text-slate-400">You</div>
                            <div class="text-lg font-semibold text-white">${escapeHtml(state.me.name)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    function attachEntryPoints() {
        const joinBtn = document.getElementById('join-live-btn');
        if (joinBtn) joinBtn.addEventListener('click', () => openJoinDialog());

        const bindCodeJoin = (el) => {
            if (!el) return;
            el.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                const value = String(el.value || '').trim();
                if (/^\d{6}$/.test(value)) {
                    event.preventDefault();
                    openJoinDialog(value);
                }
            });
        };

        bindCodeJoin(document.getElementById('main-search'));
        bindCodeJoin(document.getElementById('header-search-input'));
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadIdentity();
        initAudio();
        attachEntryPoints();

        const params = new URLSearchParams(window.location.search);
        const livePin = params.get('livePin');
        if (/^\d{6}$/.test(String(livePin || ''))) {
            openJoinDialog(String(livePin));
            window.history.replaceState({}, '', window.location.pathname);
        }
    });

    // Expose entry for quiz cards
    window.startLiveHost = startLiveHost;
    window.openJoinLive = openJoinDialog;
})();
