import { $, esc, refreshIcons } from '../lib/dom.js';
import { loadQuizForPlay } from '../lib/quizzes.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';

const stage = $('#stage');
const audio = createAudio();
const hud = { progress: $('#hud-progress'), score: $('#hud-score'), bar: $('#hud-bar') };
const soundBtn = $('#sound-btn');

function showError(message) {
  stage.innerHTML = `
    <section class="screen center">
      <div class="hero-emoji">😵</div>
      <h1 class="screen-title">Could not load the quiz</h1>
      <p class="screen-sub">${esc(message)}</p>
      <div class="screen-actions"><a class="btn btn-lime btn-big" href="index.html">Back to home</a></div>
    </section>`;
}

function paintSound(on) {
  soundBtn.setAttribute('aria-pressed', String(!on));
  soundBtn.querySelector('span').textContent = on ? 'Sound on' : 'Sound off';
  soundBtn.querySelector('i, svg')?.remove();
  soundBtn.insertAdjacentHTML('afterbegin', `<i data-lucide="${on ? 'volume-2' : 'volume-x'}"></i>`);
  refreshIcons(soundBtn);
}
soundBtn.addEventListener('click', () => { const on = audio.toggle(); paintSound(on); if (on) audio.play('tap'); });

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const file = params.get('quiz') || params.get('file');
  try {
    const quiz = id || file
      ? await loadQuizForPlay({ id, file })
      : { title: 'Demo Quiz', questions: [{ question: 'This is a demo question to test the player.', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: 0 }] };
    if (!Array.isArray(quiz.questions) || !quiz.questions.length) throw new Error('This quiz has no questions.');
    document.title = `${quiz.title} - D'Quest`;
    createGame({ stage, hud, audio, quiz }).start({ auto: params.get('autostart') === '1' });
  } catch (error) {
    console.error('[player]', error);
    showError(error.message);
  }
}

refreshIcons();
if (!audio.enabled) paintSound(false);
boot();
