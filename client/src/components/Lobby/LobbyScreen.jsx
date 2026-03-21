// src/components/Lobby/LobbyScreen.jsx
import { useState, useCallback } from 'react';
import { connectSocket, getSocket } from '../../utils/socket';
import { useGameStore }             from '../../store/gameStore';

const CARD_INFO = [
  { type: 'zombie',  icon: '☣',  color: '#ef5350', desc: 'Infects humans. Zombies cannot hold Gun or Vaccine.' },
  { type: 'vaccine', icon: '💉', color: '#26c6da', desc: 'Cures a zombie. Single-use. No effect on humans.' },
  { type: 'gun',     icon: '🔫', color: '#ffa726', desc: 'Kills any player instantly. Single-use.' },
  { type: 'normal',  icon: '🃏', color: '#78909c', desc: 'Neutral card. No effect against anyone.' },
];

function StatusDot({ status }) {
  const colors = { human: '#29b6f6', zombie: '#66bb6a', dead: '#546e7a' };
  return (
    <span style={{
      display:'inline-block', width:8, height:8, borderRadius:'50%',
      background: colors[status]||'#546e7a', marginRight:6, flexShrink:0,
    }} />
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const copy = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(copy).catch(() => {
        const el = Object.assign(document.createElement('textarea'), { value: text });
        document.body.appendChild(el); el.select(); document.execCommand('copy');
        document.body.removeChild(el); copy();
      });
    } else {
      const el = Object.assign(document.createElement('textarea'), { value: text });
      document.body.appendChild(el); el.select(); document.execCommand('copy');
      document.body.removeChild(el); copy();
    }
  };
  return (
    <button onClick={handleCopy} style={S.copyBtn}>
      {copied ? '✓ Copied!' : '⎘ Copy'}
    </button>
  );
}

export default function LobbyScreen() {
  const [username,  setUsername]  = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [joining,   setJoining]   = useState(false);
  const [error,     setError]     = useState('');
  const [mode,      setMode]      = useState('create'); // 'create' | 'join'

  const phase        = useGameStore(s => s.phase);
  const lobbyId      = useGameStore(s => s.lobbyId);
  const lobbyPlayers = useGameStore(s => s.lobbyPlayers);
  const myId         = useGameStore(s => s.myId);

  const emitJoin = useCallback((socket, name, id) => {
    socket.emit('joinLobby', { username: name, lobbyId: id || undefined }, res => {
      setJoining(false);
      if (res?.error) setError(res.error);
    });
  }, []);

  const handleCreate = useCallback(() => {
    const name = username.trim();
    if (!name) { setError('Please enter a username first'); return; }
    setError(''); setJoining(true);
    const socket = connectSocket();
    // Pass NO lobbyId → server creates a fresh lobby
    if (socket.connected) { emitJoin(socket, name, null); }
    else { socket.once('connect', () => emitJoin(socket, name, null)); }
  }, [username, emitJoin]);

  const handleJoinByCode = useCallback(() => {
    const name = username.trim();
    const code = lobbyCode.trim();
    if (!name) { setError('Please enter a username'); return; }
    if (!code) { setError('Please paste the lobby code'); return; }
    setError(''); setJoining(true);
    const socket = connectSocket();
    if (socket.connected) { emitJoin(socket, name, code); }
    else { socket.once('connect', () => emitJoin(socket, name, code)); }
  }, [username, lobbyCode, emitJoin]);

  const handleStart = useCallback(() => {
    if (!lobbyId) return;
    getSocket().emit('startMatch', { lobbyId }, res => {
      if (res?.error) setError(res.error);
    });
  }, [lobbyId]);

  // ── Lobby waiting room ────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <div style={S.screen}>
        <div style={S.panel}>
          <div style={S.titleRow}>
            <h1 style={S.title}>☣</h1>
            <div>
              <div style={S.gameName}>Zombie Card Survival</div>
              <div style={S.tagline}>Infect · Cure · Eliminate</div>
            </div>
          </div>

          {/* Share code */}
          <div style={S.shareBox}>
            <div style={S.shareLabel}>INVITE FRIENDS — share this code</div>
            <div style={S.shareRow}>
              <code style={S.shareCode}>{lobbyId || '…'}</code>
              {lobbyId && <CopyButton text={lobbyId} />}
            </div>
            <div style={S.shareHint}>
              Friends paste this full code on the "Join with Code" tab
            </div>
          </div>

          {/* Player list */}
          <div style={S.lobbyBox}>
            <div style={S.lobbyHeader}>
              <span style={S.pill}>PLAYERS</span>
              <span style={{ color:'#263548', fontSize:11 }}>{lobbyPlayers.length} / 20</span>
            </div>
            <div style={S.playerScroll}>
              {lobbyPlayers.length === 0 && <div style={S.emptyList}>Waiting for players…</div>}
              {lobbyPlayers.map(p => (
                <div key={p.id} style={S.playerRow}>
                  <StatusDot status={p.status} />
                  <span style={{ flex:1, color:'#cfd8dc', fontSize:13 }}>
                    {p.username || p.id.slice(0,8)}
                  </span>
                  {p.id === myId && <span style={S.youBadge}>YOU</span>}
                </div>
              ))}
            </div>
          </div>

          <div style={S.cardRow}>
            {CARD_INFO.map(c => (
              <div key={c.type} style={{ ...S.cardChip, borderColor: c.color+'44' }}>
                <span style={{ fontSize:16 }}>{c.icon}</span>
                <span style={{ color:c.color, fontSize:9, letterSpacing:0.5 }}>{c.type.toUpperCase()}</span>
              </div>
            ))}
          </div>

          {error && <div style={S.errorBox}>{error}</div>}

          <button
            style={{ ...S.btnPrimary, opacity: lobbyPlayers.length < 2 ? 0.4 : 1 }}
            onClick={handleStart}
            disabled={lobbyPlayers.length < 2}
          >
            {lobbyPlayers.length < 2
              ? `Waiting for players… (${lobbyPlayers.length}/2 min)`
              : `▶ Start Match (${lobbyPlayers.length} players)`}
          </button>
        </div>
      </div>
    );
  }

  // ── Join / Create menu ────────────────────────────────────────────────────
  return (
    <div style={S.screen}>
      <div style={S.scanlines} />
      <div style={S.panel}>
        <div style={S.titleRow}>
          <h1 style={S.title}>☣</h1>
          <div>
            <div style={S.gameName}>Zombie Card Survival</div>
            <div style={S.tagline}>Infect · Cure · Eliminate</div>
          </div>
        </div>

        {/* Username */}
        <div style={{ marginBottom:14 }}>
          <input
            style={S.input}
            placeholder="Your username"
            value={username}
            maxLength={20}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (mode === 'join' ? handleJoinByCode() : handleCreate())}
            autoFocus
          />
        </div>

        {/* Mode tabs */}
        <div style={S.modeTabs}>
          <button
            style={{ ...S.modeTab, ...(mode === 'create' ? S.modeTabActive : {}) }}
            onClick={() => { setMode('create'); setError(''); }}
          >
            Create Lobby
          </button>
          <button
            style={{ ...S.modeTab, ...(mode === 'join' ? S.modeTabActive : {}) }}
            onClick={() => { setMode('join'); setError(''); }}
          >
            Join with Code
          </button>
        </div>

        {/* Create */}
        {mode === 'create' && (
          <div style={S.modePanel}>
            <p style={S.modeDesc}>
              Creates a private room. You'll receive a code to share with friends.
            </p>
            {error && <div style={S.errorBox}>{error}</div>}
            <button
              style={{ ...S.btnPrimary, opacity: joining ? 0.6 : 1 }}
              onClick={handleCreate}
              disabled={joining}
            >
              {joining ? 'Creating lobby…' : '+ Create Private Lobby'}
            </button>
          </div>
        )}

        {/* Join */}
        {mode === 'join' && (
          <div style={S.modePanel}>
            <p style={S.modeDesc}>
              Paste the full lobby code your friend shared with you.
            </p>
            <input
              style={{ ...S.input, fontFamily:'monospace', fontSize:11, letterSpacing:1, marginBottom:0 }}
              placeholder="Paste full lobby code here…"
              value={lobbyCode}
              maxLength={36}
              onChange={e => setLobbyCode(e.target.value.trim())}
              onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
              spellCheck={false}
              autoComplete="off"
            />
            {error && <div style={S.errorBox}>{error}</div>}
            <button
              style={{ ...S.btnPrimary, opacity: joining || !lobbyCode.trim() ? 0.5 : 1 }}
              onClick={handleJoinByCode}
              disabled={joining || !lobbyCode.trim()}
            >
              {joining ? 'Joining…' : '⚔ Join Lobby'}
            </button>
          </div>
        )}

        {/* How to play */}
        <div style={S.divider}><span style={S.dividerText}>HOW TO PLAY</span></div>
        <div style={S.rules}>
          {[
            ['🕹','Move with WASD or arrow keys'],
            ['⚔','Walk into another player to trigger a card duel'],
            ['🃏','Choose up to 3 cards before the 30-second timer expires'],
            ['☣','Zombie card infects a human; vaccine cures a zombie'],
            ['🔫','Gun instantly eliminates any player — one-time use'],
            ['🏆','Last faction standing wins, or most survivors at time-up'],
          ].map(([icon, text]) => (
            <div key={text} style={S.ruleRow}>
              <span style={S.ruleIcon}>{icon}</span>
              <span style={S.ruleText}>{text}</span>
            </div>
          ))}
        </div>

        <div style={S.divider}><span style={S.dividerText}>CARDS</span></div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {CARD_INFO.map(c => (
            <div key={c.type} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
              <span style={{ fontSize:18, width:28, textAlign:'center' }}>{c.icon}</span>
              <div>
                <span style={{ color:c.color, fontSize:12, fontWeight:700 }}>
                  {c.type.charAt(0).toUpperCase()+c.type.slice(1)}
                </span>
                <span style={{ color:'#546e7a', fontSize:11, marginLeft:8 }}>{c.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const S = {
  screen:{ minHeight:'100vh', background:'#070f1a', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Courier New',monospace", position:'relative', overflowY:'auto' },
  scanlines:{ position:'fixed', inset:0, background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px)', pointerEvents:'none', zIndex:0 },
  panel:{ position:'relative', zIndex:1, background:'#0b1624', border:'1px solid #152535', borderRadius:14, padding:'32px 36px', width:460, maxWidth:'calc(100vw - 32px)', boxShadow:'0 0 80px rgba(41,182,246,0.06)', animation:'fadeIn 0.35s ease', margin:'24px auto' },
  titleRow:{ display:'flex', alignItems:'center', gap:14, marginBottom:22 },
  title:{ fontSize:44, lineHeight:1, color:'#ef5350', textShadow:'0 0 24px rgba(239,83,80,0.5)' },
  gameName:{ color:'#eceff1', fontSize:22, letterSpacing:2, fontWeight:700, lineHeight:1.2 },
  tagline:{ color:'#37474f', fontSize:11, letterSpacing:3, marginTop:2 },
  input:{ width:'100%', background:'#0d1e2e', border:'1px solid #1a3040', borderRadius:8, padding:'11px 14px', color:'#cfd8dc', fontSize:13, fontFamily:'inherit', display:'block' },
  modeTabs:{ display:'flex', border:'1px solid #1a3040', borderRadius:8, overflow:'hidden', marginBottom:0 },
  modeTab:{ flex:1, padding:'9px', background:'#0d1e2e', border:'none', color:'#37474f', fontSize:12, fontFamily:'inherit', letterSpacing:0.5, cursor:'pointer', transition:'background 0.15s,color 0.15s' },
  modeTabActive:{ background:'#0f2a3d', color:'#29b6f6' },
  modePanel:{ background:'#080f1a', border:'1px solid #0e1e2e', borderTop:'none', borderRadius:'0 0 8px 8px', padding:'14px 14px', marginBottom:20, display:'flex', flexDirection:'column', gap:10 },
  modeDesc:{ color:'#37474f', fontSize:11, lineHeight:1.5, letterSpacing:0.3 },
  btnPrimary:{ background:'#ef5350', border:'none', borderRadius:9, color:'#fff', fontSize:13, fontFamily:'inherit', fontWeight:700, padding:'12px', letterSpacing:1, transition:'opacity 0.2s', width:'100%' },
  errorBox:{ background:'#120808', border:'1px solid #3d1414', borderRadius:6, color:'#ef9a9a', fontSize:12, padding:'8px 12px', lineHeight:1.4 },
  shareBox:{ background:'#050d18', border:'1px solid #1a3d1a', borderRadius:10, padding:'14px 16px', marginBottom:14 },
  shareLabel:{ color:'#2e5e2e', fontSize:10, letterSpacing:2, marginBottom:8, textTransform:'uppercase' },
  shareRow:{ display:'flex', alignItems:'center', gap:10, marginBottom:8 },
  shareCode:{ flex:1, color:'#66bb6a', fontSize:11, letterSpacing:1, wordBreak:'break-all', lineHeight:1.5, fontFamily:'monospace', background:'#080f10', border:'1px solid #1a3020', borderRadius:6, padding:'6px 10px' },
  copyBtn:{ background:'#0e2a0e', border:'1px solid #2e5e2e', borderRadius:7, color:'#66bb6a', fontSize:11, fontFamily:'inherit', padding:'7px 12px', cursor:'pointer', whiteSpace:'nowrap', letterSpacing:0.5, flexShrink:0, transition:'background 0.15s' },
  shareHint:{ color:'#263548', fontSize:10, lineHeight:1.4, letterSpacing:0.3 },
  lobbyBox:{ background:'#080e18', border:'1px solid #122030', borderRadius:10, padding:'12px 14px', marginBottom:14 },
  lobbyHeader:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  pill:{ background:'#0d1e2e', color:'#37474f', fontSize:9, letterSpacing:3, padding:'3px 8px', borderRadius:4 },
  playerScroll:{ maxHeight:200, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 },
  playerRow:{ display:'flex', alignItems:'center', padding:'5px 4px', borderRadius:5, background:'#0b1624' },
  youBadge:{ background:'#0d1e2e', color:'#29b6f6', fontSize:9, letterSpacing:2, padding:'2px 6px', borderRadius:3, border:'1px solid #1a3040', marginLeft:6 },
  emptyList:{ color:'#263548', fontSize:12, textAlign:'center', padding:'12px 0' },
  cardRow:{ display:'flex', gap:6, marginBottom:14 },
  cardChip:{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, background:'#080e18', border:'1px solid', borderRadius:7, padding:'8px 4px' },
  divider:{ borderTop:'1px solid #121f2e', margin:'18px 0 14px', textAlign:'center', position:'relative' },
  dividerText:{ background:'#0b1624', color:'#1e2f3d', fontSize:10, letterSpacing:3, padding:'0 8px', position:'relative', top:-8 },
  rules:{ display:'flex', flexDirection:'column', gap:6, marginBottom:4 },
  ruleRow:{ display:'flex', alignItems:'flex-start', gap:10 },
  ruleIcon:{ fontSize:13, width:20, textAlign:'center', flexShrink:0, marginTop:1 },
  ruleText:{ color:'#546e7a', fontSize:11, lineHeight:1.5 },
};
