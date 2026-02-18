import { Router } from 'express';
import { extractApiKey } from '../middleware/auth.js';
import { heygenPost } from '../services/heygen.js';
import { getAvatarConfig, updateConversationStatus } from '../services/petya.js';
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
    const message = err.response?.data || err.message;
    res.status(status).json(typeof message === 'object' ? message : { error: message });
  }
});

/**
 * POST /v1/streaming.new
 * 1. Get avatar config from Petya
 * 2. Forward to Heygen with avatar_id, knowledge_base_id
 * 3. Return Heygen response + intro
 * 4. Store conversation_id ↔ session_id
 */
router.post('/v1/streaming.new', async (req, res) => {
  try {
    const { quality, version, conversation_id } = req.body || {};
    
    const config = await getAvatarConfig(req.customerApiKey);
    const { avatarId, intro, knowledgeBaseId, voiceId } = config;

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
      initSession(sessionId, conversation_id);
    }

    if (intro !== undefined && data?.data) {
      data.data.intro = intro;
    }

    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
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
      if (session?.entries?.length) {
        try {
          await updateConversationStatus(session.conversationId, {
            sessionId,
            status: 'completed',
            transcript: session.entries
          });
        } catch (updateErr) {
          console.error('Failed to update conversation status:', updateErr.message);
        }
      }
    }

    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    res.status(status).json(typeof message === 'object' ? message : { error: message });
  }
});

export default router;
