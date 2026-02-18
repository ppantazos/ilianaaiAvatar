import http from 'http';
import express from 'express';
import cors from 'cors';
import heygenRoutes from './routes/heygen.js';
import { setupWebSocketProxy } from './proxy/websocket.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Api-Key', 'X-api-key', 'Authorization']
}));

app.use(express.json());

app.use('/', heygenRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ilianaaiavatar' });
});

const server = http.createServer(app);
setupWebSocketProxy(server);

server.listen(PORT, () => {
  console.log(`ilianaaiAvatar running on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/v1/ws/streaming.chat`);
});
