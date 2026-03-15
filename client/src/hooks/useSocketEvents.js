// src/hooks/useSocketEvents.js
import { useEffect, useRef } from 'react';
import { getSocket } from '../utils/socket';
import { useGameStore } from '../store/gameStore';

/**
 * Register all server→client socket event handlers.
 * Must be called once at the top level (App.jsx).
 * Handlers are stable across renders — they read from the store directly.
 */
export function useSocketEvents() {
  const store = useGameStore;   // access store without subscribing to re-renders
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    const socket = getSocket();

    // ── Connection state ────────────────────────────────────────────────────
    socket.on('connect', () => {
      store.getState().setConnected(true, socket.id);
    });

    socket.on('disconnect', () => {
      store.getState().setConnected(false, null);
    });

    // ── Lobby ────────────────────────────────────────────────────────────────
    socket.on('lobbyUpdate', ({ matchId, players }) => {
      const state = store.getState();
      if (state.phase === 'menu') {
        state.enterLobby(matchId, players);
      } else {
        state.updateLobbyPlayers(players);
      }
    });

    // ── Match started ────────────────────────────────────────────────────────
    socket.on('matchStarted', (data) => {
      store.getState().startGame(data);
    });

    // ── Real-time movement ───────────────────────────────────────────────────
    socket.on('playerMoved', ({ id, x, y }) => {
      // Ignore own position echoes
      if (id === store.getState().myId) return;
      store.getState().updatePlayerPos(id, x, y);
    });

    // ── Status changes ───────────────────────────────────────────────────────
    socket.on('playerStatusChanged', ({ playerId, status }) => {
      store.getState().updatePlayerStatus(playerId, status);
      store.getState().addEvent({
        type  : 'status',
        playerId,
        status,
        label : status === 'zombie'
          ? `☣ Player infected!`
          : `✚ Player cured!`,
      });
    });

    // ── Duel started ─────────────────────────────────────────────────────────
    socket.on('startDuel', (duelData) => {
      store.getState().openDuel(duelData);
    });

    // ── Duel resolved ────────────────────────────────────────────────────────
    socket.on('duelResolved', ({ duelId, attackerId, defenderId, resolution }) => {
      store.getState().closeDuel();

      // Log each line from the resolution
      resolution.log?.forEach(msg => {
        store.getState().addEvent({ type: 'duel', label: msg });
      });

      // Surface outcome labels
      const outcome = resolution.attackerOutcome === 'dies' || resolution.defenderOutcome === 'dies'
        ? '💀 Player eliminated in duel'
        : resolution.attackerOutcome === 'infected' || resolution.defenderOutcome === 'infected'
          ? '☣ Player infected in duel'
          : resolution.attackerOutcome === 'cured' || resolution.defenderOutcome === 'cured'
            ? '✚ Player cured in duel'
            : '🃏 Duel ended — no effect';

      store.getState().addEvent({ type: 'duelResult', label: outcome });
    });

    // ── Private hand update ──────────────────────────────────────────────────
    socket.on('handUpdated', ({ cards }) => {
      store.getState().setMyCards(cards);
    });

    // ── Elimination ──────────────────────────────────────────────────────────
    socket.on('playerEliminated', ({ playerId, reason }) => {
      store.getState().eliminatePlayer(playerId);
      store.getState().addEvent({
        type : 'eliminated',
        label: reason === 'disconnected'
          ? '🔌 Player disconnected'
          : '💀 Player eliminated',
      });
    });

    // ── Card transfer ────────────────────────────────────────────────────────
    socket.on('cardTransferred', ({ from, to, card }) => {
      const myId = store.getState().myId;
      if (to === myId) {
        store.getState().addEvent({
          type : 'loot',
          label: `🎴 You received a [${card}] card!`,
        });
      } else {
        store.getState().addEvent({
          type : 'loot',
          label: `🎴 Card transferred: ${card}`,
        });
      }
    });

    // ── Match end ────────────────────────────────────────────────────────────
    socket.on('matchEnd', (result) => {
      store.getState().setMatchResult(result);
    });

    // ── Rejoin (after reconnect) ─────────────────────────────────────────────
    socket.on('rejoinData', (data) => {
      if (data.error) {
        console.warn('[rejoin]', data.error);
        return;
      }
      store.getState().startGame({
        lobbyId   : data.matchId,
        mapSize   : data.mapSize   || { width: 2400, height: 1800 },
        endTime   : data.endTime,
        yourPlayer: data.yourPlayer,
        players   : data.players,
      });
    });

    // No cleanup — these listeners are permanent for the app lifecycle
  }, []);
}
