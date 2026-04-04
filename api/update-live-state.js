import {
  buildSnapshot,
  getSessionById,
  handleCors,
  jsonResponse,
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
    const action = String(body.action || '');
    const sessionId = String(body.sessionId || '');
    const hostToken = String(body.hostToken || '');

    if (!action || !sessionId || !hostToken) {
      return jsonResponse({ error: 'action, sessionId and hostToken are required' }, 400);
    }

    const session = await getSessionById(sessionId);
    if (!session) return jsonResponse({ error: 'Session not found' }, 404);
    if (session.host_token !== hostToken) return jsonResponse({ error: 'Unauthorized host token' }, 401);

    const quiz = session.quiz_content;
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
    let nextStatus = session.status;
    let nextIndex = Number(session.current_question_index ?? -1);

    if (action === 'start') {
      if (!questions.length) return jsonResponse({ error: 'Session quiz has no questions' }, 400);
      nextStatus = 'active';
      nextIndex = 0;
    } else if (action === 'next') {
      if (session.status !== 'active') return jsonResponse({ error: 'Session is not active' }, 400);
      if (nextIndex < questions.length - 1) {
        nextIndex += 1;
      } else {
        nextStatus = 'finished';
      }
    } else if (action === 'end') {
      nextStatus = 'finished';
    } else {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }

    const rows = await supabaseFetch(`live_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: nextStatus,
        current_question_index: nextIndex,
        updated_at: new Date().toISOString()
      })
    });

    const updated = Array.isArray(rows) ? rows[0] : null;
    if (!updated) return jsonResponse({ error: 'Failed to update session state' }, 500);

    const snapshot = await buildSnapshot(updated);
    return jsonResponse({ snapshot }, 200);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to update live state', details: error.details || null }, 500);
  }
}
