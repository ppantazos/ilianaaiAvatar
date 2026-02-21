import { Router } from 'express';
import { extractApiKey } from '../middleware/auth.js';
import { heygenPost } from '../services/heygen.js';
import { updateConversationStatusIfConfigured, fetchConversationMessages, postMessage } from '../services/petya.js';
import {
  initSession,
  addUserMessage,
  addAvatarMessage,
  consumeSession,
  getSessionInfo,
  getLastEntry
} from '../services/transcript.js';

const router = Router();

router.use(extractApiKey);

/**
 * POST /v1/streaming.avatar_message
 * Store avatar message (plugin calls when avatar_end_message received from LiveKit).
 * Body: { session_id, text }
 */
router.post('/v1/streaming.avatar_message', async (req, res) => {
  try {
    const { session_id, text } = req.body || {};
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }
    const content = (text ?? '').trim();
    if (!content) {
      return res.status(400).json({ error: 'Missing text' });
    }

    // Skip placeholder/failed extraction (e.g. plugin sends "?" when text is missing)
    if (content === '?' || content.length < 2) {
      console.warn('[streaming.avatar_message] Skipping placeholder content:', JSON.stringify(content), '- plugin should fix text extraction from avatar_end_message');
      return res.json({ ok: true });
    }

    // Skip duplicate: same as last avatar entry
    const session = getSessionInfo(session_id);
    const lastEntry = getLastEntry(session_id);
    if (lastEntry?.role === 'avatar' && lastEntry?.transcript === content) {
      console.log('[streaming.avatar_message] Skipping duplicate');
      return res.json({ ok: true });
    }

    console.log('[streaming.avatar_message] Storing', { sessionId: session_id, textPreview: content.substring(0, 60) });
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
 * Forward to Heygen; return token.
 */
router.post('/v1/streaming.create_token', async (req, res) => {
  try {
    const body = req.body || {};
    const data = await heygenPost('/v1/streaming.create_token', body);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    const message = data || err.message;
    const body = typeof message === 'object' ? message : { error: message };
    // If Heygen returns 401 (e.g. code 400112), add a hint
    if (status === 401 && data?.code === 400112) {
      body._hint = 'This 401 is from Heygen — check HEYGEN_API_KEY in .env';
    }
    res.status(status).json(body);
  }
});

/**
 * POST /v1/streaming.new
 * Avatar config from: (1) request body, (2) env vars. No Petya dependency.
 * Forward to Heygen with avatar_id, knowledge_base_id, etc.
 */
router.post('/v1/streaming.new', async (req, res) => {
  try {
    const body = req.body || {};
    const { quality, version, conversation_id, avatar_id, knowledge_base_id, knowledge_base, voice_id, intro } = body;

    // Avatar config: client first, then env defaults
    const avatarId = avatar_id || process.env.DEFAULT_AVATAR_ID;
    const knowledgeBaseId = knowledge_base_id || process.env.DEFAULT_KNOWLEDGE_BASE_ID;
    const voiceId = voice_id || process.env.DEFAULT_VOICE_ID;
    const introText = intro !== undefined ? intro : process.env.DEFAULT_INTRO;

    if (!avatarId) {
      return res.status(400).json({
        error: 'Missing avatar_id',
        message: 'Provide avatar_id in request body or set DEFAULT_AVATAR_ID in .env'
      });
    }

    // Fetch conversation history from Petya so avatar retains context
    let historyPrefix = '';
    if (conversation_id && req.customerApiKey) {
      const messages = await fetchConversationMessages(conversation_id, req.customerApiKey);
      if (messages?.length > 0) {
        const lines = messages.map((m) => {
          const role = m.isFromUser ? 'User' : 'Avatar';
          const text = (m.content || '').trim().slice(0, 500);
          return text ? `${role}: ${text}` : null;
        }).filter(Boolean);
        if (lines.length > 0) {
          historyPrefix = `Previous conversation:\n${lines.join('\n')}\n\n`;
          console.log('[streaming.new] Injected conversation history:', { conversationId: conversation_id, messageCount: lines.length });
        }
      }
    }

    const baseKnowledge = (knowledge_base || '').trim();
    const knowledgeBaseValue = historyPrefix ? historyPrefix + baseKnowledge : baseKnowledge || undefined;

    const heygenBody = {
      quality: quality || 'medium',
      version: version || 'v2',
      avatar_id: avatarId,
      ...(knowledgeBaseId && { knowledge_base_id: knowledgeBaseId }),
      ...(knowledgeBaseValue && { knowledge_base: knowledgeBaseValue }),
      ...(voiceId && { voice_id: voiceId })
    };

    const data = await heygenPost('/v1/streaming.new', heygenBody);

    const sessionId = data?.data?.session_id;
    if (sessionId) {
      initSession(sessionId, conversation_id, req.customerApiKey);
    }

    if (introText !== undefined && data?.data) {
      data.data.intro = introText;
    }

    // Optional: rewrite url so client connects via our proxy (set REWRITE_WS_URL=1 to enable)
    // WARNING: Only use if client uses streaming.chat protocol. LiveKit clients need the original url.
    if (process.env.REWRITE_WS_URL === '1' && sessionId && data?.data?.url && data?.data?.access_token) {
      const origUrl = data.data.url;
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
      const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${process.env.PORT || 3000}`;
      data.data.url = `${protocol}://${host}/v1/ws/streaming.chat?session_id=${encodeURIComponent(sessionId)}&session_token=${encodeURIComponent(data.data.access_token)}`;
      console.log('[streaming.new] Rewrote url for proxy', { sessionId, orig: origUrl.substring(0, 50) + '...' });
    }

    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    const message = data || err.message;
    res.status(status).json(typeof message === 'object' ? message : { error: message });
  }
});

/**
 * POST /v1/streaming.start
 * Forward to Heygen.
 */
router.post('/v1/streaming.start', async (req, res) => {
  try {
    const data = await heygenPost('/v1/streaming.start', req.body || {});
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    res.status(status).json(typeof message === 'object' ? message : { error: message });
  }
});

/**
 * POST /v1/streaming.task
 * - User messages (talk/chat): store in Petya BEFORE sending to Heygen, then forward
 * - Avatar messages (repeat): collect for transcript; forward to Heygen
 */
router.post('/v1/streaming.task', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = body.session_id;
    const text = body.text ?? body.transcript;
    const taskType = (body.task_type || '').toLowerCase();

    if (sessionId && text) {
      const session = getSessionInfo(sessionId);
      if (taskType === 'talk' || taskType === 'chat') {
        // Store user message in Petya BEFORE sending to Heygen
        if (session?.conversationId) {
          await postMessage(session.conversationId, text, true, session.customerApiKey);
        }
        addUserMessage(sessionId, text);
      } else if (taskType === 'repeat') {
        // Avatar response (client sends LLM output): store in Petya immediately
        if (session?.conversationId) {
          await postMessage(session.conversationId, text, false, session.customerApiKey);
        }
        addAvatarMessage(sessionId, text);
      }
    }

    const data = await heygenPost('/v1/streaming.task', body);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    res.status(status).json(typeof message === 'object' ? message : { error: message });
  }
});

/**
 * POST /v1/streaming.stop
 * Forward to Heygen, build transcript, call updateConversationStatus, cleanup.
 */
router.post('/v1/streaming.stop', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = body.session_id;

    const data = await heygenPost('/v1/streaming.stop', body);

    if (sessionId) {
      const session = consumeSession(sessionId);
      if (!session) {
        console.warn('[streaming.stop] No session found for sessionId:', sessionId);
      } else {
        const roleCounts = (session.entries ?? []).reduce((acc, e) => { acc[e.role] = (acc[e.role] || 0) + 1; return acc; }, {});
        console.log('[streaming.stop] Calling Petya status:', { sessionId, conversationId: session.conversationId, transcriptByRole: roleCounts });
        await updateConversationStatusIfConfigured(session.conversationId, {
          sessionId,
          status: 'completed',
          transcript: session.entries ?? []
        }, session.customerApiKey);
      }
    } else {
      console.warn('[streaming.stop] No session_id in request body');
    }

    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    res.status(status).json(typeof message === 'object' ? message : { error: message });
  }
});

export default router;
