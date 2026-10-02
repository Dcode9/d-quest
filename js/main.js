// Home page controller: search, AI generation, library shelf, entry buttons.
import { $, esc, icon, refreshIcons, toast } from './lib/dom.js';
import { loadLibrary, searchQuizzes } from './lib/quizzes.js';
import { generateQuiz } from './lib/generate.js';
import { quizCard } from './views/card.js';
import { openBuilder } from './views/builder.js';

const PLACEHOLDERS = [
  'Physics', 'Ancient Rome', '10 questions about Space', 'Grade 10 biology',
  'World capitals', 'Music history', 'Python basics', 'Indian freedom struggle'
];

const ui = {
  form: $('#search-form'),
  input: $('#main-search'),
  library: $('#library'),
  libraryGrid: $('#library-grid'),
  results: $('#results'),
  resultsGrid: $('#results-grid'),
  resultsTitle: $('#results-title'),
  status: $('#status')
};

let runId = 0;

function showStatus(html) {
  ui.status.innerHTML = html;
  ui.status.hidden = !html;
  refreshIcons(ui.status);
}

function loadingPanel(text) {
  return `<div class="status-panel" aria-live="polite"><span class="spin-loader" style="width:28px;height:28px;border-width:3px"></span><strong>${esc(text)}</strong><span>This can take up to a minute for a fresh quiz.</span></div>`;
}

function fillGrid(grid, items) {
  grid.replaceChildren(...items.map(quizCard));
  refreshIcons(grid);
}

function showLibraryView() {
  runId += 1;
  ui.results.hidden = true;
  ui.library.hidden = false;
  showStatus('');
}

function showResultsView(title) {
  ui.library.hidden = true;
  ui.results.hidden = false;
  ui.resultsTitle.textContent = title;
  ui.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function groundingNote(meta = {}) {
  const grounded = Boolean(meta.webGrounded);
  const text = grounded ? `Web-grounded with ${Number(meta.sourceCount || 0)} live sources` : "Made by D'Ai from stable knowledge";
  return `<span class="gen-note ${grounded ? 'grounded' : ''}">${icon(grounded ? 'globe' : 'sparkles')}${esc(text)}</span>`;
}

async function handleSearch(event) {
  event?.preventDefault();
  const query = ui.input.value.trim();
  if (!query) return;

  // A 6 digit number is a live room PIN.
  if (/^\d{6}$/.test(query) && typeof window.openJoinLive === 'function') {
    window.openJoinLive(query);
    return;
  }

  const myRun = ++runId;
  showResultsView(`Results for "${query}"`);
  ui.resultsGrid.replaceChildren();
  showStatus(loadingPanel('Searching the quiz bank…'));

  try {
    const found = await searchQuizzes(query);
    if (myRun !== runId) return;
    if (found.length) {
      showStatus('');
      fillGrid(ui.resultsGrid, found);
      return;
    }

    showStatus(loadingPanel("Nothing yet. Generating with D'Ai…"));
    const item = await generateQuiz(query, (stage) => {
      if (myRun === runId) showStatus(loadingPanel(stage));
    });
    if (myRun !== runId) return;
    showStatus(`<div class="results-bar">${groundingNote(item.generationMeta)}</div>`);
    fillGrid(ui.resultsGrid, [item]);
  } catch (error) {
    if (myRun !== runId) return;
    console.error('[search]', error);
    showStatus(`<div class="status-panel"><span class="status-emoji">😵</span><strong>That did not work</strong><span>${esc(error.message)}</span></div>`);
  }
}

async function renderLibrary() {
  ui.libraryGrid.innerHTML = '<div class="status-panel" style="grid-column:1/-1"><span class="spin-loader" style="width:26px;height:26px;border-width:3px"></span><strong>Loading quizzes…</strong></div>';
  try {
    const items = await loadLibrary();
    if (!items.length) {
      ui.libraryGrid.innerHTML = '<div class="status-panel" style="grid-column:1/-1"><span class="status-emoji">🫥</span><strong>No quizzes yet</strong><span>Search for any topic and D\'Ai will write one.</span></div>';
      return;
    }
    fillGrid(ui.libraryGrid, items);
  } catch (error) {
    console.error('[library]', error);
    ui.libraryGrid.innerHTML = '<div class="status-panel" style="grid-column:1/-1"><strong>Could not load the library</strong><span>Check your connection and refresh.</span></div>';
  }
}

function startPlaceholderCycle() {
  let i = 0;
  setInterval(() => {
    if (document.activeElement === ui.input || ui.input.value) return;
    i = (i + 1) % PLACEHOLDERS.length;
    ui.input.placeholder = `Try "${PLACEHOLDERS[i]}"`;
  }, 2600);
}

function init() {
  ui.form.addEventListener('submit', handleSearch);
  $('#back-to-library').addEventListener('click', () => { ui.input.value = ''; showLibraryView(); });
  $('#create-quiz-btn').addEventListener('click', () => openBuilder(null, { mode: 'create' }));
  document.querySelectorAll('[data-prompt]').forEach((chip) => chip.addEventListener('click', () => {
    ui.input.value = chip.dataset.prompt;
    handleSearch();
  }));
  document.addEventListener('dquest:library-changed', () => renderLibrary());
  startPlaceholderCycle();
  renderLibrary();
  refreshIcons();
}

window.addEventListener('error', (e) => console.warn('[dquest]', e.message));
init();
