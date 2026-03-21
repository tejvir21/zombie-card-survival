'use strict';
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const mongoose   = require('mongoose');
const path       = require('path');

const { registerSocketHandlers } = require('./socket/handlers');
const matchRouter       = require('./routes/match');
const leaderboardRouter = require('./routes/leaderboard');

// ─── App + HTTP server ────────────────────────────────────────────────────────
const app        = express();
const httpServer = http.createServer(app);

// ─── Socket.io ────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin     : process.env.CLIENT_URL || 'http://localhost:5173',
    methods    : ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout : 60000,
  pingInterval: 25000,
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin     : process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, 'public');
  app.use(express.static(clientBuild));
  app.get('*', (_req, res) =>
    res.sendFile(path.join(clientBuild, 'index.html'))
  );
}

// ─── REST routes ──────────────────────────────────────────────────────────────
app.use('/api/matches',     matchRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── Socket handlers ──────────────────────────────────────────────────────────
registerSocketHandlers(io);

// ─── MongoDB ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zombie-card-survival';
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('[DB]  MongoDB connected →', MONGO_URI))
  .catch(err  => console.error('[DB]  Connection error:', err.message));

mongoose.connection.on('disconnected', () => console.warn('[DB]  Disconnected'));
mongoose.connection.on('reconnected',  () => console.log ('[DB]  Reconnected'));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`[SRV] Server listening on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SRV] SIGTERM received — shutting down');
  httpServer.close(() => {
    mongoose.connection.close(false, () => process.exit(0));
  });
});

module.exports = { app, io };
