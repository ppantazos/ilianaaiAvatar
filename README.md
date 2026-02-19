# ilianaaiAvatar

Proxy service for Heygen streaming API. Authenticates customers via API key, injects avatar config from Petya, and manages conversation transcripts.

## Architecture

```
chatbot-plugin (browser) → ilianaaiAvatar → Heygen API
                              ↓
                        Petya (optional: updateConversationStatus)
```

Avatar config comes from the **client** (avatar_id in request body) or **env vars** (DEFAULT_AVATAR_ID). No Petya dependency for config.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with HEYGEN_API_KEY, PETYA_BASE_URL, AVATAR_SERVICE_SECRET
```

## Run

```bash
npm start
# or with auto-reload:
npm run dev
```

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/streaming.create_token` | Create Heygen session token |
| POST | `/v1/streaming.new` | Create session (injects avatar config from Petya) |
| POST | `/v1/streaming.start` | Start streaming |
| POST | `/v1/streaming.task` | Send user message to avatar |
| POST | `/v1/streaming.stop` | Stop session, persist transcript |
| WS | `/v1/ws/streaming.chat` | WebSocket proxy for streaming chat |

**Authentication:** All requests require `X-Api-Key` or `Authorization: Bearer <key>` with the customer API key.

**streaming.new body:** `{ quality, version, conversation_id?, avatar_id?, knowledge_base_id?, voice_id?, intro? }`. Pass `avatar_id` (or set DEFAULT_AVATAR_ID in .env).

## Chatbot-Plugin Integration

- **API Contract:** See `CHATBOT-PLUGIN-API-CONTRACT.md` (in your docs) for exact request/response formats.
- **Local Testing:** See `LOCAL-TESTING-CHECKLIST.md` for setup and verification steps.
- **WordPress:** Avatar Service URL = `http://localhost:3000` (local) or your deployed URL. No trailing slash.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HEYGEN_API_KEY` | Heygen API key |
| `HEYGEN_BASE_URL` | Heygen API base (default: https://api.heygen.com) |
| `DEFAULT_AVATAR_ID` | Heygen avatar ID used when client doesn't send avatar_id (required for streaming.new) |
| `DEFAULT_KNOWLEDGE_BASE_ID` | Optional. Heygen knowledge base ID |
| `DEFAULT_INTRO` | Optional. Greeting text for client |
| `PETYA_BASE_URL` | Optional. Petya backend URL for updateConversationStatus. Omit for isolated mode |
| `AVATAR_SERVICE_SECRET` | Optional. Shared secret for Petya. Required only when PETYA_BASE_URL is set |
| `PORT` | Server port (default: 3000) |

When calling Petya's status endpoint, ilianaaiAvatar sends both `X-Avatar-Service-Secret` and `X-Api-Key` (customer key from the session) so Petya can upsert conversations.

**ilianaaiAvatar does not write to MongoDB.** All conversation creation/updates go through Petya's `POST /api/v1/avatar/conversations/:id/status` endpoint.
