// Browser-side storage for custom quizzes and the per-tab quiz cache.
const CUSTOM_KEY = 'dquest_custom_quizzes';

export function getCustomQuizzes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setCustomQuizzes(items) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(items));
}

export function cacheQuiz(id, content) {
  try { sessionStorage.setItem(`quiz_${id}`, JSON.stringify(content)); } catch { /* storage full or blocked */ }
}

export function readCachedQuiz(id) {
  try {
    const raw = sessionStorage.getItem(`quiz_${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function upsertLocalQuiz(quiz, existingId = null) {
  const id = existingId || quiz.id || `local-${Date.now()}`;
  const item = {
    id,
    content: { ...quiz, id },
    created_at: new Date().toISOString(),
    isCustomLocal: true,
    isTemp: true
  };
  setCustomQuizzes([item, ...getCustomQuizzes().filter((q) => q.id !== id)]);
  cacheQuiz(id, item.content);
  return item;
}

export function findCustomQuiz(id) {
  return getCustomQuizzes().find((item) => item.id === id) || null;
}
