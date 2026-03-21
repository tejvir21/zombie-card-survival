// src/components/HUD/GameHUD.jsx
import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';

const CARD_META = {
  zombie : { icon: '☣',  color: '#ef5350', bg: '#140808' },
  vaccine: { icon: '💉', color: '#26c6da', bg: '#061516' },
  gun    : { icon: '🔫', color: '#ffa726', bg: '#140d02' },
  normal : { icon: '🃏', color: '#78909c', bg: '#0a0e10' },
};

const isMobile = () => ('ontouchstart' in window) || window.innerWidth < 768;

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

function CardChip({ card }) {
  const meta = CARD_META[card] || CARD_META.normal;
  const mobile = isMobile();
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', gap:2,
      background:meta.bg, border:`1px solid ${meta.color}44`, borderRadius:8,
      padding: mobile ? '9px 12px' : '7px 10px',
      minWidth: mobile ? 58 : 52,
    }}>
      <span style={{ fontSize: mobile ? 20 : 17 }}>{meta.icon}</span>
      <span style={{ color:meta.color, fontSize:9, letterSpacing:1, fontWeight:700 }}>
        {card.toUpperCase()}
      </span>
    </div>
  );
}

function EventEntry({ event, age }) {
  return (
    <div style={{
      background:'rgba(8,14,24,0.85)', border:'1px solid #0e1e2e',
      borderRadius:6, padding:'5px 10px', color:'#607d8b',
      fontSize:11, letterSpacing:0.3, lineHeight:1.4,
      opacity: Math.max(0.2, 1 - age * 0.14),
      maxWidth:220, wordBreak:'break-word',
    }}>
      {event.label || event.msg || ''}
    </div>
  );
}

export default function GameHUD() {
  const myCards      = useGameStore(s => s.myCards);
  const myStatus     = useGameStore(s => s.myStatus);
  const matchEndTime = useGameStore(s => s.matchEndTime);
  const events       = useGameStore(s => s.events);
  const players      = useGameStore(s => s.players);

  const { display: timerDisplay, urgent: timerUrgent } = useMatchTimer(matchEndTime);
  const mobile = isMobile();

  const alive   = Object.values(players).filter(p => p.status !== 'dead');
  const humans  = alive.filter(p => p.status === 'human').length;
  const zombies = alive.filter(p => p.status === 'zombie').length;
  const isZombie = myStatus === 'zombie';
  const isDead   = myStatus === 'dead';

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={S.topBar}>
        <div style={S.factions}>
          <span style={{ color:'#29b6f6' }}>
            <span style={{ ...S.dot, background:'#29b6f6' }} />
            {humans}
          </span>
          <span style={S.sep}>|</span>
          <span style={{ color:'#66bb6a' }}>
            <span style={{ ...S.dot, background:'#66bb6a' }} />
            {zombies}
          </span>
        </div>

        <div style={{
          ...S.timer,
          color:    timerUrgent ? '#ef5350' : '#ffd700',
          fontSize: mobile ? 18 : 22,
          animation: timerUrgent ? 'pulse 0.8s ease-in-out infinite' : 'none',
        }}>
          {timerDisplay}
        </div>

        <div style={{
          ...S.statusBadge,
          background: isDead?'#0a0a0a': isZombie?'#0a180a':'#060e18',
          color:      isDead?'#546e7a': isZombie?'#66bb6a':'#29b6f6',
          border:`1px solid ${isDead?'#1a2428':isZombie?'#1a3a1a':'#0d2030'}`,
          fontSize: mobile ? 10 : 11,
          padding: mobile ? '4px 8px' : '5px 14px',
        }}>
          {isDead?'💀 DEAD': isZombie?'☣ ZOMBIE':'👤 HUMAN'}
        </div>
      </div>

      {/* ── Card hand — bottom centre ─────────────────────────────────────── */}
      {/* On mobile: sits above the joystick area, shifted right so it doesn't
          overlap the left-side joystick (bottom-left quadrant) */}
      <div style={{
        ...S.handBar,
        bottom:    mobile ? 12 : 0,
        left:      mobile ? '50%' : '50%',
        transform: mobile ? 'translateX(-20%)' : 'translateX(-50%)',
        borderRadius: mobile ? 12 : '12px 12px 0 0',
        paddingBottom: mobile ? 12 : 14,
      }}>
        <div style={S.handLabel}>YOUR HAND</div>
        <div style={S.hand}>
          {myCards.length === 0
            ? <span style={S.noCards}>No cards</span>
            : myCards.map((card, i) => <CardChip key={i} card={card} />)
          }
        </div>
        {isZombie && (
          <div style={S.zombieNote}>☣ Cannot hold Gun or Vaccine</div>
        )}
      </div>

      {/* ── Event log — right side (hidden on small phones) ──────────────── */}
      {!mobile && (
        <div style={S.eventLog}>
          {events.slice(0, 7).map((ev, i) => (
            <EventEntry key={ev.id ?? i} event={ev} age={i} />
          ))}
        </div>
      )}

      {/* ── Controls hint ────────────────────────────────────────────────── */}
      {!mobile && (
        <div style={S.controls}>WASD / ↑↓←→ move · walk into players to duel</div>
      )}

      {/* ── Mobile joystick label ─────────────────────────────────────────── */}
      {mobile && (
        <div style={S.joyHint}>drag left side to move</div>
      )}

      {/* ── Dead overlay ─────────────────────────────────────────────────── */}
      {isDead && (
        <div style={S.deadOverlay}>
          <div style={S.deadMsg}>
            <div style={{ fontSize:40, marginBottom:8 }}>💀</div>
            <div style={{ color:'#546e7a', fontSize:16, letterSpacing:2 }}>YOU ARE DEAD</div>
            <div style={{ color:'#263548', fontSize:11, marginTop:8 }}>Spectating…</div>
          </div>
        </div>
      )}
    </>
  );
}

const S = {
  topBar: {
    position:'fixed', top:0, left:0, right:0, height:48,
    background:'rgba(6,10,18,0.92)', borderBottom:'1px solid #0e1e2e',
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'0 14px', zIndex:100,
    fontFamily:"'Courier New',monospace",
    backdropFilter:'blur(6px)',
  },
  factions: { display:'flex', alignItems:'center', gap:8, fontSize:14 },
  dot: { width:7, height:7, borderRadius:'50%', display:'inline-block', marginRight:4 },
  sep: { color:'#0e1e2e', fontSize:14 },
  timer: { fontWeight:700, letterSpacing:3, fontFamily:"'Courier New',monospace" },
  statusBadge: {
    fontWeight:700, letterSpacing:1.5,
    borderRadius:6, fontFamily:"'Courier New',monospace",
  },
  handBar: {
    position:'fixed',
    background:'rgba(6,10,18,0.92)',
    borderTop:'1px solid #0e1e2e', borderLeft:'1px solid #0e1e2e', borderRight:'1px solid #0e1e2e',
    padding:'10px 16px',
    zIndex:100,
    fontFamily:"'Courier New',monospace",
    backdropFilter:'blur(6px)',
  },
  handLabel: { color:'#1e3040', fontSize:9, letterSpacing:3, textAlign:'center', marginBottom:8 },
  hand: { display:'flex', gap:6, justifyContent:'center', flexWrap:'wrap' },
  noCards: { color:'#263548', fontSize:11 },
  zombieNote: { color:'#2e4d2e', fontSize:9, textAlign:'center', marginTop:7, letterSpacing:0.3 },
  eventLog: {
    position:'fixed', right:14, top:58, zIndex:100,
    display:'flex', flexDirection:'column', gap:4, pointerEvents:'none',
  },
  controls: {
    position:'fixed', bottom:80, left:14, color:'#1a2c3a',
    fontSize:10, fontFamily:"'Courier New',monospace", letterSpacing:0.5, pointerEvents:'none',
  },
  joyHint: {
    position:'fixed', bottom:16, left:16, color:'#1a2c3a',
    fontSize:10, fontFamily:"'Courier New',monospace", letterSpacing:0.5, pointerEvents:'none',
  },
  deadOverlay: {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
    display:'flex', alignItems:'center', justifyContent:'center',
    zIndex:50, pointerEvents:'none', fontFamily:"'Courier New',monospace",
  },
  deadMsg: {
    textAlign:'center', background:'rgba(6,10,18,0.8)',
    border:'1px solid #1a2428', borderRadius:14, padding:'28px 40px',
  },
};
