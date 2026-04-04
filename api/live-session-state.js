import {
  buildSnapshot,
  getSessionById,
  getSessionByRoomCode,
  handleCors,
  jsonResponse
} from './live-utils.js';

export default async function handler(req) {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    const roomCode = url.searchParams.get('roomCode');

    let session = null;
    if (sessionId) session = await getSessionById(sessionId);
    if (!session && roomCode) session = await getSessionByRoomCode(roomCode.toUpperCase());
    if (!session) return jsonResponse({ error: 'Session not found' }, 404);

    const snapshot = await buildSnapshot(session);
    return jsonResponse({ snapshot }, 200);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to fetch session state', details: error.details || null }, 500);
  }
}
