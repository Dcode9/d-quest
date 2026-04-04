export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export function readSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase Config Missing: SUPABASE_URL and SUPABASE_KEY are required');
  }
  return { supabaseUrl, supabaseKey };
}

export async function supabaseFetch(path, options = {}) {
  const { supabaseUrl, supabaseKey } = readSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const err = new Error(`Supabase error ${response.status}`);
    err.details = data;
    throw err;
  }

  return data;
}

export function generateRoomCode() {
  const roomCodeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += roomCodeChars[Math.floor(Math.random() * roomCodeChars.length)];
  }
  return code;
}

export function generateToken(prefix = 'tok') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getSessionById(sessionId) {
  const rows = await supabaseFetch(`live_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*`);
  return Array.isArray(rows) ? rows[0] : null;
}

export async function getSessionByRoomCode(roomCode) {
  const rows = await supabaseFetch(`live_sessions?room_code=eq.${encodeURIComponent(roomCode)}&select=*&order=created_at.desc&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

export async function getQuizContent(session) {
  if (session.quiz_content) return session.quiz_content;
  if (!session.quiz_id) return null;
  const rows = await supabaseFetch(`quizzes?id=eq.${encodeURIComponent(session.quiz_id)}&select=*`);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0].content || null;
}

export async function getParticipants(sessionId) {
  const rows = await supabaseFetch(`live_participants?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=joined_at.asc`);
  return Array.isArray(rows) ? rows : [];
}

export async function getAnswersForQuestion(sessionId, questionIndex) {
  const rows = await supabaseFetch(`live_answers?session_id=eq.${encodeURIComponent(sessionId)}&question_index=eq.${questionIndex}&select=*&order=submitted_at.desc`);
  return Array.isArray(rows) ? rows : [];
}

export function sanitizeQuiz(quiz) {
  if (!quiz || !Array.isArray(quiz.questions)) return null;
  return {
    title: quiz.title || 'Live Quiz',
    metadata: quiz.metadata || {},
    questions: quiz.questions.map((q) => ({
      question: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map((o) => String(o || '')) : ['', '', '', ''],
      correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : Number.parseInt(q.correctIndex, 10) || 0
    }))
  };
}

export async function buildSnapshot(session) {
  const quiz = sanitizeQuiz(await getQuizContent(session));
  const participants = await getParticipants(session.id);

  let answers = [];
  if (Number.isInteger(session.current_question_index) && session.current_question_index >= 0) {
    answers = await getAnswersForQuestion(session.id, session.current_question_index);
  }

  const byParticipantId = new Map(participants.map((p) => [p.id, p]));
  const currentQuestionAnswers = answers.map((a) => {
    const p = byParticipantId.get(a.participant_id);
    return {
      player_name: p?.player_name || 'Player',
      selected_option: a.selected_option,
      is_correct: !!a.is_correct,
      submitted_at: a.submitted_at
    };
  });

  const leaderboard = participants
    .map((p) => ({ player_name: p.player_name, score: p.score || 0 }))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  return {
    session,
    quiz,
    participants: participants.map((p) => ({ id: p.id, player_name: p.player_name, score: p.score || 0 })),
    current_question_answers: currentQuestionAnswers,
    leaderboard
  };
}

export function handleCors(req) {
  if (req.method === 'OPTIONS') {
    return jsonResponse({}, 200);
  }
  return null;
}
