// Shared helpers for the quiz API: difficulty and duplicate handling.
// Files starting with an underscore are not exposed as routes by Vercel.

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

function normalizeDifficulty(value) {
  const v = String(value || '').toLowerCase();
  if (/(easy|beginner|basic|simple|starter)/.test(v)) return 'Easy';
  if (/(hard|difficult|advanced|expert|challeng)/.test(v)) return 'Hard';
  return 'Medium';
}

function words(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['quiz', 'quizzes', 'test', 'the', 'a', 'an', 'of', 'on', 'about', 'questions', 'question'].includes(w));
}

// Two quizzes are duplicates when their title and topic say the same thing,
// whatever the casing, punctuation, word order or filler words like "Quiz".
function dupKey(title, topic) {
  const t = words(title).sort().join(' ');
  const p = words(topic).sort().join(' ');
  return t || p ? `${t}|${p}` : '';
}

function rowKey(row) {
  const content = row?.content || {};
  return dupKey(content.title || row?.topic, content.metadata?.topic);
}

function questionCount(row) {
  return Array.isArray(row?.content?.questions) ? row.content.questions.length : 0;
}

// Collapses duplicate rows into one. Keeps the fullest quiz (most questions, then newest).
function dedupeRows(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = rowKey(row) || `id:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.values()).map((group) => {
    const best = group.slice().sort((a, b) =>
      questionCount(b) - questionCount(a) || String(b.created_at).localeCompare(String(a.created_at))
    )[0];
    return group.length > 1
      ? { ...best, duplicates: group.length - 1, merged_ids: group.filter((r) => r !== best).map((r) => r.id) }
      : best;
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

module.exports = { DIFFICULTIES, normalizeDifficulty, dupKey, rowKey, questionCount, dedupeRows };
