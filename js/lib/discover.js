// Discovery: duplicate merging, real search ranking, related quizzes and interest tracking.
import { describeQuiz } from './quizzes.js';

const INTEREST_KEY = 'dquest_interests';
const STOP = new Set(['quiz', 'quizzes', 'test', 'the', 'a', 'an', 'of', 'on', 'about', 'and', 'for', 'in', 'to', 'questions', 'question', 'grade', 'all', 'with', 'about', 'some', 'me', 'make', 'generate', 'new', 'quick']);

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export function normDifficulty(value) {
  const v = String(value || '').toLowerCase();
  if (/(easy|beginner|basic|simple|starter)/.test(v)) return 'Easy';
  if (/(hard|difficult|advanced|expert|challeng)/.test(v)) return 'Hard';
  return 'Medium';
}

export function words(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
}

// Same rule as the server: title and topic say the same thing, whatever the casing or word order.
export function dupKey(quiz) {
  const t = words(quiz?.title).sort().join(' ');
  const p = words(quiz?.metadata?.topic).sort().join(' ');
  return t || p ? `${t}|${p}` : '';
}

const qCount = (item) => (Array.isArray(item?.content?.questions) ? item.content.questions.length : 0);
const SOURCE_RANK = (item) => (item.isLocal ? 1 : item.isCustomLocal ? 0 : 2);

// Merge duplicates, keeping the fullest copy (most questions, then the saved one, then newest).
export function mergeDuplicates(items) {
  const groups = new Map();
  for (const item of items) {
    const key = dupKey(item.content) || `id:${item.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Array.from(groups.values()).map((group) => {
    const best = group.slice().sort((a, b) =>
      qCount(b) - qCount(a) || SOURCE_RANK(b) - SOURCE_RANK(a) || String(b.created_at).localeCompare(String(a.created_at)))[0];
    return group.length > 1 ? { ...best, mergedCount: group.length - 1 } : best;
  });
}

// ---- interests -------------------------------------------------------------
function readInterests() {
  try { return JSON.parse(localStorage.getItem(INTEREST_KEY) || '{}') || {}; } catch { return {}; }
}

export function recordInterest(source, weight = 1) {
  const tokens = typeof source === 'string' ? words(source) : tagsOf(source);
  if (!tokens.length) return;
  const map = readInterests();
  for (const t of tokens) map[t] = Math.min((map[t] || 0) + weight, 50);
  try { localStorage.setItem(INTEREST_KEY, JSON.stringify(map)); } catch { /* storage blocked */ }
}

export function hasInterests() {
  return Object.keys(readInterests()).length > 0;
}

export function topInterests(n = 3) {
  return Object.entries(readInterests()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

// ---- tags and scoring --------------------------------------------------------
export function tagsOf(item) {
  const quiz = item.content || item;
  const info = describeQuiz(quiz);
  return Array.from(new Set([...words(info.title), ...words(info.topic)]));
}

function stem(w) { return w.length > 4 ? w.replace(/(ing|ies|es|s)$/, '') : w; }

// Real search: every word counts, any order, partial words and typos by prefix, ranked.
export function searchScore(item, query) {
  const quiz = item.content || {};
  const info = describeQuiz(quiz);
  const all = words(query);
  const qWords = (all.filter((w) => !/^\d+$/.test(w)).length ? all.filter((w) => !/^\d+$/.test(w)) : all).map(stem); // "10 questions about X" is about X
  if (!qWords.length) return 0;
  const title = words(info.title).map(stem);
  const topic = words(info.topic).map(stem);
  const extra = words(`${info.grade} ${quiz.metadata?.description || ''} ${item.fileName || ''}`).map(stem);
  const diff = info.difficulty.toLowerCase();
  let score = 0;
  let hit = 0;
  let strong = 0;
  for (const w of qWords) {
    let best = 0;
    if (title.includes(w)) best = 10;
    else if (topic.includes(w)) best = 8;
    else if (title.some((t) => t.startsWith(w) || w.startsWith(t))) best = 6;
    else if (topic.some((t) => t.startsWith(w) || w.startsWith(t))) best = 5;
    else if (w.length >= 5 && [...title, ...topic].some((t) => t.length >= 5 && t.slice(0, 4) === w.slice(0, 4))) best = 4; // typo tolerance
    else if (extra.includes(w) || diff === w) best = 3;
    else if ((quiz.questions || []).some((q) => String(q.question).toLowerCase().includes(w))) best = 1.5;
    if (best) hit += 1;
    if (best >= 3) strong += 1;
    score += best;
  }
  if (!strong || hit < Math.ceil(qWords.length / 2)) return 0; // most of the words must match
  if (info.title.toLowerCase().includes(String(query).toLowerCase().trim())) score += 6;
  return score * (0.6 + 0.4 * (hit / qWords.length));
}

export function rankSearch(items, query) {
  return items
    .map((item) => ({ item, score: searchScore(item, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

// "More like this": shared topic and title words, close difficulty and grade.
export function relatedTo(base, items, n = 4) {
  const baseTags = new Set(tagsOf(base));
  const baseInfo = describeQuiz(base.content || {});
  const baseDiff = DIFFICULTIES.indexOf(normDifficulty(baseInfo.difficulty));
  const baseKey = dupKey(base.content);
  return items
    .filter((it) => it.id !== base.id && dupKey(it.content) !== baseKey)
    .map((it) => {
      const info = describeQuiz(it.content || {});
      const shared = tagsOf(it).filter((t) => baseTags.has(t)).length;
      let score = shared * 5;
      if (info.topic.toLowerCase() === baseInfo.topic.toLowerCase()) score += 6;
      if (score === 0) return { it, score: 0 };
      score += 2 - Math.abs(DIFFICULTIES.indexOf(normDifficulty(info.difficulty)) - baseDiff);
      if (info.grade === baseInfo.grade) score += 1;
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.it);
}

// "Picked for you": weight quizzes by what this person searched, previewed and played.
export function recommend(items, n = 6) {
  const interests = readInterests();
  const scored = items.map((it) => {
    const score = tagsOf(it).reduce((sum, t) => sum + (interests[t] || 0), 0);
    return { it, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((x) => x.it);
}

export function topicsOf(items, n = 10) {
  const counts = new Map();
  for (const it of items) {
    const topic = describeQuiz(it.content || {}).topic;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}
