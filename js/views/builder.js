import { esc, icon, el, openModal, refreshIcons } from '../lib/dom.js';
import { upsertLocalQuiz } from '../lib/storage.js';
import { publishQuiz } from '../lib/generate.js';

const blankQuestion = () => ({ question: '', options: ['', '', '', ''], correctIndex: 0 });
const blankQuiz = () => ({
  title: 'My Quiz',
  metadata: { topic: 'Custom', difficulty: 'Medium', grade: 'All Grades', emoji: '✍️' },
  questions: [blankQuestion()]
});

let uid = 0;

function questionBlock(q, index) {
  const group = `correct-${++uid}`;
  const options = [0, 1, 2, 3].map((i) => `
    <label class="builder-opt">
      <input type="radio" name="${group}" value="${i}" ${Number(q.correctIndex) === i ? 'checked' : ''} aria-label="Mark option ${i + 1} correct">
      <input class="input builder-option" value="${esc(q.options?.[i] || '')}" placeholder="Option ${String.fromCharCode(65 + i)}">
    </label>`).join('');
  return el(`
    <div class="builder-q">
      <div class="builder-q-head"><b>QUESTION ${index}</b>
        <button type="button" class="btn btn-sm btn-icon" data-remove aria-label="Remove question">${icon('trash-2')}</button>
      </div>
      <input class="input builder-question" value="${esc(q.question || '')}" placeholder="Question text">
      ${options}
    </div>`);
}

// opts: { id, mode: 'create' | 'edit' | 'edit-ai', onSaved }
export function openBuilder(quiz = null, opts = {}) {
  const source = JSON.parse(JSON.stringify(quiz || blankQuiz()));
  const meta = source.metadata || {};
  const heading = opts.mode === 'edit-ai' ? 'Edit AI quiz' : opts.mode === 'edit' ? 'Edit quiz' : 'Make your own quiz';

  const { root, close } = openModal(`
    <div class="modal-panel">
      <div class="modal-head">
        <div><h2>${heading}</h2><p>Build it by hand or fix an AI draft. Keep it on this device or publish it.</p></div>
        <button type="button" class="btn btn-sm btn-icon" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div class="modal-body">
        <div class="builder-grid">
          <label class="field wide"><span>Quiz title</span><input id="b-title" class="input" value="${esc(source.title || '')}"></label>
          <label class="field"><span>Topic</span><input id="b-topic" class="input" value="${esc(meta.topic || 'Custom')}"></label>
          <label class="field"><span>Grade</span><input id="b-grade" class="input" value="${esc(String(meta.grade || 'All Grades'))}"></label>
          <label class="field"><span>Difficulty</span>
            <select id="b-diff" class="select">${['Easy', 'Medium', 'Hard'].map((d) => `<option ${String(meta.difficulty || 'Medium') === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Emoji</span><input id="b-emoji" class="input" value="${esc(meta.emoji || '✍️')}" maxlength="4"></label>
        </div>
        <div id="b-status" class="builder-status" role="status"></div>
        <div id="b-questions"></div>
        <button type="button" id="b-add" class="btn btn-purple btn-block">${icon('plus')}<span>Add question</span></button>
      </div>
      <div class="modal-foot">
        <button type="button" id="b-local" class="btn">Keep on this device</button>
        <button type="button" id="b-publish" class="btn btn-lime">Publish</button>
        <button type="button" id="b-play" class="btn btn-ink">${icon('play')}<span>Save and play</span></button>
      </div>
    </div>`);

  const list = root.querySelector('#b-questions');
  const status = (text, kind = 'ok') => {
    const node = root.querySelector('#b-status');
    node.className = `builder-status ${kind}`;
    node.textContent = text;
  };
  const renumber = () => list.querySelectorAll('.builder-q').forEach((block, i) => {
    block.querySelector('.builder-q-head b').textContent = `QUESTION ${i + 1}`;
  });
  const add = (q = blankQuestion()) => {
    const block = questionBlock(q, list.children.length + 1);
    block.querySelector('[data-remove]').addEventListener('click', () => { block.remove(); renumber(); });
    list.appendChild(block);
    refreshIcons(block);
  };
  (source.questions?.length ? source.questions : [blankQuestion()]).forEach(add);

  const collect = () => ({
    id: opts.id || source.id,
    title: root.querySelector('#b-title').value.trim(),
    metadata: {
      topic: root.querySelector('#b-topic').value.trim() || 'Custom',
      grade: root.querySelector('#b-grade').value.trim() || 'All Grades',
      difficulty: root.querySelector('#b-diff').value,
      emoji: root.querySelector('#b-emoji').value.trim() || '✍️'
    },
    questions: Array.from(list.querySelectorAll('.builder-q')).map((block) => ({
      question: block.querySelector('.builder-question').value.trim(),
      options: Array.from(block.querySelectorAll('.builder-option')).map((i) => i.value.trim()),
      correctIndex: Number(block.querySelector('input[type="radio"]:checked')?.value || 0)
    })).filter((q) => q.question && q.options.some(Boolean))
  });

  const validate = (data) => {
    if (!data.title) return 'Please add a quiz title.';
    if (!data.questions.length) return 'Please add at least one complete question.';
    if (data.questions.some((q) => q.options.length < 4 || q.options.some((o) => !o))) return 'Each question needs four answer options.';
    return null;
  };

  const saveLocal = () => {
    const data = collect();
    const problem = validate(data);
    if (problem) { status(problem, 'err'); return null; }
    const item = upsertLocalQuiz(data, opts.id || data.id);
    status('Saved on this device.', 'ok');
    document.dispatchEvent(new CustomEvent('dquest:library-changed'));
    return item;
  };

  root.querySelector('#b-add').addEventListener('click', () => add());
  root.querySelector('#b-local').addEventListener('click', saveLocal);
  root.querySelector('#b-play').addEventListener('click', () => {
    const item = saveLocal();
    if (item) window.location.href = `player.html?id=${encodeURIComponent(item.id)}`;
  });
  root.querySelector('#b-publish').addEventListener('click', async () => {
    const data = collect();
    const problem = validate(data);
    if (problem) { status(problem, 'err'); return; }
    status('Publishing quiz…', 'busy');
    try {
      await publishQuiz(data);
      status('Quiz published.', 'ok');
      document.dispatchEvent(new CustomEvent('dquest:library-changed'));
    } catch (error) {
      status(`Publish failed: ${error.message}`, 'err');
    }
  });
  return { close };
}
