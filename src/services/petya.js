import axios from 'axios';

const PETYA_BASE_URL = process.env.PETYA_BASE_URL;
const AVATAR_SERVICE_SECRET = process.env.AVATAR_SERVICE_SECRET;

const isPetyaConfigured = () => PETYA_BASE_URL && AVATAR_SERVICE_SECRET;

/**
 * Calculate duration in seconds from transcript timestamps.
 * @param {Array} transcript - [{ role, transcript, timestamp }, ...]
 * @returns {number|null} Duration in seconds, or null if not calculable
 */
function calculateDuration(transcript) {
  if (!Array.isArray(transcript) || transcript.length < 2) return null;
  const timestamps = transcript.map((e) => e.timestamp).filter((t) => typeof t === 'number');
  if (timestamps.length < 2) return null;
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return Math.max(0, Math.round(max - min));
}

/**
 * Update conversation status when session ends.
 * Only calls Petya if PETYA_BASE_URL and AVATAR_SERVICE_SECRET are set.
 * Sends X-Api-Key when provided so Petya can upsert (create if missing).
 * @param {string} conversationId - Conversation ID
 * @param {object} body - { sessionId, status, transcript }
 * @param {string} [customerApiKey] - Customer API key (for Petya upsert)
 */
export async function updateConversationStatusIfConfigured(conversationId, body, customerApiKey) {
  // Validation & config check
  if (!isPetyaConfigured()) {
    console.log('[Petya] SKIP: Not configured (missing PETYA_BASE_URL or AVATAR_SERVICE_SECRET)');
    return;
  }

  const sessionId = body?.sessionId;
  const transcript = body?.transcript;

  if (!conversationId || !sessionId) {
    console.warn('[Petya] SKIP: Missing conversationId or sessionId', { conversationId, sessionId });
    return;
  }

  if (!Array.isArray(transcript)) {
    console.warn('[Petya] SKIP: transcript must be an array', { type: typeof transcript });
    return;
  }

  if (!customerApiKey) {
    console.warn('[Petya] WARN: No customerApiKey — Petya may not upsert new conversations');
  }

  const duration = calculateDuration(transcript);
  const payload = {
    sessionId,
    status: body?.status || 'completed',
    transcript,
    ...(duration != null && { duration })
  };

  const url = `${PETYA_BASE_URL}/api/v1/avatar/conversations/${conversationId}/status`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Avatar-Service-Secret': AVATAR_SERVICE_SECRET
  };
  if (customerApiKey) {
    headers['X-Api-Key'] = String(customerApiKey).trim();
  }

  console.log('[Petya] Calling:', url);
  if (customerApiKey) {
    console.log('[Petya] X-Api-Key:', customerApiKey.substring(0, 8) + '... (forwarded from session)');
  }
  console.log('[Petya] Payload:', { conversationId, sessionId, status: payload.status, transcriptCount: transcript?.length, duration: payload.duration });

  try {
    const response = await axios.post(url, payload, { headers });
    console.log('[Petya] SUCCESS:', response.status, response.data);
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const isNetworkError = !err.response;
    console.error('[Petya] FAILED:', isNetworkError ? err.message : status, isNetworkError ? `(code: ${err.code})` : '');
    if (data) {
      console.error('[Petya] Response body:', JSON.stringify(data, null, 2));
    }
  }
}
