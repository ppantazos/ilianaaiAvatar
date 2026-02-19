import { Router } from 'express';
import { extractApiKey } from '../middleware/auth.js';
import { heygenPost } from '../services/heygen.js';
import { updateConversationStatusIfConfigured } from '../services/petya.js';
import {
  initSession,
  addUserMessage,
  consumeSession
} from '../services/transcript.js';

const router = Router();

router.use(extractApiKey);

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
    const { quality, version, conversation_id, avatar_id, knowledge_base_id, voice_id, intro } = body;

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

    const heygenBody = {
      quality: quality || 'medium',
      version: version || 'v2',
      avatar_id: avatarId,
      ...(knowledgeBaseId && { knowledge_base_id: knowledgeBaseId }),
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
 * Forward to Heygen; collect user text for transcript.
 * Only task_type "talk" is a user message; "repeat" is avatar speaking (from WebSocket).
 */
router.post('/v1/streaming.task', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = body.session_id;
    const text = body.text ?? body.transcript;
    const taskType = body.task_type;

    if (sessionId && text && taskType === 'talk') {
      addUserMessage(sessionId, text);
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
      } else if (!session.entries?.length) {
        console.log('[streaming.stop] Session has no transcript entries, skipping Petya', { sessionId, conversationId: session.conversationId });
      } else {
        console.log('[streaming.stop] Persisting to Petya:', { sessionId, conversationId: session.conversationId, entries: session.entries.length });
        await updateConversationStatusIfConfigured(session.conversationId, {
          sessionId,
          status: 'completed',
          transcript: session.entries
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
