import {
  buildSnapshot,
  generateToken,
  getSessionByRoomCode,
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
    const roomCode = String(body.roomCode || '').trim().toUpperCase();
    const playerName = String(body.playerName || '').trim().slice(0, 50);

    if (!roomCode || !playerName) {
      return jsonResponse({ error: 'roomCode and playerName are required' }, 400);
    }

    const session = await getSessionByRoomCode(roomCode);
    if (!session) return jsonResponse({ error: 'Room not found' }, 404);
    if (session.status === 'finished') return jsonResponse({ error: 'Session already finished' }, 400);

    const participantToken = generateToken('player');

    const rows = await supabaseFetch('live_participants', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        session_id: session.id,
        player_name: playerName,
        participant_token: participantToken,
        score: 0,
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });

    const participant = Array.isArray(rows) ? rows[0] : null;
    if (!participant) return jsonResponse({ error: 'Failed to join session' }, 500);

    const snapshot = await buildSnapshot(session);
    return jsonResponse({ session, participantToken, participant, snapshot }, 200);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to join live session', details: error.details || null }, 500);
  }
}
