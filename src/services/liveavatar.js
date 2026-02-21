import axios from 'axios';

const LIVEAVATAR_BASE_URL = process.env.LIVEAVATAR_BASE_URL || 'https://api.liveavatar.com';
const LIVEAVATAR_API_KEY = process.env.LIVEAVATAR_API_KEY;

/**
 * LiveAvatar REST API client. Uses X-API-KEY header.
 * @see https://docs.liveavatar.com/docs/interactive-avatar-migration-guide
 */
function getHeaders(bearerToken) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  } else {
    headers['X-API-KEY'] = LIVEAVATAR_API_KEY;
  }
  return headers;
}

/**
 * Create session token. Combines config from old streaming.new + streaming.create_token.
 * @param {object} body - { mode, avatar_id, avatar_persona?, video_settings?, ... }
 * @returns {Promise<{ session_id, session_token }>}
 */
export async function createSessionToken(body = {}) {
  const url = `${LIVEAVATAR_BASE_URL}/v1/sessions/token`;
  const response = await axios.post(url, body, {
    headers: getHeaders()
  });
  const data = response?.data?.data ?? response?.data;
  return { session_id: data.session_id, session_token: data.session_token };
}

/**
 * Start session. Uses session_token as Bearer. Returns LiveKit connection details.
 * @param {string} sessionToken - From createSessionToken
 * @returns {Promise<{ session_id, livekit_url, livekit_client_token, livekit_agent_token?, ws_url? }>}
 */
export async function startSession(sessionToken) {
  const url = `${LIVEAVATAR_BASE_URL}/v1/sessions/start`;
  const response = await axios.post(url, {}, {
    headers: getHeaders(sessionToken)
  });
  const data = response?.data?.data ?? response?.data;
  return {
    session_id: data.session_id,
    livekit_url: data.livekit_url,
    livekit_client_token: data.livekit_client_token,
    livekit_agent_token: data.livekit_agent_token,
    ws_url: data.ws_url
  };
}

/**
 * Stop session. Uses session_token (Bearer) or X-API-KEY with session_id.
 * @param {string} sessionToken - Session token (preferred) or null
 * @param {string} [sessionId] - Required when not using session_token
 * @param {string} [reason] - USER_DISCONNECTED, IDLE_TIMEOUT, etc.
 */
export async function stopSession(sessionToken, sessionId, reason) {
  const url = `${LIVEAVATAR_BASE_URL}/v1/sessions/stop`;
  const headers = sessionToken ? getHeaders(sessionToken) : getHeaders();
  const body = {};
  if (sessionId) body.session_id = sessionId;
  if (reason) body.reason = reason;
  await axios.post(url, body, { headers });
}

/**
 * List public avatars (for DEFAULT_AVATAR_ID selection).
 */
export async function listPublicAvatars(opts = {}) {
  const url = `${LIVEAVATAR_BASE_URL}/v1/avatars/public`;
  const params = { page: opts.page ?? 1, page_size: opts.page_size ?? 50 };
  const response = await axios.get(url, {
    params,
    headers: getHeaders()
  });
  const data = response?.data?.data ?? response?.data;
  return data?.results ?? [];
}

/**
 * Forward POST request to LiveAvatar with Bearer token from client.
 * Used for /v1/sessions/start when plugin sends Authorization: Bearer <session_token>.
 */
export async function forwardPostToLiveAvatar(path, bearerToken, body = {}) {
  const url = `${LIVEAVATAR_BASE_URL}${path}`;
  const response = await axios.post(url, body, {
    headers: getHeaders(bearerToken)
  });
  return response.data;
}
