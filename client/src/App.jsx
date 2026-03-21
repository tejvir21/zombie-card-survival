// src/App.jsx
import { useGameStore }    from './store/gameStore';
import { useSocketEvents } from './hooks/useSocketEvents';
import LobbyScreen         from './components/Lobby/LobbyScreen';
import PhaserGame          from './components/Game/PhaserGame';
import GameHUD             from './components/HUD/GameHUD';
import DuelScreen          from './components/Duel/DuelScreen';
import MatchEndScreen      from './components/Game/MatchEndScreen';

/**
 * Shown on portrait phones while IN the game.
 * The lobby works fine in portrait so we only show this during gameplay.
 */
function LandscapeHint() {
  return (
    <div className="rotate-hint">
      <div className="icon">📱</div>
      <p>Please rotate your device to landscape to play</p>
    </div>
  );
}

export default function App() {
  const phase = useGameStore(s => s.phase);

  // Register all socket→store listeners once at the top level
  useSocketEvents();

  const inGame = phase === 'game' || phase === 'duel' || phase === 'ended';

  return (
    <div style={{ width:'100%', height:'100%', background:'#070f1a' }}>

      {/* Landscape nudge — only visible during gameplay on portrait phones */}
      {inGame && <LandscapeHint />}

      {/* Menu / Lobby — works fine in both orientations */}
      {(phase === 'menu' || phase === 'lobby') && <LobbyScreen />}

      {/* Active game */}
      {inGame && (
        <>
          <PhaserGame />
          {phase !== 'ended' && <GameHUD />}
          {phase === 'duel'  && <DuelScreen />}
          {phase === 'ended' && <MatchEndScreen />}
        </>
      )}
    </div>
  );
}
