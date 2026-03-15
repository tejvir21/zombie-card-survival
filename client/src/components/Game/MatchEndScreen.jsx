// src/components/Game/MatchEndScreen.jsx
import { useGameStore } from '../../store/gameStore';

const WIN_META = {
  zombies_win: {
    icon : '☣',
    title: 'ZOMBIES WIN',
    color: '#66bb6a',
    sub  : 'All humans have been infected or eliminated.',
    glow : 'rgba(102,187,106,0.15)',
  },
  humans_win: {
    icon : '🏆',
    title: 'HUMANS WIN',
    color: '#29b6f6',
    sub  : 'All zombies have been neutralised.',
    glow : 'rgba(41,182,246,0.15)',
  },
  timeout: {
    icon : '⏱',
    title: "TIME'S UP",
    color: '#ffd700',
    sub  : 'The match ended by time limit. Most survivors win.',
    glow : 'rgba(255,215,0,0.1)',
  },
};

const RANK_ICON = (rank) => {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return rank;
};

const STATUS_COLOR = { human: '#29b6f6', zombie: '#66bb6a', dead: '#455a64' };
const STATUS_ICON  = { human: '👤', zombie: '☣', dead: '💀' };

export default function MatchEndScreen() {
  const matchResult = useGameStore(s => s.matchResult);
  const reset       = useGameStore(s => s.reset);

  if (!matchResult) return null;

  const { winCondition, standings = [], reason } = matchResult;
  const meta = WIN_META[winCondition] || WIN_META.timeout;

  return (
    <div style={{ ...S.overlay, boxShadow: `inset 0 0 120px ${meta.glow}` }}>
      <div style={S.panel}>

        {/* ── Win banner ──────────────────────────────────────────── */}
        <div style={S.banner}>
          <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 8 }}>{meta.icon}</div>
          <h1 style={{ ...S.winTitle, color: meta.color }}>
            {meta.title}
          </h1>
          <p style={S.winSub}>{meta.sub}</p>
        </div>

        {/* ── Standings table ─────────────────────────────────────── */}
        {standings.length > 0 && (
          <div style={S.tableWrap}>
            <div style={S.tableHead}>
              <span style={S.col.rank}>#</span>
              <span style={S.col.name}>Player</span>
              <span style={S.col.status}>Status</span>
              <span style={S.col.stat}>Kills</span>
              <span style={S.col.stat}>Infect</span>
              <span style={S.col.stat}>Score</span>
            </div>

            {standings.map((p, i) => {
              const score = (p.kills || 0) * 3 + (p.infections || 0) * 2 + (p.rank === 1 ? 10 : 0);
              return (
                <div
                  key={p.playerId}
                  style={{
                    ...S.tableRow,
                    background: i === 0 ? '#0a1a0a' : i % 2 === 0 ? '#090f18' : '#070d16',
                    borderLeft: i === 0 ? `3px solid ${meta.color}` : '3px solid transparent',
                  }}
                >
                  <span style={{ ...S.col.rank, fontSize: i < 3 ? 16 : 13 }}>
                    {RANK_ICON(i + 1)}
                  </span>
                  <span style={{ ...S.col.name, color: i === 0 ? meta.color : '#b0bec5' }}>
                    {p.username || p.playerId?.slice(0, 8)}
                  </span>
                  <span style={{ ...S.col.status, color: STATUS_COLOR[p.status] || '#546e7a' }}>
                    {STATUS_ICON[p.status]} {p.status?.toUpperCase()}
                  </span>
                  <span style={{ ...S.col.stat, color: p.kills > 0 ? '#ef5350' : '#37474f' }}>
                    {p.kills || 0}
                  </span>
                  <span style={{ ...S.col.stat, color: p.infections > 0 ? '#66bb6a' : '#37474f' }}>
                    {p.infections || 0}
                  </span>
                  <span style={{ ...S.col.stat, color: score > 0 ? '#ffd700' : '#37474f' }}>
                    {score}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {standings.length === 0 && (
          <div style={S.noStandings}>No survivors recorded.</div>
        )}

        {/* ── Score legend ────────────────────────────────────────── */}
        <div style={S.legend}>
          <span style={S.legendItem}><span style={{ color: '#ffd700' }}>Win</span> +10</span>
          <span style={S.legendItem}><span style={{ color: '#ef5350' }}>Kill</span> +3</span>
          <span style={S.legendItem}><span style={{ color: '#66bb6a' }}>Infect</span> +2</span>
        </div>

        {/* ── Actions ────────────────────────────────────────────── */}
        <div style={S.actions}>
          <button style={S.btnPrimary} onClick={reset}>
            ▶ Play Again
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position      : 'fixed',
    inset         : 0,
    background    : 'rgba(3,6,12,0.94)',
    display       : 'flex',
    alignItems    : 'center',
    justifyContent: 'center',
    zIndex        : 900,
    fontFamily    : "'Courier New', monospace",
    backdropFilter: 'blur(4px)',
  },
  panel: {
    background  : '#080f1a',
    border      : '1px solid #152535',
    borderRadius: 16,
    padding     : '32px 36px',
    width       : 540,
    maxWidth    : 'calc(100vw - 32px)',
    maxHeight   : 'calc(100vh - 32px)',
    overflowY   : 'auto',
    boxShadow   : '0 0 80px rgba(0,0,0,0.6)',
    animation   : 'slideUp 0.3s ease',
  },
  banner: {
    textAlign    : 'center',
    marginBottom : 24,
    paddingBottom: 20,
    borderBottom : '1px solid #0e1e2e',
  },
  winTitle: {
    fontSize     : 28,
    fontWeight   : 700,
    letterSpacing: 4,
    margin       : '0 0 6px',
  },
  winSub: {
    color    : '#37474f',
    fontSize : 12,
    letterSpacing: 0.5,
  },

  // Table
  tableWrap: {
    marginBottom: 16,
    borderRadius: 8,
    overflow    : 'hidden',
    border      : '1px solid #0e1e2e',
  },
  tableHead: {
    display    : 'flex',
    alignItems : 'center',
    background : '#060c18',
    padding    : '8px 12px',
    color      : '#1e3040',
    fontSize   : 10,
    letterSpacing: 2,
    borderBottom: '1px solid #0e1e2e',
  },
  tableRow: {
    display    : 'flex',
    alignItems : 'center',
    padding    : '10px 12px',
    fontSize   : 12,
    borderBottom: '1px solid #080f1a',
    transition : 'background 0.15s',
  },
  col: {
    rank  : { width: 36, flexShrink: 0 },
    name  : { flex: 1, minWidth: 80 },
    status: { width: 90, flexShrink: 0, fontSize: 10, letterSpacing: 0.5 },
    stat  : { width: 52, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  },

  noStandings: {
    color    : '#37474f',
    textAlign: 'center',
    padding  : '20px 0',
    fontSize : 13,
  },

  legend: {
    display       : 'flex',
    justifyContent: 'center',
    gap           : 16,
    marginBottom  : 20,
    color         : '#37474f',
    fontSize      : 11,
    letterSpacing : 0.5,
  },
  legendItem: { display: 'flex', gap: 4 },

  actions: { display: 'flex', gap: 10 },
  btnPrimary: {
    flex        : 1,
    padding     : '13px',
    background  : '#ef5350',
    border      : 'none',
    borderRadius: 10,
    color       : '#fff',
    fontSize    : 13,
    fontFamily  : 'inherit',
    fontWeight  : 700,
    letterSpacing: 1,
    transition  : 'opacity 0.15s',
  },
};
