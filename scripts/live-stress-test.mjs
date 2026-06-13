#!/usr/bin/env node

const PLAYER_COUNT = Number.parseInt(process.env.LIVE_STRESS_PLAYERS || '500', 10);
const QUESTION_COUNT = Number.parseInt(process.env.LIVE_STRESS_QUESTIONS || '30', 10);
const DUPLICATE_ANSWER_RATE = Number.parseFloat(process.env.LIVE_STRESS_DUPLICATE_RATE || '0.18');
const MISSED_ANSWER_RATE = Number.parseFloat(process.env.LIVE_STRESS_MISSED_RATE || '0.08');
const ANSWER_WINDOW_MS = 30000;

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function calculateScoreDelta(elapsedMs) {
  const speedFactor = Math.max(0, 1 - Math.min(elapsedMs, ANSWER_WINDOW_MS) / ANSWER_WINDOW_MS);
  return Math.max(150, Math.round(600 + 400 * speedFactor));
}

function computeRankMeta(sortedResults, prevRanks) {
  return sortedResults.map((res, idx, arr) => {
    const rank = idx + 1;
    const prevRank = prevRanks[res.id] || rank;
    const rankRise = Math.max(0, prevRank - rank);
    const distanceAhead = idx > 0 ? arr[idx - 1].total - res.total : null;
    return { ...res, rank, prevRank, rankRise, distanceAhead };
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const random = mulberry32(0xD9357);
const players = Array.from({ length: PLAYER_COUNT }, (_, idx) => ({
  id: `player-${idx + 1}`,
  name: `Stress Player ${idx + 1}`,
  emoji: ['🧠', '🚀', '🎯', '🦉'][idx % 4]
}));

const scores = Object.fromEntries(players.map((player) => [player.id, 0]));
let prevRanks = {};
let totalAnswerPayloads = 0;
let duplicatePayloads = 0;
let totalScoredAnswers = 0;
const startedAt = performance.now();

for (let questionIndex = 0; questionIndex < QUESTION_COUNT; questionIndex += 1) {
  const correctIndex = questionIndex % 4;
  const answers = {};
  const expectedIds = players.map((player) => player.id);

  for (const player of players) {
    if (random() < MISSED_ANSWER_RATE) continue;

    const isCorrect = random() < 0.62;
    const choice = isCorrect ? correctIndex : (correctIndex + 1 + Math.floor(random() * 3)) % 4;
    const elapsed = Math.floor(random() * ANSWER_WINDOW_MS);
    const payload = { questionIndex, id: player.id, choice, elapsed };

    totalAnswerPayloads += 1;
    if (!answers[payload.id]) answers[payload.id] = payload;

    if (random() < DUPLICATE_ANSWER_RATE) {
      duplicatePayloads += 1;
      totalAnswerPayloads += 1;
      const duplicatePayload = { ...payload, choice: (choice + 1) % 4, elapsed: elapsed + 999 };
      if (!answers[duplicatePayload.id]) answers[duplicatePayload.id] = duplicatePayload;
    }
  }

  const answeredExpected = expectedIds.filter((id) => Boolean(answers[id])).length;
  assert(answeredExpected <= PLAYER_COUNT, 'answered count cannot exceed player count');

  const results = players.map((player) => {
    const response = answers[player.id];
    const isCorrect = response ? response.choice === correctIndex : false;
    const delta = isCorrect ? calculateScoreDelta(response.elapsed) : 0;
    scores[player.id] += delta;
    if (response) totalScoredAnswers += 1;
    return {
      id: player.id,
      name: player.name,
      emoji: player.emoji,
      choice: response?.choice,
      isCorrect,
      delta,
      total: scores[player.id]
    };
  });

  results.sort((a, b) => b.total - a.total || b.delta - a.delta || a.id.localeCompare(b.id));
  const ranked = computeRankMeta(results, prevRanks);
  prevRanks = Object.fromEntries(ranked.map((result) => [result.id, result.rank]));

  assert(ranked.length === PLAYER_COUNT, `question ${questionIndex + 1}: missing ranked players`);
  assert(ranked[0].rank === 1, `question ${questionIndex + 1}: top rank should be 1`);
  assert(ranked.every((result, idx) => result.rank === idx + 1), `question ${questionIndex + 1}: ranks should be sequential`);
  assert(ranked.every((result) => scores[result.id] === result.total), `question ${questionIndex + 1}: score map mismatch`);
}

const durationMs = performance.now() - startedAt;
const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
assert(sortedScores.length === PLAYER_COUNT, 'final standings player count mismatch');
assert(totalAnswerPayloads >= totalScoredAnswers, 'payload count should include all scored answers');

console.log(JSON.stringify({
  players: PLAYER_COUNT,
  questions: QUESTION_COUNT,
  totalAnswerPayloads,
  duplicatePayloads,
  totalScoredAnswers,
  topScore: sortedScores[0][1],
  durationMs: Math.round(durationMs * 100) / 100
}, null, 2));
