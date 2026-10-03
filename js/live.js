// Live quiz: host and player flows over Supabase realtime broadcast channels (no custom backend).
// The host's browser is the game server. Players send answers; the host scores and broadcasts.
// All markup is built here with the lv-* classes from css/live.css (paper-and-lime, mobile first).

(() => {
    const DEFAULT_EMOJIS = ['🧠', '🚀', '🦉', '🪐', '🎯', '🎸', '🐉', '🦾', '🧩', '🔥', '🌟', '🎮'];
    const QUESTION_PREP_MS = 6000;
    const ANSWER_WINDOW_MS = 30000;
    const LETTERS = ['A', 'B', 'C', 'D'];

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
        timers: { question: null, questionTick: null, heartbeat: null, phase: null, finale: null },
        me: null,
        presence: {},
        status: 'idle',
        lastResults: null,
        quizMeta: null,
        myChoice: null,
        lobbySig: ''
    };

    const sfx = (name) => { try { window.DQSfx?.play(name); } catch { /* sound is optional */ } };

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    const icons = () => { if (window.lucide) window.lucide.createIcons(); };

    // ---------- identity ----------
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

    function loadIdentity() {
        const stored = localStorage.getItem('dquest_live_identity');
        const sessionId = getTabSessionId();
        let parsed = {};
        try { parsed = JSON.parse(stored || '{}') || {}; } catch { parsed = {}; }
        state.me = { id: sessionId, name: parsed.name || 'Player', emoji: parsed.emoji || '🧠' };
        if (!stored) saveIdentity();
    }

    function saveIdentity() {
        localStorage.setItem('dquest_live_identity', JSON.stringify({ name: state.me.name, emoji: state.me.emoji }));
    }

    function updateIdentity(partial) {
        state.me = { ...state.me, ...partial };
        saveIdentity();
    }

    function ensureClient() {
        if (!window.supabase) { toast('Live quiz could not load. Check your connection and reload.', true); return null; }
        if (!window.hasSupabaseConfig || !window.hasSupabaseConfig()) { toast('Live quiz is not configured on this site.', true); return null; }
        if (!state.client) {
            const { url, anonKey } = window.getSupabaseConfig();
            state.client = supabase.createClient(url, anonKey);
        }
        return state.client;
    }

    // ---------- shell ----------
    function toast(message, isError = false) {
        const el = document.createElement('div');
        el.className = `lv-toast${isError ? ' is-error' : ''}`;
        el.setAttribute('role', 'status');
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3600);
    }

    function ensureOverlay() {
        let overlay = document.getElementById('live-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'live-overlay';
            overlay.className = 'lv';
            overlay.innerHTML = '<div class="lv-frame" id="live-overlay-shell"></div>';
            document.body.appendChild(overlay);
            document.body.classList.add('lv-open');
        }
        return document.getElementById('live-overlay-shell');
    }

    // In-page confirm so it works the same on phones and never gets blocked.
    function confirmDialog(message, okLabel = 'Yes') {
        return new Promise((resolve) => {
            const wrap = document.createElement('div');
            wrap.className = 'lv-dialog';
            wrap.setAttribute('role', 'dialog');
            wrap.setAttribute('aria-modal', 'true');
            wrap.innerHTML = `
                <div class="lv-dialog-card">
                    <p>${esc(message)}</p>
                    <div class="lv-dialog-actions">
                        <button type="button" class="btn" data-no>Cancel</button>
                        <button type="button" class="btn btn-coral" data-yes>${esc(okLabel)}</button>
                    </div>
                </div>`;
            const done = (value) => { wrap.remove(); resolve(value); };
            wrap.querySelector('[data-no]').onclick = () => done(false);
            wrap.querySelector('[data-yes]').onclick = () => done(true);
            (document.getElementById('live-overlay') || document.body).appendChild(wrap);
            wrap.querySelector('[data-yes]').focus();
        });
    }

    function getQuizMetadata() {
        const content = state.quizItem?.content || {};
        const metadata = content.metadata || {};
        return {
            grade: metadata.grade || content.grade || 'All',
            difficulty: metadata.difficulty || content.difficulty || 'Mixed',
            totalQuestions: content.questions?.length || state.currentQuestionPayload?.totalQuestions || state.quizMeta?.totalQuestions || 0
        };
    }

    function formatPoints(value) { return Number(value || 0).toLocaleString(); }

    function soundButton() {
        const on = window.DQSfx ? window.DQSfx.enabled : false;
        return `<button type="button" class="btn btn-sm btn-icon" id="lv-sound" aria-label="${on ? 'Mute sound' : 'Turn sound on'}" aria-pressed="${on ? 'false' : 'true'}"><i data-lucide="${on ? 'volume-2' : 'volume-x'}"></i></button>`;
    }

    function renderTop() {
        const total = getQuizMetadata().totalQuestions;
        const tracker = state.status === 'lobby' || state.status === 'join' || state.status === 'waiting'
            ? ''
            : `<span class="lv-tracker">Q ${Math.min(state.questionIndex + 1, total || state.questionIndex + 1)}<small>/${total || '?'}</small></span>`;
        if (state.role === 'host') {
            return `
                <header class="lv-top">
                    <span class="chip chip-lime">PIN ${esc(state.roomCode || '------')}</span>
                    ${tracker}
                    <span class="lv-top-actions">
                        ${soundButton()}
                        <button type="button" class="btn btn-sm btn-icon" id="lv-fullscreen" aria-label="Toggle fullscreen"><i data-lucide="maximize-2"></i></button>
                        <button type="button" class="btn btn-sm btn-coral" id="lv-end"><i data-lucide="square"></i><span>End quiz</span></button>
                    </span>
                </header>`;
        }
        return `
            <header class="lv-top">
                <span class="lv-me"><span class="lv-me-emoji">${esc(state.me?.emoji || '🎯')}</span><b>${esc(state.me?.name || 'Player')}</b></span>
                ${tracker}
                <span class="lv-top-actions">
                    <span class="chip chip-purple" id="lv-points">${formatPoints(state.scores[state.me?.id] || 0)} pts</span>
                    ${soundButton()}
                    <button type="button" class="btn btn-sm btn-icon" id="lv-leave" aria-label="Leave room"><i data-lucide="log-out"></i></button>
                </span>
            </header>`;
    }

    function wireTop() {
        const snd = document.getElementById('lv-sound');
        if (snd) snd.onclick = () => { const on = window.DQSfx?.toggle(); snd.setAttribute('aria-pressed', String(!on)); snd.innerHTML = `<i data-lucide="${on ? 'volume-2' : 'volume-x'}"></i>`; snd.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on'); icons(); if (on) sfx('tap'); };
        const fs = document.getElementById('lv-fullscreen');
        if (fs) fs.onclick = () => {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
            else document.exitFullscreen?.().catch(() => {});
        };
        const end = document.getElementById('lv-end');
        if (end) end.onclick = async () => {
            if (!await confirmDialog('End the live quiz for everyone?', 'End quiz')) return;
            broadcast({ type: 'end-session' });
            closeOverlay();
        };
        const leave = document.getElementById('lv-leave');
        if (leave) leave.onclick = async () => {
            if (!await confirmDialog('Leave this live quiz?', 'Leave')) return;
            closeOverlay();
        };
    }

    // One full-screen stage: top bar plus a content area. `cls` picks the layout flavour.
    function renderStage(contentHtml, cls = '') {
        const shell = ensureOverlay();
        shell.innerHTML = `
            <div class="lv-stage ${state.role === 'host' ? 'is-host' : 'is-player'} ${cls}">
                ${renderTop()}
                <main class="lv-main">${contentHtml}</main>
            </div>`;
        wireTop();
        icons();
    }

    function closeOverlay() {
        const overlay = document.getElementById('live-overlay');
        if (overlay) overlay.remove();
        document.body.classList.remove('lv-open');
        state.status = 'idle';
        cleanupTimers();
        stopPlayerHeartbeat();
        window.DQSfx?.stopAll();
        leaveChannel();
        state.players = {};
        state.currentQuestionPayload = null;
        state.pendingResults = null;
        state.revealTriggered = false;
        state.myChoice = null;
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

    // ---------- players ----------
    function upsertPlayer(player) {
        if (!player || !player.id || player.role === 'host') return;
        const existing = state.players[player.id] || {};
        state.players[player.id] = {
            id: player.id,
            role: 'player',
            name: player.name || existing.name || 'Player',
            emoji: player.emoji || existing.emoji || '🎯'
        };
        if (typeof state.scores[player.id] !== 'number') state.scores[player.id] = 0;
    }

    function getPlayers() {
        const merged = {};
        Object.values(state.players).forEach((player) => { if (player?.id) merged[player.id] = player; });
        Object.values(state.presence)
            .filter((entry) => entry.role === 'player' && entry.id)
            .forEach((entry) => {
                merged[entry.id] = { id: entry.id, role: 'player', name: entry.name || merged[entry.id]?.name || 'Player', emoji: entry.emoji || merged[entry.id]?.emoji || '🎯' };
            });
        return Object.values(merged);
    }

    function announcePlayerPresence(eventType = 'player-presence') {
        if (state.role !== 'player') return;
        broadcast({ type: eventType, player: { id: state.me.id, role: 'player', name: state.me.name, emoji: state.me.emoji, status: state.status } });
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

    // ---------- timer widget (host and players share it) ----------
    function timerHtml(seconds = 30) {
        return `
            <div class="lv-timer" id="lv-timer" role="timer" aria-label="Time left">
                <span class="lv-timer-num" id="lv-timer-num">${seconds}</span>
                <span class="lv-timer-track"><span class="lv-timer-fill" id="lv-timer-fill"></span></span>
            </div>`;
    }

    function paintTimer(remaining, total) {
        const num = document.getElementById('lv-timer-num');
        const fill = document.getElementById('lv-timer-fill');
        const box = document.getElementById('lv-timer');
        if (num) num.textContent = String(remaining);
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, (remaining / total) * 100))}%`;
        if (box) box.classList.toggle('is-low', remaining <= 5);
    }

    function optionsHtml(options, { interactive = false, locked = false } = {}) {
        return `<div class="lv-opts" id="live-options">${options.map((text, idx) => {
            const letter = LETTERS[idx] || String.fromCharCode(65 + idx);
            const inner = `<span class="lv-letter l${idx}">${letter}</span><span class="lv-opt-text">${esc(text)}</span>`;
            return interactive
                ? `<button type="button" class="lv-opt" data-idx="${idx}" id="live-option-${idx}">${inner}</button>`
                : `<div class="lv-opt${locked ? ' is-locked' : ''}" data-host-option="${idx}" id="live-option-${idx}">${inner}</div>`;
        }).join('')}</div>`;
    }

    function questionSizeClass(text) {
        const length = String(text || '').trim().length;
        return length > 190 ? 'is-long' : length > 110 ? 'is-medium' : 'is-short';
    }

    function questionCard(text, index) {
        return `<div class="lv-question ${questionSizeClass(text)}"><span class="lv-qnum">Q${index + 1}</span><h2>${esc(text)}</h2></div>`;
    }

    // ---------- host: lobby ----------
    function participantCard(p) {
        const score = state.scores[p.id] || 0;
        return `
            <li class="lv-player">
                <span class="lv-avatar">${esc(p.emoji || '🎯')}</span>
                <span class="lv-player-name"><b>${esc(p.name || 'Player')}</b>${score ? `<small>${formatPoints(score)} pts</small>` : ''}</span>
                <button type="button" class="btn btn-sm btn-icon" data-kick-player="${esc(p.id)}" aria-label="Remove ${esc(p.name || 'player')}"><i data-lucide="x"></i></button>
            </li>`;
    }

    function renderHostLobby() {
        const participants = getPlayers();
        const sig = participants.map((p) => `${p.id}:${p.name}:${p.emoji}`).join('|');
        if (state.status === 'lobby' && sig === state.lobbySig && document.getElementById('lv-lobby')) return;
        state.lobbySig = sig;
        const { totalQuestions, grade, difficulty } = getQuizMetadata();
        const joinLink = `${window.location.origin}${window.location.pathname}?livePin=${state.roomCode}`;
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(joinLink)}`;
        renderStage(`
            <div class="lv-lobby" id="lv-lobby">
                <section class="lv-card lv-pin-card">
                    <p class="lv-eyebrow">Live room · ${esc(state.quizItem?.content?.title || 'Quiz')}</p>
                    <p class="lv-pin-label">Game PIN</p>
                    <div class="lv-pin" aria-label="Game PIN ${esc(state.roomCode)}">${esc(state.roomCode)}</div>
                    <div class="lv-pin-actions">
                        <button type="button" class="btn btn-sm" id="copy-room"><i data-lucide="copy"></i><span>Copy PIN</span></button>
                        <button type="button" class="btn btn-sm" id="copy-link"><i data-lucide="link"></i><span>Copy link</span></button>
                    </div>
                    <div class="lv-join-how">
                        <img src="${qrSrc}" alt="QR code to join" width="132" height="132" loading="lazy">
                        <ol>
                            <li>Open <b>${esc(window.location.host)}</b> or scan the code</li>
                            <li>Tap <b>Join live quiz</b></li>
                            <li>Enter the PIN and a nickname</li>
                        </ol>
                    </div>
                    <div class="lv-meta"><span class="chip">${totalQuestions} questions</span><span class="chip">Grade ${esc(grade)}</span><span class="chip">${esc(difficulty)}</span></div>
                </section>
                <section class="lv-card lv-players-card">
                    <h2 class="lv-h2"><i data-lucide="users"></i> Players <span class="chip chip-lime">${participants.length}</span></h2>
                    ${participants.length
                        ? `<ul class="lv-players">${participants.map(participantCard).join('')}</ul>`
                        : '<p class="lv-empty">Waiting for players. Share the PIN or QR code.</p>'}
                </section>
            </div>
            <footer class="lv-bar">
                <button type="button" class="btn btn-lime btn-big" id="start-live-quiz"><i data-lucide="play"></i><span data-start-label>${participants.length ? `Start with ${participants.length} player${participants.length === 1 ? '' : 's'}` : 'Start live quiz'}</span></button>
            </footer>`, 'stage-lobby');

        document.getElementById('copy-room').onclick = (event) => copyText(state.roomCode, event.currentTarget, 'PIN copied');
        document.getElementById('copy-link').onclick = (event) => copyText(joinLink, event.currentTarget, 'Link copied');

        const startBtn = document.getElementById('start-live-quiz');
        startBtn.onclick = async () => {
            if (!participants.length && !await confirmDialog('No players have joined yet. Start anyway?', 'Start')) return;
            startBtn.disabled = true;
            startBtn.querySelector('[data-start-label]').textContent = 'Starting…';
            startLiveSession();
        };

        document.querySelectorAll('[data-kick-player]').forEach((kickBtn) => {
            kickBtn.onclick = async () => {
                const playerId = kickBtn.getAttribute('data-kick-player');
                const target = participants.find((p) => p.id === playerId);
                if (!await confirmDialog(`Remove ${target?.name || 'this player'} from the room?`, 'Remove')) return;
                delete state.players[playerId];
                delete state.scores[playerId];
                broadcast({ type: 'kick-player', targetId: playerId, reason: 'Removed by host' });
                state.lobbySig = '';
                renderHostLobby();
            };
        });
    }

    function copyText(text, button, doneLabel) {
        const label = button.querySelector('span');
        const original = label ? label.textContent : '';
        const finish = () => { if (label) { label.textContent = doneLabel; setTimeout(() => { label.textContent = original; }, 1400); } else toast(doneLabel); };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(finish, () => toast(`Copy this: ${text}`));
        else toast(`Copy this: ${text}`);
    }

    // ---------- title ----------
    function renderTitleIntro(payload) {
        const isHost = state.role === 'host';
        renderStage(`
            <div class="lv-center lv-title-screen">
                <p class="lv-eyebrow">Live quiz</p>
                <h1 class="lv-big">${esc(payload.title)}</h1>
                <p class="lv-sub">${payload.totalQuestions ? `${payload.totalQuestions} questions. ` : ''}${isHost ? 'Players are ready when you are.' : 'Your host is about to begin.'}</p>
                ${isHost
                    ? '<button type="button" class="btn btn-lime btn-big" id="title-next-btn"><i data-lucide="play"></i><span>Show the first question</span></button>'
                    : '<span class="chip chip-lime lv-pulse">Get ready…</span>'}
            </div>`, 'stage-title');
        if (isHost) document.getElementById('title-next-btn').onclick = () => handleTitleNext();
    }

    // ---------- host: question ----------
    function hostQuestionView(mode, payload) {
        const q = state.quizItem.content.questions[state.questionIndex];
        const opts = q.options || [];
        const answered = Object.keys(state.answers[state.questionIndex] || {}).length;
        const expected = (state.expectedAnswerPlayerIds[state.questionIndex] || []).length || getPlayers().length;
        let side = '';
        if (mode === 'prep') {
            side = `<div class="lv-prep"><span class="chip" id="host-prep-countdown">Options open in ${Math.round(QUESTION_PREP_MS / 1000)}s</span>
                <button type="button" class="btn btn-sm btn-lime" id="open-options-btn"><i data-lucide="unlock"></i><span>Open options now</span></button></div>`;
        } else if (mode === 'live') {
            side = `${timerHtml(Math.round(ANSWER_WINDOW_MS / 1000))}
                <div class="lv-live-row"><span class="chip chip-purple" id="lv-answered">${answered} / ${expected} answered</span>
                <button type="button" class="btn btn-sm btn-coral" id="end-question-btn"><i data-lucide="eye"></i><span>Reveal now</span></button></div>`;
        }
        renderStage(`
            <div class="lv-qscreen">
                ${side}
                ${questionCard(q.question, state.questionIndex)}
                ${optionsHtml(opts, { locked: mode === 'prep' })}
            </div>`, `stage-question-host is-${mode}`);
        const endBtn = document.getElementById('end-question-btn');
        if (endBtn) endBtn.onclick = () => finishQuestion(true);
        const openBtn = document.getElementById('open-options-btn');
        if (openBtn) openBtn.onclick = () => openOptionsForCurrentQuestion();
    }

    function renderQuestionOnlyView(payload) {
        if (state.role === 'host') { hostQuestionView('prep', payload); return; }
        state.myChoice = null;
        renderStage(`
            <div class="lv-qscreen lv-qplayer">
                ${questionCard(payload.question, payload.questionIndex)}
                <p class="lv-sub"><span class="spin-loader"></span> Options are about to open…</p>
            </div>`, 'stage-question-only');
    }

    function renderHostQuestionView() { hostQuestionView('live'); }

    function renderPlayerQuestionView(payload) {
        state.status = 'answering';
        state.myChoice = null;
        cleanupTimers();
        renderStage(`
            <div class="lv-qscreen lv-qplayer">
                ${timerHtml(30)}
                ${questionCard(payload.question, payload.questionIndex)}
                ${optionsHtml(payload.options || [], { interactive: true })}
                <p class="lv-sub" id="lv-answer-note" role="status">Tap your answer.</p>
            </div>`, 'stage-question-player');
        startPlayerCountdown(payload.startAt);
        const buttons = Array.from(document.querySelectorAll('#live-options button[data-idx]'));
        buttons.forEach((btn) => {
            btn.onclick = () => {
                if (state.status !== 'answering') return;
                const choice = parseInt(btn.getAttribute('data-idx'), 10);
                state.myChoice = choice;
                sendAnswer(choice, payload);
                buttons.forEach((b) => { b.disabled = true; b.classList.add(b === btn ? 'is-selected' : 'is-dim'); });
                const note = document.getElementById('lv-answer-note');
                if (note) note.textContent = 'Answer locked in. Waiting for the others…';
                sfx('lock');
            };
        });
    }

    // ---------- reveal ----------
    function renderAnswerReveal(payload) {
        const mine = payload.results.find((r) => r.id === state.me.id);
        if (state.role === 'host') {
            const q = state.quizItem.content.questions[state.questionIndex];
            const counts = [0, 0, 0, 0];
            payload.results.forEach((r) => { if (Number.isInteger(r.choice) && counts[r.choice] !== undefined) counts[r.choice] += 1; });
            const total = payload.results.length || 1;
            const opts = (q.options || []).map((text, idx) => `
                <div class="lv-opt ${idx === payload.correctIndex ? 'is-correct' : 'is-dim'}" data-host-option="${idx}" id="live-option-${idx}">
                    <span class="lv-letter l${idx}">${LETTERS[idx]}</span><span class="lv-opt-text">${esc(text)}</span>
                    <span class="lv-count" aria-label="${counts[idx]} players chose this"><i style="width:${Math.round((counts[idx] / total) * 100)}%"></i><b>${counts[idx]}</b></span>
                </div>`).join('');
            renderStage(`
                <div class="lv-qscreen">
                    ${questionCard(q.question, state.questionIndex)}
                    <div class="lv-opts" id="live-options">${opts}</div>
                    <footer class="lv-bar"><button type="button" class="btn btn-lime btn-big" id="to-leaderboard-btn"><i data-lucide="trophy"></i><span>Leaderboard</span></button></footer>
                </div>`, 'stage-answer-reveal');
            document.getElementById('to-leaderboard-btn').onclick = () => showLeaderboardStage();
            return;
        }

        if (mine) state.scores[state.me.id] = mine.total;
        const noAnswer = !mine || mine.choice === undefined || mine.choice === null;
        const ok = !noAnswer && mine.isCorrect;
        const correctText = payload.correctOption ?? payload.options?.[payload.correctIndex];
        renderStage(`
            <div class="lv-center lv-result ${ok ? 'is-good' : 'is-bad'}">
                <div class="lv-result-mark" aria-hidden="true">${noAnswer ? '⏰' : ok ? '✅' : '❌'}</div>
                <h1 class="lv-big">${noAnswer ? "Time's up" : ok ? 'Correct!' : 'Not quite'}</h1>
                <p class="lv-points">${ok ? `+${formatPoints(mine.delta)} points` : noAnswer ? 'No answer locked this round.' : 'No points this round.'}</p>
                ${!ok && correctText ? `<p class="lv-sub">Right answer: <b>${esc(correctText)}</b></p>` : ''}
                ${mine ? `<span class="chip chip-lime">Rank ${mine.rank} of ${payload.results.length} · ${formatPoints(mine.total)} pts</span>` : ''}
                <p class="lv-sub">Next up shortly…</p>
            </div>`, `stage-player-result ${ok ? 'is-good' : 'is-bad'}`);
        sfx(noAnswer ? 'timeup' : ok ? 'correct' : 'wrong');
    }

    // ---------- leaderboard ----------
    function rankRow(res, idx, meId) {
        return `
            <li class="lv-rank-row${res.id === meId ? ' is-me' : ''}" data-player-id="${esc(res.id)}">
                <span class="lv-pos">${idx + 1}</span>
                <span class="lv-avatar">${esc(res.emoji || '🎯')}</span>
                <span class="lv-player-name"><b>${esc(res.name)}</b><small>${formatPoints(res.total)} pts${res.delta ? ` · +${formatPoints(res.delta)}` : ''}</small></span>
                ${res.rankRise > 0 ? `<span class="lv-rise" aria-label="Up ${res.rankRise}">▲${res.rankRise}</span>` : ''}
            </li>`;
    }

    function renderLeaderboard(results, correctIndex, isFinal = false) {
        const sorted = [...results].sort((a, b) => (a.rank || 999) - (b.rank || 999) || b.total - a.total);
        const shown = sorted.slice(0, state.role === 'host' ? 8 : 5);
        const meId = state.me.id;
        const mine = sorted.find((r) => r.id === meId);
        const last = state.quizItem ? state.questionIndex + 1 >= state.quizItem.content.questions.length : false;
        const previous = [...shown].sort((a, b) => (a.prevRank || a.rank || 999) - (b.prevRank || b.rank || 999));
        renderStage(`
            <div class="lv-board">
                <p class="lv-eyebrow">${isFinal ? 'Final board' : `After question ${state.questionIndex + 1}`}</p>
                <h1 class="lv-big">Leaderboard</h1>
                ${state.role === 'player' && mine ? `<p class="lv-sub">You are <b>#${mine.rank}</b> with ${formatPoints(mine.total)} points.</p>` : ''}
                <ol class="lv-ranks" id="leaderboard-list">${shown.map((res, idx) => rankRow(res, idx, meId)).join('') || '<li class="lv-empty">No players yet.</li>'}</ol>
                ${state.role === 'host' && !isFinal ? `<footer class="lv-bar"><button type="button" class="btn btn-lime btn-big" id="next-question-btn"><i data-lucide="${last ? 'flag' : 'skip-forward'}"></i><span>${last ? 'Finish quiz' : 'Next question'}</span></button></footer>` : ''}
                ${state.role === 'player' ? '<p class="lv-sub">Waiting for the host…</p>' : ''}
            </div>`, 'stage-leaderboard');

        // Rows slide from their old place to their new one.
        const list = document.getElementById('leaderboard-list');
        if (list && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const rows = Array.from(list.querySelectorAll('.lv-rank-row'));
            const rowHeight = rows[0] ? rows[0].getBoundingClientRect().height + 8 : 62;
            const prevIndex = new Map(previous.map((res, idx) => [res.id, idx]));
            rows.forEach((row, nextIndex) => {
                const from = prevIndex.has(row.dataset.playerId) ? prevIndex.get(row.dataset.playerId) : nextIndex;
                const dy = (from - nextIndex) * rowHeight;
                if (dy) { row.style.transform = `translateY(${dy}px)`; }
            });
            requestAnimationFrame(() => requestAnimationFrame(() => rows.forEach((row) => { row.style.transition = 'transform 650ms cubic-bezier(.22,1,.36,1)'; row.style.transform = 'translateY(0)'; })));
        }
        if (state.role === 'host') sfx('whoosh');
        else sfx('rank');

        if (state.role === 'host' && !isFinal) {
            document.getElementById('next-question-btn').onclick = () => {
                if (last) broadcastFinal(results);
                else { state.questionIndex += 1; state.pendingResults = null; sendQuestion(); }
            };
        }
    }

    // ---------- finale ----------
    function podiumHtml(top) {
        const order = [top[1], top[0], top[2]]; // 2nd, 1st, 3rd so the winner stands in the middle
        const heights = ['is-second', 'is-first', 'is-third'];
        const medals = ['🥈', '🥇', '🥉'];
        return `<div class="lv-podium">${order.map((res, i) => res ? `
            <div class="lv-step ${heights[i]}">
                <span class="lv-step-medal">${medals[i]}</span>
                <span class="lv-avatar lv-avatar-lg">${esc(res.emoji || '🎯')}</span>
                <b class="lv-step-name">${esc(res.name)}</b>
                <span class="lv-step-pts">${formatPoints(res.total)} pts</span>
            </div>` : '<div class="lv-step is-empty"></div>').join('')}</div>`;
    }

    function renderFinaleSpotlight(results) {
        const sorted = [...results].sort((a, b) => b.total - a.total);
        const topThree = sorted.slice(0, 3);
        const meIdx = sorted.findIndex((r) => r.id === state.me.id);
        sfx('fanfare');
        renderStage(`
            <div class="lv-center lv-finale">
                <p class="lv-eyebrow">Final result</p>
                <h1 class="lv-big">${topThree[0] ? `${esc(topThree[0].name)} wins!` : 'Quiz complete'}</h1>
                ${podiumHtml(topThree)}
                ${state.role === 'player' && meIdx >= 0 ? `<p class="lv-sub">You finished <b>#${meIdx + 1}</b> of ${sorted.length} with ${formatPoints(sorted[meIdx].total)} points.</p>` : ''}
                ${sorted.length > 3 ? `<ol class="lv-ranks">${sorted.slice(3, 10).map((res, i) => rankRow(res, i + 3, state.me.id)).join('')}</ol>` : ''}
                ${state.role === 'host'
                    ? '<footer class="lv-bar"><button type="button" class="btn btn-lime btn-big" id="end-quiz-btn"><i data-lucide="check"></i><span>Close room</span></button></footer>'
                    : '<button type="button" class="btn btn-big" id="leave-final-btn"><i data-lucide="log-out"></i><span>Leave room</span></button>'}
            </div>`, 'stage-finale');
        const endBtn = document.getElementById('end-quiz-btn');
        if (endBtn) endBtn.onclick = () => { broadcast({ type: 'end-session' }); closeOverlay(); };
        const leaveBtn = document.getElementById('leave-final-btn');
        if (leaveBtn) leaveBtn.onclick = closeOverlay;
    }

    // ---------- host: room and flow ----------
    async function startLiveHost(quizItem) {
        if (!ensureClient()) return;
        state.role = 'host';
        state.quizItem = quizItem;
        state.roomCode = String(Math.floor(100000 + Math.random() * 900000));
        state.questionIndex = 0;
        resetRoomState();
        state.status = 'lobby';
        sfx('tap');
        try {
            await trackChannel(state.roomCode);
            renderHostLobby();
        } catch (error) {
            console.error('Failed to start live room:', error);
            toast('Could not create the live room. Please try again.', true);
            closeOverlay();
        }
    }

    function resetRoomState() {
        state.scores = {};
        state.prevRanks = {};
        state.players = {};
        state.answers = {};
        state.expectedAnswerPlayerIds = {};
        state.currentQuestionPayload = null;
        state.pendingResults = null;
        state.introStarted = false;
        state.revealTriggered = false;
        state.myChoice = null;
        state.lobbySig = '';
        state.quizMeta = null;
    }

    async function trackChannel(code) {
        if (state.channel) await state.channel.unsubscribe();
        const client = ensureClient();
        if (!client) throw new Error('No live client');
        state.channel = client.channel(`live-${code}`, { config: { presence: { key: state.me.id } } });
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
                if (status === 'SUBSCRIBED') { clearTimeout(timeout); settled = true; resolve(); return; }
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    clearTimeout(timeout); settled = true; reject(new Error(`Live connection failed: ${status}`));
                }
            });
        });
    }

    function handlePresenceSync() {
        if (!state.channel) return;
        const presence = state.channel.presenceState();
        const flattened = {};
        Object.keys(presence).forEach((key) => {
            const entries = presence[key];
            const latest = entries[entries.length - 1];
            if (latest) flattened[key] = latest;
        });
        state.presence = flattened;
        Object.values(flattened).forEach((entry) => upsertPlayer(entry));
        if (state.role === 'host' && state.status === 'lobby') {
            renderHostLobby();
            broadcastRoomInfo();
        }
    }

    function broadcastRoomInfo() {
        if (state.role !== 'host') return;
        broadcast({ type: 'room-info', roomCode: state.roomCode, title: state.quizItem?.content?.title, totalQuestions: state.quizItem?.content?.questions?.length || 0 });
    }

    function handleBroadcast(payload) {
        if (!payload || !payload.type) return;
        if (state.role === 'host' && payload.isResync) return;
        if (state.role === 'player' && payload.targetId && payload.targetId !== state.me.id) return;

        if ((payload.type === 'player-joined' || payload.type === 'player-presence') && state.role === 'host') {
            const isNew = !state.players[(payload.player || payload).id];
            upsertPlayer(payload.player || payload);
            if (isNew && payload.type === 'player-joined') sfx('join');
            if (state.status === 'lobby') renderHostLobby();
            // Re-sync only the player who just joined so everyone else is left alone.
            if (payload.type === 'player-joined' && state.status !== 'lobby' && state.currentQuestionPayload) {
                const joinedPlayerId = payload.player?.id || payload.id;
                if (joinedPlayerId) broadcast({ ...state.currentQuestionPayload, targetId: joinedPlayerId, isResync: true });
            }
            return;
        }

        if (payload.type === 'kick-player' && state.role === 'player') {
            toast(payload.reason || 'The host removed you from this room.', true);
            closeOverlay();
            return;
        }
        if (payload.type === 'room-info' && state.role === 'player') {
            state.quizMeta = payload;
            if (state.status === 'waiting') renderWaitingRoom();
        }
        if (payload.type === 'quiz-title' && state.role === 'player') {
            state.currentQuestionPayload = payload;
            if (typeof payload.questionIndex === 'number') state.questionIndex = payload.questionIndex;
            state.quizMeta = { ...(state.quizMeta || {}), totalQuestions: payload.totalQuestions, title: payload.title };
            state.status = 'title';
            sfx('join');
            renderTitleIntro(payload);
        }
        if (payload.type === 'question-only' && state.role === 'player') {
            const duplicate = state.currentQuestionPayload?.type === 'question-only' && state.currentQuestionPayload?.questionIndex === payload.questionIndex && state.status === 'question-only';
            if (duplicate) return;
            state.currentQuestionPayload = payload;
            if (typeof payload.questionIndex === 'number') state.questionIndex = payload.questionIndex;
            if (payload.totalQuestions) state.quizMeta = { ...(state.quizMeta || {}), totalQuestions: payload.totalQuestions };
            state.status = 'question-only';
            sfx('incoming');
            renderQuestionOnlyView(payload);
        }
        if (payload.type === 'options-open' && state.role === 'player') {
            const duplicate = state.currentQuestionPayload?.type === 'options-open' && state.currentQuestionPayload?.questionIndex === payload.questionIndex && (state.status === 'answering' || state.status === 'locked' || state.status === 'question');
            if (duplicate) return;
            cleanupTimers();
            state.status = 'question';
            state.questionIndex = payload.questionIndex;
            state.questionStart = payload.startAt;
            state.currentQuestionPayload = payload;
            sfx('open');
            renderPlayerQuestionView(payload);
        }
        if (payload.type === 'answer' && state.role === 'host') {
            upsertPlayer(payload);
            collectAnswer(payload);
        }
        if (payload.type === 'answer-reveal' && state.role === 'player') {
            cleanupTimers();
            state.status = 'reveal';
            renderAnswerReveal(payload);
        }
        if (payload.type === 'leaderboard' && state.role === 'player') {
            cleanupTimers();
            state.lastResults = payload.results;
            state.status = 'leaderboard';
            const mine = payload.results.find((r) => r.id === state.me.id);
            if (mine) state.scores[state.me.id] = mine.total;
            renderLeaderboard(payload.results, payload.correctIndex, false);
        }
        if (payload.type === 'final' && state.role === 'player') {
            cleanupTimers();
            state.status = 'final';
            renderFinaleSpotlight(payload.results);
        }
        if (payload.type === 'end-session' && state.role === 'player') {
            toast('The host ended the quiz.');
            closeOverlay();
        }
    }

    function startLiveSession() {
        state.status = 'title';
        state.introStarted = true;
        const titlePayload = {
            type: 'quiz-title',
            title: state.quizItem?.content?.title || 'Quiz Show',
            questionIndex: state.questionIndex,
            totalQuestions: state.quizItem?.content?.questions?.length || 0
        };
        state.currentQuestionPayload = titlePayload;
        broadcast(titlePayload);
        renderTitleIntro(titlePayload);
        sfx('intro');
    }

    function handleTitleNext() {
        if (state.status !== 'title' && state.status !== 'in-progress') return;
        sendQuestion();
    }

    function sendQuestion() {
        cleanupTimers();
        window.DQSfx?.stopAll();
        const q = state.quizItem.content.questions[state.questionIndex];
        const payload = {
            type: 'question-only',
            questionIndex: state.questionIndex,
            question: q.question,
            totalQuestions: state.quizItem.content.questions.length
        };
        state.answers[state.questionIndex] = {};
        state.expectedAnswerPlayerIds[state.questionIndex] = [];
        state.revealTriggered = false;
        state.pendingResults = null;
        state.currentQuestionPayload = payload;
        state.status = 'question-only';
        broadcast(payload);
        renderQuestionOnlyView(payload);
        sfx('incoming');

        let prepRemaining = Math.round(QUESTION_PREP_MS / 1000);
        state.timers.questionTick = setInterval(() => {
            prepRemaining = Math.max(0, prepRemaining - 1);
            const chip = document.getElementById('host-prep-countdown');
            if (chip) chip.textContent = prepRemaining > 0 ? `Options open in ${prepRemaining}s` : 'Opening…';
            if (prepRemaining <= 0 && state.timers.questionTick) { clearInterval(state.timers.questionTick); state.timers.questionTick = null; }
        }, 1000);
        state.timers.phase = setTimeout(() => {
            if (state.role === 'host' && state.status === 'question-only') openOptionsForCurrentQuestion();
        }, QUESTION_PREP_MS);
    }

    function normalizedCorrect(q) {
        const parsed = Number.parseInt(q.correctIndex, 10);
        return Number.isNaN(parsed) ? q.correctIndex : parsed;
    }

    function openOptionsForCurrentQuestion() {
        if (state.status !== 'question-only') return;
        cleanupTimers();
        const q = state.quizItem.content.questions[state.questionIndex];
        const payload = {
            type: 'options-open',
            questionIndex: state.questionIndex,
            question: q.question,
            options: q.options,
            correctIndex: normalizedCorrect(q),
            startAt: Date.now()
        };
        state.status = 'question';
        state.currentQuestionPayload = payload;
        state.questionStart = payload.startAt;
        // Lock who we expect an answer from, so the reveal can fire as soon as everyone has answered.
        state.expectedAnswerPlayerIds[state.questionIndex] = Array.from(new Set([
            ...Object.keys(state.players || {}),
            ...getPlayers().map((player) => player.id).filter(Boolean)
        ]));
        broadcast(payload);
        renderHostQuestionView();
        sfx('open');
        window.DQSfx?.countdown(Math.round(ANSWER_WINDOW_MS / 1000));
        startHostCountdown();
    }

    function startHostCountdown() {
        if (state.timers.question) clearTimeout(state.timers.question);
        if (state.timers.questionTick) clearInterval(state.timers.questionTick);
        const total = Math.round(ANSWER_WINDOW_MS / 1000);
        let remaining = total;
        paintTimer(remaining, total);
        state.timers.questionTick = setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            paintTimer(remaining, total);
            if (remaining <= 0 && state.timers.questionTick) { clearInterval(state.timers.questionTick); state.timers.questionTick = null; }
        }, 1000);
        state.timers.question = setTimeout(() => finishQuestion(false), ANSWER_WINDOW_MS);
    }

    function startPlayerCountdown(startAt) {
        if (state.timers.questionTick) clearInterval(state.timers.questionTick);
        const total = Math.round(ANSWER_WINDOW_MS / 1000);
        const tickLeft = () => Math.max(0, Math.ceil((ANSWER_WINDOW_MS - Math.max(0, Date.now() - (startAt || Date.now()))) / 1000));
        let remaining = tickLeft();
        paintTimer(remaining, total);
        state.timers.questionTick = setInterval(() => {
            remaining = tickLeft();
            paintTimer(remaining, total);
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
        document.querySelectorAll('#live-options button[data-idx]').forEach((btn) => { btn.disabled = true; btn.classList.add('is-dim'); });
        const note = document.getElementById('lv-answer-note');
        if (note) note.textContent = "Time's up. Wait for the reveal.";
        sfx('timeup');
    }

    function sendAnswer(choice, questionPayload) {
        state.status = 'locked';
        if (state.timers.questionTick) { clearInterval(state.timers.questionTick); state.timers.questionTick = null; }
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
        if (!state.answers[payload.questionIndex]) state.answers[payload.questionIndex] = {};
        if (!state.answers[payload.questionIndex][payload.id]) state.answers[payload.questionIndex][payload.id] = payload;

        const answerMap = state.answers[payload.questionIndex] || {};
        const expectedAtOpen = state.expectedAnswerPlayerIds[payload.questionIndex] || [];
        const fallbackExpected = Array.from(new Set([...Object.keys(state.players || {}), ...getPlayers().map((player) => player.id).filter(Boolean)]));
        const expectedIds = expectedAtOpen.length ? expectedAtOpen : fallbackExpected;
        const answeredExpected = expectedIds.filter((id) => Boolean(answerMap[id])).length;

        const chip = document.getElementById('lv-answered');
        if (chip) chip.textContent = `${answeredExpected} / ${expectedIds.length} answered`;

        if (expectedIds.length > 0 && answeredExpected >= expectedIds.length && !state.revealTriggered) finishQuestion(false);
    }

    function finishQuestion(forceReveal) {
        if (state.revealTriggered) return;
        state.revealTriggered = true;
        cleanupTimers();
        window.DQSfx?.stop('countdown');
        const q = state.quizItem.content.questions[state.questionIndex];
        const correctIndex = normalizedCorrect(q);
        const answers = state.answers[state.questionIndex] || {};
        const results = [];
        getPlayers().forEach((p) => {
            const response = answers[p.id];
            const isCorrect = response ? response.choice === correctIndex : false;
            const delta = isCorrect ? calculateScoreDelta(response?.elapsed ?? 30000) : 0;
            state.scores[p.id] = (state.scores[p.id] || 0) + delta;
            results.push({ id: p.id, name: p.name, emoji: p.emoji, choice: response?.choice, isCorrect, delta, total: state.scores[p.id] });
        });
        results.sort((a, b) => b.total - a.total || b.delta - a.delta);
        const withMeta = computeRankMeta(results);
        updatePreviousRanks(withMeta);
        const revealPayload = {
            type: 'answer-reveal',
            questionIndex: state.questionIndex,
            correctIndex,
            correctOption: q.options?.[correctIndex],
            options: q.options,
            results: withMeta
        };
        state.pendingResults = withMeta;
        state.status = 'reveal';
        broadcast(revealPayload);
        renderAnswerReveal(revealPayload);
        sfx('open');
    }

    function computeRankMeta(sortedResults) {
        return sortedResults.map((res, idx, arr) => {
            const rank = idx + 1;
            const prevRank = state.prevRanks[res.id] || rank;
            return { ...res, rank, prevRank, rankRise: Math.max(0, prevRank - rank), distanceAhead: idx > 0 ? arr[idx - 1].total - res.total : null };
        });
    }

    function updatePreviousRanks(resultsWithMeta) {
        const updated = {};
        resultsWithMeta.forEach((res) => { updated[res.id] = res.rank; });
        state.prevRanks = updated;
    }

    function showLeaderboardStage() {
        const q = state.quizItem.content.questions[state.questionIndex];
        const correctIndex = normalizedCorrect(q);
        const results = state.pendingResults || [];
        state.status = 'leaderboard';
        broadcast({ type: 'leaderboard', questionIndex: state.questionIndex, correctIndex, results });
        renderLeaderboard(results, correctIndex, false);
    }

    function calculateScoreDelta(elapsedMs) {
        const speedFactor = Math.max(0, 1 - Math.min(elapsedMs, 30000) / 30000);
        return Math.max(150, Math.round(600 + 400 * speedFactor));
    }

    function broadcastFinal(results) {
        cleanupTimers();
        const sorted = [...results].sort((a, b) => b.total - a.total);
        state.status = 'final';
        broadcast({ type: 'final', results: sorted });
        renderFinaleSpotlight(sorted);
    }

    function broadcast(payload) {
        if (!state.channel) return;
        state.channel.send({ type: 'broadcast', event: 'live', payload });
    }

    // ---------- player: join and wait ----------
    function openJoinDialog(prefill = '') {
        const shell = ensureOverlay();
        state.role = 'player';
        state.status = 'join';
        const me = state.me;
        shell.innerHTML = `
            <div class="lv-stage is-player stage-join">
                <header class="lv-top"><span class="chip chip-purple">Join a live quiz</span><span class="lv-top-actions"><button type="button" class="btn btn-sm btn-icon" id="cancel-join" aria-label="Close"><i data-lucide="x"></i></button></span></header>
                <main class="lv-main">
                    <form class="lv-card lv-join" id="lv-join-form" novalidate>
                        <div class="lv-join-me"><span class="lv-avatar lv-avatar-lg" id="live-preview-emoji">${esc(me.emoji)}</span><div><small>You</small><b id="live-preview-name">${esc(me.name)}</b></div></div>
                        <label class="field"><span>Game PIN</span><input class="input lv-pin-input" id="join-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" value="${esc(prefill || '')}" placeholder="123456"></label>
                        <label class="field"><span>Nickname</span><input class="input" id="join-name" maxlength="20" autocomplete="nickname" value="${esc(me.name === 'Player' ? '' : me.name)}" placeholder="Your name"></label>
                        <div class="field"><span>Pick an emoji</span>
                            <div class="lv-emoji-grid emoji-picker">${DEFAULT_EMOJIS.map((em) => `<button type="button" data-emoji="${em}" class="lv-emoji${me.emoji === em ? ' is-on' : ''}" aria-pressed="${me.emoji === em}">${em}</button>`).join('')}</div>
                        </div>
                        <p class="lv-error" id="join-error" role="alert" hidden></p>
                        <button type="submit" class="btn btn-lime btn-big btn-block" id="submit-join"><i data-lucide="log-in"></i><span data-join-label>Join room</span></button>
                    </form>
                </main>
            </div>`;

        const err = document.getElementById('join-error');
        const showError = (message) => { err.textContent = message; err.hidden = false; };

        shell.querySelectorAll('.lv-emoji').forEach((btn) => {
            btn.onclick = () => {
                const em = btn.getAttribute('data-emoji');
                updateIdentity({ emoji: em });
                shell.querySelectorAll('.lv-emoji').forEach((b) => { b.classList.toggle('is-on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
                document.getElementById('live-preview-emoji').textContent = em;
                sfx('tap');
            };
        });
        document.getElementById('cancel-join').onclick = closeOverlay;
        const nameInput = document.getElementById('join-name');
        nameInput.addEventListener('input', () => { document.getElementById('live-preview-name').textContent = nameInput.value || 'Player'; });
        const codeInput = document.getElementById('join-code');
        codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6); });

        document.getElementById('lv-join-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const code = codeInput.value.trim();
            const name = nameInput.value.trim() || 'Player';
            if (!/^\d{6}$/.test(code)) { showError('Enter the 6 digit PIN from the host screen.'); codeInput.focus(); return; }
            updateIdentity({ name });
            err.hidden = true;
            const submit = document.getElementById('submit-join');
            submit.disabled = true;
            submit.querySelector('[data-join-label]').textContent = 'Joining…';
            const ok = await joinAsPlayer(code);
            if (!ok && document.getElementById('submit-join')) {
                submit.disabled = false;
                submit.querySelector('[data-join-label]').textContent = 'Join room';
                showError('Could not join. Check the PIN and try again.');
            }
        });
        icons();
        (prefill ? nameInput : codeInput).focus();
    }

    async function joinAsPlayer(code) {
        state.roomCode = code;
        state.role = 'player';
        state.status = 'waiting';
        state.quizItem = null;
        state.questionIndex = 0;
        resetRoomState();
        try {
            await trackChannel(code);
            startPlayerHeartbeat();
            sfx('join');
            renderWaitingRoom();
            return true;
        } catch (error) {
            console.error('Failed to join live room:', error);
            leaveChannel();
            state.status = 'join';
            return false;
        }
    }

    function renderWaitingRoom() {
        state.status = 'waiting';
        renderStage(`
            <div class="lv-center lv-waiting">
                <span class="chip chip-lime">Room ${esc(state.roomCode)}</span>
                <span class="lv-avatar lv-avatar-xl">${esc(state.me.emoji)}</span>
                <h1 class="lv-big">You're in, ${esc(state.me.name)}!</h1>
                ${state.quizMeta?.title ? `<p class="lv-sub"><b>${esc(state.quizMeta.title)}</b>${state.quizMeta.totalQuestions ? ` · ${state.quizMeta.totalQuestions} questions` : ''}</p>` : ''}
                <p class="lv-sub"><span class="spin-loader"></span> Waiting for the host to start. Keep this screen open.</p>
            </div>`, 'stage-waiting');
    }

    function attachEntryPoints() {
        const joinBtn = document.getElementById('join-live-btn');
        if (joinBtn) joinBtn.addEventListener('click', () => openJoinDialog());
        const bindCodeJoin = (el) => {
            if (!el) return;
            el.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                const value = String(el.value || '').trim();
                if (/^\d{6}$/.test(value)) { event.preventDefault(); openJoinDialog(value); }
            });
        };
        bindCodeJoin(document.getElementById('main-search'));
        bindCodeJoin(document.getElementById('header-search-input'));
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadIdentity();
        attachEntryPoints();
        const params = new URLSearchParams(window.location.search);
        const livePin = params.get('livePin');
        if (/^\d{6}$/.test(String(livePin || ''))) {
            openJoinDialog(String(livePin));
            window.history.replaceState({}, '', window.location.pathname);
        }
    });

    // Entry points used by quiz cards and the home search box.
    window.startLiveHost = startLiveHost;
    window.openJoinLive = openJoinDialog;
})();
