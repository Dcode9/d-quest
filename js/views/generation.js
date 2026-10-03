// A real-request animation: time decorates the outline, never gates completion.
import { el, esc, refreshIcons } from '../lib/dom.js';
import { quizCard } from './card.js';

export function generationCard(host, topic) {
  const node = el(`<section class="quiz-build" aria-busy="true" aria-label="Creating quiz">
    <svg class="build-outline" viewBox="0 0 360 240" preserveAspectRatio="none" aria-hidden="true"><rect class="build-guide" x="2" y="2" width="356" height="236" rx="22"/><rect class="build-trace" x="2" y="2" width="356" height="236" rx="22"/></svg>
    <div class="build-paper" aria-hidden="true"><div class="build-symbol">✦</div><div class="build-lines"><span></span><span></span></div><div class="build-tags"><span></span><span></span><span></span></div></div>
    <div class="build-caption"><b>Making your quiz</b><span class="build-topic">${esc(topic)}</span><p class="build-stage" role="status">Waiting for D'Ai…</p></div>
  </section>`);
  host.replaceChildren(node);
  node.scrollIntoView({ block: 'center', behavior: 'auto' });
  return {
    stage(text) { const p = node.querySelector('.build-stage'); if (p) p.textContent = text; },
    ready(item) {
      node.setAttribute('aria-busy', 'false');
      node.classList.add('is-ready');
      node.replaceChildren(quizCard(item));
      refreshIcons(node);
      node.scrollIntoView({ block: 'center', behavior: 'auto' });
    },
    remove() { node.remove(); }
  };
}
