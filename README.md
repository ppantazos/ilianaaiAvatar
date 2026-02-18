# ilianaaiAvatar

Proxy service for Heygen streaming API. Authenticates customers via API key, injects avatar config from Petya, and manages conversation transcripts.

## Architecture

```
chatbot-plugin (browser) → ilianaaiAvatar → Heygen API
                              ↓
                        Petya (config + updateConversationStatus)
```

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

**streaming.new body:** Include `conversation_id` for Petya's `updateConversationStatus`. Example: `{ quality: "medium", version: "v2", conversation_id: "..." }`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HEYGEN_API_KEY` | Heygen API key |
| `HEYGEN_BASE_URL` | Heygen API base (default: https://api.heygen.com) |
| `PETYA_BASE_URL` | Petya backend URL |
| `AVATAR_SERVICE_SECRET` | Shared secret for Petya updateConversationStatus |
| `PORT` | Server port (default: 3000) |
