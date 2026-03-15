// src/App.jsx
import { useGameStore } from "./store/gameStore";
import { useSocketEvents } from "./hooks/useSocketEvents";
import LobbyScreen from "./components/Lobby/LobbyScreen";
import PhaserGame from "./components/Game/PhaserGame";
import GameHUD from "./components/HUD/GameHUD";
import DuelScreen from "./components/Duel/DuelScreen";
import MatchEndScreen from "./components/Game/MatchEndScreen";

export default function App() {
  const phase = useGameStore((s) => s.phase);

  // Register ALL socket→store listeners once here, at the top of the component tree
  useSocketEvents();

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#070f1a",
        overflowY: "auto",
      }}
    >
      {/* ── Menu / Lobby ─────────────────────────────────── */}
      {(phase === "menu" || phase === "lobby") && <LobbyScreen />}

      {/* ── Active game ──────────────────────────────────── */}
      {(phase === "game" || phase === "duel" || phase === "ended") && (
        <>
          {/* Phaser canvas — always mounted once game starts */}
          <PhaserGame />

          {/* HUD overlaid on canvas */}
          {phase !== "ended" && <GameHUD />}

          {/* Duel overlay (sits above HUD) */}
          {phase === "duel" && <DuelScreen />}

          {/* Match-end results (sits above everything) */}
          {phase === "ended" && <MatchEndScreen />}
        </>
      )}
    </div>
  );
}
