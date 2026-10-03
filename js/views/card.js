import { esc, icon, el } from '../lib/dom.js';
import { describeQuiz, playUrl } from '../lib/quizzes.js';
import { openPreview } from './preview.js';
import { openBuilder } from './builder.js';
import { recordInterest } from '../lib/discover.js';

// Builds one quiz card. Edit is offered for AI drafts and quizzes saved on this device.
export function quizCard(item) {
  const quiz = item.content || {};
  const info = describeQuiz(quiz);
  const canEdit = Boolean(item.isAI || item.isCustomLocal);
  const node = el(`
    <article class="quiz-card">
      <div class="quiz-card-top">
        <div class="quiz-emoji" aria-hidden="true">${esc(info.emoji)}</div>
        <div style="min-width:0">
          <h3 class="quiz-title">${esc(info.title)}</h3>
          <div class="quiz-topic">${esc(info.topic)}</div>
        </div>
      </div>
      <div class="quiz-meta">
        <span class="chip">${esc(info.grade)}</span>
        <span class="chip diff diff-${esc(String(info.difficulty).toLowerCase())}">${esc(info.difficulty)}</span>
        <span class="chip chip-lime">${info.count} ${info.count === 1 ? "question" : "questions"}</span>
        ${item.isCustomLocal ? '<span class="chip badge-local">On this device</span>' : ''}
        
        
      </div>
      <div class="quiz-actions">
        <a class="btn btn-lime btn-play" href="${esc(playUrl(item))}">${icon('play')}<span>Play</span></a>
        <button type="button" class="btn btn-sm btn-icon" data-act="live" title="Host a live room" aria-label="Host live quiz">${icon('radio')}</button>
        <button type="button" class="btn btn-sm btn-icon" data-act="preview" title="Preview questions" aria-label="Preview">${icon('eye')}</button>
        <button type="button" class="btn btn-sm btn-icon" data-act="ai" title="Extend or edit with AI" aria-label="Extend or edit with AI">${icon('sparkles')}</button>
        
      </div>
    </article>`);

  node.querySelector('[data-act="preview"]').addEventListener('click', () => { recordInterest(item, 0.5); openPreview(quiz, item); });
  node.querySelector('.btn-play').addEventListener('click', () => recordInterest(item, 3));
  node.querySelector('[data-act="live"]').addEventListener('click', () => {
    if (typeof window.startLiveHost === 'function') window.startLiveHost(item);
    else alert('Live hosting is not available right now.');
  });
  node.querySelector('[data-act="ai"]').addEventListener('click', () => {
    openBuilder(quiz, { id: canEdit ? item.id : undefined, mode: canEdit ? (item.isAI ? 'edit-ai' : 'edit') : 'create', focusAI: true });
  });
  node.querySelector('[data-act="edit"]')?.addEventListener('click', () => {
    openBuilder(quiz, { id: item.id, mode: item.isAI ? 'edit-ai' : 'edit' });
  });
  return node;
}
