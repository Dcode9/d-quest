// Quiz catalog: built-in JSON files, the shared database, and quizzes saved on this device.
import { getCustomQuizzes, findCustomQuiz, readCachedQuiz } from './storage.js';
import { mergeDuplicates, rankSearch } from './discover.js';

const FALLBACK_FILES = [
  'demo.json', 'general-knowledge.json', 'science.json', 'history.json', 'geography.json',
  'technology.json', 'Improvement_in_Food_Resources.json', 'ai-employability-skills.json',
  'communication-skills.json', 'english-grammar-grade-10.json', 'green-skills.json'
];
const REMOTE_TIMEOUT_MS = 6000;
const LOCAL_DATE = '2024-01-01T00:00:00.000Z';

let manifestPromise;
async function localFileList() {
  if (!manifestPromise) {
    manifestPromise = fetch('quizzes/index.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (Array.isArray(data?.files) && data.files.length ? data.files : FALLBACK_FILES))
      .catch(() => FALLBACK_FILES);
  }
  return manifestPromise;
}

async function loadLocalFile(file) {
  try {
    const res = await fetch(`quizzes/${file}`);
    if (!res.ok) return null;
    const content = await res.json();
    return { id: content.id || file.replace('.json', ''), content, created_at: LOCAL_DATE, isLocal: true, fileName: file };
  } catch (error) {
    console.warn(`Could not load ${file}:`, error);
    return null;
  }
}

export async function loadBuiltIn() {
  const files = await localFileList();
  return (await Promise.all(files.map(loadLocalFile))).filter(Boolean);
}

export async function loadRemote(query = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const url = query ? `/api/quizzes?q=${encodeURIComponent(query)}` : '/api/quizzes';
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const payload = await res.json();
    return Array.isArray(payload.quizzes) ? payload.quizzes : [];
  } catch (error) {
    if (error?.name !== 'AbortError') console.warn('Quiz database unavailable:', error.message || error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.id || item?.content?.title;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadLibrary() {
  const [remote, builtIn] = await Promise.all([loadRemote(), loadBuiltIn()]);
  return mergeDuplicates(dedupe([...getCustomQuizzes(), ...remote, ...builtIn]));
}

// Real search over the whole catalog (built-in, shared database, this device), ranked by relevance.
export async function searchQuizzes(query) {
  return rankSearch(await loadLibrary(), query);
}

// Used by the player: resolve a quiz from ?quiz=<file> or ?id=<id>.
export async function loadQuizForPlay({ id, file }) {
  if (file) {
    const res = await fetch(`quizzes/${encodeURIComponent(file).replace(/%2F/g, '/')}`);
    if (!res.ok) throw new Error('Quiz file not found.');
    return res.json();
  }
  if (id.startsWith('ai-') || id.startsWith('local-') || id.startsWith('practice-')) {
    const cached = readCachedQuiz(id) || findCustomQuiz(id)?.content;
    if (!cached) throw new Error('This quiz only lived in your browser and is gone. Create or save it again.');
    return cached;
  }
  const res = await fetch(`/api/quizzes?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Could not fetch the quiz from the database.');
  const payload = await res.json();
  const first = Array.isArray(payload.quizzes) ? payload.quizzes[0] : null;
  if (!first) throw new Error('Quiz not found.');
  return first.content;
}

export function playUrl(item) {
  return item.isLocal ? `player.html?quiz=${encodeURIComponent(item.fileName)}` : `player.html?id=${encodeURIComponent(item.id)}`;
}

const EMOJI_RULES = [
  [['space', 'planet'], '🚀'], [['science', 'chemistry'], '🔬'], [['history'], '📜'],
  [['geography', 'world'], '🌍'], [['technology', 'computer'], '💻'], [['math'], '🔢'],
  [['biology'], '🧬'], [['physics'], '⚛️'], [['literature', 'book'], '📚'], [['art'], '🎨'],
  [['music'], '🎵'], [['sports'], '⚽']
];
export function emojiFor(title = '') {
  const t = title.toLowerCase();
  return EMOJI_RULES.find(([keys]) => keys.some((k) => t.includes(k)))?.[1] || '🎯';
}

const TOPICS = ['Science', 'History', 'Geography', 'Technology', 'Mathematics', 'Biology', 'Physics', 'Chemistry', 'Literature', 'General Knowledge'];
export function topicFor(title = '') {
  return TOPICS.find((t) => title.toLowerCase().includes(t.toLowerCase())) || 'General';
}

// One normalised view of a quiz used by every card, preview and live screen.
export function describeQuiz(quiz) {
  const meta = quiz.metadata || {};
  const grade = meta.grade ? (typeof meta.grade === 'number' ? `Grade ${meta.grade}` : meta.grade) : 'All Grades';
  return {
    title: quiz.title || 'Untitled quiz',
    emoji: meta.emoji || emojiFor(quiz.title),
    topic: meta.topic || topicFor(quiz.title),
    grade,
    difficulty: meta.difficulty || 'Medium',
    count: Array.isArray(quiz.questions) ? quiz.questions.length : 0
  };
}
