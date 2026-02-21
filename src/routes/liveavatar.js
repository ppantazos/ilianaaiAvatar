import { Router } from 'express';
import { extractApiKey } from '../middleware/auth.js';
import {
  createSessionToken,
  startSession,
  stopSession,
  forwardPostToLiveAvatar
} from '../services/liveavatar.js';
import { publishLiveAvatarCommand } from '../services/livekit-publish.js';
import { updateConversationStatusIfConfigured, fetchConversationMessages, postMessage } from '../services/petya.js';
import {
  initSession,
  addUserMessage,
  addAvatarMessage,
  consumeSession,
  getSessionInfo,
  getLastEntry,
  setLiveAvatarCredentials
} from '../services/transcript.js';

const router = Router();

router.use(extractApiKey);

// ─── LiveAvatar native paths (chatbot-plugin expects these) ─────────────────

/**
 * POST /v1/sessions/token
 * Proxy to LiveAvatar create token with Petya config (avatar_id, avatar_persona, conversation context).
 */
router.post('/v1/sessions/token', async (req, res) => {
  try {
    const body = req.body || {};
    const { avatar_id, avatar_persona, conversation_id, quality } = body;

    const avatarId = avatar_id || process.env.DEFAULT_AVATAR_ID;
    const voiceId = avatar_persona?.voice_id || process.env.DEFAULT_VOICE_ID;
    const contextId = avatar_persona?.context_id || process.env.DEFAULT_KNOWLEDGE_BASE_ID;

    if (!avatarId) {
      return res.status(400).json({ error: 'Missing avatar_id', message: 'Set DEFAULT_AVATAR_ID or pass avatar_id' });
    }

    const tokenBody = {
      mode: 'FULL',
      avatar_id: avatarId,
      video_settings: quality ? { quality: quality === 'high' ? 'high' : quality === 'low' ? 'low' : 'medium' } : undefined,
      avatar_persona: Object.fromEntries(
        Object.entries({
          voice_id: voiceId,
          context_id: contextId,
          language: 'en'
        }).filter(([, v]) => v != null && v !== '')
      )
    };
    if (Object.keys(tokenBody.avatar_persona).length === 0) tokenBody.avatar_persona = { language: 'en' };

    if (conversation_id && req.customerApiKey) {
      const messages = await fetchConversationMessages(conversation_id, req.customerApiKey);
      if (messages?.length > 0) {
        const lines = messages.map((m) => {
          const role = m.isFromUser ? 'User' : 'Avatar';
          const text = (m.content || '').trim().slice(0, 500);
          return text ? `${role}: ${text}` : null;
        }).filter(Boolean);
        if (lines.length > 0) {
          console.log('[sessions/token] Conversation history:', { conversationId: conversation_id, messageCount: lines.length });
        }
      }
    }

    const { session_id, session_token } = await createSessionToken(tokenBody);
    initSession(session_id, conversation_id, req.customerApiKey);
    setLiveAvatarCredentials(session_id, { sessionToken: session_token });

    res.json({ data: { session_id, session_token } });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    const message = data || err.message;
    return res.status(status).json(typeof message === 'object' ? message : { error: String(message) });
  }
});

/**
 * POST /v1/sessions/start
 * Forward to LiveAvatar with Authorization: Bearer <session_token>.
 * Stores livekit credentials for streaming.task; returns LiveAvatar response.
 */
router.post('/v1/sessions/start', async (req, res) => {
  try {
    const bearer = req.sessionToken || req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!bearer) {
      return res.status(401).json({ error: 'Missing Authorization: Bearer <session_token>' });
    }

    const data = await forwardPostToLiveAvatar('/v1/sessions/start', bearer, {});
    const sessionId = data?.data?.session_id ?? data?.session_id;

    if (sessionId) {
      setLiveAvatarCredentials(sessionId, {
        livekitUrl: data?.data?.livekit_url ?? data?.livekit_url,
        livekitAgentToken: data?.data?.livekit_agent_token ?? data?.livekit_agent_token,
        sessionToken: bearer
      });
    }

    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    const message = data || err.message;
    return res.status(status).json(typeof message === 'object' ? message : { error: String(message) });
  }
});

/**
 * POST /v1/sessions/stop
 * Forward to LiveAvatar, then call Petya updateConversationStatus.
 */
router.post('/v1/sessions/stop', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = body.session_id;
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();

    try {
      if (bearer) {
        await forwardPostToLiveAvatar('/v1/sessions/stop', bearer, body);
      } else {
        await stopSession(null, sessionId, body.reason);
      }
    } catch (stopErr) {
      console.warn('[sessions/stop] LiveAvatar stop failed:', stopErr.message);
    }

    if (sessionId) {
      const session = consumeSession(sessionId);
      if (session) {
        const roleCounts = (session.entries ?? []).reduce((acc, e) => { acc[e.role] = (acc[e.role] || 0) + 1; return acc; }, {});
        console.log('[sessions/stop] Calling Petya status:', { sessionId, conversationId: session.conversationId, transcriptByRole: roleCounts });
        await updateConversationStatusIfConfigured(session.conversationId, {
          sessionId,
          status: 'completed',
          transcript: session.entries ?? []
        }, session.customerApiKey);
      }
    }

    res.json({ data: { ok: true } });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json(typeof message === 'object' ? message : { error: String(message) });
  }
});

// ─── Legacy streaming.* paths (backward compat) ─────────────────────────────

/**
 * Remove internal repetition (e.g. "Hello. Hello." -> "Hello.")
 */
function dedupeContent(text) {
  const t = (text || '').trim();
  if (t.length < 10) return t;
  const half = Math.floor(t.length / 2);
  const first = t.substring(0, half).trim();
  const second = t.substring(half).trim();
  if (first && second && first === second) return first;
  if (t.length >= 4 && first && t.endsWith(first)) return first;
  return t;
}

/**
 * POST /v1/streaming.user_message
 * Store user message (plugin calls when user.transcription received from LiveKit agent-response).
 * Body: { session_id, text }
 */
router.post('/v1/streaming.user_message', async (req, res) => {
  try {
    const { session_id, text } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
    const content = dedupeContent(text ?? '');
    if (!content || content.length < 2) return res.json({ ok: true });

    const session = getSessionInfo(session_id);
    const lastEntry = getLastEntry(session_id);
    const lastTranscript = lastEntry?.role === 'user' ? dedupeContent(lastEntry?.transcript || '') : '';
    if (lastEntry?.role === 'user') {
      if (lastTranscript === content) return res.json({ ok: true });
      if (lastTranscript.length > content.length && lastTranscript.startsWith(content)) return res.json({ ok: true });
    }

    addUserMessage(session_id, content);
    if (session?.conversationId) {
      await postMessage(session.conversationId, content, true, session.customerApiKey ?? req.customerApiKey);
    }
    return res.json({ ok: true });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json(typeof message === 'object' ? { error: message } : { error: String(message) });
  }
});

/**
 * POST /v1/streaming.avatar_message
 * Store avatar message (plugin calls when avatar.transcription received from LiveKit agent-response).
 * Body: { session_id, text }
 */
router.post('/v1/streaming.avatar_message', async (req, res) => {
  try {
    const { session_id, text } = req.body || {};
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }
    const rawContent = (text ?? '').trim();
    const content = dedupeContent(rawContent);

    if (!content || content === '?' || content.length < 2) {
      console.warn('[streaming.avatar_message] Skipping placeholder or empty content');
      return res.json({ ok: true });
    }

    const session = getSessionInfo(session_id);
    const lastEntry = getLastEntry(session_id);
    const lastTranscript = lastEntry?.role === 'avatar' ? dedupeContent(lastEntry?.transcript || '') : '';
    if (lastEntry?.role === 'avatar') {
      if (lastTranscript === content) return res.json({ ok: true });
      if (lastTranscript.length > content.length && lastTranscript.startsWith(content)) {
        if (process.env.DEBUG_TRANSCRIPT) console.log('[streaming.avatar_message] Skipping shorter duplicate');
        return res.json({ ok: true });
      }
    }

    addAvatarMessage(session_id, content);
    if (session?.conversationId) {
      await postMessage(session.conversationId, content, false, session.customerApiKey ?? req.customerApiKey);
    }

    return res.json({ ok: true });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json(typeof message === 'object' ? { error: message } : { error: String(message) });
  }
});

/**
 * POST /v1/streaming.create_token
 * LiveAvatar: Create session token (minimal). Use streaming.new for full config.
 */
router.post('/v1/streaming.create_token', async (req, res) => {
  try {
    const body = req.body || {};
    const avatarId = body.avatar_id || process.env.DEFAULT_AVATAR_ID;
    if (!avatarId) {
      return res.status(400).json({ error: 'Missing avatar_id', message: 'Set DEFAULT_AVATAR_ID or pass avatar_id' });
    }
    const { session_id, session_token } = await createSessionToken({
      mode: 'FULL',
      avatar_id: avatarId
    });
    res.json({ data: { session_id, session_token } });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    const message = data || err.message;
    return res.status(status).json(typeof message === 'object' ? message : { error: String(message) });
  }
});

/**
 * POST /v1/streaming.new
 * LiveAvatar: Create session token with full config + optionally start.
 * Maps: knowledge_base → context_id, voice_id → avatar_persona.voice_id
 */
router.post('/v1/streaming.new', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      quality,
      conversation_id,
      avatar_id,
      knowledge_base_id,
      knowledge_base,
      voice_id,
      intro
    } = body;

    const avatarId = avatar_id || process.env.DEFAULT_AVATAR_ID;
    const contextId = knowledge_base_id || process.env.DEFAULT_KNOWLEDGE_BASE_ID;
    const voiceId = voice_id || process.env.DEFAULT_VOICE_ID;

    if (!avatarId) {
      return res.status(400).json({
        error: 'Missing avatar_id',
        message: 'Provide avatar_id or set DEFAULT_AVATAR_ID in .env'
      });
    }

    const tokenBody = {
      mode: 'FULL',
      avatar_id: avatarId,
      video_settings: quality ? { quality: quality === 'high' ? 'high' : quality === 'low' ? 'low' : 'medium' } : undefined,
      avatar_persona: {
        voice_id: voiceId || null,
        context_id: contextId || null,
        language: 'en'
      }
    };

    if (conversation_id && req.customerApiKey) {
      const messages = await fetchConversationMessages(conversation_id, req.customerApiKey);
      if (messages?.length > 0) {
        const lines = messages.map((m) => {
          const role = m.isFromUser ? 'User' : 'Avatar';
          const text = (m.content || '').trim().slice(0, 500);
          return text ? `${role}: ${text}` : null;
        }).filter(Boolean);
        if (lines.length > 0) {
          console.log('[streaming.new] Conversation history available (use context_id for LiveAvatar):', { conversationId: conversation_id, messageCount: lines.length });
        }
      }
    }
    tokenBody.avatar_persona = Object.fromEntries(
      Object.entries(tokenBody.avatar_persona).filter(([, v]) => v != null && v !== '')
    );
    if (Object.keys(tokenBody.avatar_persona).length === 0) {
      tokenBody.avatar_persona = { language: 'en' };
    }

    const { session_id, session_token } = await createSessionToken(tokenBody);
    initSession(session_id, conversation_id, req.customerApiKey);
    setLiveAvatarCredentials(session_id, { sessionToken: session_token });

    const response = {
      data: {
        session_id,
        session_token,
        intro: intro !== undefined ? intro : process.env.DEFAULT_INTRO
      }
    };

    res.json(response);
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    const message = data || err.message;
    return res.status(status).json(typeof message === 'object' ? message : { error: String(message) });
  }
});

/**
 * POST /v1/streaming.start
 * LiveAvatar: Start session with stored token, returns LiveKit credentials.
 */
router.post('/v1/streaming.start', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = body.session_id;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const session = getSessionInfo(sessionId);
    const sessionToken = session?.sessionToken || session?.session_token;
    if (!sessionToken) {
      return res.status(400).json({
        error: 'Session not initialized',
        message: 'Call streaming.new first to create the session'
      });
    }

    const data = await startSession(sessionToken);
    setLiveAvatarCredentials(sessionId, {
      livekitUrl: data.livekit_url,
      livekitAgentToken: data.livekit_agent_token,
      sessionToken
    });

    res.json({
      data: {
        session_id: data.session_id,
        url: data.livekit_url,
        access_token: data.livekit_client_token,
        livekit_url: data.livekit_url,
        livekit_client_token: data.livekit_client_token
      }
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    const message = data || err.message;
    return res.status(status).json(typeof message === 'object' ? message : { error: String(message) });
  }
});

/**
 * POST /v1/streaming.task
 * LiveAvatar: Publish command to agent-control topic instead of REST.
 * talk/chat → avatar.speak_response, repeat → avatar.speak_text
 */
router.post('/v1/streaming.task', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = body.session_id;
    const text = (body.text ?? body.transcript ?? '').trim();
    const taskType = (body.task_type || 'talk').toLowerCase();

    if (!sessionId || !text) {
      return res.status(400).json({ error: 'Missing session_id or text' });
    }

    const session = getSessionInfo(sessionId);
    if (taskType === 'talk' || taskType === 'chat') {
      const lastEntry = getLastEntry(sessionId);
      const lastTranscript = lastEntry?.role === 'user' ? dedupeContent(lastEntry?.transcript || '') : '';
      const content = dedupeContent(text);
      const isDup = lastEntry?.role === 'user' && (lastTranscript === content || (lastTranscript.length > content.length && lastTranscript.startsWith(content)));
      if (!isDup) {
        if (session?.conversationId) {
          await postMessage(session.conversationId, content, true, session.customerApiKey);
        }
        addUserMessage(sessionId, content);
      }
    }

    const eventType = (taskType === 'repeat') ? 'avatar.speak_text' : 'avatar.speak_response';
    const ok = await publishLiveAvatarCommand(sessionId, eventType, { text });

    if (!ok) {
      return res.status(502).json({ error: 'Failed to send command to LiveAvatar session' });
    }

    if (taskType === 'repeat' && session?.conversationId) {
      await postMessage(session.conversationId, text, false, session.customerApiKey);
    }
    if (taskType === 'repeat') {
      addAvatarMessage(sessionId, text);
    }

    res.json({ data: { ok: true } });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json(typeof message === 'object' ? message : { error: String(message) });
  }
});

/**
 * POST /v1/streaming.stop
 * LiveAvatar: Stop session.
 */
router.post('/v1/streaming.stop', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = body.session_id;

    const session = consumeSession(sessionId);
    const sessionToken = session?.sessionToken || session?.session_token;

    try {
      if (sessionToken) {
        await stopSession(sessionToken, null);
      } else if (sessionId) {
        await stopSession(null, sessionId);
      }
    } catch (stopErr) {
      console.warn('[streaming.stop] LiveAvatar stopSession failed:', stopErr.message);
    }

    if (session) {
      const roleCounts = (session.entries ?? []).reduce((acc, e) => { acc[e.role] = (acc[e.role] || 0) + 1; return acc; }, {});
      console.log('[streaming.stop] Calling Petya status:', { sessionId, conversationId: session.conversationId, transcriptByRole: roleCounts });
      await updateConversationStatusIfConfigured(session.conversationId, {
        sessionId,
        status: 'completed',
        transcript: session.entries ?? []
      }, session.customerApiKey);
    }

    res.json({ data: { ok: true } });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json(typeof message === 'object' ? message : { error: String(message) });
  }
});

export default router;
