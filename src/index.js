require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sessionsRouter = require('./routes/sessions');
const avatarsRouter = require('./routes/avatars');
const { petyaOriginGate } = require('./middleware/petyaOriginGate');

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const LIVEAVATAR_API_KEY = process.env.LIVEAVATAR_API_KEY;

if (!LIVEAVATAR_API_KEY) {
  console.error('LIVEAVATAR_API_KEY is required. Set it in .env or environment.');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const config = {
  apiKey: LIVEAVATAR_API_KEY,
  mode: (process.env.LIVEAVATAR_MODE || 'LITE').toUpperCase(),
  defaultAvatarId: process.env.LIVEAVATAR_AVATAR_ID || null,
  defaultContextId: process.env.LIVEAVATAR_CONTEXT_ID || null,
  defaultVoiceId: process.env.LIVEAVATAR_VOICE_ID || null,
  defaultLanguage: process.env.LIVEAVATAR_LANGUAGE || 'en',
};
sessionsRouter.init(config);
avatarsRouter.init(config);

// Optional: same Allowed Domains as Petya when clients send Petya X-API-KEY and PETYA_API_BASE_URL is set
app.use('/api', petyaOriginGate);

app.use('/api/sessions', sessionsRouter.router);
app.use('/api/avatars', avatarsRouter.router);

app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`ilianaaiAvatar proxy listening on port ${PORT}`);
});
