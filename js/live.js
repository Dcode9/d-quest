const state = {
  sessionId: null,
  roomCode: null,
  hostMode: false,
  hostToken: null,
  participantToken: null,
  participantName: null,
  pollTimer: null,
  currentQuestionIndex: -1,
  quiz: null,
  lastSnapshot: null
};

const ui = {
  loading: document.getElementById('live-loading'),
  joinScreen: document.getElementById('join-screen'),
  hostScreen: document.getElementById('host-screen'),
  playerScreen: document.getElementById('player-screen')
};

document.addEventListener('DOMContentLoaded', init);

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function init() {
  state.sessionId = qs('session');
  state.roomCode = (qs('room') || '').toUpperCase();
  state.hostMode = qs('host') === '1';
  state.hostToken = qs('token') || localStorage.getItem('dquest_host_token') || null;

  if (state.hostToken) localStorage.setItem('dquest_host_token', state.hostToken);

  if (state.hostMode && state.sessionId && state.hostToken) {
    show('host');
    bindHostEvents();
    startPolling();
    return;
  }

  if (state.roomCode) {
    showJoin(state.roomCode);
    return;
  }

  showJoin('');
}

function show(mode) {
  ui.loading.classList.add('hidden');
  ui.joinScreen.classList.add('hidden');
  ui.hostScreen.classList.add('hidden');
  ui.playerScreen.classList.add('hidden');

  if (mode === 'host') ui.hostScreen.classList.remove('hidden');
  if (mode === 'player') ui.playerScreen.classList.remove('hidden');
}

function showJoin(prefillRoom) {
  show('');
  ui.joinScreen.classList.remove('hidden');
  ui.loading.classList.add('hidden');

  const roomInput = document.getElementById('join-room');
  const joinBtn = document.getElementById('join-btn');
  roomInput.value = prefillRoom || '';

  joinBtn.onclick = async () => {
    const name = (document.getElementById('join-name').value || '').trim();
    const room = (roomInput.value || '').trim().toUpperCase();
    const errorEl = document.getElementById('join-error');
    errorEl.textContent = '';

    if (!name || !room) {
      errorEl.textContent = 'Name and room code are required.';
      return;
    }

    try {
      const resp = await fetch('/api/join-live-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: room, playerName: name })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Join failed');

      state.sessionId = data.session.id;
      state.roomCode = data.session.room_code;
      state.participantToken = data.participantToken;
      state.participantName = name;
      localStorage.setItem('dquest_participant_token', state.participantToken);

      show('player');
      document.getElementById('player-room-code').textContent = state.roomCode;
      startPolling();
    } catch (e) {
      errorEl.textContent = e.message;
    }
  };
}

function bindHostEvents() {
  const startBtn = document.getElementById('host-start-btn');
  const nextBtn = document.getElementById('host-next-btn');
  const endBtn = document.getElementById('host-end-btn');

  startBtn.onclick = () => hostAction('start');
  nextBtn.onclick = () => hostAction('next');
  endBtn.onclick = () => hostAction('end');
}

async function hostAction(action) {
  const resp = await fetch('/api/update-live-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      sessionId: state.sessionId,
      hostToken: state.hostToken
    })
  });
  const data = await resp.json();
  if (!resp.ok) {
    alert(data.error || 'Action failed');
    return;
  }
  renderSnapshot(data.snapshot);
}

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  pollOnce();
  state.pollTimer = setInterval(pollOnce, 1500);
}

async function pollOnce() {
  try {
    const query = new URLSearchParams();
    if (state.sessionId) query.set('sessionId', state.sessionId);
    if (state.roomCode) query.set('roomCode', state.roomCode);

    const resp = await fetch(`/api/live-session-state?${query.toString()}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Poll failed');

    state.sessionId = data.snapshot.session.id;
    state.roomCode = data.snapshot.session.room_code;
    state.quiz = data.snapshot.quiz;

    renderSnapshot(data.snapshot);
  } catch (e) {
    console.warn('Polling error:', e.message);
  }
}

function renderSnapshot(snapshot) {
  state.lastSnapshot = snapshot;
  const session = snapshot.session;
  const participants = snapshot.participants || [];
  const leaderboard = snapshot.leaderboard || [];

  if (state.hostMode) {
    document.getElementById('host-room-code').textContent = session.room_code;
    document.getElementById('host-player-count').textContent = String(participants.length);

    const startBtn = document.getElementById('host-start-btn');
    const nextBtn = document.getElementById('host-next-btn');

    if (session.status === 'waiting') {
      startBtn.classList.remove('hidden');
      nextBtn.classList.add('hidden');
    } else if (session.status === 'active') {
      startBtn.classList.add('hidden');
      nextBtn.classList.remove('hidden');
    } else {
      startBtn.classList.add('hidden');
      nextBtn.classList.add('hidden');
    }

    renderQuestion('host-question', snapshot, true);
    renderHostAnswers(snapshot);
    renderLeaderboard('host-leaderboard', leaderboard);
    return;
  }

  show('player');
  document.getElementById('player-room-code').textContent = session.room_code;
  document.getElementById('player-status').textContent = statusLabel(session.status);

  renderQuestion('player-question', snapshot, false);
  renderLeaderboard('player-leaderboard', leaderboard);
}

function statusLabel(status) {
  if (status === 'waiting') return 'Waiting for host...';
  if (status === 'active') return 'Question live now';
  return 'Session finished';
}

function renderQuestion(containerId, snapshot, hostView) {
  const container = document.getElementById(containerId);
  const session = snapshot.session;
  const quiz = snapshot.quiz;
  const idx = session.current_question_index;

  if (!quiz || !Array.isArray(quiz.questions) || idx < 0 || idx >= quiz.questions.length) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  const q = quiz.questions[idx];
  const optionsHtml = (q.options || []).map((opt, i) => `
    <button data-opt="${i}" class="answer-btn text-left bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-3 w-full ${hostView ? 'cursor-default' : ''}">
      <span class="text-yellow-400 font-bold mr-2">${String.fromCharCode(65 + i)}.</span>${escapeHtml(opt)}
    </button>
  `).join('');

  container.innerHTML = `
    <div class="mb-3 text-slate-400 text-sm">Question ${idx + 1} / ${quiz.questions.length}</div>
    <h3 class="text-xl font-bold mb-4">${escapeHtml(q.question)}</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${optionsHtml}</div>
    ${session.status === 'finished' ? `<div class="mt-4 text-green-400 font-bold">Correct: ${String.fromCharCode(65 + Number(q.correctIndex || 0))}</div>` : ''}
  `;

  if (!hostView && session.status === 'active') {
    container.querySelectorAll('.answer-btn').forEach(btn => {
      btn.onclick = () => submitAnswer(Number(btn.getAttribute('data-opt')));
    });
  }
}

async function submitAnswer(selectedOption) {
  if (!state.participantToken || !state.sessionId || !state.lastSnapshot) return;

  const questionIndex = Number(state.lastSnapshot.session.current_question_index);
  const resp = await fetch('/api/submit-live-answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: state.sessionId,
      participantToken: state.participantToken,
      questionIndex,
      selectedOption
    })
  });
  const data = await resp.json();
  if (!resp.ok) {
    alert(data.error || 'Failed to submit answer');
    return;
  }
}

function renderHostAnswers(snapshot) {
  const container = document.getElementById('host-answers');
  const answers = snapshot.current_question_answers || [];
  container.classList.remove('hidden');
  if (!answers.length) {
    container.innerHTML = '<h3 class="font-bold mb-2">Current Answers</h3><div class="text-slate-400">No answers yet.</div>';
    return;
  }

  const rows = answers.map(a => `
    <div class="flex items-center justify-between border-b border-slate-700 py-2">
      <div>${escapeHtml(a.player_name)}</div>
      <div class="font-bold ${a.is_correct ? 'text-green-400' : 'text-red-400'}">${String.fromCharCode(65 + Number(a.selected_option))}</div>
    </div>
  `).join('');
  container.innerHTML = `<h3 class="font-bold mb-2">Current Answers</h3>${rows}`;
}

function renderLeaderboard(containerId, leaderboard) {
  const container = document.getElementById(containerId);
  container.classList.remove('hidden');

  if (!leaderboard.length) {
    container.innerHTML = '<h3 class="font-bold mb-2">Leaderboard</h3><div class="text-slate-400">No scores yet.</div>';
    return;
  }

  const rows = leaderboard.map((p, i) => `
    <div class="flex items-center justify-between border-b border-slate-700 py-2">
      <div><span class="text-yellow-400 font-bold mr-2">#${i + 1}</span>${escapeHtml(p.player_name)}</div>
      <div class="font-bold text-green-400">${Number(p.score || 0)}</div>
    </div>
  `).join('');

  container.innerHTML = `<h3 class="font-bold mb-2">Leaderboard</h3>${rows}`;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
