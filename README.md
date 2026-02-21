# ilianaaiAvatar

Proxy server for LiveAvatar API. Keeps the LiveAvatar API key server-side and exposes a client-friendly API for the chatbot-plugin.

## Setup

1. Install dependencies: `npm install`
2. Set environment variable: `LIVEAVATAR_API_KEY=<your-liveavatar-api-key>`
3. Start: `npm start`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEAVATAR_API_KEY` | Yes | LiveAvatar API key |
| `PORT` | No | Server port (default: 3000) |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `*`) |

## API Documentation

See [ILIANAAIAVATAR_ENDPOINTS.md](../chatbot-plugin/ILIANAAIAVATAR_ENDPOINTS.md) in the chatbot-plugin repo for full endpoint specifications.
