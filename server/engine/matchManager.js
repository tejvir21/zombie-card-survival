'use strict';
/**
 * server/engine/matchManager.js
 *
 * In-memory match state manager.
 * All active matches are held in `activeMatches` Map.
 * Socket→match lookup is held in `playerMatchMap` Map.
 *
 * This module is pure state + logic; it never calls io directly —
 * it returns data for the socket handler to broadcast.
 */

const { v4: uuidv4 } = require('uuid');
const {
  distributeCards,
  PLAYER_STATUS,
  CARD_TYPES,
  enforceZombieRestrictions,
} = require('./cardEngine');

// ─── Config ───────────────────────────────────────────────────────────────────

const MAP_WIDTH       = 2400;
const MAP_HEIGHT      = 1800;
const ENCOUNTER_DIST  = 80;          // pixels — triggers a duel
const MATCH_DURATION  = 10 * 60 * 1000;   // 10 minutes
const DUEL_TIMEOUT    = 30 * 1000;         // 30 seconds to pick cards
const MIN_PLAYERS     = 2;
const MAX_PLAYERS     = 20;

// ─── Global state maps ────────────────────────────────────────────────────────

/** @type {Map<string, MatchState>} matchId → match */
const activeMatches = new Map();

/** @type {Map<string, string>} socketId → matchId */
const playerMatchMap = new Map();

// ─── Lobby ────────────────────────────────────────────────────────────────────

/**
 * Create a new lobby and return its id.
 * @returns {string}
 */
function createLobby() {
  const matchId = uuidv4();
  /** @type {MatchState} */
  const state = {
    id         : matchId,
    phase      : 'lobby',     // 'lobby' | 'active' | 'ended'
    players    : new Map(),   // socketId → PlayerState
    duels      : new Map(),   // duelId   → DuelState
    matchTimer : null,
    duelTimers : new Map(),   // duelId → NodeJS.Timeout
    startTime  : null,
    endTime    : null,
  };
  activeMatches.set(matchId, state);
  return matchId;
}

/**
 * Add a player to an existing lobby.
 * @param {string} matchId
 * @param {string} socketId
 * @param {string} username
 * @returns {{ error?: string, success?: boolean }}
 */
function joinLobby(matchId, socketId, username) {
  const match = activeMatches.get(matchId);
  if (!match)                        return { error: 'Lobby not found' };
  if (match.phase !== 'lobby')       return { error: 'Match already started' };
  if (match.players.size >= MAX_PLAYERS) return { error: 'Lobby is full (max 20)' };

  const spawnX = 200 + Math.random() * (MAP_WIDTH  - 400);
  const spawnY = 200 + Math.random() * (MAP_HEIGHT - 400);

  /** @type {PlayerState} */
  const player = {
    id        : socketId,
    username  : username.trim().slice(0, 24) || `Ghost_${socketId.slice(0, 4)}`,
    status    : PLAYER_STATUS.HUMAN,
    cards     : [],
    x         : spawnX,
    y         : spawnY,
    inDuel    : false,
    kills     : 0,
    infections: 0,
    joinedAt  : Date.now(),
  };

  match.players.set(socketId, player);
  playerMatchMap.set(socketId, matchId);
  return { success: true };
}

/**
 * Start the match: assign statuses, distribute cards, start the match timer.
 * The timer callback is injected so matchManager doesn't call io directly.
 *
 * @param {string} matchId
 * @param {Function} onMatchTimeout  called with (matchId) when time runs out
 * @returns {{ error?: string, players?: PlayerState[], mapSize: object, endTime: number }}
 */
function startMatch(matchId, onMatchTimeout) {
  const match = activeMatches.get(matchId);
  if (!match)                                   return { error: 'Match not found' };
  if (match.phase !== 'lobby')                  return { error: 'Match already started' };
  if (match.players.size < MIN_PLAYERS)         return { error: `Need at least ${MIN_PLAYERS} players` };

  const playerArray = Array.from(match.players.values());
  const hands       = distributeCards(playerArray.length);

  // How many start as zombies (~20 %)
  const zombieCount = Math.max(1, Math.ceil(playerArray.length * 0.2));

  playerArray.forEach((p, i) => {
    p.cards  = hands[i];
    p.status = i < zombieCount ? PLAYER_STATUS.ZOMBIE : PLAYER_STATUS.HUMAN;
  });

  match.phase     = 'active';
  match.startTime = Date.now();
  match.endTime   = match.startTime + MATCH_DURATION;

  match.matchTimer = setTimeout(() => onMatchTimeout(matchId), MATCH_DURATION);

  return {
    success  : true,
    players  : playerArray,
    mapSize  : { width: MAP_WIDTH, height: MAP_HEIGHT },
    endTime  : match.endTime,
    duration : MATCH_DURATION,
  };
}

// ─── Movement & encounters ────────────────────────────────────────────────────

/**
 * Update a player's position and detect encounters with nearby players.
 *
 * @param {string} socketId
 * @param {number} x
 * @param {number} y
 * @returns {{ matchId:string, player:PlayerState, encounters:string[] }|null}
 */
function updatePlayerPosition(socketId, x, y) {
  const matchId = playerMatchMap.get(socketId);
  if (!matchId) return null;

  const match = activeMatches.get(matchId);
  if (!match || match.phase !== 'active') return null;

  const player = match.players.get(socketId);
  if (!player || player.status === PLAYER_STATUS.DEAD || player.inDuel) return null;

  player.x = Math.max(0, Math.min(MAP_WIDTH,  x));
  player.y = Math.max(0, Math.min(MAP_HEIGHT, y));

  const encounters = [];
  for (const [otherId, other] of match.players) {
    if (otherId === socketId)                   continue;
    if (other.status === PLAYER_STATUS.DEAD)    continue;
    if (other.inDuel || player.inDuel)          continue;

    const dist = Math.hypot(player.x - other.x, player.y - other.y);
    if (dist <= ENCOUNTER_DIST) {
      encounters.push(otherId);
    }
  }

  return { matchId, player, encounters };
}

// ─── Duel lifecycle ───────────────────────────────────────────────────────────

/**
 * Attempt to start a duel between two players.
 * Returns null if either is already in a duel or dead.
 *
 * @param {string} matchId
 * @param {string} attackerId
 * @param {string} defenderId
 * @param {Function} onTimeout  called with (duelId, matchId) if time runs out
 * @returns {{ duelId:string, attackerId:string, defenderId:string }|null}
 */
function initiateDuel(matchId, attackerId, defenderId, onTimeout) {
  const match = activeMatches.get(matchId);
  if (!match || match.phase !== 'active') return null;

  const attacker = match.players.get(attackerId);
  const defender = match.players.get(defenderId);
  if (!attacker || !defender)      return null;
  if (attacker.inDuel || defender.inDuel) return null;
  if (attacker.status === PLAYER_STATUS.DEAD) return null;
  if (defender.status === PLAYER_STATUS.DEAD) return null;

  const duelId = uuidv4();

  attacker.inDuel = true;
  defender.inDuel = true;

  /** @type {DuelState} */
  const duel = {
    id            : duelId,
    matchId,
    attackerId,
    defenderId,
    attackerCards : null,
    defenderCards : null,
    status        : 'pending',    // 'pending' | 'resolved'
    createdAt     : Date.now(),
  };

  match.duels.set(duelId, duel);

  // Auto-resolve after timeout with 'normal' for any side that didn't respond
  const timer = setTimeout(() => onTimeout(duelId, matchId), DUEL_TIMEOUT);
  match.duelTimers.set(duelId, timer);

  return { duelId, attackerId, defenderId };
}

/**
 * Record a player's card selection for a duel.
 *
 * @param {string} duelId
 * @param {string} socketId
 * @param {string[]} cards   raw card list from client (validated here)
 * @returns {{ error?:string, bothReady?:boolean, duelId?:string }}
 */
function submitDuelCards(duelId, socketId, cards) {
  const matchId = playerMatchMap.get(socketId);
  if (!matchId) return { error: 'Not in a match' };

  const match = activeMatches.get(matchId);
  if (!match)   return { error: 'Match not found' };

  const duel = match.duels.get(duelId);
  if (!duel || duel.status !== 'pending') return { error: 'Duel not available' };

  const player = match.players.get(socketId);
  if (!player)  return { error: 'Player not found' };

  // Validate: client can only play cards it actually holds
  const validCards = (Array.isArray(cards) ? cards : [])
    .filter(c => player.cards.includes(c))
    .slice(0, 3);

  // Fallback to a normal card if selection is empty
  const finalCards = validCards.length > 0 ? validCards : [CARD_TYPES.NORMAL];

  if (socketId === duel.attackerId) {
    duel.attackerCards = finalCards;
  } else if (socketId === duel.defenderId) {
    duel.defenderCards = finalCards;
  } else {
    return { error: 'You are not part of this duel' };
  }

  const bothReady = duel.attackerCards !== null && duel.defenderCards !== null;
  return { success: true, bothReady, duelId };
}

/**
 * Force-fill any missing card selections and mark the duel ready.
 * Called by the timeout handler so resolution can proceed.
 *
 * @param {string} duelId
 * @param {string} matchId
 * @returns {boolean}  true if the duel is now ready to resolve
 */
function forceReadyDuel(duelId, matchId) {
  const match = activeMatches.get(matchId);
  if (!match) return false;

  const duel = match.duels.get(duelId);
  if (!duel || duel.status !== 'pending') return false;

  if (!duel.attackerCards) duel.attackerCards = [CARD_TYPES.NORMAL];
  if (!duel.defenderCards) duel.defenderCards = [CARD_TYPES.NORMAL];
  return true;
}

/**
 * Clear the duel's timeout timer and mark it resolved.
 * Must be called before broadcasting the result to prevent double-fire.
 *
 * @param {string} duelId
 * @param {string} matchId
 */
function finaliseDuel(duelId, matchId) {
  const match = activeMatches.get(matchId);
  if (!match) return;

  const timer = match.duelTimers.get(duelId);
  if (timer) { clearTimeout(timer); match.duelTimers.delete(duelId); }

  const duel = match.duels.get(duelId);
  if (duel) {
    duel.status = 'resolved';
    const a = match.players.get(duel.attackerId);
    const d = match.players.get(duel.defenderId);
    if (a) a.inDuel = false;
    if (d) d.inDuel = false;
  }
}

// ─── Faction win check ────────────────────────────────────────────────────────

/**
 * Check whether a faction has been eliminated.
 * @param {string} matchId
 * @returns {'zombies_win'|'humans_win'|null}
 */
function checkFactionWin(matchId) {
  const match = activeMatches.get(matchId);
  if (!match || match.phase !== 'active') return null;

  const alive   = Array.from(match.players.values())
                       .filter(p => p.status !== PLAYER_STATUS.DEAD);
  const humans  = alive.filter(p => p.status === PLAYER_STATUS.HUMAN).length;
  const zombies = alive.filter(p => p.status === PLAYER_STATUS.ZOMBIE).length;

  if (humans  === 0 && zombies > 0) return 'zombies_win';
  if (zombies === 0 && humans  > 0) return 'humans_win';
  return null;
}

// ─── End match ────────────────────────────────────────────────────────────────

/**
 * Mark match as ended, clear timers, build standings.
 * @param {string} matchId
 * @param {'timeout'|'faction_eliminated'|'admin'} reason
 * @returns {{ winCondition:string, standings:object[] }|null}
 */
function endMatch(matchId, reason) {
  const match = activeMatches.get(matchId);
  if (!match || match.phase === 'ended') return null;

  // Cancel match timer
  if (match.matchTimer) { clearTimeout(match.matchTimer); match.matchTimer = null; }

  // Cancel all outstanding duel timers
  for (const t of match.duelTimers.values()) clearTimeout(t);
  match.duelTimers.clear();

  match.phase   = 'ended';
  match.endTime = Date.now();

  const factionResult = checkFactionWin(matchId);
  let winCondition;
  if      (reason === 'timeout')              winCondition = 'timeout';
  else if (factionResult)                     winCondition = factionResult;
  else                                        winCondition = 'timeout';

  const standings = Array.from(match.players.values())
    .filter(p => p.status !== PLAYER_STATUS.DEAD)
    .sort((a, b) => (b.kills + b.infections) - (a.kills + a.infections))
    .map((p, i) => ({
      playerId  : p.id,
      username  : p.username,
      status    : p.status,
      kills     : p.kills,
      infections: p.infections,
      rank      : i + 1,
    }));

  // Schedule cleanup
  setTimeout(() => activeMatches.delete(matchId), 120_000);

  return { winCondition, standings };
}

// ─── Player disconnect ────────────────────────────────────────────────────────

/**
 * Mark a disconnected player as dead and clean up their mappings.
 * @param {string} socketId
 * @returns {{ matchId:string }|null}
 */
function removePlayer(socketId) {
  const matchId = playerMatchMap.get(socketId);
  if (!matchId) return null;

  const match = activeMatches.get(matchId);
  if (match) {
    const player = match.players.get(socketId);
    if (player) {
      player.status = PLAYER_STATUS.DEAD;
      player.cards  = [];
      player.inDuel = false;
    }
  }

  playerMatchMap.delete(socketId);
  return { matchId };
}

// ─── Accessors ────────────────────────────────────────────────────────────────

function getMatch(matchId)          { return activeMatches.get(matchId)  || null; }
function getMatchId(socketId)       { return playerMatchMap.get(socketId) || null; }
function getPlayer(matchId, pid)    { return activeMatches.get(matchId)?.players.get(pid) || null; }
function getDuel(matchId, duelId)   { return activeMatches.get(matchId)?.duels.get(duelId) || null; }

/**
 * Return a sanitised player object safe to send over the wire.
 * When showCards=true the full hand is included (only for the owner).
 *
 * @param {PlayerState} p
 * @param {boolean} [showCards=false]
 * @returns {object}
 */
function sanitisePlayer(p, showCards = false) {
  return {
    id        : p.id,
    username  : p.username,
    status    : p.status,
    x         : Math.round(p.x),
    y         : Math.round(p.y),
    inDuel    : p.inDuel,
    kills     : p.kills,
    infections: p.infections,
    cardCount : p.cards.length,
    ...(showCards ? { cards: [...p.cards] } : {}),
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Config
  MAP_WIDTH,
  MAP_HEIGHT,
  ENCOUNTER_DIST,
  MATCH_DURATION,
  DUEL_TIMEOUT,

  // Lobby
  createLobby,
  joinLobby,
  startMatch,

  // Movement
  updatePlayerPosition,

  // Duels
  initiateDuel,
  submitDuelCards,
  forceReadyDuel,
  finaliseDuel,

  // Match lifecycle
  checkFactionWin,
  endMatch,
  removePlayer,

  // Accessors
  getMatch,
  getMatchId,
  getPlayer,
  getDuel,
  sanitisePlayer,
};
