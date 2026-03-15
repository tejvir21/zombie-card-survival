'use strict';
/**
 * server/socket/handlers.js
 *
 * All Socket.io event handlers.
 * Each handler is documented with its expected payload and emitted events.
 */

const {
  createLobby,
  joinLobby,
  startMatch,
  updatePlayerPosition,
  initiateDuel,
  submitDuelCards,
  forceReadyDuel,
  finaliseDuel,
  checkFactionWin,
  endMatch,
  removePlayer,
  getMatch,
  getMatchId,
  getPlayer,
  getDuel,
  sanitisePlayer,
} = require('../engine/matchManager');

const {
  resolveDuel,
  applyDuelResult,
  PLAYER_STATUS,
} = require('../engine/cardEngine');

const Match       = require('../models/Match');
const Player      = require('../models/Player');
const Leaderboard = require('../models/Leaderboard');

// ─── Main registration ────────────────────────────────────────────────────────

function registerSocketHandlers(io) {

  io.on('connection', socket => {
    console.log(`[CON]  + ${socket.id}`);

    // ── joinLobby ─────────────────────────────────────────────────────────────
    /**
     * Payload : { username: string, lobbyId?: string }
     * Callback: { success, lobbyId, yourId } | { error }
     * Emits   : lobbyUpdate → all in room
     *
     * Logic:
     *   - If lobbyId provided AND a lobby-phase match with that id exists → join it.
     *   - If lobbyId provided but NOT found (or already started/ended) → return error
     *     so the client knows the code is invalid (don't silently create a new lobby).
     *   - If no lobbyId provided → create a fresh lobby.
     */
    socket.on('joinLobby', async ({ username = '', lobbyId } = {}, cb) => {
      try {
        let targetId;

        if (lobbyId && lobbyId.trim()) {
          // Player supplied a lobby code — look it up in the live match state
          const existing = getMatch(lobbyId.trim());

          if (!existing) {
            return safeCb(cb, { error: 'Lobby not found. Check the code and try again.' });
          }
          if (existing.phase !== 'lobby') {
            return safeCb(cb, { error: 'That match has already started or ended.' });
          }

          targetId = lobbyId.trim();
        } else {
          // No code supplied — create a brand-new lobby
          targetId = createLobby();
        }

        const result = joinLobby(targetId, socket.id, username);
        if (result.error) return safeCb(cb, { error: result.error });

        socket.join(targetId);

        // Persist player document
        await Player.findOneAndUpdate(
          { socketId: socket.id },
          { socketId: socket.id, username: username.trim() || socket.id.slice(0, 8), lastSeen: new Date() },
          { upsert: true, new: true }
        ).catch(() => {});

        broadcastLobbyUpdate(io, targetId);
        safeCb(cb, { success: true, lobbyId: targetId, yourId: socket.id });
      } catch (err) {
        console.error('[joinLobby]', err);
        safeCb(cb, { error: 'Server error joining lobby' });
      }
    });

    // ── startMatch ────────────────────────────────────────────────────────────
    /**
     * Payload : { lobbyId: string }
     * Callback: { success } | { error }
     * Emits   : matchStarted → each player in room (private cards sent individually)
     */
    socket.on('startMatch', async ({ lobbyId } = {}, cb) => {
      try {
        if (!lobbyId) return safeCb(cb, { error: 'lobbyId required' });

        const result = startMatch(lobbyId, (mid) => handleMatchTimeout(io, mid));
        if (result.error) return safeCb(cb, { error: result.error });


        // Persist match to DB
        await Match.create({
          matchId  : lobbyId,
          status   : 'active',
          startTime: new Date(),
          playerIds: result.players.map(p => p.id),
        }).catch(() => {});

        // Emit matchStarted privately to each player (they see their own cards)
        const match = getMatch(lobbyId);
        for (const [pid, pState] of match.players) {
          const allPublic = Array.from(match.players.values())
            .map(p => sanitisePlayer(p, p.id === pid));

          io.to(pid).emit('matchStarted', {
            lobbyId,
            mapSize  : result.mapSize,
            endTime  : result.endTime,
            duration : result.duration,
            yourPlayer: sanitisePlayer(pState, true),
            players  : allPublic,
          });
        }

        safeCb(cb, { success: true });
      } catch (err) {
        console.error('[startMatch]', err);
        safeCb(cb, { error: 'Server error starting match' });
      }
    });

    // ── playerMove ────────────────────────────────────────────────────────────
    /**
     * Payload : { x: number, y: number }
     * Emits   : playerMoved   → room (others)
     * Emits   : startDuel     → both involved players (if encounter)
     */
    socket.on('playerMove', ({ x, y } = {}) => {
      const update = updatePlayerPosition(socket.id, Number(x), Number(y));
      if (!update) return;

      const { matchId, player, encounters } = update;

      // Broadcast new position to all other players in the match
      socket.to(matchId).emit('playerMoved', {
        id: socket.id,
        x : player.x,
        y : player.y,
      });

      // Handle any new encounters
      for (const otherId of encounters) {
        const match   = getMatch(matchId);
        if (!match) continue;
        const other   = match.players.get(otherId);
        if (!other || other.inDuel || player.inDuel) continue;

        const duelInfo = initiateDuel(
          matchId,
          socket.id,
          otherId,
          (duelId, mid) => handleDuelTimeout(io, duelId, mid)
        );
        if (!duelInfo) continue;

        const { duelId, attackerId, defenderId } = duelInfo;
        const aState = match.players.get(attackerId);
        const dState = match.players.get(defenderId);

        io.to(attackerId).emit('startDuel', {
          duelId,
          role           : 'attacker',
          opponentId     : defenderId,
          opponentUsername: dState?.username || '???',
          opponentStatus : dState?.status  || 'human',
          yourCards      : aState ? [...aState.cards] : [],
          timeLimit      : 30000,
        });

        io.to(defenderId).emit('startDuel', {
          duelId,
          role           : 'defender',
          opponentId     : attackerId,
          opponentUsername: aState?.username || '???',
          opponentStatus : aState?.status  || 'human',
          yourCards      : dState ? [...dState.cards] : [],
          timeLimit      : 30000,
        });
      }
    });

    // ── submitCards ───────────────────────────────────────────────────────────
    /**
     * Payload : { duelId: string, cards: string[] }
     * Callback: { success, waiting } | { error }
     * Triggers: resolveAndBroadcast() when both sides have submitted
     */
    socket.on('submitCards', ({ duelId, cards } = {}, cb) => {
      const result = submitDuelCards(duelId, socket.id, cards || []);
      if (result.error) return safeCb(cb, { error: result.error });

      safeCb(cb, { success: true, waiting: !result.bothReady });

      if (result.bothReady) {
        const matchId = getMatchId(socket.id);
        if (matchId) resolveAndBroadcast(io, duelId, matchId);
      }
    });

    // ── requestRejoin ─────────────────────────────────────────────────────────
    /**
     * Allows a temporarily disconnected client to re-sync state.
     * Payload : { matchId: string }
     * Emits   : rejoinData → socket
     */
    socket.on('requestRejoin', ({ matchId } = {}) => {
      const match = getMatch(matchId);
      if (!match || match.phase === 'ended') {
        socket.emit('rejoinData', { error: 'Match not found or ended' });
        return;
      }
      const player = match.players.get(socket.id);
      if (!player) {
        socket.emit('rejoinData', { error: 'Not a participant in this match' });
        return;
      }

      socket.join(matchId);
      const allPublic = Array.from(match.players.values())
        .map(p => sanitisePlayer(p, p.id === socket.id));

      socket.emit('rejoinData', {
        matchId,
        phase     : match.phase,
        endTime   : match.endTime,
        yourPlayer: sanitisePlayer(player, true),
        players   : allPublic,
      });
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[CON]  - ${socket.id} (${reason})`);
      const info = removePlayer(socket.id);
      if (!info) return;

      const { matchId } = info;
      io.to(matchId).emit('playerEliminated', {
        playerId: socket.id,
        reason  : 'disconnected',
      });

      // Check if one faction is now entirely gone
      maybeEndMatch(io, matchId);
    });
  }); // io.on('connection')
}

// ─── Duel resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a duel and broadcast all resulting state changes to the match room.
 *
 * @param {SocketServer} io
 * @param {string}       duelId
 * @param {string}       matchId
 */
async function resolveAndBroadcast(io, duelId, matchId) {
  const match = getMatch(matchId);
  if (!match) return;

  const duel = match.duels.get(duelId);
  if (!duel || duel.status === 'resolved') return;

  const aState = match.players.get(duel.attackerId);
  const dState = match.players.get(duel.defenderId);
  if (!aState || !dState) return;

  // Finalise (clears timer, marks resolved, clears inDuel flags)
  finaliseDuel(duelId, matchId);

  // Compute result
  const resolution = resolveDuel(
    { id: duel.attackerId, status: aState.status, selectedCards: duel.attackerCards  },
    { id: duel.defenderId, status: dState.status, selectedCards: duel.defenderCards  }
  );

  // Apply mutations to server state
  applyDuelResult(resolution, aState, dState);

  // Update combat stats
  if (resolution.defenderOutcome === 'dies')     aState.kills++;
  if (resolution.attackerOutcome === 'dies')     dState.kills++;
  if (resolution.defenderOutcome === 'infected') aState.infections++;
  if (resolution.attackerOutcome === 'infected') dState.infections++;

  // ── Broadcast duelResolved to the whole room ──────────────────────────────
  io.to(matchId).emit('duelResolved', {
    duelId,
    attackerId: duel.attackerId,
    defenderId: duel.defenderId,
    resolution: {
      attackerCard   : resolution.attackerCard,
      defenderCard   : resolution.defenderCard,
      attackerOutcome: resolution.attackerOutcome,
      defenderOutcome: resolution.defenderOutcome,
      winner         : resolution.winner,
      cardTransferred: resolution.cardTransferred,
      log            : resolution.log,
    },
  });

  // ── Send updated private hands ────────────────────────────────────────────
  io.to(duel.attackerId).emit('handUpdated', { cards: [...aState.cards] });
  io.to(duel.defenderId).emit('handUpdated', { cards: [...dState.cards] });

  // ── Status-change broadcasts ──────────────────────────────────────────────
  const statusEvents = [
    { outcome: resolution.attackerOutcome, pid: duel.attackerId, pState: aState },
    { outcome: resolution.defenderOutcome, pid: duel.defenderId, pState: dState },
  ];

  for (const { outcome, pid, pState } of statusEvents) {
    if (outcome === 'infected' || outcome === 'cured') {
      io.to(matchId).emit('playerStatusChanged', {
        playerId: pid,
        status  : pState.status,
      });
    }
    if (outcome === 'dies') {
      io.to(matchId).emit('playerEliminated', {
        playerId: pid,
        reason  : 'killed_in_duel',
      });
    }
  }

  // ── Card transfer notification ────────────────────────────────────────────
  if (resolution.cardTransferred && resolution.winner) {
    const loserId = resolution.winner === duel.attackerId ? duel.defenderId : duel.attackerId;
    io.to(matchId).emit('cardTransferred', {
      from: loserId,
      to  : resolution.winner,
      card: resolution.cardTransferred,
    });
  }

  // ── Persist duel event ────────────────────────────────────────────────────
  await Match.findOneAndUpdate(
    { matchId },
    { $push: { events: { type: 'duel', data: resolution, timestamp: new Date() } } }
  ).catch(() => {});

  // ── Check faction win ─────────────────────────────────────────────────────
  maybeEndMatch(io, matchId);
}

// ─── Timeout helpers ──────────────────────────────────────────────────────────

function handleDuelTimeout(io, duelId, matchId) {
  const ready = forceReadyDuel(duelId, matchId);
  if (ready) resolveAndBroadcast(io, duelId, matchId);
}

function handleMatchTimeout(io, matchId) {
  const result = endMatch(matchId, 'timeout');
  if (!result) return;
  broadcastMatchEnd(io, matchId, 'timeout', result);
}

// ─── Match end ────────────────────────────────────────────────────────────────

function maybeEndMatch(io, matchId) {
  const condition = checkFactionWin(matchId);
  if (!condition) return;

  const result = endMatch(matchId, 'faction_eliminated');
  if (!result) return;
  broadcastMatchEnd(io, matchId, 'faction_eliminated', result);
}

async function broadcastMatchEnd(io, matchId, reason, result) {
  io.to(matchId).emit('matchEnd', {
    matchId,
    reason,
    winCondition: result.winCondition,
    standings   : result.standings,
  });

  // Persist end state
  await Match.findOneAndUpdate(
    { matchId },
    {
      status      : 'ended',
      endTime     : new Date(),
      winCondition: result.winCondition,
      standings   : result.standings,
    }
  ).catch(() => {});

  // Update leaderboard for survivors
  for (const entry of result.standings) {
    await Leaderboard.findOneAndUpdate(
      { playerId: entry.playerId },
      {
        $setOnInsert: { playerId: entry.playerId, username: entry.username },
        $inc: {
          wins         : entry.rank === 1 ? 1 : 0,
          kills        : entry.kills || 0,
          infections   : entry.infections || 0,
          matchesPlayed: 1,
        },
      },
      { upsert: true }
    ).then(async doc => {
      if (doc) {
        const score = doc.wins * 10 + doc.kills * 3 + doc.infections * 2;
        await Leaderboard.findOneAndUpdate({ playerId: entry.playerId }, { score });
      }
    }).catch(() => {});
  }
}

// ─── Lobby broadcast helper ───────────────────────────────────────────────────

function broadcastLobbyUpdate(io, matchId) {
  const match = getMatch(matchId);
  if (!match) return;
  const players = Array.from(match.players.values()).map(p => sanitisePlayer(p));
  io.to(matchId).emit('lobbyUpdate', {
    matchId,
    players,
    playerCount: players.length,
  });
}

// ─── Safe callback helper ─────────────────────────────────────────────────────

function safeCb(cb, data) {
  if (typeof cb === 'function') cb(data);
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = { registerSocketHandlers };
