const express = require('express');
const liveAvatar = require('../services/liveAvatarClient');

const router = express.Router();

/** @type {string} */
let apiKey;
/** @type {string|null} */
let defaultAvatarId;
/** @type {string|null} */
let defaultContextId;
/** @type {string|null} */
let defaultVoiceId;
/** @type {string} */
let defaultLanguage;
/** @type {string} */
let defaultMode;

function ensureApiKey() {
  if (!apiKey) {
    throw new Error('LIVEAVATAR_API_KEY is not configured');
  }
}

function getAuthToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return null;
  }
  return auth.slice(7);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPACT_UUID_REGEX = /^[0-9a-f]{32}$/i;

function normalizeUuid(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (UUID_REGEX.test(s)) return s;
  if (COMPACT_UUID_REGEX.test(s)) {
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
  return null;
}

function isValidUuid(value) {
  return normalizeUuid(value) !== null;
}

/**
 * POST /api/sessions/token
 * Creates a LiveAvatar session token.
 */
router.post('/token', express.json(), async (req, res) => {
  ensureApiKey();
  try {
    const { avatar_id, context_id, voice_id, language } = req.body || {};
    // Prefer proxy's env (LIVEAVATAR_AVATAR_ID) when set; client avatar_id is fallback for multi-tenant
    const resolvedAvatarId = defaultAvatarId || (avatar_id && String(avatar_id).trim());
    if (!resolvedAvatarId) {
      return res.status(400).json({
        error: 'avatar_id is required. Send it in the request body or set LIVEAVATAR_AVATAR_ID in the proxy .env.',
      });
    }
    const normalizedAvatarId = normalizeUuid(resolvedAvatarId);
    if (!normalizedAvatarId) {
      return res.status(400).json({
        error: 'avatar_id must be a valid UUID. LiveAvatar requires UUID format (get one from GET /api/avatars/public). HeyGen-style IDs like "Katya_Chair_Sitting_public" are not supported.',
      });
    }
    const clientContextId = normalizeUuid(context_id);
    const clientVoiceId = normalizeUuid(voice_id);
    const resolvedContextId = normalizeUuid(defaultContextId) || clientContextId;
    const resolvedVoiceId = normalizeUuid(defaultVoiceId) || clientVoiceId;
    if (context_id != null && context_id !== '' && !clientContextId) {
      console.warn('[/api/sessions/token] context_id is not a valid UUID, using null:', context_id);
    }
    if (voice_id != null && voice_id !== '' && !clientVoiceId) {
      console.warn('[/api/sessions/token] voice_id is not a valid UUID, using null:', voice_id);
    }
    const data = await liveAvatar.createSessionToken(apiKey, {
      mode: defaultMode,
      avatar_id: normalizedAvatarId,
      context_id: resolvedContextId,
      voice_id: resolvedVoiceId,
      language: (language && String(language).trim()) || defaultLanguage,
    });
    return res.json({
      session_id: data.session_id,
      session_token: data.session_token,
    });
  } catch (err) {
    console.error('[/api/sessions/token]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to create session token' });
  }
});

/**
 * POST /api/sessions/start
 * Starts the LiveAvatar session. Requires Authorization: Bearer <session_token>
 */
router.post('/start', express.json(), async (req, res) => {
  let token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authorization: Bearer <session_token> required' });
  }
  token = token.trim();
  try {
    const data = await liveAvatar.startSession(token);
    return res.status(201).json(data);
  } catch (err) {
    console.error('[/api/sessions/start]', err.message);
    if (err.body) console.error('[/api/sessions/start] LiveAvatar response:', JSON.stringify(err.body));
    return res.status(err.status || 500).json({ error: err.message || 'Failed to start session' });
  }
});

/**
 * POST /api/sessions/stop
 * Stops the LiveAvatar session.
 */
router.post('/stop', express.json(), async (req, res) => {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authorization: Bearer <session_token> required' });
  }
  try {
    const body = req.body || {};
    await liveAvatar.stopSession(token, body);
    return res.json({ success: true });
  } catch (err) {
    console.error('[/api/sessions/stop]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to stop session' });
  }
});

/**
 * POST /api/sessions/keep-alive
 * Extends the session idle timeout.
 */
router.post('/keep-alive', express.json(), async (req, res) => {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authorization: Bearer <session_token> required' });
  }
  try {
    const body = req.body || {};
    await liveAvatar.keepAlive(token, body);
    return res.json({ success: true });
  } catch (err) {
    console.error('[/api/sessions/keep-alive]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to keep session alive' });
  }
});

/**
 * POST /api/sessions/speak
 * For FULL mode: returns 501. Clients use LiveKit publishData instead.
 */
router.post('/speak', express.json(), (_req, res) => {
  return res.status(501).json({
    error: 'Not Implemented for FULL mode. Use LiveKit room.publishData() with topic avatar.speak_text or avatar.speak_response.',
  });
});

function init(config) {
  apiKey = config.apiKey;
  defaultMode = (config.mode || 'LITE').toUpperCase();
  defaultAvatarId = config.defaultAvatarId ?? null;
  defaultContextId = config.defaultContextId ?? null;
  defaultVoiceId = config.defaultVoiceId ?? null;
  defaultLanguage = config.defaultLanguage ?? 'en';
}

module.exports = { router, init };
