// AI quiz generation through the D'Ai backed /api/generate-quiz endpoint.
import { cacheQuiz } from './storage.js';
import { recordInterest } from './discover.js';

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
  recordInterest(topic, 2);

  // Save it to the shared database right away so it survives a refresh and shows up for others.
  // The server merges it into an existing quiz when the title and topic already exist.
  onStage('Saving to the quiz library…');
  try {
    const saved = await publishQuiz(data.quiz);
    // A reused duplicate comes back without this run's follow-up suggestions, so keep them.
    if (saved.content && !saved.content.suggestions?.length && data.quiz.suggestions?.length) saved.content = { ...saved.content, suggestions: data.quiz.suggestions };
    return { ...item, ...saved, isAI: true, isTemp: false, saveState: saved.duplicate ? 'duplicate' : 'saved', generationMeta: item.generationMeta };
  } catch (error) {
    console.warn('[save]', error.message || error);
    return { ...item, saveState: 'failed' };
  }
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
  return { ...payload.quiz, content: payload.quiz.content || content, isAI: true, isTemp: false, duplicate: Boolean(payload.duplicate), updated: Boolean(payload.updated) };
}

// Extend, edit and suggest share the generation endpoint. Returns the parsed JSON or throws a readable error.
async function aiCall(body, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    let data = null;
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw new Error(data?.error || `AI request failed (${response.status}).`);
    return data || {};
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('The AI took too long. Try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function extendQuizAI(quiz, { count = 5, style = 'more', instruction = '' } = {}) {
  const data = await aiCall({ action: 'extend', quiz, count, style, instruction });
  if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('The AI returned no new questions.');
  return data.questions;
}

export async function editQuizAI(quiz, instruction) {
  const data = await aiCall({ action: 'edit', quiz, instruction });
  if (!data.quiz || !Array.isArray(data.quiz.questions)) throw new Error('The AI returned an incomplete quiz.');
  return data.quiz;
}

export async function suggestNextAI(quiz) {
  const data = await aiCall({ action: 'suggest', quiz }, 25000);
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}
