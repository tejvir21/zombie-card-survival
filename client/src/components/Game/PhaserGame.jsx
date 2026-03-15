// src/components/Game/PhaserGame.jsx
import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GameScene }     from '../../scenes/GameScene.js';
import { useGameStore }  from '../../store/gameStore';

export default function PhaserGame() {
  const containerRef = useRef(null);
  const gameRef      = useRef(null);

  const players  = useGameStore(s => s.players);
  const myId     = useGameStore(s => s.myId);
  const myStatus = useGameStore(s => s.myStatus);
  const mapSize  = useGameStore(s => s.mapSize);

  useEffect(() => {
    // Only create the game once
    if (gameRef.current || !containerRef.current) return;

    const config = {
      type      : Phaser.AUTO,
      parent    : containerRef.current,
      width     : window.innerWidth,
      height    : window.innerHeight,
      backgroundColor: '#070f1a',
      physics: {
        default: 'arcade',
        arcade : { gravity: { y: 0 }, debug: false },
      },
      scene: [GameScene],
      scale: {
        mode      : Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      // Prevent Phaser stealing keyboard focus from React forms
      input: {
        keyboard: true,
        mouse   : true,
        touch   : true,
      },
    };

    const game = new Phaser.Game(config);

    // Pass the initial state to the scene once Phaser is ready
    game.events.once('ready', () => {
      game.scene.start('GameScene', {
        players   : players,
        myId      : myId,
        myStatus  : myStatus,
        mapWidth  : mapSize.width,
        mapHeight : mapSize.height,
      });
    });

    // Handle window resize
    const onResize = () => {
      game.scale.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    gameRef.current = game;

    return () => {
      window.removeEventListener('resize', onResize);
      game.destroy(true);
      gameRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only run once on mount

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset   : 0,
        zIndex  : 1,
      }}
    />
  );
}
