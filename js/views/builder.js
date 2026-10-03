import { esc, icon, el, openModal, refreshIcons } from '../lib/dom.js';
import { upsertLocalQuiz } from '../lib/storage.js';
import { publishQuiz, extendQuizAI, editQuizAI } from '../lib/generate.js';

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
  const heading = opts.focusAI ? 'Extend or edit with AI' : opts.mode === 'edit-ai' ? 'Edit AI quiz' : opts.mode === 'edit' ? 'Edit quiz' : 'Make your own quiz';

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
        <section class="ai-panel" id="ai-panel" aria-label="AI helper">
          <div class="ai-head"><b>${icon('sparkles')}<span>AI helper</span></b><button type="button" id="ai-undo" class="btn btn-sm" hidden>Undo AI change</button></div>
          <div class="ai-row">
            <input id="ai-instr" class="input" maxlength="800" placeholder="What should AI change? e.g. make it harder">
            <button type="button" id="ai-edit" class="btn btn-purple">${icon('wand-2')}<span>Edit with AI</span></button>
          </div>
          <div class="ai-row">
            <label class="ai-count"><span>Questions</span><select id="ai-count" class="select">${[3, 5, 10, 15, 20].map((n) => `<option ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <button type="button" id="ai-more" class="btn">${icon('plus')}<span>Add more questions</span></button>
            <button type="button" id="ai-extend" class="btn">${icon('layers')}<span>Extend quiz</span></button>
          </div>
          <p class="ai-hint">Add more keeps the same level. Extend goes deeper and a bit harder. The text box above can steer both. You review everything before saving.</p>
        </section>
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
    suggestions: source.suggestions,
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

  // ---- AI helper: results land in the form for review, nothing is saved until you save.
  let undoState = null;
  const aiButtons = ['#ai-edit', '#ai-more', '#ai-extend'].map((q) => root.querySelector(q));
  const instrBox = root.querySelector('#ai-instr');
  const setForm = (data) => {
    root.querySelector('#b-title').value = data.title || '';
    root.querySelector('#b-topic').value = data.metadata?.topic || 'Custom';
    root.querySelector('#b-grade').value = String(data.metadata?.grade || 'All Grades');
    root.querySelector('#b-diff').value = ['Easy', 'Medium', 'Hard'].includes(data.metadata?.difficulty) ? data.metadata.difficulty : 'Medium';
    root.querySelector('#b-emoji').value = data.metadata?.emoji || '✍️';
    list.replaceChildren();
    (data.questions?.length ? data.questions : [blankQuestion()]).forEach((q) => add(q));
  };
  const runAI = async (label, work) => {
    const current = collect();
    const problem = validate(current);
    if (problem) { status(`Finish the quiz first. ${problem}`, 'err'); return; }
    aiButtons.forEach((b) => { b.disabled = true; });
    status(`${label}…`, 'busy');
    try {
      const result = await work(current);
      undoState = current;
      root.querySelector('#ai-undo').hidden = false;
      result(current);
    } catch (error) {
      status(error.message || 'The AI request failed.', 'err');
    } finally {
      aiButtons.forEach((b) => { b.disabled = false; });
    }
  };
  const extend = (style, label) => runAI(label, async (current) => {
    const count = Number(root.querySelector('#ai-count').value) || 5;
    const fresh = await extendQuizAI(current, { count, style, instruction: instrBox.value.trim() });
    return (cur) => {
      fresh.forEach((q) => add(q));
      status(`Added ${fresh.length} questions (now ${cur.questions.length + fresh.length}). Review them, then save.`, 'ok');
      list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
  });
  root.querySelector('#ai-more').addEventListener('click', () => extend('more', 'Writing more questions'));
  root.querySelector('#ai-extend').addEventListener('click', () => extend('deeper', 'Extending the quiz'));
  root.querySelector('#ai-edit').addEventListener('click', () => {
    const instruction = instrBox.value.trim();
    if (!instruction) { status('Type what you want the AI to change first.', 'err'); instrBox.focus(); return; }
    runAI('Editing with AI', async (current) => {
      const edited = await editQuizAI(current, instruction);
      return () => { setForm({ ...edited }); status('AI edit applied. Review it, then save. You can undo it.', 'ok'); instrBox.value = ''; };
    });
  });
  root.querySelector('#ai-undo').addEventListener('click', () => {
    if (!undoState) return;
    setForm(undoState); undoState = null;
    root.querySelector('#ai-undo').hidden = true;
    status('Undone.', 'ok');
  });
  if (opts.focusAI) setTimeout(() => instrBox.focus({ preventScroll: false }), 50);

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
      const saved = await publishQuiz(data);
      if (saved.duplicate && !saved.updated) {
        status('A quiz with this title and topic is already published, so it was not replaced. Change the title to publish yours as a new one, or keep it on this device.', 'err');
        return;
      }
      status(saved.updated ? 'Published. The existing quiz was updated with your extra questions.' : 'Quiz published.', 'ok');
      document.dispatchEvent(new CustomEvent('dquest:library-changed'));
    } catch (error) {
      status(`Publish failed: ${error.message}`, 'err');
    }
  });
  return { close };
}
