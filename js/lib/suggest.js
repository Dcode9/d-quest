// Picks the "What next?" quizzes from a pool of AI candidates, using how the player scored.
// The AI only proposes (about 10, each tagged with a kind and difficulty). The choice happens here.
const KINDS = ['fundamentals', 'same', 'related', 'deeper', 'challenge'];
const LEVEL = { Easy: 0, Medium: 1, Hard: 2 };

// How much each kind suits each score band. Bands: low (<40%), mid (40-69%), good (70-89%), top (90%+).
const WEIGHTS = {
  low:  { fundamentals: 10, same: 4, related: 1, deeper: -6, challenge: -8 },
  mid:  { fundamentals: 6, same: 7, related: 5, deeper: 1, challenge: -3 },
  good: { fundamentals: -2, same: 4, related: 7, deeper: 8, challenge: 3 },
  top:  { fundamentals: -8, same: 0, related: 5, deeper: 9, challenge: 10 }
};

export function bandFor(pct) {
  return pct < 40 ? 'low' : pct < 70 ? 'mid' : pct < 90 ? 'good' : 'top';
}

// Older suggestions carry no tags, so read them from the wording.
export function inferKind(item) {
  if (KINDS.includes(item?.kind)) return item.kind;
  const text = `${item?.title || ''} ${item?.prompt || ''}`.toLowerCase();
  if (/\b(basic|basics|fundamental|fundamentals|beginner|easy|easier|intro|introduction|foundation|starter|simple)\b/.test(text)) return 'fundamentals';
  if (/\b(challenge|expert|toughest|hardest|ultimate)\b/.test(text)) return 'challenge';
  if (/\b(harder|advanced|deeper|deep dive|in depth|in-depth|hard)\b/.test(text)) return 'deeper';
  if (/\b(related|connected|similar|different|more on|other)\b/.test(text)) return 'related';
  return 'same';
}

// Returns up to `count` suggestions. Never returns fewer than the pool allows.
export function pickSuggestions(pool, { pct = 0, difficulty = 'Medium', count = 3 } = {}) {
  const list = (Array.isArray(pool) ? pool : []).filter((x) => x?.title && x?.prompt);
  if (!list.length) return [];
  const band = bandFor(pct);
  const base = LEVEL[difficulty] ?? 1;
  // Where the next quiz should sit relative to this one: easier after a poor score, harder after a great one.
  const target = band === 'low' ? Math.max(0, base - 1) : band === 'top' ? Math.min(2, base + 1) : band === 'good' ? Math.min(2, base + (base < 2 ? 0.5 : 0)) : base;
  const scored = list.map((item, i) => {
    const kind = inferKind(item);
    const level = LEVEL[item.difficulty];
    const fit = level == null ? 0 : -Math.abs(level - target) * 3;
    return { item: { ...item, kind }, score: WEIGHTS[band][kind] + fit - i * 0.01 };
  }).sort((a, b) => b.score - a.score);
  const out = [];
  const perKind = {};
  for (const entry of scored) {
    if (out.length >= count) break;
    if ((perKind[entry.item.kind] || 0) >= 2) continue;
    perKind[entry.item.kind] = (perKind[entry.item.kind] || 0) + 1;
    out.push(entry.item);
  }
  for (const entry of scored) { if (out.length >= count) break; if (!out.includes(entry.item)) out.push(entry.item); }
  return out;
}

// What the heading says, so the choice feels deliberate.
export function nextHeading(pct) {
  const band = bandFor(pct);
  return band === 'low' ? 'Build up the basics' : band === 'mid' ? 'Keep the momentum' : band === 'good' ? 'Ready for more' : 'Time for a real challenge';
}

// Used only when the AI is unreachable or returned nothing.
export function fallbackPool(quiz) {
  const topic = quiz?.metadata?.topic || quiz?.title || 'this topic';
  return [
    { emoji: '🌱', title: `${topic}: the basics`, prompt: `An easy beginner quiz covering the fundamentals of ${topic}`, kind: 'fundamentals', difficulty: 'Easy' },
    { emoji: '🧱', title: `${topic}: key terms`, prompt: `An easy quiz on the key terms and definitions of ${topic}`, kind: 'fundamentals', difficulty: 'Easy' },
    { emoji: '🔎', title: `More on ${topic}`, prompt: `Different questions on ${topic} at the same level`, kind: 'same', difficulty: 'Medium' },
    { emoji: '🧭', title: `Around ${topic}`, prompt: `A quiz on a topic closely related to ${topic}`, kind: 'related', difficulty: 'Medium' },
    { emoji: '📈', title: `Harder ${topic}`, prompt: `A harder, more advanced quiz on ${topic}`, kind: 'deeper', difficulty: 'Hard' },
    { emoji: '🏔️', title: `${topic}: expert round`, prompt: `A tough expert-level mixed quiz on ${topic}`, kind: 'challenge', difficulty: 'Hard' }
  ];
}
