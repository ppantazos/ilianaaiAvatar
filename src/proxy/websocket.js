import WebSocket, { WebSocketServer } from 'ws';
import { addAvatarMessage, consumeSession } from '../services/transcript.js';
import { updateConversationStatusIfConfigured } from '../services/petya.js';

const HEYGEN_WS_URL = (process.env.HEYGEN_BASE_URL || 'https://api.heygen.com')
  .replace(/^https/, 'wss')
  .replace(/^http/, 'ws');

/**
 * Extract text from Heygen message for transcript.
 * Handles avatar_talking_message and avatar_end_message with various field names.
 */
function extractAvatarText(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const data = msg.data || msg;
  return data.text ?? data.sentence ?? data.transcript ?? data.message ?? null;
}

/**
 * Handle Heygen WebSocket message for transcript collection.
 */
function collectTranscript(sessionId, msg) {
  const type = msg?.type;
  const text = extractAvatarText(msg);
  
  if (type === 'avatar_talking_message' && text) {
    addAvatarMessage(sessionId, text);
  }
  if (type === 'avatar_end_message' && text) {
    addAvatarMessage(sessionId, text);
  }
}

/**
 * Proxy WebSocket: client <-> ilianaaiAvatar <-> Heygen.
 * Collects avatar messages for transcript; on close, calls updateConversationStatus.
 */
export function setupWebSocketProxy(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const pathname = url.pathname;
    
    if (pathname === '/v1/ws/streaming.chat') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, url.searchParams);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs, request, searchParams) => {
    const sessionId = searchParams.get('session_id');
    const sessionToken = searchParams.get('session_token');

    if (!sessionId || !sessionToken) {
      clientWs.close(4000, 'Missing session_id or session_token');
      return;
    }

    // Forward all query params to Heygen (silence_response, opening_text, stt_language, enable_tts, enable_stt, etc.)
    const queryString = searchParams.toString();
    const heygenUrl = `${HEYGEN_WS_URL}/v1/ws/streaming.chat?${queryString}`;
    const heygenWs = new WebSocket(heygenUrl);

    heygenWs.on('open', () => {
      clientWs.on('message', (data) => heygenWs.send(data));
      heygenWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          collectTranscript(sessionId, msg);
        } catch {
          // Binary or non-JSON, pass through
        }
        clientWs.send(data);
      });
    });

    const cleanup = () => {
      heygenWs.removeAllListeners();
      clientWs.removeAllListeners();
      if (heygenWs.readyState === WebSocket.OPEN) heygenWs.close();
    };

    heygenWs.on('error', (err) => {
      console.error('Heygen WebSocket error:', err.message);
      clientWs.close(1011, 'Upstream error');
      finishSession(sessionId);
      cleanup();
    });

    heygenWs.on('close', () => {
      finishSession(sessionId);
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    clientWs.on('close', () => {
      finishSession(sessionId);
      cleanup();
      if (heygenWs.readyState === WebSocket.OPEN) heygenWs.close();
    });
  });

  async function finishSession(sessionId) {
    const session = consumeSession(sessionId);
    if (!session) {
      console.log('[WebSocket] finishSession: No session found for', sessionId);
      return;
    }
    if (!session.entries?.length) {
      console.log('[WebSocket] finishSession: No transcript entries, skipping Petya', { sessionId, conversationId: session.conversationId });
      return;
    }
    console.log('[WebSocket] finishSession: Persisting to Petya', { sessionId, conversationId: session.conversationId, entries: session.entries.length });
    await updateConversationStatusIfConfigured(session.conversationId, {
      sessionId,
      status: 'completed',
      transcript: session.entries
    }, session.customerApiKey);
  }
}
