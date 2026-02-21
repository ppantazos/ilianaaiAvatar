import WebSocket, { WebSocketServer } from 'ws';
import { addAvatarMessage, consumeSession, getSessionInfo } from '../services/transcript.js';
import { updateConversationStatusIfConfigured, postMessage } from '../services/petya.js';

const HEYGEN_WS_URL = (process.env.HEYGEN_BASE_URL || 'https://api.heygen.com')
  .replace(/^https/, 'wss')
  .replace(/^http/, 'ws');

// Accumulate avatar chunks per session (Heygen may send avatar_talking_message in chunks)
const avatarBuffer = new Map();

/**
 * Extract text from Heygen message. Handles type and event_type, various field names.
 */
function extractText(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const data = msg.data || msg;
  return data.text ?? data.sentence ?? data.transcript ?? data.message ?? null;
}

/** @deprecated use extractText */
function extractAvatarText(msg) {
  return extractText(msg);
}

function getMessageType(msg) {
  const t = msg?.type ?? msg?.event_type ?? '';
  return String(t).toLowerCase();
}

/**
 * Flush buffered avatar text: POST to Petya and add to transcript.
 */
async function flushAvatarBuffer(sessionId) {
  const text = avatarBuffer.get(sessionId);
  avatarBuffer.delete(sessionId);
  if (!text?.trim()) return;

  const session = getSessionInfo(sessionId);
  if (session?.conversationId) {
    await postMessage(session.conversationId, text.trim(), false, session.customerApiKey);
  }
  addAvatarMessage(sessionId, text.trim());
  if (process.env.DEBUG_TRANSCRIPT) {
    console.log('[Transcript] avatar turn flushed (user spoke)', { sessionId, text: text.substring(0, 80) });
  }
}

/**
 * Handle Heygen WebSocket message: accumulate chunks, post full avatar response per turn.
 * - avatar_talking_message: streaming chunks (cumulative); buffer the text
 * - avatar_end_message: turn complete; POST buffered/final text
 * - user_start / user_end_message: user is speaking; flush avatar buffer (avatar's previous turn is done)
 */
async function handleWebSocketMessage(sessionId, msg) {
  const type = getMessageType(msg);
  const text = extractText(msg);

  if (process.env.DEBUG_TRANSCRIPT && (type.includes('avatar') || type.includes('user'))) {
    console.log('[Transcript] WS message', { sessionId, type, hasText: !!text, textPreview: text ? text.substring(0, 50) : null });
  }

  // User started speaking or finished - avatar's previous turn is complete; flush buffer
  if (type === 'user_start' || type === 'user_end_message') {
    await flushAvatarBuffer(sessionId);
  }

  if (type === 'avatar_talking_message' && text) {
    avatarBuffer.set(sessionId, text);
    return;
  }

  if (type === 'avatar_end_message') {
    const finalText = text || avatarBuffer.get(sessionId);
    avatarBuffer.delete(sessionId);

    if (!finalText?.trim()) return;

    const session = getSessionInfo(sessionId);
    if (session?.conversationId) {
      await postMessage(session.conversationId, finalText.trim(), false, session.customerApiKey);
    }
    addAvatarMessage(sessionId, finalText.trim());
    if (process.env.DEBUG_TRANSCRIPT) {
      console.log('[Transcript] avatar turn complete', { sessionId, text: finalText.substring(0, 80) });
    }
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

    console.log('[WebSocket] Client connected', { sessionId });

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
      heygenWs.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const type = getMessageType(msg);
          const rawType = msg?.type ?? msg?.event_type ?? '(none)';
          // Log all message types to diagnose missing avatar responses
          if (type && !type.includes('connection') && !type.includes('quality')) {
            console.log('[WebSocket] Heygen', { sessionId, type: rawType, hasText: !!extractText(msg) });
          }
          await handleWebSocketMessage(sessionId, msg);
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
    await flushAvatarBuffer(sessionId);
    const session = consumeSession(sessionId);
    if (!session) {
      console.log('[WebSocket] finishSession: No session found for', sessionId);
      return;
    }
    const roleCounts = (session.entries ?? []).reduce((acc, e) => { acc[e.role] = (acc[e.role] || 0) + 1; return acc; }, {});
    console.log('[WebSocket] finishSession: Calling Petya status', { sessionId, conversationId: session.conversationId, transcriptByRole: roleCounts });
    await updateConversationStatusIfConfigured(session.conversationId, {
      sessionId,
      status: 'completed',
      transcript: session.entries ?? []
    }, session.customerApiKey);
  }
}
