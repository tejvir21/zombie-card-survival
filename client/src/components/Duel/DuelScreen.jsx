// src/components/Duel/DuelScreen.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket }    from '../../utils/socket';
import { useGameStore } from '../../store/gameStore';

const CARD_META = {
  zombie : { label:'Zombie',  icon:'☣',  color:'#ef5350', bg:'#140808', border:'#3d1414', desc:'Infects humans'  },
  vaccine: { label:'Vaccine', icon:'💉', color:'#26c6da', bg:'#061516', border:'#0d3338', desc:'Cures zombies'   },
  gun    : { label:'Gun',     icon:'🔫', color:'#ffa726', bg:'#140d02', border:'#3d2900', desc:'Kills anyone'    },
  normal : { label:'Normal',  icon:'🃏', color:'#78909c', bg:'#0a0e10', border:'#1a2428', desc:'No effect'       },
};

const OUTCOME_STYLE = {
  dies    : { color:'#ef5350', icon:'💀', label:'ELIMINATED' },
  infected: { color:'#ef5350', icon:'☣', label:'INFECTED'   },
  cured   : { color:'#26c6da', icon:'✚', label:'CURED'      },
  survives: { color:'#66bb6a', icon:'✔', label:'SURVIVED'   },
};

const isMobile = () => ('ontouchstart' in window) || window.innerWidth < 768;

function CardTile({ card, selected, onClick, disabled }) {
  const meta   = CARD_META[card] || CARD_META.normal;
  const mobile = isMobile();
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        position:'relative',
        background: meta.bg,
        border:`2px solid ${selected ? meta.color : meta.border}`,
        borderRadius:12,
        padding: mobile ? '18px 8px 14px' : '14px 8px 10px',
        textAlign:'center',
        cursor: disabled ? 'default' : 'pointer',
        transition:'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
        transform: selected ? 'translateY(-10px) scale(1.05)' : 'none',
        boxShadow: selected ? `0 8px 24px ${meta.color}33` : 'none',
        opacity: disabled && !selected ? 0.5 : 1,
        userSelect:'none',
        WebkitTapHighlightColor:'transparent',
        minWidth: mobile ? 68 : 72,
        // Large touch target
        minHeight: mobile ? 90 : 'unset',
      }}
    >
      <div style={{ fontSize: mobile ? 30 : 26, marginBottom:6, lineHeight:1 }}>{meta.icon}</div>
      <div style={{ color:meta.color, fontSize:11, fontWeight:700, letterSpacing:1, marginBottom:2 }}>
        {meta.label.toUpperCase()}
      </div>
      <div style={{ color:'#455a64', fontSize:9 }}>{meta.desc}</div>
      {selected && (
        <div style={{
          position:'absolute', top:-8, right:-8,
          width:20, height:20, borderRadius:'50%',
          background:meta.color,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:11, color:'#fff', fontWeight:700,
        }}>✓</div>
      )}
    </div>
  );
}

export default function DuelScreen() {
  const activeDuel = useGameStore(s => s.activeDuel);
  const closeDuel  = useGameStore(s => s.closeDuel);

  const [selected,  setSelected]  = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft,  setTimeLeft]  = useState(30);
  const [result,    setResult]    = useState(null);
  const [closing,   setClosing]   = useState(false);
  const timerRef = useRef(null);
  const mobile = isMobile();

  useEffect(() => {
    if (!activeDuel) return;
    setSelected([]); setSubmitted(false); setResult(null); setClosing(false);
    setTimeLeft(Math.floor((activeDuel.timeLimit || 30000) / 1000));

    timerRef.current = setInterval(() =>
      setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); return 0; } return t - 1; })
    , 1000);

    const socket = getSocket();
    const onResolved = ({ resolution }) => {
      clearInterval(timerRef.current);
      setResult(resolution); setSubmitted(true);
      setTimeout(() => { setClosing(true); setTimeout(() => closeDuel(), 400); }, 3200);
    };
    socket.once('duelResolved', onResolved);
    return () => { clearInterval(timerRef.current); socket.off('duelResolved', onResolved); };
  }, [activeDuel?.duelId]);

  const toggleCard = useCallback((idx) => {
    if (submitted) return;
    setSelected(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx);
      if (prev.length >= 3)   return prev;
      return [...prev, idx];
    });
  }, [submitted]);

  const submitCards = useCallback((overrideCards) => {
    if (!activeDuel || submitted) return;
    setSubmitted(true); clearInterval(timerRef.current);
    const cards = overrideCards ?? (selected.length > 0 ? selected.map(i => activeDuel.yourCards[i]) : ['normal']);
    getSocket().emit('submitCards', { duelId: activeDuel.duelId, cards });
  }, [activeDuel, selected, submitted]);

  useEffect(() => { if (timeLeft === 0 && !submitted) submitCards(['normal']); }, [timeLeft]);

  if (!activeDuel) return null;

  const { yourCards=[], opponentUsername, opponentStatus, role } = activeDuel;
  const timerPct   = (timeLeft / 30) * 100;
  const timerColor = timeLeft<=5?'#ef5350': timeLeft<=10?'#ffa726':'#29b6f6';
  const myOutcome  = result ? (role==='attacker' ? result.attackerOutcome : result.defenderOutcome) : null;

  // On mobile show at most 4 per row, ensure grid fits screen
  const cols = Math.min(yourCards.length, mobile ? 3 : 4);

  return (
    <div style={{
      ...S.overlay,
      opacity:closing?0:1, transition:'opacity 0.4s ease',
      alignItems: mobile ? 'flex-end' : 'center',
    }}>
      <div style={{
        ...S.modal,
        borderRadius: mobile ? '16px 16px 0 0' : 16,
        padding: mobile ? '20px 16px 28px' : '26px 28px 24px',
        maxHeight: mobile ? '90vh' : '95vh',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.duelLabel}>⚔ CARD DUEL</div>
            <div style={S.vs}>
              vs <span style={{ color: opponentStatus==='zombie'?'#66bb6a':'#29b6f6' }}>
                {opponentUsername||'Unknown'}
              </span>
              <span style={{
                ...S.statusChip,
                background: opponentStatus==='zombie'?'#0e1e0e':'#060e18',
                color:      opponentStatus==='zombie'?'#66bb6a':'#29b6f6',
              }}>
                {(opponentStatus||'human').toUpperCase()}
              </span>
            </div>
          </div>
          <div style={{
            ...S.timer, color:timerColor, fontSize: mobile?30:36,
            animation: timeLeft<=5?'pulse 0.6s ease-in-out infinite':'none',
          }}>
            {String(timeLeft).padStart(2,'0')}s
          </div>
        </div>

        {/* Timer bar */}
        <div style={S.timerTrack}>
          <div style={{ ...S.timerFill, width:`${timerPct}%`, background:timerColor, transition:'width 1s linear,background 0.5s' }} />
        </div>

        {/* Result */}
        {result && (
          <div style={S.resultBanner}>
            {myOutcome && (
              <div style={{ ...S.outcomeRow, color:OUTCOME_STYLE[myOutcome]?.color||'#ccc' }}>
                <span style={{ fontSize:24 }}>{OUTCOME_STYLE[myOutcome]?.icon}</span>
                <span style={{ fontSize:16, fontWeight:700, letterSpacing:1 }}>
                  YOU {OUTCOME_STYLE[myOutcome]?.label}
                </span>
              </div>
            )}
            {result.log?.map((msg,i) => <div key={i} style={S.logLine}>{msg}</div>)}
            <div style={S.cardsReveal}>
              <span style={{ color:'#37474f', fontSize:11 }}>You played:</span>
              <span style={{ color:(CARD_META[result.attackerCard]||CARD_META.normal).color, fontSize:13, fontWeight:700 }}>
                {(CARD_META[result.attackerCard]||CARD_META.normal).icon} {result.attackerCard?.toUpperCase()}
              </span>
              <span style={{ color:'#263548' }}>vs</span>
              <span style={{ color:(CARD_META[result.defenderCard]||CARD_META.normal).color, fontSize:13, fontWeight:700 }}>
                {(CARD_META[result.defenderCard]||CARD_META.normal).icon} {result.defenderCard?.toUpperCase()}
              </span>
            </div>
          </div>
        )}

        {/* Card selection */}
        {!result && (
          <>
            <div style={S.instruction}>
              Select up to <strong style={{ color:'#cfd8dc' }}>3 cards</strong>
              <span style={{ color:'#37474f', marginLeft:8 }}>({selected.length}/3)</span>
            </div>

            <div style={{ ...S.cardGrid, gridTemplateColumns:`repeat(${cols}, 1fr)` }}>
              {yourCards.map((card, idx) => (
                <CardTile
                  key={idx}
                  card={card}
                  selected={selected.includes(idx)}
                  onClick={() => toggleCard(idx)}
                  disabled={(selected.length>=3 && !selected.includes(idx)) || submitted}
                />
              ))}
            </div>

            {yourCards.length === 0 && (
              <div style={S.noCards}>No cards — Normal card will be played automatically.</div>
            )}

            <button
              style={{
                ...S.submitBtn,
                padding: mobile ? '16px' : '13px',
                fontSize: mobile ? 15 : 13,
                opacity: submitted ? 0.5 : 1,
                background: submitted ? '#263548' : '#ef5350',
              }}
              onClick={() => submitCards()}
              disabled={submitted}
            >
              {submitted
                ? '⏳ Waiting for opponent…'
                : selected.length===0
                  ? 'Play Normal (no selection)'
                  : `Play ${selected.length} card${selected.length!==1?'s':''} →`}
            </button>
          </>
        )}

        {result && <div style={S.closingHint}>Returning to game…</div>}
      </div>
    </div>
  );
}

const S = {
  overlay:{
    position:'fixed', inset:0, background:'rgba(4,8,16,0.88)',
    display:'flex', justifyContent:'center', zIndex:500,
    fontFamily:"'Courier New',monospace", backdropFilter:'blur(3px)',
  },
  modal:{
    background:'#080f1a', border:'1px solid #1a3040',
    width:500, maxWidth:'calc(100vw - 0px)',
    boxShadow:'0 0 100px rgba(239,83,80,0.15)',
    animation:'slideUp 0.25s ease',
  },
  header:{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 },
  duelLabel:{ color:'#ef5350', fontSize:11, letterSpacing:3, marginBottom:4 },
  vs:{ color:'#b0bec5', fontSize:15, display:'flex', alignItems:'center', flexWrap:'wrap', gap:6 },
  statusChip:{ fontSize:10, letterSpacing:1, padding:'2px 8px', borderRadius:4, fontWeight:700 },
  timer:{ fontWeight:700, letterSpacing:2, lineHeight:1, minWidth:56, textAlign:'right' },
  timerTrack:{ height:3, background:'#0d1a26', borderRadius:2, overflow:'hidden', marginBottom:16 },
  timerFill:{ height:'100%', borderRadius:2 },
  instruction:{ color:'#546e7a', fontSize:12, letterSpacing:0.5, marginBottom:12, textAlign:'center' },
  cardGrid:{ display:'grid', gap:10, marginBottom:16 },
  noCards:{ color:'#455a64', fontSize:12, textAlign:'center', padding:'16px 0', marginBottom:16 },
  submitBtn:{ width:'100%', border:'none', borderRadius:10, color:'#fff', fontFamily:'inherit', fontWeight:700, letterSpacing:1, transition:'background 0.25s,opacity 0.2s' },
  resultBanner:{ background:'#050d18', border:'1px solid #1a2e1a', borderRadius:12, padding:'14px 16px', marginBottom:0 },
  outcomeRow:{ display:'flex', alignItems:'center', gap:10, marginBottom:8 },
  logLine:{ color:'#607d8b', fontSize:12, letterSpacing:0.3, marginBottom:4, lineHeight:1.5 },
  cardsReveal:{ display:'flex', alignItems:'center', gap:8, marginTop:10, flexWrap:'wrap' },
  closingHint:{ color:'#1e3040', fontSize:11, textAlign:'center', marginTop:14, letterSpacing:1 },
};
