# ilianaaiAvatar

LiveAvatar API proxy for the chatbot-plugin. Keeps the LiveAvatar API key server-side and exposes a client-friendly API.

## Setup

1. Copy `.env.example` to `.env`
2. Set `LIVEAVATAR_API_KEY` to your LiveAvatar API key
3. `npm install && npm start`
4. Get a valid avatar ID: `curl http://localhost:3000/api/avatars/public` and use an `id` from the response
5. Set `LIVEAVATAR_AVATAR_ID` in `.env` to that UUID (or configure it in your Petya account config)

**Important:** HeyGen and LiveAvatar are different platforms. HeyGen avatar IDs (e.g. from heygen.ai) do not work with LiveAvatar. You must use avatar IDs from `GET /api/avatars/public`.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/sessions/token` | Create session token |
| `POST /api/sessions/start` | Start session (Bearer token required) |
| `POST /api/sessions/stop` | Stop session |
| `POST /api/sessions/keep-alive` | Extend idle timeout |
| `POST /api/sessions/speak` | 501 in FULL mode (use LiveKit publishData) |
| `GET /api/avatars/public` | List public avatars |

## Environment

- `LIVEAVATAR_API_KEY` (required). Prefer the `lv_` prefix format from the LiveAvatar dashboard; legacy UUID-style keys may cause "Errors validating session token" on start.
- `LIVEAVATAR_MODE` (optional) – `LITE` or `FULL`. Default `LITE` (FULL mode has known session-start issues)
- `LIVEAVATAR_AVATAR_ID` (optional) – default avatar UUID (from `GET /api/avatars/public`)
- `LIVEAVATAR_CONTEXT_ID` (optional) – default context/knowledge base UUID
- `LIVEAVATAR_VOICE_ID` (optional) – default voice UUID
- `LIVEAVATAR_LANGUAGE` (optional) – default language (default: `en`)
- `PORT` (default: 3000)
- `CORS_ORIGIN` (default: * for dev)