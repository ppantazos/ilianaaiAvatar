/**
 * In-memory transcript storage per session.
 * Key: session_id
 * Value: { conversationId, entries: [{ role, transcript, timestamp }] }
 */
const sessionTranscripts = new Map();

/**
 * Initialize transcript for a session.
 * @param {string} sessionId - Heygen session ID
 * @param {string} conversationId - Petya/SellEmbedded conversation ID
 */
export function initSession(sessionId, conversationId) {
  sessionTranscripts.set(sessionId, {
    conversationId: conversationId || sessionId,
    entries: []
  });
}

/**
 * Add a user message (from streaming.task).
 * @param {string} sessionId
 * @param {string} text
 */
export function addUserMessage(sessionId, text) {
  const session = sessionTranscripts.get(sessionId);
  if (!session) return;
  session.entries.push({
    role: 'user',
    transcript: text,
    timestamp: Math.floor(Date.now() / 1000)
  });
}

/**
 * Add an avatar message (from WebSocket avatar_talking_message, avatar_end_message).
 * @param {string} sessionId
 * @param {string} text
 */
export function addAvatarMessage(sessionId, text) {
  const session = sessionTranscripts.get(sessionId);
  if (!session) return;
  session.entries.push({
    role: 'avatar',
    transcript: text,
    timestamp: Math.floor(Date.now() / 1000)
  });
}

/**
 * Get and remove transcript for a session.
 * @param {string} sessionId
 * @returns {{ conversationId: string, transcript: Array } | null}
 */
export function consumeSession(sessionId) {
  const session = sessionTranscripts.get(sessionId);
  sessionTranscripts.delete(sessionId);
  return session || null;
}

/**
 * Get conversation ID for a session without consuming.
 */
export function getConversationId(sessionId) {
  const session = sessionTranscripts.get(sessionId);
  return session?.conversationId;
}
