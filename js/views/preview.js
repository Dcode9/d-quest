import { esc, icon, openModal } from '../lib/dom.js';
import { describeQuiz, loadLibrary, playUrl } from '../lib/quizzes.js';
import { relatedTo } from '../lib/discover.js';

export function openPreview(quiz, item = null) {
  const info = describeQuiz(quiz);
  const questions = (quiz.questions || []).map((q, i) => {
    const correct = parseInt(q.correctIndex, 10);
    const options = (q.options || []).map((opt, idx) => `
      <div class="preview-opt ${idx === correct ? 'is-correct' : ''}">
        <b>${String.fromCharCode(65 + idx)}</b><span>${esc(opt)}</span>${idx === correct ? '<span style="margin-left:auto">✓</span>' : ''}
      </div>`).join('');
    return `<div class="preview-q"><h4>Q${i + 1}. ${esc(q.question)}</h4>${options}</div>`;
  }).join('');

  const modal = openModal(`
    <div class="modal-panel">
      <div class="modal-head">
        <div><h2>${esc(info.emoji)} ${esc(info.title)}</h2><p>${info.count} questions. Preview shows the correct answers.</p></div>
        <button type="button" class="btn btn-sm btn-icon" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div class="modal-body">${questions || '<p>No questions yet.</p>'}</div>
    </div>`);

  if (item) {
    loadLibrary().then((all) => {
      const more = relatedTo(item, all, 4);
      if (!more.length || !document.body.contains(modal.root)) return;
      const box = document.createElement('div');
      box.className = 'related';
      box.innerHTML = `<h4>More like this</h4>${more.map((m) => {
        const mi = describeQuiz(m.content || {});
        return `<a class="related-item" href="${esc(playUrl(m))}"><span class="related-emoji">${esc(mi.emoji)}</span><span class="related-text"><b>${esc(mi.title)}</b><small>${esc(mi.topic)} · ${esc(mi.difficulty)} · ${mi.count} questions</small></span></a>`;
      }).join('')}`;
      modal.root.querySelector('.modal-body').prepend(box);
    }).catch(() => {});
  }
}
