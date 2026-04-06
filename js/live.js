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
        leaveChannel();
    }

    function leaveChannel() {
        if (!state.channel) return;
        state.channel.unsubscribe().catch(() => {});
        state.channel = null;
        state.presence = {};
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
                        <button id="start-live-quiz" class="kbc-button text-black font-bold px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 hover:scale-105 transition-transform disabled:opacity-50" ${participants.length === 0 ? 'disabled' : ''}>
                            <i data-lucide="play" class="w-4 h-4"></i>
                            <span>${participants.length === 0 ? 'Waiting for players' : 'Start Live Quiz'}</span>
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
        shell.innerHTML = `
            <div class="live-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none opacity-30" style="background: radial-gradient(circle at 20% 20%, rgba(234, 179, 8, 0.12), transparent 40%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.12), transparent 35%);"></div>
                <div class="relative flex flex-col gap-6">
                    <div class="flex items-center justify-between gap-4">
                        <div>
                            <div class="text-xs uppercase tracking-wide text-slate-400">Question ${payload.questionIndex + 1}</div>
                            <div class="text-xl md:text-2xl font-bold text-white">${payload.question}</div>
                        </div>
                        <div class="live-chip flex items-center gap-2">
                            <i data-lucide="clock-3" class="w-4 h-4"></i>
                            <span id="live-countdown">30s</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="live-options">
                        ${payload.options.map((opt, idx) => `
                            <button data-idx="${idx}" class="live-option-btn rounded-xl px-4 py-4 text-left text-slate-100 flex gap-3 items-center">
                                <span class="text-yellow-400 font-black">${String.fromCharCode(65 + idx)}</span>
                                <span class="font-semibold">${opt}</span>
                            </button>
                        `).join('')}
                    </div>

                    <div class="text-slate-400 text-sm flex items-center gap-2">
                        <i data-lucide="activity" class="w-4 h-4"></i>
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
            <div class="live-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none opacity-40" style="background: radial-gradient(circle at 25% 20%, rgba(234, 179, 8, 0.15), transparent 45%), radial-gradient(circle at 75% 80%, rgba(59, 130, 246, 0.18), transparent 40%);"></div>
                <div class="relative flex flex-col gap-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-xs uppercase tracking-wide text-slate-400">Question ${state.questionIndex + 1} / ${state.quizItem.content.questions.length}</div>
                            <div class="text-xl md:text-2xl font-bold text-white">${question.question}</div>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="live-chip flex items-center gap-2">
                                <i data-lucide="timer" class="w-4 h-4"></i>
                                <span id="host-countdown">30s</span>
                            </div>
                            <button id="end-question-btn" class="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors">
                                Reveal Now
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${question.options.map((opt, idx) => `
                            <div class="live-option-btn rounded-xl px-4 py-4 text-left text-slate-100 flex gap-3 items-center">
                                <span class="text-yellow-400 font-black">${String.fromCharCode(65 + idx)}</span>
                                <span class="font-semibold">${opt}</span>
                            </div>
                        `).join('')}
                    </div>

                    <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-400 flex items-center gap-2">
                        <i data-lucide="activity" class="w-4 h-4"></i>
                        Live answers will appear automatically. Leaderboard pops after reveal.
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
            <div class="live-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none opacity-30" style="background: radial-gradient(circle at 20% 20%, rgba(234, 179, 8, 0.15), transparent 45%), radial-gradient(circle at 70% 80%, rgba(59, 130, 246, 0.18), transparent 40%);"></div>
                <div class="relative flex flex-col gap-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-xs uppercase tracking-wide text-slate-400">${isFinal ? 'Grand Finale' : 'Leaderboard'}</div>
                            <div class="text-2xl font-bold text-white">${isFinal ? 'Final Standings' : 'After Question ' + (state.questionIndex + 1)}</div>
                        </div>
                        <div class="live-chip flex items-center gap-2">
                            <i data-lucide="check-circle-2" class="w-4 h-4"></i>
                            ${typeof correctIndex === 'number' ? `Correct: ${String.fromCharCode(65 + correctIndex)}` : 'Scores'}
                        </div>
                    </div>

                    ${topThree.length ? renderPodium(topThree) : '<div class="text-slate-400">No answers yet.</div>'}

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto" id="leaderboard-list">
                        ${results.map((res, idx) => `
                            <div class="leaderboard-card rounded-xl p-3 flex items-center gap-3 ${res.id === state.me.id ? 'border-yellow-400/60' : 'border-transparent'}">
                                <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-2xl">${res.emoji || '🎯'}</div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-white font-semibold truncate">${idx + 1}. ${res.name}</div>
                                    <div class="text-xs text-slate-500">+${res.delta} • Total ${res.total}</div>
                                </div>
                                ${typeof res.choice === 'number' ? `<div class="text-xs ${res.isCorrect ? 'text-green-400' : 'text-rose-400'}">${String.fromCharCode(65 + res.choice)}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>

                    ${state.role === 'host' && !isFinal ? `
                        <div class="flex justify-end gap-3">
                            <button id="next-question-btn" class="kbc-button text-black font-bold px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 hover:scale-105 transition-transform">
                                <i data-lucide="${state.questionIndex + 1 >= state.quizItem.content.questions.length ? 'flag' : 'skip-forward'}" class="w-4 h-4"></i>
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

    async function startLiveHost(quizItem) {
        if (!ensureClient()) return;
        state.role = 'host';
        state.quizItem = quizItem;
        state.roomCode = String(Math.floor(100000 + Math.random() * 900000));
        state.questionIndex = 0;
        state.scores = {};
        state.answers = {};
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
        const correctIndex = Number.parseInt(q.correctIndex, 10);
        const normalizedCorrectIndex = Number.isNaN(correctIndex) ? q.correctIndex : correctIndex;
        const payload = {
            type: 'question',
            questionIndex: state.questionIndex,
            question: q.question,
            options: q.options,
            correctIndex: normalizedCorrectIndex,
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
        const correctIndex = Number.parseInt(q.correctIndex, 10);
        const normalizedCorrectIndex = Number.isNaN(correctIndex) ? q.correctIndex : correctIndex;
        const answers = state.answers[state.questionIndex] || {};
        const results = [];
        const playersOnly = Object.values(state.presence).filter(p => p.role === 'player');
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
        state.answers = {};
        try {
            await trackChannel(code);
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
