/**
 * In-memory transcript storage per session.
 * Key: session_id
 * Value: { conversationId, customerApiKey, entries, livekitUrl?, livekitAgentToken?, sessionToken? }
 */
const sessionTranscripts = new Map();

/**
 * Initialize transcript for a session.
 * @param {string} sessionId - Heygen/LiveAvatar session ID
 * @param {string} conversationId - Petya/SellEmbedded conversation ID
 * @param {string} customerApiKey - Customer API key (for Petya upsert)
 */
export function initSession(sessionId, conversationId, customerApiKey) {
  const stored = {
    conversationId: conversationId || sessionId,
    customerApiKey: customerApiKey || null,
    entries: []
  };
  sessionTranscripts.set(sessionId, stored);
  console.log('[Transcript] initSession:', { sessionId, conversationId: stored.conversationId, hasApiKey: !!customerApiKey });
}

/**
 * Store LiveAvatar LiveKit credentials for server-side command publishing.
 * @param {string} sessionId
 * @param {object} creds - { livekitUrl, livekitAgentToken, sessionToken? }
 */
export function setLiveAvatarCredentials(sessionId, creds) {
  const session = sessionTranscripts.get(sessionId);
  if (!session) return;
  session.livekitUrl = creds.livekitUrl;
  session.livekitAgentToken = creds.livekitAgentToken;
  session.sessionToken = creds.sessionToken;
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
 * @returns {{ conversationId: string, customerApiKey?: string, entries: Array } | null}
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

/**
 * Get session info (conversationId, customerApiKey, livekitUrl?, livekitAgentToken?, sessionToken?) without consuming.
 */
export function getSessionInfo(sessionId) {
  const session = sessionTranscripts.get(sessionId);
  if (!session) return null;
  return {
    conversationId: session.conversationId,
    customerApiKey: session.customerApiKey,
    livekitUrl: session.livekitUrl,
    livekitAgentToken: session.livekitAgentToken,
    sessionToken: session.sessionToken
  };
}

/**
 * Get last transcript entry (for deduplication).
 */
export function getLastEntry(sessionId) {
  const session = sessionTranscripts.get(sessionId);
  const entries = session?.entries;
  return entries?.length ? entries[entries.length - 1] : null;
}
