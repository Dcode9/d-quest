import {
  buildSnapshot,
  generateRoomCode,
  generateToken,
  getSessionByRoomCode,
  handleCors,
  jsonResponse,
  sanitizeQuiz,
  supabaseFetch
} from './live-utils.js';

export default async function handler(req) {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const hostName = String(body.hostName || 'Host').trim().slice(0, 50) || 'Host';
    const quizId = body.quizId ? String(body.quizId) : null;
    const quiz = sanitizeQuiz(body.quiz);

    if (!quiz) {
      return jsonResponse({ error: 'A valid quiz payload is required to host live quiz' }, 400);
    }

    let roomCode = null;
    for (let i = 0; i < 5; i++) {
      const candidate = generateRoomCode();
      const existing = await getSessionByRoomCode(candidate);
      if (!existing || existing.status === 'finished') {
        roomCode = candidate;
        break;
      }
    }

    if (!roomCode) {
      return jsonResponse({ error: 'Could not allocate room code' }, 500);
    }

    const hostToken = generateToken('host');

    const payload = {
      room_code: roomCode,
      quiz_id: quizId,
      quiz_content: quiz,
      host_name: hostName,
      host_token: hostToken,
      status: 'waiting',
      current_question_index: -1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const rows = await supabaseFetch('live_sessions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    });

    const session = Array.isArray(rows) ? rows[0] : null;
    if (!session) return jsonResponse({ error: 'Failed to create session' }, 500);

    const snapshot = await buildSnapshot(session);
    return jsonResponse({ session, hostToken, snapshot }, 200);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to create live session', details: error.details || null }, 500);
  }
}
