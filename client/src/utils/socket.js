// src/utils/socket.js
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

let socket = null;

/**
 * Return the singleton socket instance (created lazily).
 * Does NOT auto-connect — call connectSocket() for that.
 */
export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports : ['websocket', 'polling'],
      reconnection      : true,
      reconnectionDelay : 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect',       () => console.log('[WS] connected :', socket.id));
    socket.on('disconnect',    r  => console.log('[WS] disconnected:', r));
    socket.on('connect_error', e  => console.warn('[WS] error:', e.message));
  }
  return socket;
}

/** Connect and return the socket. */
export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

/** Disconnect if currently connected. */
export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
