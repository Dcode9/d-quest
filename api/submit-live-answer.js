import {
  buildSnapshot,
  getSessionById,
  getParticipants,
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
    const sessionId = String(body.sessionId || '');
    const participantToken = String(body.participantToken || '');
    const questionIndex = Number(body.questionIndex);
    const selectedOption = Number(body.selectedOption);

    if (!sessionId || !participantToken || !Number.isInteger(questionIndex) || !Number.isInteger(selectedOption)) {
      return jsonResponse({ error: 'sessionId, participantToken, questionIndex and selectedOption are required' }, 400);
    }

    const session = await getSessionById(sessionId);
    if (!session) return jsonResponse({ error: 'Session not found' }, 404);
    if (session.status !== 'active') return jsonResponse({ error: 'Session is not active' }, 400);
    if (questionIndex !== Number(session.current_question_index)) {
      return jsonResponse({ error: 'Question index mismatch' }, 400);
    }

    const participants = await getParticipants(sessionId);
    const participant = participants.find((p) => p.participant_token === participantToken);
    if (!participant) return jsonResponse({ error: 'Unauthorized participant token' }, 401);

    const quiz = session.quiz_content;
    const q = quiz?.questions?.[questionIndex];
    if (!q) return jsonResponse({ error: 'Question not found' }, 404);

    const correctIndex = Number(q.correctIndex || 0);
    const isCorrect = selectedOption === correctIndex;

    const existingAnswers = await supabaseFetch(`live_answers?session_id=eq.${encodeURIComponent(sessionId)}&participant_id=eq.${encodeURIComponent(participant.id)}&question_index=eq.${questionIndex}&select=id&limit=1`);
    if (Array.isArray(existingAnswers) && existingAnswers.length > 0) {
      return jsonResponse({ error: 'Answer already submitted for this question' }, 409);
    }

    await supabaseFetch('live_answers', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        session_id: sessionId,
        participant_id: participant.id,
        question_index: questionIndex,
        selected_option: selectedOption,
        is_correct: isCorrect,
        submitted_at: new Date().toISOString()
      })
    });

    const nextScore = Number(participant.score || 0) + (isCorrect ? 1000 : 0);
    await supabaseFetch(`live_participants?id=eq.${encodeURIComponent(participant.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        score: nextScore,
        updated_at: new Date().toISOString()
      })
    });

    const refreshedSession = await getSessionById(sessionId);
    const snapshot = await buildSnapshot(refreshedSession);
    return jsonResponse({ ok: true, isCorrect, snapshot }, 200);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to submit answer', details: error.details || null }, 500);
  }
}
