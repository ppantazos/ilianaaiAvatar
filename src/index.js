/**
 * ilianaaiAvatar - LiveAvatar API Proxy
 * Keeps API key server-side and exposes client-friendly endpoints
 */
const express = require('express');
const cors = require('cors');

const LIVEAVATAR_BASE = 'https://api.liveavatar.com';
const apiKey = process.env.LIVEAVATAR_API_KEY;
const port = process.env.PORT || 3000;
const corsOrigin = process.env.CORS_ORIGIN || '*';

if (!apiKey) {
  console.error('LIVEAVATAR_API_KEY environment variable is required');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

async function liveAvatarFetch(path, options = {}) {
  const url = `${LIVEAVATAR_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-API-KEY': apiKey,
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

// POST /api/sessions/token
app.post('/api/sessions/token', async (req, res) => {
  try {
    const { avatar_id, context_id, voice_id, language = 'en' } = req.body;
    if (!avatar_id) {
      return res.status(400).json({ error: 'avatar_id is required' });
    }
    const payload = {
      mode: 'FULL',
      avatar_id,
      avatar_persona: {
        language,
        ...(context_id && { context_id }),
        ...(voice_id && { voice_id }),
      },
    };
    const { status, data } = await liveAvatarFetch('/v1/sessions/token', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (status !== 200) {
      return res.status(status).json(data || { error: 'LiveAvatar API error' });
    }
    const tokenData = data?.data;
    if (!tokenData?.session_id || !tokenData?.session_token) {
      return res.status(500).json({ error: 'Invalid LiveAvatar token response' });
    }
    return res.json({
      session_id: tokenData.session_id,
      session_token: tokenData.session_token,
    });
  } catch (err) {
    console.error('Token error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/sessions/start
app.post('/api/sessions/start', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization: Bearer <session_token> required' });
    }
    const token = auth.slice(7);
    const { status, data } = await liveAvatarFetch('/v1/sessions/start', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (status !== 201) {
      return res.status(status).json(data || { error: 'LiveAvatar API error' });
    }
    const sessionData = data?.data;
    if (!sessionData?.livekit_url || !sessionData?.livekit_client_token) {
      return res.status(500).json({ error: 'Invalid LiveAvatar start response' });
    }
    return res.status(201).json({
      session_id: sessionData.session_id,
      livekit_url: sessionData.livekit_url,
      livekit_client_token: sessionData.livekit_client_token,
      ws_url: sessionData.ws_url || null,
    });
  } catch (err) {
    console.error('Start error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/sessions/stop
app.post('/api/sessions/stop', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization: Bearer <session_token> required' });
    }
    const token = auth.slice(7);
    const { status, data } = await liveAvatarFetch('/v1/sessions/stop', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(req.body || {}),
    });
    if (status !== 200) {
      return res.status(status).json(data || { error: 'LiveAvatar API error' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Stop error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/sessions/keep-alive
app.post('/api/sessions/keep-alive', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization: Bearer <session_token> required' });
    }
    const token = auth.slice(7);
    const { status, data } = await liveAvatarFetch('/v1/sessions/keep-alive', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(req.body || {}),
    });
    if (status !== 200) {
      return res.status(status).json(data || { error: 'LiveAvatar API error' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Keep-alive error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/avatars/public
app.get('/api/avatars/public', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = qs ? `/v1/avatars/public?${qs}` : '/v1/avatars/public';
    const { status, data } = await liveAvatarFetch(path);
    if (status !== 200) {
      return res.status(status).json(data || { error: 'LiveAvatar API error' });
    }
    return res.json(data || {});
  } catch (err) {
    console.error('Avatars error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'ilianaaiavatar' });
});

app.listen(port, () => {
  console.log(`ilianaaiavatar listening on port ${port}`);
});
