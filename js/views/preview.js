import { esc, icon, openModal } from '../lib/dom.js';
import { describeQuiz } from '../lib/quizzes.js';

export function openPreview(quiz) {
  const info = describeQuiz(quiz);
  const questions = (quiz.questions || []).map((q, i) => {
    const correct = parseInt(q.correctIndex, 10);
    const options = (q.options || []).map((opt, idx) => `
      <div class="preview-opt ${idx === correct ? 'is-correct' : ''}">
        <b>${String.fromCharCode(65 + idx)}</b><span>${esc(opt)}</span>${idx === correct ? '<span style="margin-left:auto">✓</span>' : ''}
      </div>`).join('');
    return `<div class="preview-q"><h4>Q${i + 1}. ${esc(q.question)}</h4>${options}</div>`;
  }).join('');

  openModal(`
    <div class="modal-panel">
      <div class="modal-head">
        <div><h2>${esc(info.emoji)} ${esc(info.title)}</h2><p>${info.count} questions. Preview shows the correct answers.</p></div>
        <button type="button" class="btn btn-sm btn-icon" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div class="modal-body">${questions || '<p>No questions yet.</p>'}</div>
    </div>`);
}
