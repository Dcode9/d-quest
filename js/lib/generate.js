// AI quiz generation through the D'Ai backed /api/generate-quiz endpoint.
import { cacheQuiz } from './storage.js';

const REQUEST_TIMEOUT_MS = 60000; // D'Ai plus web grounding plus an optional repair pass

export function questionCountFrom(topic) {
  const match = topic.match(/(\d+)\s*questions?/i);
  return match ? Math.min(Math.max(parseInt(match[1], 10), 1), 20) : 5;
}

export async function generateQuiz(topic, onStage = () => {}) {
  onStage('Grounding the topic with live web sources…');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    onStage("Building a polished quiz with D'Ai…");
    response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, count: questionCountFrom(topic) }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    throw new Error(`Network error: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = JSON.parse(await response.text());
  } catch {
    throw new Error("D'Quest received an invalid response from the AI backend.");
  }
  if (!response.ok) throw new Error(data.error || 'Quiz generation failed');
  if (!data.quiz || !Array.isArray(data.quiz.questions)) throw new Error("D'Ai returned an incomplete quiz.");

  const item = {
    id: `ai-${Date.now()}`,
    content: data.quiz,
    created_at: new Date().toISOString(),
    isAI: true,
    isTemp: true,
    generationMeta: data.meta || {}
  };
  cacheQuiz(item.id, data.quiz);
  return item;
}

export async function publishQuiz(content) {
  const response = await fetch('/api/save-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!response.ok) throw new Error((await response.text()) || 'Could not save quiz');
  const payload = await response.json();
  if (!payload?.quiz?.id) throw new Error('Save response missing quiz id');
  return { ...payload.quiz, content: payload.quiz.content || content, isAI: true, isTemp: false };
}
