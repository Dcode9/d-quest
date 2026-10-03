// Home page controller: search, AI generation, library shelf, entry buttons.
import { $, esc, icon, refreshIcons, toast } from './lib/dom.js';
import { loadLibrary, searchQuizzes } from './lib/quizzes.js';
import { generateQuiz } from './lib/generate.js';
import { quizCard } from './views/card.js';
import { openBuilder } from './views/builder.js';
import { recordInterest, recommend, topicsOf, normDifficulty } from './lib/discover.js';
import { describeQuiz } from './lib/quizzes.js';

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
let allItems = [];
const filters = { difficulty: '', topic: '' };

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

  recordInterest(query, 1);
  const myRun = ++runId;
  showResultsView(`Results for "${query}"`);
  ui.resultsGrid.replaceChildren();
  showStatus(loadingPanel('Searching the quiz bank…'));

  try {
    const found = await searchQuizzes(query);
    if (myRun !== runId) return;
    if (found.length) {
      showStatus(`<div class="results-bar"><span class="gen-note">${icon('search')}${found.length} ${found.length === 1 ? 'match' : 'matches'}, best first</span><button type="button" id="gen-anyway" class="btn btn-sm btn-purple">${icon('sparkles')}<span>Generate a new one instead</span></button></div>`);
      document.getElementById('gen-anyway').addEventListener('click', () => generateFor(query, myRun));
      fillGrid(ui.resultsGrid, found);
      return;
    }
    await generateFor(query, myRun);
  } catch (error) {
    if (myRun !== runId) return;
    console.error('[search]', error);
    showStatus(`<div class="status-panel"><span class="status-emoji">😵</span><strong>That did not work</strong><span>${esc(error.message)}</span></div>`);
  }
}

async function generateFor(query, myRun) {
  try {

    showStatus(loadingPanel("Nothing yet. Generating with D'Ai…"));
    const item = await generateQuiz(query, (stage) => {
      if (myRun === runId) showStatus(loadingPanel(stage));
    });
    if (myRun !== runId) return;
    const saveNote = { saved: 'Saved to the quiz library', duplicate: 'Already in the library, showing the existing quiz', failed: 'Could not save to the library, it only lives in this tab' }[item.saveState] || '';
    const saveChip = saveNote ? `<span class="gen-note ${item.saveState === 'failed' ? '' : 'grounded'}">${icon(item.saveState === 'failed' ? 'alert-triangle' : 'check')}${esc(saveNote)}</span>` : '';
    showStatus(`<div class="results-bar"><span class="gen-row">${groundingNote(item.generationMeta)}${saveChip}</span></div>`);
    if (item.saveState && item.saveState !== 'failed') document.dispatchEvent(new CustomEvent('dquest:library-changed'));
    fillGrid(ui.resultsGrid, [item]);
  } catch (error) {
    if (myRun !== runId) return;
    console.error('[search]', error);
    showStatus(`<div class="status-panel"><span class="status-emoji">😵</span><strong>That did not work</strong><span>${esc(error.message)}</span></div>`);
  }
}

function shelf(title, sub, items) {
  if (!items.length) return null;
  const node = document.createElement('section');
  node.className = 'shelf';
  node.innerHTML = `<div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div></div><div class="shelf-row"></div>`;
  node.querySelector('.shelf-row').replaceChildren(...items.map(quizCard));
  return node;
}

function renderHub() {
  const shelves = $('#hub-shelves');
  const picks = recommend(allItems, 6);
  const fresh = allItems.filter((i) => !i.isLocal && !i.isCustomLocal).slice(0, 6);
  const featured = allItems.filter((i) => i.content?.metadata?.featured);
  const nodes = [
    picks.length ? shelf('Picked for you', 'Based on what you searched, previewed and played.', picks)
      : shelf('Start here', 'A few good ones. Play some and this shelf learns your taste.', (featured.length ? featured : allItems).slice(0, 6)),
    fresh.length ? shelf('Fresh from the community', 'Newest quizzes saved by D\'Ai and other players.', fresh) : null
  ].filter(Boolean);
  shelves.replaceChildren(...nodes);
  refreshIcons(shelves);

  const topics = topicsOf(allItems, 12);
  const topicRow = $('#topic-filter');
  topicRow.replaceChildren(...topics.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip topic-chip${filters.topic === t ? ' is-on' : ''}`;
    b.textContent = t;
    b.addEventListener('click', () => { filters.topic = filters.topic === t ? '' : t; renderHub(); });
    return b;
  }));
  document.querySelectorAll('#diff-filter .seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.diff === filters.difficulty));

  const shown = allItems.filter((i) => {
    const info = describeQuiz(i.content || {});
    return (!filters.difficulty || normDifficulty(info.difficulty) === filters.difficulty) && (!filters.topic || info.topic === filters.topic);
  });
  const merged = allItems.reduce((n, i) => n + (i.mergedCount || 0), 0);
  $('#library-count').textContent = `${shown.length} ${shown.length === 1 ? 'quiz' : 'quizzes'}${merged ? `, ${merged} duplicate${merged === 1 ? '' : 's'} merged` : ''}`;
  if (!shown.length) {
    ui.libraryGrid.innerHTML = '<div class="status-panel" style="grid-column:1/-1"><span class="status-emoji">🫥</span><strong>Nothing at this level yet</strong><span>Search a topic and D\'Ai will write one.</span></div>';
    return;
  }
  fillGrid(ui.libraryGrid, shown);
}

async function renderLibrary() {
  if (!allItems.length) ui.libraryGrid.innerHTML = '<div class="status-panel" style="grid-column:1/-1"><span class="spin-loader" style="width:26px;height:26px;border-width:3px"></span><strong>Loading quizzes…</strong></div>';
  try {
    allItems = await loadLibrary();
    if (!allItems.length) {
      ui.libraryGrid.innerHTML = '<div class="status-panel" style="grid-column:1/-1"><span class="status-emoji">🫥</span><strong>No quizzes yet</strong><span>Search for any topic and D\'Ai will write one.</span></div>';
      return;
    }
    renderHub();
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
  document.querySelectorAll('#diff-filter .seg-btn').forEach((b) => b.addEventListener('click', () => { filters.difficulty = b.dataset.diff; renderHub(); }));
  document.addEventListener('dquest:library-changed', () => renderLibrary());
  startPlaceholderCycle();
  renderLibrary();
  refreshIcons();
}

window.addEventListener('error', (e) => console.warn('[dquest]', e.message));
init();
