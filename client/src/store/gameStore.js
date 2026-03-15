// src/store/gameStore.js
import { create } from 'zustand';

/**
 * Global game state managed by Zustand.
 *
 * phase values:
 *   'menu'   – pre-lobby, show username / join form
 *   'lobby'  – waiting room, player list visible
 *   'game'   – match active, Phaser canvas + HUD visible
 *   'duel'   – card-selection overlay on top of game canvas
 *   'ended'  – match over, results screen
 */
export const useGameStore = create((set, get) => ({

  // ── Connection ──────────────────────────────────────────────────────────
  connected : false,
  myId      : null,
  username  : '',

  // ── Lobby ────────────────────────────────────────────────────────────────
  lobbyId      : null,
  lobbyPlayers : [],   // sanitised player objects (no cards)

  // ── Match ────────────────────────────────────────────────────────────────
  phase       : 'menu',
  players     : {},         // id → sanitisedPlayer
  myCards     : [],         // string[]  (full hand — private)
  myStatus    : 'human',    // 'human' | 'zombie' | 'dead'
  mapSize     : { width: 2400, height: 1800 },
  matchEndTime: null,       // epoch ms
  matchResult : null,       // { winCondition, standings }

  // ── Active duel ──────────────────────────────────────────────────────────
  activeDuel: null,
  /*
   * activeDuel shape:
   * {
   *   duelId          : string,
   *   role            : 'attacker' | 'defender',
   *   opponentId      : string,
   *   opponentUsername: string,
   *   opponentStatus  : 'human' | 'zombie',
   *   yourCards       : string[],
   *   timeLimit       : number,   // ms
   * }
   */

  // ── Combat event log (rolling, max 40 entries) ───────────────────────────
  events: [],

  // ═══════════════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════════════

  setConnected: (connected, myId) => set({ connected, myId }),
  setUsername : (username)        => set({ username }),

  // Called after successful joinLobby
  enterLobby: (lobbyId, players) => set({
    phase       : 'lobby',
    lobbyId,
    lobbyPlayers: players,
  }),

  // Called on subsequent lobbyUpdate events
  updateLobbyPlayers: (players) => set({ lobbyPlayers: players }),

  // Called on matchStarted
  startGame: ({ lobbyId, mapSize, endTime, yourPlayer, players }) => {
    const playersMap = {};
    players.forEach(p => { playersMap[p.id] = p; });
    set({
      phase       : 'game',
      lobbyId,
      mapSize,
      matchEndTime: endTime,
      players     : playersMap,
      myCards     : yourPlayer.cards     || [],
      myStatus    : yourPlayer.status    || 'human',
    });
  },

  // Real-time position updates from other players
  updatePlayerPos: (id, x, y) => set(s => ({
    players: { ...s.players, [id]: { ...s.players[id], x, y } },
  })),

  // Status change (infection / cure)
  updatePlayerStatus: (id, status) => set(s => {
    const updates = {
      players: { ...s.players, [id]: { ...s.players[id], status } },
    };
    if (id === s.myId) updates.myStatus = status;
    return updates;
  }),

  // Mark a player as dead
  eliminatePlayer: (id) => set(s => ({
    players: { ...s.players, [id]: { ...s.players[id], status: 'dead', inDuel: false } },
  })),

  // Server sends updated hand after duel
  setMyCards: (cards) => set({ myCards: cards }),

  // Open the duel overlay
  openDuel: (duelData) => set({ activeDuel: duelData, phase: 'duel' }),

  // Return to game after duel resolves (or times out)
  closeDuel: () => set(s => ({
    activeDuel: null,
    phase      : s.phase === 'duel' ? 'game' : s.phase,
  })),

  // Push an entry to the rolling event log
  addEvent: (event) => set(s => ({
    events: [{ ...event, id: Date.now() + Math.random() }, ...s.events].slice(0, 40),
  })),

  // Match finished
  setMatchResult: (result) => set({ matchResult: result, phase: 'ended' }),

  // Return to menu / lobby
  reset: () => set({
    phase       : 'menu',
    lobbyId     : null,
    lobbyPlayers: [],
    players     : {},
    myCards     : [],
    myStatus    : 'human',
    mapSize     : { width: 2400, height: 1800 },
    matchEndTime: null,
    matchResult : null,
    activeDuel  : null,
    events      : [],
  }),
}));
