/**
 * LiveAvatar API client - forwards requests to api.liveavatar.com
 */

const LIVEAVATAR_BASE = 'https://api.liveavatar.com/v1';

/**
 * @param {string} apiKey - LIVEAVATAR_API_KEY
 * @param {string} [sessionToken] - Bearer token for session-scoped requests
 */
function getHeaders(apiKey, sessionToken = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else {
    headers['X-API-KEY'] = apiKey;
  }
  return headers;
}

/**
 * Create session token
 * @param {string} apiKey
 * @param {{ avatar_id: string, context_id?: string|null, voice_id?: string|null, language?: string, mode?: string }} body
 * @returns {Promise<{ session_id: string, session_token: string }>}
 */
async function createSessionToken(apiKey, body) {
  const avatarId = String(body.avatar_id || '').trim();
  const mode = (body.mode || 'FULL').toUpperCase();
  const payload = {
    mode,
    avatar_id: avatarId,
  };
  if (mode === 'FULL') {
    payload.avatar_persona = {
      voice_id: body.voice_id || null,
      context_id: body.context_id || null,
      language: body.language || 'en',
    };
  }

  if (process.env.DEBUG) {
    console.log('[LiveAvatar] Creating token with payload:', JSON.stringify(payload, null, 2));
  }

  const res = await fetch(`${LIVEAVATAR_BASE}/sessions/token`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.detail || json.message || JSON.stringify(json) || `LiveAvatar error ${res.status}`);
  }
  return json.data || json;
}

/**
 * Start session
 * @param {string} sessionToken
 * @returns {Promise<{ session_id: string, livekit_url: string, livekit_client_token: string, ws_url?: string|null }>}
 */
async function startSession(sessionToken) {
  const res = await fetch(`${LIVEAVATAR_BASE}/sessions/start`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${sessionToken.trim()}`,
    },
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json.detail || json.message || (Array.isArray(json.errors) ? json.errors.join('; ') : null) || JSON.stringify(json);
    const err = new Error(msg || `LiveAvatar error ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json.data || json;
}

/**
 * Stop session
 * @param {string} sessionToken
 * @param {{ session_id?: string|null, reason?: string }} [body]
 */
async function stopSession(sessionToken, body = {}) {
  const res = await fetch(`${LIVEAVATAR_BASE}/sessions/stop`, {
    method: 'POST',
    headers: getHeaders(null, sessionToken),
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.detail || json.message || JSON.stringify(json) || `LiveAvatar error ${res.status}`);
  }
  return json.data || json;
}

/**
 * Keep session alive
 * @param {string} sessionToken
 * @param {{ session_id?: string|null }} [body]
 */
async function keepAlive(sessionToken, body = {}) {
  const res = await fetch(`${LIVEAVATAR_BASE}/sessions/keep-alive`, {
    method: 'POST',
    headers: getHeaders(null, sessionToken),
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.detail || json.message || JSON.stringify(json) || `LiveAvatar error ${res.status}`);
  }
  return json.data || json;
}

/**
 * List public avatars
 * @param {string} apiKey
 * @param {{ page?: number, page_size?: number }} [params]
 */
async function listPublicAvatars(apiKey, params = {}) {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set('page', String(params.page));
  if (params.page_size != null) searchParams.set('page_size', String(params.page_size));
  const qs = searchParams.toString();
  const url = `${LIVEAVATAR_BASE}/avatars/public${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: getHeaders(apiKey),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.detail || json.message || JSON.stringify(json) || `LiveAvatar error ${res.status}`);
  }
  return json.data || json;
}

module.exports = {
  createSessionToken,
  startSession,
  stopSession,
  keepAlive,
  listPublicAvatars,
};
