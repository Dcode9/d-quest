const DAI_API_BASE_URL = (process.env.DAI_API_BASE_URL || 'https://d-m22f8yuju-dcode9s-projects.vercel.app/api').replace(/\/+$/, '');
const MAX_QUESTIONS = 20;
const MAX_TOTAL_QUESTIONS = 60;
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 15 };
const { allow } = require('./_rate');
const MIN_QUESTIONS = 1;
const REQUEST_TIMEOUT_MS = 48000;

const QUIZ_SYSTEM_PROMPT = [
  "You are D'Quest, an expert quiz architect running on the D'Ai model backend.",
  "Turn the user's request into a high-quality multiple-choice quiz.",
  "Return ONLY valid JSON. Never return markdown, commentary, code fences, or prose outside the JSON object.",
  "",
  "Required JSON shape:",
  '{',
  '  "title": "Concise, polished quiz title",',
  '  "metadata": { "grade": 1, "topic": "Primary topic", "difficulty": "Easy", "emoji": "📚" },',
  '  "questions": [{ "question": "A clear, unambiguous question?", "options": ["A", "B", "C", "D"], "correctIndex": 0 }],',
  '  "suggestions": [{ "title": "Short button label for a follow-up quiz", "prompt": "Standalone request that generates that quiz", "emoji": "🎯" }]',
  '}',
  "",
  "Quality rules:",
  "- Generate EXACTLY the requested number of questions.",
  "- Every question must have exactly 4 non-empty options and exactly one defensible correct answer.",
  "- correctIndex must be an integer from 0 to 3.",
  "- Avoid duplicate questions, duplicate options, trick wording, all/none-of-the-above options, and giveaway patterns.",
  "- Distractors must be plausible, belong to the same category as the correct answer, and be wrong for a clear reason.",
  "- Vary question forms: recall, understanding, application, comparison, sequencing, interpretation, or light calculation when appropriate.",
  "- Match requested grade, audience, difficulty, and scope. For broad/general quizzes, choose a reasonable grade.",
  "- Spread correctIndex values across A/B/C/D instead of repeatedly using the same position.",
  "- Prefer precise wording over clever wording. Do not introduce ambiguity just to make a question harder.",
  "- For quantitative questions, check arithmetic and units. For science and technical questions, use canonical terminology.",
  "- Treat the web research packet as evidence for current, time-sensitive, or source-specific facts. Do not invent unsupported current details.",
  "- If the research packet is empty, rely on stable knowledge and do not pretend that you verified live facts.",
  "- suggestions: exactly 3 follow-up quizzes someone who just finished this one would enjoy next (go deeper, a harder level, or a closely related topic). Each prompt must be self-contained, under 160 characters, and must not mention this quiz.",
  '- grade must be 1-12; difficulty must be Easy, Medium, or Hard; emoji must be one emoji.'
].join('\\n');

function clampCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(parsed, MIN_QUESTIONS), MAX_QUESTIONS);
}

function cleanText(value, max = 4000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function extractJson(text) {
  let value = cleanText(text, 50000)
    .replace(/^\s*\x60{3}(?:json)?\s*/i, '')
    .replace(/\s*\x60{3}\s*$/i, '')
    .trim();

  try {
    return JSON.parse(value);
  } catch (_) {
    const firstObject = value.indexOf('{');
    const lastObject = value.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject) return JSON.parse(value.slice(firstObject, lastObject + 1));
    throw new Error('AI response was not valid JSON.');
  }
}

function normalizeOption(value) {
  return cleanText(value, 600).replace(/\s+/g, ' ');
}

function validateQuiz(quiz, count) {
  const errors = [];
  if (!quiz || typeof quiz !== 'object') errors.push('quiz must be an object');
  if (!cleanText(quiz?.title, 160)) errors.push('title is required');

  const metadata = quiz?.metadata;
  if (!metadata || typeof metadata !== 'object') {
    errors.push('metadata is required');
  } else {
    const grade = Number(metadata.grade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) errors.push('metadata.grade must be 1-12');
    if (!['Easy', 'Medium', 'Hard'].includes(metadata.difficulty)) errors.push('metadata.difficulty must be Easy, Medium, or Hard');
    if (!cleanText(metadata.topic, 160)) errors.push('metadata.topic is required');
    if (!cleanText(metadata.emoji, 10)) errors.push('metadata.emoji is required');
  }

  if (!Array.isArray(quiz?.questions)) {
    errors.push('questions must be an array');
    return errors;
  }
  if (count !== null && quiz.questions.length !== count) errors.push('questions must contain exactly ' + count + ' items');

  const questionKeys = new Set();
  for (let i = 0; i < quiz.questions.length; i += 1) {
    const item = quiz.questions[i];
    if (!item || typeof item !== 'object') {
      errors.push('question ' + (i + 1) + ' must be an object');
      continue;
    }

    const question = normalizeOption(item.question);
    if (!question) errors.push('question ' + (i + 1) + ' text is required');
    const qKey = question.toLowerCase();
    if (qKey && questionKeys.has(qKey)) errors.push('duplicate question at ' + (i + 1));
    if (qKey) questionKeys.add(qKey);

    if (!Array.isArray(item.options) || item.options.length !== 4) {
      errors.push('question ' + (i + 1) + ' must have exactly 4 options');
    } else {
      const optionKeys = new Set();
      item.options.forEach((raw, j) => {
        const option = normalizeOption(raw);
        if (!option) errors.push('question ' + (i + 1) + ' option ' + (j + 1) + ' is empty');
        const key = option.toLowerCase();
        if (key && optionKeys.has(key)) errors.push('question ' + (i + 1) + ' contains duplicate options');
        if (key) optionKeys.add(key);
      });
    }

    if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3) {
      errors.push('question ' + (i + 1) + ' correctIndex must be 0-3');
    }
  }

  return errors;
}

function normalizeSuggestions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const title = cleanText(item?.title, 70);
    const prompt = cleanText(item?.prompt || item?.title, 200);
    if (!title || !prompt || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({ title, prompt, emoji: cleanText(item?.emoji, 8) || '🎯' });
    if (out.length >= 3) break;
  }
  return out;
}

function normalizeQuiz(quiz, topic, count) {
  const metadata = quiz.metadata || {};
  const questions = Array.isArray(quiz.questions) ? quiz.questions.slice(0, count || MAX_TOTAL_QUESTIONS) : [];
  return {
    title: cleanText(quiz.title, 160) || 'AI Quiz',
    suggestions: normalizeSuggestions(quiz.suggestions),
    metadata: {
      grade: Number.isInteger(Number(metadata.grade)) ? Math.min(Math.max(Number(metadata.grade), 1), 12) : 7,
      topic: cleanText(metadata.topic, 160) || cleanText(topic, 160),
      difficulty: ['Easy', 'Medium', 'Hard'].includes(metadata.difficulty) ? metadata.difficulty : 'Medium',
      emoji: cleanText(metadata.emoji, 10) || '🎯'
    },
    questions: questions.map((q) => ({
      question: normalizeOption(q.question),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(normalizeOption) : [],
      correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0
    }))
  };
}

async function fetchJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
    if (!response.ok) {
      const detail = cleanText(data?.error || raw || response.statusText, 600);
      throw new Error('D-Ai backend returned ' + response.status + ': ' + detail);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWeb(topic) {
  try {
    const data = await fetchJson(
      DAI_API_BASE_URL + '/search',
      { method: 'POST', body: JSON.stringify({ query: cleanText(topic, 800) }) },
      9000
    );
    const results = Array.isArray(data?.results) ? data.results : [];
    const unique = [];
    const seen = new Set();
    for (const item of results) {
      const url = cleanText(item?.url, 1000);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      unique.push({
        title: cleanText(item?.title || 'Source', 220),
        url,
        snippet: cleanText(item?.content || item?.snippet || '', 900)
      });
      if (unique.length >= 8) break;
    }
    return { answer: cleanText(data?.answer, 1800), results: unique };
  } catch (error) {
    console.warn('[D-Quest] Web grounding unavailable:', error.message);
    return { answer: '', results: [] };
  }
}

function formatResearchPacket(research) {
  const lines = [];
  if (research.answer) lines.push('Search summary: ' + research.answer);
  for (let i = 0; i < research.results.length; i += 1) {
    const source = research.results[i];
    lines.push('[' + (i + 1) + '] ' + source.title + '\\nURL: ' + source.url + '\\nExcerpt: ' + source.snippet);
  }
  return cleanText(lines.join('\\n\\n'), 9000);
}

async function callDai(topic, count, research, repairContext = null) {
  const packet = formatResearchPacket(research) || '(No live web results were available. Use stable knowledge only.)';
  const userPrompt = repairContext
    ? [
        'Repair the quiz below so it satisfies every schema and quality rule.',
        'Original request:', cleanText(topic, 1200),
        'Required question count:', String(count),
        'Validation errors:', repairContext.errors.join('\\n'),
        'Broken quiz JSON:', JSON.stringify(repairContext.quiz),
        'WEB RESEARCH PACKET:', packet,
        'Return only the complete corrected JSON object.'
      ].join('\\n\\n')
    : [
        'Create a quiz from this request:', JSON.stringify(cleanText(topic, 1200)),
        'Requested question count: ' + count,
        'WEB RESEARCH PACKET:', packet,
        'Return exactly the required JSON object and nothing else.'
      ].join('\\n\\n');

  const data = await fetchJson(
    DAI_API_BASE_URL + '/chat',
    {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          { role: 'system', content: QUIZ_SYSTEM_PROMPT + (repairContext ? '\\nThis is a repair pass. Preserve good content while fixing every listed issue.' : '') },
          { role: 'user', content: userPrompt.slice(0, 18000) }
        ],
        stream: false,
        enable_tools: false,
        mode: 'Quiz',
        max_tokens: Math.min(12000, Math.max(4500, count * 520)),
        temperature: repairContext ? 0.2 : 0.35
      })
    },
    REQUEST_TIMEOUT_MS
  );

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('D-Ai returned an empty quiz response.');
  return extractJson(content);
}

async function callJson(system, user, { maxTokens = 4500, temperature = 0.35 } = {}) {
  const data = await fetchJson(
    DAI_API_BASE_URL + '/chat',
    {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'system', content: system }, { role: 'user', content: user.slice(0, 20000) }],
        stream: false,
        enable_tools: false,
        mode: 'Quiz',
        max_tokens: maxTokens,
        temperature
      })
    },
    REQUEST_TIMEOUT_MS
  );
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('D-Ai returned an empty response.');
  return extractJson(content);
}

const JSON_ONLY = 'Return ONLY valid JSON. Never return markdown, commentary, or code fences.';
const QUESTION_RULES = [
  'Every question has exactly 4 non-empty, distinct options and exactly one defensible correct answer.',
  'correctIndex is an integer 0 to 3 and varies across the new questions.',
  'Distractors are plausible and wrong for a clear reason. No all/none-of-the-above options.'
].join(' ');

// Compact view of a quiz for the model. Keeps the prompt small and ignores anything unexpected.
function briefQuiz(input) {
  const quiz = input && typeof input === 'object' ? input : {};
  const questions = (Array.isArray(quiz.questions) ? quiz.questions : []).slice(0, MAX_TOTAL_QUESTIONS).map((q) => ({
    question: normalizeOption(q?.question),
    options: (Array.isArray(q?.options) ? q.options : []).slice(0, 4).map(normalizeOption),
    correctIndex: Number.isInteger(q?.correctIndex) ? q.correctIndex : 0
  })).filter((q) => q.question);
  const meta = quiz.metadata && typeof quiz.metadata === 'object' ? quiz.metadata : {};
  return {
    title: cleanText(quiz.title, 160),
    metadata: { topic: cleanText(meta.topic, 160), grade: meta.grade ?? 7, difficulty: ['Easy', 'Medium', 'Hard'].includes(meta.difficulty) ? meta.difficulty : 'Medium', emoji: cleanText(meta.emoji, 10) || '🎯' },
    questions
  };
}

function checkQuestions(list, count, existing = []) {
  const errors = [];
  if (!Array.isArray(list) || list.length !== count) return ['questions must contain exactly ' + count + ' items'];
  const seen = new Set(existing.map((q) => q.question.toLowerCase()));
  list.forEach((item, i) => {
    const text = normalizeOption(item?.question);
    if (!text) errors.push('question ' + (i + 1) + ' text is required');
    if (seen.has(text.toLowerCase())) errors.push('question ' + (i + 1) + ' repeats an existing question');
    seen.add(text.toLowerCase());
    const opts = Array.isArray(item?.options) ? item.options.map(normalizeOption) : [];
    if (opts.length !== 4 || opts.some((o) => !o) || new Set(opts.map((o) => o.toLowerCase())).size !== 4) errors.push('question ' + (i + 1) + ' needs 4 distinct options');
    if (!Number.isInteger(item?.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3) errors.push('question ' + (i + 1) + ' correctIndex must be 0-3');
  });
  return errors;
}

const cleanQuestions = (list) => list.map((q) => ({ question: normalizeOption(q.question), options: q.options.slice(0, 4).map(normalizeOption), correctIndex: q.correctIndex }));

async function extendQuiz(body) {
  const quiz = briefQuiz(body.quiz);
  if (!quiz.questions.length) { const e = new Error('Add at least one question before extending the quiz.'); e.status = 400; throw e; }
  const room = MAX_TOTAL_QUESTIONS - quiz.questions.length;
  if (room <= 0) { const e = new Error('This quiz already has the maximum of ' + MAX_TOTAL_QUESTIONS + ' questions.'); e.status = 400; throw e; }
  const count = Math.min(clampCount(body.count), room);
  const deeper = body.style === 'deeper';
  const focus = cleanText(body.instruction, 400);
  const system = [
    "You are D'Quest, an expert quiz writer. " + JSON_ONLY,
    'Write NEW multiple-choice questions that continue an existing quiz.',
    deeper
      ? 'Extend the quiz: go one level deeper than the existing questions. Cover related ideas the quiz has not touched yet and be somewhat harder.'
      : 'Add more questions at the same level, grade and style as the existing ones, covering other parts of the same topic.',
    QUESTION_RULES,
    'Never repeat or lightly reword an existing question.',
    'Shape: {"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0}]}'
  ].join('\n');
  const user = [
    'Existing quiz:', JSON.stringify(quiz),
    'Write exactly ' + count + ' new questions.',
    focus ? 'Extra direction from the user: ' + JSON.stringify(focus) : '',
    'Return only the JSON object.'
  ].filter(Boolean).join('\n\n');
  const opts = { maxTokens: Math.min(9000, Math.max(2500, count * 480)), temperature: 0.4 };
  let out = await callJson(system, user, opts);
  let errors = checkQuestions(out?.questions, count, quiz.questions);
  if (errors.length) {
    out = await callJson(system, user + '\n\nFix these problems and return the full corrected JSON:\n' + errors.join('\n') + '\n\nPrevious attempt: ' + JSON.stringify(out), { ...opts, temperature: 0.2 });
    errors = checkQuestions(out?.questions, count, quiz.questions);
  }
  if (errors.length) { const e = new Error('D-Ai produced questions that failed quality checks. Please try again.'); e.validation = errors.slice(0, 6); throw e; }
  return { questions: cleanQuestions(out.questions) };
}

async function editQuiz(body) {
  const quiz = briefQuiz(body.quiz);
  const instruction = cleanText(body.instruction, 800);
  if (!instruction) { const e = new Error('Tell the AI what to change.'); e.status = 400; throw e; }
  if (!quiz.questions.length) { const e = new Error('Add at least one question before editing with AI.'); e.status = 400; throw e; }
  const system = [
    "You are D'Quest, an expert quiz editor. " + JSON_ONLY,
    'Apply the user\'s instruction to the quiz and return the COMPLETE updated quiz.',
    'Change only what the instruction asks for. Keep every other question exactly as it is. You may add, remove, reword, reorder or fix questions when asked.',
    QUESTION_RULES,
    'Keep metadata (grade 1-12 integer, difficulty Easy/Medium/Hard, topic, one emoji) valid; update it only if the instruction implies it.',
    'Shape: {"title":"...","metadata":{"grade":7,"topic":"...","difficulty":"Medium","emoji":"📚"},"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0}]}'
  ].join('\n');
  const user = ['Current quiz:', JSON.stringify(quiz), 'Instruction:', JSON.stringify(instruction), 'Return only the JSON object.'].join('\n\n');
  const opts = { maxTokens: Math.min(12000, Math.max(4000, quiz.questions.length * 520)), temperature: 0.25 };
  const check = (q) => { const errs = validateQuiz(q, null); if (Array.isArray(q?.questions) && (q.questions.length < 1 || q.questions.length > MAX_TOTAL_QUESTIONS)) errs.push('questions must have 1 to ' + MAX_TOTAL_QUESTIONS + ' items'); return errs; };
  let out = await callJson(system, user, opts);
  let errors = check(out);
  if (errors.length) {
    out = await callJson(system, user + '\n\nFix these problems and return the complete corrected JSON:\n' + errors.join('\n') + '\n\nPrevious attempt: ' + JSON.stringify(out), { ...opts, temperature: 0.15 });
    errors = check(out);
  }
  if (errors.length) { const e = new Error('D-Ai produced an edit that failed quality checks. Please try again.'); e.validation = errors.slice(0, 6); throw e; }
  const normalized = normalizeQuiz(out, quiz.metadata.topic, null);
  delete normalized.suggestions;
  return { quiz: normalized };
}

async function suggestNext(body) {
  const quiz = briefQuiz(body.quiz);
  if (!quiz.title && !quiz.questions.length) { const e = new Error('Quiz required.'); e.status = 400; throw e; }
  const system = [
    "You are D'Quest. " + JSON_ONLY,
    'Someone just finished the quiz below. Suggest exactly 3 follow-up quizzes: go deeper, step up the difficulty, or move to a closely related topic.',
    'Each prompt must be a self-contained request under 160 characters that does not mention the finished quiz.',
    'Shape: {"suggestions":[{"title":"Short button label","prompt":"...","emoji":"🎯"}]}'
  ].join('\n');
  const brief = { ...quiz, questions: quiz.questions.slice(0, 8).map((q) => q.question) };
  const out = await callJson(system, 'Finished quiz: ' + JSON.stringify(brief), { maxTokens: 700, temperature: 0.6 });
  return { suggestions: normalizeSuggestions(out?.suggestions) };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'Online',
      backend: 'D-Ai',
      webGrounding: true,
      maxQuestions: MAX_QUESTIONS,
      actions: ['generate', 'extend', 'edit', 'suggest']
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body && typeof body === 'object' ? body : {};
  const action = ['extend', 'edit', 'suggest'].includes(body.action) ? body.action : 'generate';

  // Anonymous callers share the AI backend, so cap how often one address can use it.
  const gate = allow(req, RATE_LIMIT);
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfterSec));
    return res.status(429).json({ error: 'Too many AI requests from this connection. Try again in ' + Math.ceil(gate.retryAfterSec / 60) + ' min.' });
  }

  if (action !== 'generate') {
    try {
      const result = action === 'extend' ? await extendQuiz(body) : action === 'edit' ? await editQuiz(body) : await suggestNext(body);
      return res.status(200).json(result);
    } catch (error) {
      console.error('[D-Quest] ' + action + ' error:', error.message);
      return res.status(error.status || 502).json({
        error: error.status ? error.message : (error.validation ? error.message : 'AI is temporarily unavailable.'),
        validation: error.validation,
        details: error.status ? undefined : cleanText(error.message, 300)
      });
    }
  }

  const topic = cleanText(body.topic, 1200);
  const count = clampCount(body.count);
  if (!topic) return res.status(400).json({ error: 'Topic required' });

  const startedAt = Date.now();

  try {
    const research = await searchWeb(topic);
    let quiz = await callDai(topic, count, research);
    let validationErrors = validateQuiz(quiz, count);

    if (validationErrors.length) {
      quiz = await callDai(topic, count, research, { quiz, errors: validationErrors });
      validationErrors = validateQuiz(quiz, count);
    }

    if (validationErrors.length) {
      console.error('[D-Quest] Quiz validation failed after repair:', validationErrors);
      return res.status(502).json({
        error: 'D-Ai generated a quiz that failed quality validation. Please try again.',
        validation: validationErrors.slice(0, 8)
      });
    }

    return res.status(200).json({
      quiz: normalizeQuiz(quiz, topic, count),
      meta: {
        backend: 'D-Ai',
        webGrounded: research.results.length > 0,
        sourceCount: research.results.length,
        sourceTitles: research.results.slice(0, 5).map((item) => item.title),
        durationMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    console.error('[D-Quest] Generate quiz error:', error.message);
    return res.status(502).json({
      error: 'Quiz generation is temporarily unavailable.',
      details: cleanText(error.message, 500)
    });
  }
};
