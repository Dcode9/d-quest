// Live quiz experience powered by Supabase realtime channels.
// Provides host and participant flows without requiring a bespoke backend.

(() => {
    const DEFAULT_EMOJIS = ['🧠', '🚀', '🦉', '🪐', '🎯', '🎸', '🐉', '🦾', '🧩', '🔥', '🌟', '🎮'];
    const LIVE_AUDIO = {
        intro: "assets/audio/Kaun Banega Crorepati Intro 2019.wav",
        correct: "assets/audio/Correct answer.mp3",
        wrong: "assets/audio/Wrong Ans.mp3"
    };

    const state = {
        client: null,
        channel: null,
        role: null, // 'host' | 'player'
        roomCode: null,
        quizItem: null,
        questionIndex: 0,
        scores: {},
        answers: {},
        questionStart: null,
        timers: {
            question: null
        },
        me: null,
        presence: {},
        status: 'idle',
        lastResults: null
    };

    const audioRefs = {};

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
        if (stored) {
            try {
                state.me = JSON.parse(stored);
                return;
            } catch (err) {
                console.warn('Failed to parse stored identity', err);
            }
        }
        state.me = {
            id: `p-${crypto.randomUUID?.() || Date.now()}`,
            name: 'Player',
            emoji: '🧠'
        };
        localStorage.setItem('dquest_live_identity', JSON.stringify(state.me));
    }

    function updateIdentity(partial) {
        state.me = { ...state.me, ...partial };
        localStorage.setItem('dquest_live_identity', JSON.stringify(state.me));
    }

    function initAudio() {
        ['intro', 'correct', 'wrong'].forEach((key) => {
            const audio = new Audio(LIVE_AUDIO[key]);
            audio.volume = key === 'intro' ? 0.9 : 0.7;
            audioRefs[key] = audio;
        });
    }

    function playAudio(key) {
        const audio = audioRefs[key];
        if (!audio) return;
        audio.currentTime = 0;
        audio.play().catch(() => {});
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
    }

    function cleanupTimers() {
        if (state.timers.question) clearInterval(state.timers.question);
        state.timers.question = null;
    }

    function renderHostLobby() {
        const shell = ensureOverlay();
        const participants = Object.values(state.presence).filter(p => p.role === 'player');
        const totalQuestions = state.quizItem?.content?.questions?.length || 0;
        shell.innerHTML = `
            <div class="live-panel" style="max-height: 90vh; overflow-y: auto;">
                <!-- Title bar -->
                <div class="win-titlebar">
                    <div class="win-titlebar-text">
                        <span class="win-titlebar-icon">📡</span>
                        <span>Live Quiz Room &mdash; ${state.quizItem?.content?.title || 'Quiz'}</span>
                    </div>
                    <div class="win-ctrl-btns">
                        <button id="close-live" class="win-ctrl-btn">✕</button>
                    </div>
                </div>
                <!-- Body -->
                <div style="padding: 8px; display: flex; flex-direction: column; gap: 8px;">
                    <!-- Room code + host info -->
                    <div class="win-groupbox" style="margin-top: 16px;">
                        <div class="win-groupbox-label">Room Code</div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 0;">
                            <span class="kbc-title" style="font-size: 28px; color: #000080; letter-spacing: 6px;">${state.roomCode}</span>
                            <button id="copy-room" class="win-btn" style="gap: 4px; font-size: 10px; padding: 2px 8px;">
                                <i data-lucide="copy" class="w-3 h-3"></i> Copy
                            </button>
                            <span class="live-chip" style="font-size: 10px; gap: 4px; display: inline-flex; align-items: center;">
                                <i data-lucide="radio" class="w-3 h-3"></i>
                                Hosting ${totalQuestions} Qs
                            </span>
                        </div>
                        <div style="font-size: 10px; color: #555; margin-top: 2px;">
                            Host: ${state.me.emoji} &bull; Share code with players
                        </div>
                    </div>

                    <!-- Participants + How it works -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div class="win-groupbox" style="margin-top: 16px; min-height: 80px;">
                            <div class="win-groupbox-label">Participants (${participants.length})</div>
                            <div id="live-participant-list" style="display: flex; flex-direction: column; gap: 4px; padding: 4px 0;">
                                ${participants.map(p => renderParticipantChip(p)).join('') || '<div style="font-size: 10px; color: #808080;">Waiting for players...</div>'}
                            </div>
                        </div>
                        <div class="win-groupbox" style="margin-top: 16px;">
                            <div class="win-groupbox-label">How it works</div>
                            <ul style="font-size: 10px; color: #333; padding-left: 14px; margin: 4px 0; line-height: 1.6;">
                                <li>Share the 6-digit room code.</li>
                                <li>Players choose a name + emoji.</li>
                                <li>Start when ready. Questions sync automatically.</li>
                                <li>Intro sound plays for you.</li>
                            </ul>
                        </div>
                    </div>

                    <!-- Start button area -->
                    <div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px;">
                        <button id="start-live-quiz" class="kbc-button win-btn-primary" style="gap: 4px; font-size: 11px; padding: 4px 16px;" ${participants.length === 0 ? 'disabled style="opacity:0.5; cursor:default;"' : ''}>
                            <i data-lucide="play" class="w-3 h-3"></i>
                            <span>${participants.length === 0 ? 'Waiting for players...' : 'Start Live Quiz'}</span>
                        </button>
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
                startBtn.disabled = true;
                startLiveSession();
            };
        }

        if (window.lucide) window.lucide.createIcons();
    }

    function renderParticipantChip(p) {
        const score = state.scores[p.id] || 0;
        return `
            <div class="live-participant" style="padding: 4px 6px; display: flex; align-items: center; gap: 6px; font-size: 10px;">
                <span style="font-size: 16px; line-height: 1;">${p.emoji || '🎯'}</span>
                <div>
                    <div style="font-weight: bold; color: #000; font-size: 10px;">${p.name || 'Player'}</div>
                    <div style="color: #555; font-size: 9px;">Score: ${score}</div>
                </div>
            </div>
        `;
    }

    function renderPlayerQuestionView(payload) {
        const shell = ensureOverlay();
        state.status = 'answering';
        cleanupTimers();
        shell.innerHTML = `
            <div class="live-panel" style="max-height: 90vh; overflow-y: auto;">
                <div class="win-titlebar">
                    <div class="win-titlebar-text">
                        <span class="win-titlebar-icon">❓</span>
                        <span>Question ${payload.questionIndex + 1}</span>
                    </div>
                    <span class="live-chip" style="font-size: 10px; display: inline-flex; align-items: center; gap: 4px; margin-left: auto;">
                        <i data-lucide="clock-3" class="w-3 h-3"></i>
                        <span id="live-countdown">30s</span>
                    </span>
                </div>
                <div style="padding: 8px; display: flex; flex-direction: column; gap: 8px;">
                    <!-- Question text -->
                    <div class="win-sunken" style="padding: 8px; background: #fff; font-size: 12px; font-weight: bold; color: #000; min-height: 48px;">
                        ${payload.question}
                    </div>
                    <!-- Options -->
                    <div id="live-options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        ${payload.options.map((opt, idx) => `
                            <button data-idx="${idx}" class="live-option-btn" style="display: flex; gap: 8px; align-items: flex-start; font-size: 11px; padding: 6px 10px;">
                                <span style="font-weight: bold; color: #000080; min-width: 14px;">${String.fromCharCode(65 + idx)}.</span>
                                <span>${opt}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div style="font-size: 10px; color: #555; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="activity" class="w-3 h-3"></i>
                        Answers are ranked by correctness and speed.
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();

        const optionButtons = Array.from(document.querySelectorAll('#live-options button'));
        optionButtons.forEach(btn => {
            btn.onclick = () => {
                if (state.status !== 'answering') return;
                const choice = parseInt(btn.getAttribute('data-idx'), 10);
                sendAnswer(choice, payload);
                optionButtons.forEach(b => b.disabled = true);
                btn.classList.add('border-yellow-400');
            };
        });

        startPlayerCountdown(payload);
    }

    function renderHostQuestionView(question) {
        const shell = ensureOverlay();
        shell.innerHTML = `
            <div class="live-panel" style="max-height: 90vh; overflow-y: auto;">
                <div class="win-titlebar">
                    <div class="win-titlebar-text">
                        <span class="win-titlebar-icon">📡</span>
                        <span>Question ${state.questionIndex + 1} / ${state.quizItem.content.questions.length}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-left: auto;">
                        <span class="live-chip" style="font-size: 10px; display: inline-flex; align-items: center; gap: 4px;">
                            <i data-lucide="timer" class="w-3 h-3"></i>
                            <span id="host-countdown">30s</span>
                        </span>
                        <button id="end-question-btn" class="win-btn" style="font-size: 10px; padding: 2px 8px;">Reveal Now</button>
                    </div>
                </div>
                <div style="padding: 8px; display: flex; flex-direction: column; gap: 8px;">
                    <!-- Question text -->
                    <div class="win-sunken" style="padding: 8px; background: #fff; font-size: 12px; font-weight: bold; color: #000; min-height: 48px;">
                        ${question.question}
                    </div>
                    <!-- Options -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        ${question.options.map((opt, idx) => `
                            <div class="live-option-btn" style="display: flex; gap: 8px; align-items: flex-start; font-size: 11px; padding: 6px 10px; cursor: default;">
                                <span style="font-weight: bold; color: #000080; min-width: 14px;">${String.fromCharCode(65 + idx)}.</span>
                                <span>${opt}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="win-statusbar" style="font-size: 10px; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="activity" class="w-3 h-3"></i>
                        Live answers appear automatically. Leaderboard pops after reveal.
                    </div>
                </div>
            </div>
        `;

        const endBtn = document.getElementById('end-question-btn');
        if (endBtn) endBtn.onclick = () => finishQuestion(true);
        if (window.lucide) window.lucide.createIcons();
    }

    function renderLeaderboard(results, correctIndex, isFinal = false) {
        const shell = ensureOverlay();
        const topThree = [...results].sort((a, b) => b.total - a.total).slice(0, 3);
        shell.innerHTML = `
            <div class="live-panel" style="max-height: 90vh; overflow-y: auto;">
                <div class="win-titlebar">
                    <div class="win-titlebar-text">
                        <span class="win-titlebar-icon">${isFinal ? '🏆' : '📊'}</span>
                        <span>${isFinal ? 'Final Standings' : 'Leaderboard — After Q' + (state.questionIndex + 1)}</span>
                    </div>
                    <span class="live-chip" style="font-size: 10px; display: inline-flex; align-items: center; gap: 4px; margin-left: auto;">
                        <i data-lucide="check-circle-2" class="w-3 h-3"></i>
                        ${typeof correctIndex === 'number' ? `Correct: ${String.fromCharCode(65 + correctIndex)}` : 'Scores'}
                    </span>
                </div>
                <div style="padding: 8px; display: flex; flex-direction: column; gap: 8px;">
                    ${topThree.length ? renderPodium(topThree) : '<div style="font-size: 11px; color: #555;">No answers yet.</div>'}

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; max-height: 200px; overflow-y: auto;" id="leaderboard-list">
                        ${results.map((res, idx) => `
                            <div class="leaderboard-card" style="padding: 4px 8px; display: flex; align-items: center; gap: 6px; ${res.id === state.me.id ? 'outline: 1px solid #000080;' : ''}">
                                <span style="font-size: 16px; line-height: 1;">${res.emoji || '🎯'}</span>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 10px; font-weight: bold; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${idx + 1}. ${res.name}</div>
                                    <div style="font-size: 9px; color: #555;">+${res.delta} &bull; ${res.total} pts</div>
                                </div>
                                ${typeof res.choice === 'number' ? `<div style="font-size: 10px; font-weight: bold; color: ${res.isCorrect ? '#006400' : '#cc0000'};">${String.fromCharCode(65 + res.choice)}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>

                    ${state.role === 'host' && !isFinal ? `
                        <div style="display: flex; justify-content: flex-end; padding-top: 4px;">
                            <button id="next-question-btn" class="kbc-button win-btn-primary" style="gap: 4px; font-size: 11px; padding: 4px 14px;">
                                <i data-lucide="${state.questionIndex + 1 >= state.quizItem.content.questions.length ? 'flag' : 'skip-forward'}" class="w-3 h-3"></i>
                                <span>${state.questionIndex + 1 >= state.quizItem.content.questions.length ? 'Finish Quiz' : 'Next Question'}</span>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        if (state.role === 'host') {
            const nextBtn = document.getElementById('next-question-btn');
            if (nextBtn) nextBtn.onclick = () => {
                if (state.questionIndex + 1 >= state.quizItem.content.questions.length) {
                    broadcastFinal(results);
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
            <div class="win-groupbox" style="margin-top: 14px;">
                <div class="win-groupbox-label">Top Scores</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 6px 0;">
                    ${entries.map((res, idx) => `
                        <div class="podium-card text-center" style="padding: 8px 4px;">
                            <div style="font-size: 20px;">${places[idx] || ''}</div>
                            <div style="font-size: 16px; margin-top: 2px;">${res.emoji || '🎯'}</div>
                            <div style="font-size: 11px; font-weight: bold; color: #000080; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${res.name}</div>
                            <div style="font-size: 10px; color: #555;">${res.total} pts</div>
                        </div>
                    `).reverse().join('')}
                </div>
            </div>
        `;
    }

    function startLiveHost(quizItem) {
        if (!ensureClient()) return;
        state.role = 'host';
        state.quizItem = quizItem;
        state.roomCode = String(Math.floor(100000 + Math.random() * 900000));
        state.questionIndex = 0;
        state.scores = {};
        state.answers = {};
        state.status = 'lobby';
        trackChannel(state.roomCode);
        renderHostLobby();
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

        await state.channel.subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
                alert('Live connection failed. Please check your network and try again.');
            }
        });

        await state.channel.track({
            id: state.me.id,
            name: state.me.name,
            emoji: state.me.emoji,
            role: state.role,
            quizTitle: state.quizItem?.content?.title,
            totalQuestions: state.quizItem?.content?.questions?.length || 0
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
        Object.values(flattened).forEach(p => {
            if (!state.scores[p.id]) state.scores[p.id] = 0;
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
        if (payload.type === 'room-info' && state.role === 'player') {
            state.quizMeta = payload;
            if (state.status === 'waiting') renderWaitingRoom();
        }
        if (payload.type === 'question') {
            cleanupTimers();
            state.status = 'question';
            state.questionIndex = payload.questionIndex;
            state.questionStart = payload.startAt;
            if (state.role === 'player') {
                renderPlayerQuestionView(payload);
            } else if (state.role === 'host') {
                renderHostQuestionView(state.quizItem.content.questions[state.questionIndex]);
            }
        }
        if (payload.type === 'answer' && state.role === 'host') {
            collectAnswer(payload);
        }
        if (payload.type === 'leaderboard') {
            cleanupTimers();
            state.lastResults = payload.results;
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
        const payload = {
            type: 'question',
            questionIndex: state.questionIndex,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            startAt: Date.now()
        };
        state.questionStart = payload.startAt;
        state.answers[state.questionIndex] = {};
        broadcast(payload);
        renderHostQuestionView(q);
        startHostCountdown();
    }

    function startHostCountdown() {
        const countdownEl = document.getElementById('host-countdown');
        let remaining = 30;
        if (countdownEl) countdownEl.textContent = `${remaining}s`;
        state.timers.question = setInterval(() => {
            remaining -= 1;
            if (countdownEl) countdownEl.textContent = `${remaining}s`;
            if (remaining <= 0) {
                finishQuestion(false);
            }
        }, 1000);
    }

    function startPlayerCountdown(payload) {
        const countdownEl = document.getElementById('live-countdown');
        let remaining = 30;
        if (countdownEl) countdownEl.textContent = `${remaining}s`;
        state.timers.question = setInterval(() => {
            remaining -= 1;
            if (countdownEl) countdownEl.textContent = `${remaining}s`;
            if (remaining <= 0) {
                clearInterval(state.timers.question);
                state.status = 'locked';
                const options = document.querySelectorAll('#live-options button');
                options.forEach(btn => btn.disabled = true);
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
        const q = state.quizItem.content.questions[state.questionIndex];
        const answers = state.answers[state.questionIndex] || {};
        const results = [];
        const playersOnly = Object.values(state.presence).filter(p => p.role === 'player');
        playersOnly.forEach((p) => {
            const response = answers[p.id];
            const isCorrect = response ? response.choice === q.correctIndex : false;
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
            correctIndex: q.correctIndex,
            results
        });
        renderLeaderboard(results, q.correctIndex, false);
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
            <div class="live-panel" style="max-height: 90vh; overflow-y: auto; max-width: 460px; margin: 0 auto;">
                <div class="win-titlebar">
                    <div class="win-titlebar-text">
                        <span class="win-titlebar-icon">🎮</span>
                        <span>Join Live Quiz Room</span>
                    </div>
                    <div class="win-ctrl-btns">
                        <button id="cancel-join" class="win-ctrl-btn">✕</button>
                    </div>
                </div>
                <div style="padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                    <!-- Room code -->
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label style="font-size: 11px; font-weight: bold;">Room Code:</label>
                        <input id="join-code" maxlength="6" value="${prefill || ''}" class="win-input" placeholder="123456" style="font-size: 16px; letter-spacing: 4px; font-weight: bold; width: 100%; padding: 4px 8px;" />
                    </div>
                    <!-- Name -->
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label style="font-size: 11px; font-weight: bold;">Display Name:</label>
                        <input id="join-name" value="${state.me.name || ''}" class="win-input" placeholder="Player One" style="width: 100%; padding: 4px 8px;" />
                    </div>
                    <!-- Emoji picker -->
                    <div class="win-groupbox" style="margin-top: 12px;">
                        <div class="win-groupbox-label">Pick an Emoji</div>
                        <div class="emoji-picker" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 6px 0;">
                            ${DEFAULT_EMOJIS.map(em => `
                                <button data-emoji="${em}" style="padding: 4px; text-align: center; font-size: 18px; ${state.me.emoji === em ? 'background: #000080; color: #fff;' : ''}">
                                    ${em}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <!-- Preview -->
                    <div class="win-sunken" style="padding: 6px; background: #fff; display: flex; align-items: center; gap: 8px; font-size: 11px;">
                        <span id="live-preview-emoji" style="font-size: 24px;">${state.me.emoji}</span>
                        <div>
                            <div style="font-size: 9px; color: #555;">You</div>
                            <div id="live-preview-name" style="font-weight: bold; color: #000;">${state.me.name}</div>
                        </div>
                        <div style="font-size: 9px; color: #555; margin-left: auto;">Room: ${prefill || '------'}</div>
                    </div>
                    <!-- Buttons -->
                    <div style="display: flex; justify-content: flex-end; gap: 6px; padding-top: 4px;">
                        <button id="cancel-join-btn" class="win-btn">Cancel</button>
                        <button id="submit-join" class="win-btn win-btn-primary kbc-button" style="gap: 4px; font-size: 11px; padding: 3px 14px;">
                            <i data-lucide="log-in" class="w-3 h-3"></i>
                            Join Room
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.querySelectorAll('.emoji-picker button').forEach(btn => {
            btn.onclick = () => {
                const em = btn.getAttribute('data-emoji');
                updateIdentity({ emoji: em });
                document.querySelectorAll('.emoji-picker button').forEach(b => {
                    b.style.background = '';
                    b.style.color = '';
                });
                btn.style.background = '#000080';
                btn.style.color = '#fff';
                const avatar = document.getElementById('live-preview-emoji');
                if (avatar) avatar.textContent = em;
            };
        });

        const cancel = document.getElementById('cancel-join');
        const cancelBtn = document.getElementById('cancel-join-btn');
        if (cancel) cancel.onclick = closeOverlay;
        if (cancelBtn) cancelBtn.onclick = closeOverlay;

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
        state.answers = {};
        await trackChannel(code);
        renderWaitingRoom();
    }

    function renderWaitingRoom() {
        const shell = ensureOverlay();
        shell.innerHTML = `
            <div class="live-panel" style="max-width: 400px; margin: 0 auto;">
                <div class="win-titlebar">
                    <div class="win-titlebar-text">
                        <span class="win-titlebar-icon">📡</span>
                        <span>Waiting for Host &mdash; Room ${state.roomCode}</span>
                    </div>
                </div>
                <div style="padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;">
                    <div class="win-progress-bar" style="width: 100%;">
                        <div class="win-progress-fill" style="width: 100%;"></div>
                    </div>
                    <div style="font-size: 13px; font-weight: bold; color: #000080;">Waiting for host to start...</div>
                    <div class="win-sunken" style="padding: 8px 16px; background: #fff; display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 28px;">${state.me.emoji}</span>
                        <div style="text-align: left;">
                            <div style="font-size: 9px; color: #555;">You</div>
                            <div style="font-size: 12px; font-weight: bold; color: #000;">${state.me.name}</div>
                        </div>
                    </div>
                    <div style="font-size: 9px; color: #555;">${state.quizMeta?.title || '...'}</div>
                </div>
                <div class="win-statusbar">
                    <div class="win-status-panel" style="flex:1;">Ready</div>
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
