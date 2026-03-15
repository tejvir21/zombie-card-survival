// src/components/HUD/GameHUD.jsx
import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';

const CARD_META = {
  zombie : { icon: '☣',  color: '#ef5350', bg: '#140808' },
  vaccine: { icon: '💉', color: '#26c6da', bg: '#061516' },
  gun    : { icon: '🔫', color: '#ffa726', bg: '#140d02' },
  normal : { icon: '🃏', color: '#78909c', bg: '#0a0e10' },
};

// ─── Match timer hook ─────────────────────────────────────────────────────────
function useMatchTimer(endTime) {
  const [display, setDisplay] = useState('--:--');
  const [urgent,  setUrgent]  = useState(false);

  useEffect(() => {
    if (!endTime) return;
    const tick = () => {
      const ms = endTime - Date.now();
      if (ms <= 0) { setDisplay('00:00'); setUrgent(true); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setDisplay(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
      setUrgent(ms < 60000);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endTime]);

  return { display, urgent };
}

// ─── Card chip ────────────────────────────────────────────────────────────────
function CardChip({ card }) {
  const meta = CARD_META[card] || CARD_META.normal;
  return (
    <div style={{
      display      : 'flex',
      flexDirection: 'column',
      alignItems   : 'center',
      gap          : 2,
      background   : meta.bg,
      border       : `1px solid ${meta.color}44`,
      borderRadius : 8,
      padding      : '7px 10px',
      minWidth     : 52,
      transition   : 'transform 0.1s',
    }}>
      <span style={{ fontSize: 17 }}>{meta.icon}</span>
      <span style={{ color: meta.color, fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>
        {card.toUpperCase()}
      </span>
    </div>
  );
}

// ─── Event log entry ──────────────────────────────────────────────────────────
function EventEntry({ event, age }) {
  return (
    <div style={{
      background  : 'rgba(8,14,24,0.85)',
      border      : '1px solid #0e1e2e',
      borderRadius: 6,
      padding     : '5px 10px',
      color       : '#607d8b',
      fontSize    : 11,
      letterSpacing: 0.3,
      lineHeight  : 1.4,
      opacity     : Math.max(0.2, 1 - age * 0.12),
      transition  : 'opacity 0.5s',
      maxWidth    : 230,
      wordBreak   : 'break-word',
    }}>
      {event.label || event.msg || ''}
    </div>
  );
}

// ─── Main HUD ─────────────────────────────────────────────────────────────────
export default function GameHUD() {
  const myCards     = useGameStore(s => s.myCards);
  const myStatus    = useGameStore(s => s.myStatus);
  const matchEndTime= useGameStore(s => s.matchEndTime);
  const events      = useGameStore(s => s.events);
  const players     = useGameStore(s => s.players);
  const myId        = useGameStore(s => s.myId);

  const { display: timerDisplay, urgent: timerUrgent } = useMatchTimer(matchEndTime);

  // Faction counts
  const alive   = Object.values(players).filter(p => p.status !== 'dead');
  const humans  = alive.filter(p => p.status === 'human').length;
  const zombies = alive.filter(p => p.status === 'zombie').length;
  const total   = Object.values(players).length;

  // Group my cards for compact display
  const cardGroups = myCards.reduce((acc, c) => {
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});

  const isZombie = myStatus === 'zombie';
  const isDead   = myStatus === 'dead';

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={S.topBar}>
        {/* Faction counts */}
        <div style={S.factions}>
          <span style={S.faction}>
            <span style={{ ...S.factionDot, background: '#29b6f6' }} />
            <span style={{ color: '#29b6f6' }}>{humans}</span>
            <span style={S.factionLabel}> Human{humans !== 1 ? 's' : ''}</span>
          </span>
          <span style={S.divider}>|</span>
          <span style={S.faction}>
            <span style={{ ...S.factionDot, background: '#66bb6a' }} />
            <span style={{ color: '#66bb6a' }}>{zombies}</span>
            <span style={S.factionLabel}> Zombie{zombies !== 1 ? 's' : ''}</span>
          </span>
          <span style={S.divider}>|</span>
          <span style={{ ...S.factionLabel, color: '#37474f' }}>
            {total - alive.length} dead
          </span>
        </div>

        {/* Timer */}
        <div style={{
          ...S.timer,
          color    : timerUrgent ? '#ef5350' : '#ffd700',
          animation: timerUrgent ? 'pulse 0.8s ease-in-out infinite' : 'none',
        }}>
          {timerDisplay}
        </div>

        {/* My status */}
        <div style={{
          ...S.statusBadge,
          background: isDead   ? '#0a0a0a'
                    : isZombie ? '#0a180a'
                    : '#060e18',
          color     : isDead   ? '#546e7a'
                    : isZombie ? '#66bb6a'
                    : '#29b6f6',
          border    : `1px solid ${
            isDead   ? '#1a2428'
            : isZombie ? '#1a3a1a'
            : '#0d2030'
          }`,
        }}>
          {isDead   ? '💀 DEAD'
           : isZombie ? '☣ ZOMBIE'
           : '👤 HUMAN'}
        </div>
      </div>

      {/* ── Card hand (bottom centre) ────────────────────────────────────── */}
      <div style={S.handBar}>
        <div style={S.handLabel}>YOUR HAND</div>
        <div style={S.hand}>
          {myCards.length === 0 ? (
            <span style={S.noCards}>No cards — Normal played in duels</span>
          ) : (
            myCards.map((card, i) => (
              <CardChip key={i} card={card} />
            ))
          )}
        </div>
        {isZombie && (
          <div style={S.zombieNote}>
            ☣ Zombies cannot hold Gun or Vaccine cards
          </div>
        )}
      </div>

      {/* ── Event log (right side) ───────────────────────────────────────── */}
      <div style={S.eventLog}>
        {events.slice(0, 7).map((ev, i) => (
          <EventEntry key={ev.id ?? i} event={ev} age={i} />
        ))}
      </div>

      {/* ── Controls hint (bottom left) ──────────────────────────────────── */}
      <div style={S.controls}>
        WASD / ↑↓←→ move &nbsp;·&nbsp; walk into players to duel
      </div>

      {/* ── Dead overlay ─────────────────────────────────────────────────── */}
      {isDead && (
        <div style={S.deadOverlay}>
          <div style={S.deadMsg}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💀</div>
            <div style={{ color: '#546e7a', fontSize: 16, letterSpacing: 2 }}>YOU ARE DEAD</div>
            <div style={{ color: '#263548', fontSize: 11, marginTop: 8 }}>
              Spectating the match…
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  topBar: {
    position      : 'fixed',
    top           : 0,
    left          : 0,
    right         : 0,
    height        : 48,
    background    : 'rgba(6,10,18,0.92)',
    borderBottom  : '1px solid #0e1e2e',
    display       : 'flex',
    alignItems    : 'center',
    justifyContent: 'space-between',
    padding       : '0 16px',
    zIndex        : 100,
    fontFamily    : "'Courier New', monospace",
    backdropFilter: 'blur(6px)',
  },
  factions: {
    display   : 'flex',
    alignItems: 'center',
    gap       : 8,
    fontSize  : 13,
  },
  faction: {
    display   : 'flex',
    alignItems: 'center',
    gap       : 5,
  },
  factionDot: {
    width       : 7,
    height      : 7,
    borderRadius: '50%',
    display     : 'inline-block',
  },
  factionLabel: {
    color   : '#37474f',
    fontSize: 12,
  },
  divider: { color: '#0e1e2e', fontSize: 14 },

  timer: {
    fontSize     : 22,
    fontWeight   : 700,
    letterSpacing: 3,
    fontFamily   : "'Courier New', monospace",
  },
  statusBadge: {
    fontSize     : 11,
    fontWeight   : 700,
    letterSpacing: 1.5,
    padding      : '5px 14px',
    borderRadius : 6,
    fontFamily   : "'Courier New', monospace",
  },

  // Hand
  handBar: {
    position      : 'fixed',
    bottom        : 0,
    left          : '50%',
    transform     : 'translateX(-50%)',
    background    : 'rgba(6,10,18,0.92)',
    borderTop     : '1px solid #0e1e2e',
    borderLeft    : '1px solid #0e1e2e',
    borderRight   : '1px solid #0e1e2e',
    borderRadius  : '12px 12px 0 0',
    padding       : '10px 20px 14px',
    zIndex        : 100,
    fontFamily    : "'Courier New', monospace",
    backdropFilter: 'blur(6px)',
    minWidth      : 280,
    maxWidth      : '90vw',
  },
  handLabel: {
    color        : '#1e3040',
    fontSize     : 9,
    letterSpacing: 3,
    textAlign    : 'center',
    marginBottom : 8,
  },
  hand: {
    display       : 'flex',
    gap           : 7,
    justifyContent: 'center',
    flexWrap      : 'wrap',
  },
  noCards: {
    color    : '#263548',
    fontSize : 11,
    textAlign: 'center',
    padding  : '4px 0',
  },
  zombieNote: {
    color        : '#2e4d2e',
    fontSize     : 10,
    textAlign    : 'center',
    marginTop    : 8,
    letterSpacing: 0.3,
  },

  // Event log
  eventLog: {
    position     : 'fixed',
    right        : 14,
    top          : 60,
    zIndex       : 100,
    display      : 'flex',
    flexDirection: 'column',
    gap          : 4,
    pointerEvents: 'none',
  },

  // Controls
  controls: {
    position     : 'fixed',
    bottom       : 80,
    left         : 14,
    color        : '#1a2c3a',
    fontSize     : 10,
    fontFamily   : "'Courier New', monospace",
    letterSpacing: 0.5,
    pointerEvents: 'none',
  },

  // Dead overlay
  deadOverlay: {
    position      : 'fixed',
    inset         : 0,
    background    : 'rgba(0,0,0,0.55)',
    display       : 'flex',
    alignItems    : 'center',
    justifyContent: 'center',
    zIndex        : 50,
    pointerEvents : 'none',
    fontFamily    : "'Courier New', monospace",
  },
  deadMsg: {
    textAlign    : 'center',
    background   : 'rgba(6,10,18,0.8)',
    border       : '1px solid #1a2428',
    borderRadius : 14,
    padding      : '28px 40px',
  },
};
