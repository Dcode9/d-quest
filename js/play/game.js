// Solo quiz state machine: start, question, options, lock, reveal, finish.
import { esc, icon, refreshIcons } from '../lib/dom.js';

const TIME_PER_QUESTION = 30;
const LOCK_MS = 1800;
const POINTS = 1000;
const LETTERS = ['A', 'B', 'C', 'D'];

export function createGame({ stage, hud, audio, quiz }) {
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const s = { index: 0, score: 0, correct: 0, phase: 'start', picked: null, timer: null, left: TIME_PER_QUESTION };

  const onKey = (event) => {
    if (s.phase === 'ready' && (event.code === 'Space' || event.code === 'ArrowRight')) { event.preventDefault(); revealOptions(); }
    else if (s.phase === 'options' && /^[1-4]$/.test(event.key)) pick(Number(event.key) - 1);
    else if (s.phase === 'revealed' && (event.code === 'Enter' || event.code === 'ArrowRight')) next();
  };

  function setHud() {
    const total = questions.length;
    hud.progress.textContent = s.phase === 'start' || s.phase === 'done' ? `${total} questions` : `Q ${s.index + 1}/${total}`;
    hud.score.textContent = s.score.toLocaleString();
    hud.bar.style.width = total ? `${(Math.min(s.index + (s.phase === 'revealed' || s.phase === 'done' ? 1 : 0), total) / total) * 100}%` : '0%';
  }

  function render(html) {
    stage.innerHTML = html;
    refreshIcons(stage);
    setHud();
  }

  function start() {
    s.phase = 'start';
    render(`
      <section class="screen center animate-slideUp">
        <div class="hero-emoji">${esc(quiz.metadata?.emoji || '🎯')}</div>
        <h1 class="screen-title">${esc(quiz.title || 'Quiz')}</h1>
        <p class="screen-sub">${questions.length} questions. 30 seconds each. Each right answer is worth ${POINTS} points.</p>
        <div class="screen-actions">
          <button id="go" class="btn btn-lime btn-big">${icon('play')}<span>Start quiz</span></button>
          <a class="btn" href="index.html">${icon('home')}<span>Home</span></a>
        </div>
        <p class="tip">Tip: press 1 to 4 to answer, Space to reveal options.</p>
      </section>`);
    document.getElementById('go').addEventListener('click', () => {
      audio.play('intro');
      s.index = 0; s.score = 0; s.correct = 0;
      intro();
    });
  }

  function intro() {
    s.phase = 'intro';
    render(`<section class="screen center"><div class="q-badge pop">${s.index + 1}</div><p class="screen-sub">Question ${s.index + 1}</p></section>`);
    setTimeout(() => { audio.stop('intro'); showQuestion(); }, 1100);
  }

  function showQuestion() {
    const q = questions[s.index];
    s.phase = 'ready'; s.picked = null; s.left = TIME_PER_QUESTION;
    audio.play('incoming');
    render(`
      <section class="screen play animate-slideUp">
        <div class="q-card"><span class="q-num">Q${s.index + 1}</span><h2 class="q-text">${esc(q.question)}</h2></div>
        <div id="timer" class="timer" hidden><span id="timer-text">${TIME_PER_QUESTION}</span></div>
        <div id="options" class="options is-hidden">
          ${(q.options || []).map((opt, i) => `
            <button class="opt" data-i="${i}" type="button"><b>${LETTERS[i]}</b><span>${esc(opt)}</span></button>`).join('')}
        </div>
        <div id="foot" class="foot">
          <button id="reveal" class="btn btn-purple btn-big" type="button">${icon('eye')}<span>Reveal options</span></button>
        </div>
      </section>`);
    document.getElementById('reveal').addEventListener('click', revealOptions);
    stage.querySelectorAll('.opt').forEach((btn) => btn.addEventListener('click', () => pick(Number(btn.dataset.i))));
  }

  function revealOptions() {
    if (s.phase !== 'ready') return;
    s.phase = 'options';
    audio.pause('incoming');
    audio.play('clock', true);
    document.getElementById('options').classList.remove('is-hidden');
    document.getElementById('timer').hidden = false;
    document.getElementById('foot').innerHTML = '';
    tick();
  }

  function tick() {
    const text = document.getElementById('timer-text');
    const ring = document.getElementById('timer');
    clearInterval(s.timer);
    s.timer = setInterval(() => {
      s.left -= 1;
      if (text) text.textContent = s.left;
      if (ring) ring.classList.toggle('is-low', s.left <= 5);
      if (s.left <= 0) { clearInterval(s.timer); timeUp(); }
    }, 1000);
  }

  function mark(i, cls) {
    stage.querySelector(`.opt[data-i="${i}"]`)?.classList.add(cls);
  }

  function pick(i) {
    if (s.phase !== 'options') return;
    clearInterval(s.timer);
    s.phase = 'locked'; s.picked = i;
    audio.pause('clock');
    mark(i, 'is-picked');
    stage.querySelectorAll('.opt').forEach((b) => { b.disabled = true; });
    setTimeout(reveal, LOCK_MS);
  }

  function timeUp() {
    s.phase = 'locked';
    audio.pause('clock');
    stage.querySelectorAll('.opt').forEach((b) => { b.disabled = true; });
    reveal();
  }

  function reveal() {
    const q = questions[s.index];
    const right = parseInt(q.correctIndex, 10);
    s.phase = 'revealed';
    stage.querySelectorAll('.opt').forEach((b) => b.classList.remove('is-picked'));
    mark(right, 'is-correct');
    const gotIt = s.picked === right;
    if (s.picked !== null && !gotIt) mark(s.picked, 'is-wrong');
    if (gotIt) { s.score += POINTS; s.correct += 1; }
    audio.play(gotIt ? 'correct' : 'wrong');
    const last = s.index >= questions.length - 1;
    document.getElementById('foot').innerHTML = `
      <p class="verdict ${gotIt ? 'good' : 'bad'}">${gotIt ? `Correct! +${POINTS}` : s.picked === null ? "Time's up" : 'Not quite'}</p>
      <button id="next" class="btn btn-lime btn-big" type="button"><span>${last ? 'See results' : 'Next question'}</span>${icon('arrow-right')}</button>`;
    refreshIcons(document.getElementById('foot'));
    document.getElementById('next').addEventListener('click', next);
    setHud();
  }

  function next() {
    if (s.phase !== 'revealed') return;
    audio.stopAll();
    if (s.index < questions.length - 1) { s.index += 1; intro(); } else finish();
  }

  function finish() {
    s.phase = 'done';
    const total = questions.length;
    const pct = total ? Math.round((s.correct / total) * 100) : 0;
    const msg = pct === 100 ? 'Flawless!' : pct >= 70 ? 'Great run!' : pct >= 40 ? 'Not bad, go again?' : 'Keep practising!';
    render(`
      <section class="screen center animate-slideUp">
        <div class="hero-emoji">${pct >= 70 ? '🏆' : pct >= 40 ? '👏' : '💪'}</div>
        <h1 class="screen-title">${msg}</h1>
        <div class="result-grid">
          <div class="result"><small>SCORE</small><b>${s.score.toLocaleString()}</b></div>
          <div class="result"><small>CORRECT</small><b>${s.correct}/${total}</b></div>
          <div class="result"><small>ACCURACY</small><b>${pct}%</b></div>
        </div>
        <div class="screen-actions">
          <button id="again" class="btn btn-lime btn-big">${icon('rotate-ccw')}<span>Play again</span></button>
          <a class="btn" href="index.html">${icon('home')}<span>Home</span></a>
        </div>
      </section>`);
    document.getElementById('again').addEventListener('click', () => { s.index = 0; s.score = 0; s.correct = 0; intro(); });
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.pause('clock'); else if (s.phase === 'options') audio.play('clock', true); });
  return { start };
}
