'use strict';
/**
 * server/engine/cardEngine.js
 *
 * Core card-resolution engine for Zombie Card Survival.
 *
 * Card types
 *   zombie  – infects a human; zombies may not carry gun/vaccine
 *   vaccine – cures a zombie; single-use; no effect on humans
 *   gun     – kills any player instantly; single-use
 *   normal  – neutral; no effect against anyone
 *
 * Resolution priority  gun(4) > zombie(3) > vaccine(2) > normal(1)
 * Each duel: each player's *strongest* card in their selected hand is used.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_TYPES = Object.freeze({
  ZOMBIE : 'zombie',
  VACCINE: 'vaccine',
  GUN    : 'gun',
  NORMAL : 'normal',
});

const PLAYER_STATUS = Object.freeze({
  HUMAN : 'human',
  ZOMBIE: 'zombie',
  DEAD  : 'dead',
});

const CARD_PRIORITY = {
  [CARD_TYPES.GUN]    : 4,
  [CARD_TYPES.ZOMBIE] : 3,
  [CARD_TYPES.VACCINE]: 2,
  [CARD_TYPES.NORMAL] : 1,
};

const SINGLE_USE = new Set([CARD_TYPES.GUN, CARD_TYPES.VACCINE]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle — returns a new shuffled array.
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Return the card with the highest priority from an array of cards.
 * Falls back to 'normal' when the list is empty.
 * @param {string[]} cards
 * @returns {string}
 */
function pickStrongestCard(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return CARD_TYPES.NORMAL;
  return cards.reduce((best, c) =>
    (CARD_PRIORITY[c] || 0) > (CARD_PRIORITY[best] || 0) ? c : best,
    cards[0]
  );
}

/**
 * Pick one random card from an array (for loot transfer).
 * @param {string[]} cards
 * @returns {string|null}
 */
function pickRandomLoot(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  return cards[Math.floor(Math.random() * cards.length)];
}

/**
 * Remove gun and vaccine cards from a zombie's hand.
 * @param {string[]} hand
 * @returns {string[]}
 */
function enforceZombieRestrictions(hand) {
  return hand.filter(c => !SINGLE_USE.has(c));
}

// ─── Card distribution ────────────────────────────────────────────────────────

/**
 * Build starting hands for every player in a match.
 *
 * ~20 % of players start as zombies (at least 1).
 * Every player starts with 3 normal cards plus one special card.
 *   Zombies   → zombie card
 *   Humans    → gun, vaccine, or normal (weighted toward normal)
 *
 * @param {number} playerCount   2–20
 * @returns {string[][]}         One hand array per player (parallel to playerArray)
 */
function distributeCards(playerCount) {
  const n         = Math.max(2, Math.min(20, playerCount));
  const zombieN   = Math.max(1, Math.ceil(n * 0.2));

  // Weighted bonus card pool for humans
  const humanBonus = [
    CARD_TYPES.GUN,
    CARD_TYPES.VACCINE,
    CARD_TYPES.NORMAL,
    CARD_TYPES.NORMAL,
    CARD_TYPES.NORMAL,
  ];

  return Array.from({ length: n }, (_, i) => {
    const base = [CARD_TYPES.NORMAL, CARD_TYPES.NORMAL, CARD_TYPES.NORMAL];
    if (i < zombieN) {
      base.push(CARD_TYPES.ZOMBIE);
    } else {
      base.push(humanBonus[Math.floor(Math.random() * humanBonus.length)]);
    }
    return shuffle(base);
  });
}

// ─── Duel resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a card duel between two players.
 *
 * @param {{ id:string, status:string, selectedCards:string[] }} attacker
 * @param {{ id:string, status:string, selectedCards:string[] }} defender
 * @returns {{
 *   attackerCard    : string,
 *   defenderCard    : string,
 *   attackerOutcome : 'survives'|'dies'|'infected'|'cured',
 *   defenderOutcome : 'survives'|'dies'|'infected'|'cured',
 *   winner          : string|null,
 *   cardTransferred : string|null,
 *   usedCards       : { attacker:string[], defender:string[] },
 *   log             : string[],
 * }}
 */
function resolveDuel(attacker, defender) {
  const aCard = pickStrongestCard(attacker.selectedCards);
  const dCard = pickStrongestCard(defender.selectedCards);

  const aIsZombie = attacker.status === PLAYER_STATUS.ZOMBIE;
  const dIsZombie = defender.status === PLAYER_STATUS.ZOMBIE;

  let attackerOutcome = 'survives';
  let defenderOutcome = 'survives';
  let winner          = null;
  const log           = [];

  // ── Resolution matrix ───────────────────────────────────────────────────────

  if (aCard === CARD_TYPES.GUN && dCard === CARD_TYPES.GUN) {
    // Both draw guns → both die
    attackerOutcome = 'dies';
    defenderOutcome = 'dies';
    winner          = null;
    log.push('Both players drew guns — mutual elimination!');

  } else if (aCard === CARD_TYPES.GUN) {
    defenderOutcome = 'dies';
    winner          = attacker.id;
    log.push(`${attacker.id} fires gun — ${defender.id} is eliminated.`);

  } else if (dCard === CARD_TYPES.GUN) {
    attackerOutcome = 'dies';
    winner          = defender.id;
    log.push(`${defender.id} fires gun — ${attacker.id} is eliminated.`);

  } else if (aCard === CARD_TYPES.VACCINE && dIsZombie) {
    defenderOutcome = 'cured';
    winner          = attacker.id;
    log.push(`${attacker.id} uses vaccine — ${defender.id} is cured and converted to human!`);

  } else if (dCard === CARD_TYPES.VACCINE && aIsZombie) {
    attackerOutcome = 'cured';
    winner          = defender.id;
    log.push(`${defender.id} uses vaccine — ${attacker.id} is cured and converted to human!`);

  } else if (aCard === CARD_TYPES.VACCINE && !dIsZombie) {
    // Vaccine vs human — no effect, draw
    log.push('Vaccine used on a human — no effect.');

  } else if (dCard === CARD_TYPES.VACCINE && !aIsZombie) {
    log.push('Vaccine used on a human — no effect.');

  } else if (aCard === CARD_TYPES.ZOMBIE && !dIsZombie) {
    defenderOutcome = 'infected';
    winner          = attacker.id;
    log.push(`${attacker.id} infects ${defender.id} — converted to zombie!`);

  } else if (dCard === CARD_TYPES.ZOMBIE && !aIsZombie) {
    attackerOutcome = 'infected';
    winner          = defender.id;
    log.push(`${defender.id} infects ${attacker.id} — converted to zombie!`);

  } else if (aCard === CARD_TYPES.ZOMBIE && dCard === CARD_TYPES.ZOMBIE) {
    // Zombie vs zombie — stalemate
    log.push('Two zombies clash — no effect.');

  } else {
    // All normal / neutral matchups
    log.push('Cards cancel out — no effect.');
  }

  // ── Single-use consumption ─────────────────────────────────────────────────
  const usedCards = {
    attacker: SINGLE_USE.has(aCard) ? [aCard] : [],
    defender: SINGLE_USE.has(dCard) ? [dCard] : [],
  };

  // ── Loot transfer (winner gains 1 random card from loser's submitted hand) ──
  let cardTransferred = null;
  if (winner) {
    const loserSelected = winner === attacker.id
      ? defender.selectedCards
      : attacker.selectedCards;
    cardTransferred = pickRandomLoot(loserSelected);
    if (cardTransferred) {
      log.push(`${winner} takes a [${cardTransferred}] card from the loser.`);
    }
  }

  return {
    attackerCard   : aCard,
    defenderCard   : dCard,
    attackerOutcome,
    defenderOutcome,
    winner,
    cardTransferred,
    usedCards,
    log,
  };
}

// ─── State mutation ───────────────────────────────────────────────────────────

/**
 * Apply a duel resolution to in-memory player state objects.
 * Mutates attackerState and defenderState in place.
 *
 * @param {object} resolution  return value of resolveDuel()
 * @param {object} attackerState  { id, status, cards[] }
 * @param {object} defenderState  { id, status, cards[] }
 */
function applyDuelResult(resolution, attackerState, defenderState) {
  const _apply = (state, outcome, usedCards) => {
    switch (outcome) {
      case 'dies':
        state.status = PLAYER_STATUS.DEAD;
        state.cards  = [];
        break;
      case 'infected':
        state.status = PLAYER_STATUS.ZOMBIE;
        state.cards  = enforceZombieRestrictions(state.cards);
        break;
      case 'cured':
        state.status = PLAYER_STATUS.HUMAN;
        break;
      default:
        break;
    }
    // Remove single-use cards that were played
    usedCards.forEach(c => {
      const idx = state.cards.indexOf(c);
      if (idx !== -1) state.cards.splice(idx, 1);
    });
  };

  _apply(attackerState, resolution.attackerOutcome, resolution.usedCards.attacker);
  _apply(defenderState, resolution.defenderOutcome, resolution.usedCards.defender);

  // Transfer loot card from loser → winner
  if (resolution.winner && resolution.cardTransferred) {
    const loser  = resolution.winner === attackerState.id ? defenderState : attackerState;
    const winner = resolution.winner === attackerState.id ? attackerState : defenderState;

    const lootIdx = loser.cards.indexOf(resolution.cardTransferred);
    if (lootIdx !== -1) {
      loser.cards.splice(lootIdx, 1);
      // Zombies cannot hold gun or vaccine — silently discard if loot is restricted
      const isRestricted = winner.status === PLAYER_STATUS.ZOMBIE
        && SINGLE_USE.has(resolution.cardTransferred);
      if (!isRestricted) {
        winner.cards.push(resolution.cardTransferred);
      }
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  CARD_TYPES,
  PLAYER_STATUS,
  SINGLE_USE,
  CARD_PRIORITY,
  shuffle,
  pickStrongestCard,
  pickRandomLoot,
  enforceZombieRestrictions,
  distributeCards,
  resolveDuel,
  applyDuelResult,
};
