// src/scenes/GameScene.js
import Phaser from 'phaser';
import { getSocket } from '../utils/socket';

const TILE       = 32;
const SPEED      = 210;
const SEND_MS    = 50;   // throttle position broadcasts to 20/s

// ─── Room definition type ─────────────────────────────────────────────────────
// { x, y, w, h, label }

const ROOMS = [
  { x: 64,   y: 64,   w: 384, h: 256, label: 'Classroom A' },
  { x: 576,  y: 64,   w: 320, h: 256, label: 'Library' },
  { x: 1024, y: 64,   w: 448, h: 256, label: 'Lab' },
  { x: 1600, y: 64,   w: 352, h: 256, label: 'Gym' },
  { x: 64,   y: 512,  w: 256, h: 384, label: 'Canteen' },
  { x: 448,  y: 512,  w: 512, h: 384, label: 'Hall' },
  { x: 1088, y: 512,  w: 384, h: 384, label: 'Office' },
  { x: 1600, y: 512,  w: 448, h: 384, label: 'Storage' },
  { x: 128,  y: 1088, w: 320, h: 320, label: 'Toilet Block' },
  { x: 640,  y: 1088, w: 640, h: 320, label: 'Auditorium' },
  { x: 1408, y: 1088, w: 512, h: 320, label: 'Roof Access' },
];

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    this.mySprite   = null;
    this.myLabel    = null;
    this.others     = {};     // socketId → { sprite, label, glow }
    this.cursors    = null;
    this.wasd       = null;
    this.lastSent   = 0;
    this.mapW       = 2400;
    this.mapH       = 1800;
    this.myId       = null;
    this.myStatus   = 'human';
    this.initPlayers = {};
  }

  // ── init ─────────────────────────────────────────────────────────────────
  init(data) {
    this.myId       = data.myId       || null;
    this.myStatus   = data.myStatus   || 'human';
    this.mapW       = data.mapWidth   || 2400;
    this.mapH       = data.mapHeight  || 1800;
    this.initPlayers = data.players   || {};
  }

  // ── preload ───────────────────────────────────────────────────────────────
  preload() {
    this._buildTextures();
  }

  // ── create ────────────────────────────────────────────────────────────────
  create() {
    this._buildMap();
    this._setupCamera();
    this._setupControls();
    this._spawnAllPlayers();
    this._createMinimap();
    this._bindSocketEvents();
  }

  // ── update (game loop) ────────────────────────────────────────────────────
  update(time) {
    if (!this.mySprite) return;

    // ── Movement input ──────────────────────────────────────────────────────
    let vx = 0, vy = 0;
    const c = this.cursors, w = this.wasd;

    if (c.left.isDown  || w.left.isDown)  vx = -SPEED;
    else if (c.right.isDown || w.right.isDown) vx =  SPEED;

    if (c.up.isDown    || w.up.isDown)    vy = -SPEED;
    else if (c.down.isDown  || w.down.isDown)  vy =  SPEED;

    // Normalise diagonal movement
    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }

    this.mySprite.setVelocity(vx, vy);

    // Keep name label above sprite
    if (this.myLabel) {
      this.myLabel.setPosition(this.mySprite.x, this.mySprite.y - 26);
    }

    // Throttled position broadcast
    if (time - this.lastSent > SEND_MS && (vx !== 0 || vy !== 0)) {
      this.lastSent = time;
      getSocket().emit('playerMove', {
        x: Math.round(this.mySprite.x),
        y: Math.round(this.mySprite.y),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Texture generation (no external assets) ───────────────────────────────
  _buildTextures() {
    const g = (key, fn) => {
      const gfx = this.make.graphics({ add: false });
      fn(gfx);
      gfx.generateTexture(key, 32, 32);
      gfx.destroy();
    };

    // Floor tile
    g('floor', gfx => {
      gfx.fillStyle(0x0d1a2e); gfx.fillRect(0, 0, 32, 32);
      gfx.lineStyle(0.5, 0x101f30, 1); gfx.strokeRect(0, 0, 32, 32);
    });

    // Corridor tile (slightly lighter)
    g('corridor', gfx => {
      gfx.fillStyle(0x111e30); gfx.fillRect(0, 0, 32, 32);
      gfx.lineStyle(0.3, 0x0d1a28, 1); gfx.strokeRect(0, 0, 32, 32);
    });

    // Wall tile
    g('wall', gfx => {
      gfx.fillStyle(0x0a1628); gfx.fillRect(0, 0, 32, 32);
      gfx.fillStyle(0x0f2040, 0.5); gfx.fillRect(2, 2, 28, 28);
    });

    // Human player
    g('p_human', gfx => {
      gfx.fillStyle(0x29b6f6); gfx.fillCircle(16, 16, 13);
      gfx.lineStyle(2, 0x81d4fa); gfx.strokeCircle(16, 16, 13);
      // Eyes
      gfx.fillStyle(0xffffff); gfx.fillCircle(11, 13, 3); gfx.fillCircle(21, 13, 3);
      gfx.fillStyle(0x1565c0); gfx.fillCircle(12, 14, 2); gfx.fillCircle(22, 14, 2);
    });

    // Zombie player
    g('p_zombie', gfx => {
      gfx.fillStyle(0x66bb6a); gfx.fillCircle(16, 16, 13);
      gfx.lineStyle(2, 0x81c784); gfx.strokeCircle(16, 16, 13);
      // Red eyes
      gfx.fillStyle(0xff1744); gfx.fillCircle(11, 13, 3); gfx.fillCircle(21, 13, 3);
      gfx.fillStyle(0x000000); gfx.fillCircle(11, 14, 1); gfx.fillCircle(21, 14, 1);
      // Stitches
      gfx.lineStyle(1, 0x2e7d32);
      gfx.strokeRect(10, 20, 12, 1);
    });

    // My player (gold outline)
    g('p_me', gfx => {
      gfx.fillStyle(0x29b6f6); gfx.fillCircle(16, 16, 13);
      gfx.lineStyle(3, 0xffd700); gfx.strokeCircle(16, 16, 13);
      gfx.fillStyle(0xffffff); gfx.fillCircle(11, 13, 3); gfx.fillCircle(21, 13, 3);
      gfx.fillStyle(0x1565c0); gfx.fillCircle(12, 14, 2); gfx.fillCircle(22, 14, 2);
    });

    // My player (zombie)
    g('p_me_z', gfx => {
      gfx.fillStyle(0x66bb6a); gfx.fillCircle(16, 16, 13);
      gfx.lineStyle(3, 0xffd700); gfx.strokeCircle(16, 16, 13);
      gfx.fillStyle(0xff1744); gfx.fillCircle(11, 13, 3); gfx.fillCircle(21, 13, 3);
    });

    // Dead player
    g('p_dead', gfx => {
      gfx.fillStyle(0x37474f); gfx.fillCircle(16, 16, 9);
      gfx.lineStyle(1, 0x546e7a); gfx.strokeCircle(16, 16, 9);
      // X eyes
      gfx.lineStyle(1.5, 0x78909c);
      gfx.strokeLineShape(new Phaser.Geom.Line(9, 9, 14, 14));
      gfx.strokeLineShape(new Phaser.Geom.Line(14, 9, 9, 14));
      gfx.strokeLineShape(new Phaser.Geom.Line(18, 9, 23, 14));
      gfx.strokeLineShape(new Phaser.Geom.Line(23, 9, 18, 14));
    });

    // Encounter glow ring (32×32 transparent circle outline)
    g('encounter_ring', gfx => {
      gfx.lineStyle(2, 0xef5350, 0.6);
      gfx.strokeCircle(16, 16, 15);
    });
  }

  // ── Map build ─────────────────────────────────────────────────────────────
  _buildMap() {
    const cols = Math.ceil(this.mapW / TILE);
    const rows = Math.ceil(this.mapH / TILE);

    // Base corridor layer
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.add.image(c * TILE + TILE / 2, r * TILE + TILE / 2, 'corridor').setDepth(0);
      }
    }

    // Rooms
    ROOMS.forEach(room => {
      // Floor
      for (let ry = room.y; ry < room.y + room.h; ry += TILE) {
        for (let rx = room.x; rx < room.x + room.w; rx += TILE) {
          this.add.image(rx + TILE / 2, ry + TILE / 2, 'floor').setDepth(1);
        }
      }
      // Room border
      const border = this.add.graphics().setDepth(2);
      border.lineStyle(2, 0x1a3a5c, 0.9);
      border.strokeRect(room.x, room.y, room.w, room.h);

      // Room label
      this.add.text(room.x + 8, room.y + 8, room.label, {
        fontFamily: 'monospace',
        fontSize  : '10px',
        color     : '#1e3a5a',
      }).setDepth(2).setAlpha(0.8);
    });

    // Outer boundary walls
    const wallG = this.add.graphics().setDepth(3);
    wallG.lineStyle(4, 0x1a3a5c);
    wallG.strokeRect(2, 2, this.mapW - 4, this.mapH - 4);

    // Decorative interior pillars
    const pillars = [
      [320, 384], [704, 384], [1152, 384], [1536, 384],
      [320, 896], [704, 896], [1152, 896], [1536, 896],
    ];
    pillars.forEach(([px, py]) => {
      const pg = this.add.graphics().setDepth(3);
      pg.fillStyle(0x0f2a3d, 1);
      pg.fillRect(px - 8, py - 8, 16, 16);
      pg.lineStyle(1, 0x1a3a5c);
      pg.strokeRect(px - 8, py - 8, 16, 16);
    });

    // Set world bounds
    this.physics.world.setBounds(TILE, TILE, this.mapW - TILE * 2, this.mapH - TILE * 2);
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  _setupCamera() {
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    this.cameras.main.setZoom(1.3);
    this.cameras.main.setBackgroundColor(0x07101e);
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  _setupControls() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd    = this.input.keyboard.addKeys({
      up   : Phaser.Input.Keyboard.KeyCodes.W,
      left : Phaser.Input.Keyboard.KeyCodes.A,
      down : Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  // ── Spawn players ─────────────────────────────────────────────────────────
  _spawnAllPlayers() {
    Object.values(this.initPlayers).forEach(p => {
      if (p.id === this.myId) {
        this._spawnMe(p);
      } else {
        this._spawnOther(p);
      }
    });
  }

  _spawnMe(data) {
    const tex = data.status === 'zombie' ? 'p_me_z' : 'p_me';
    this.mySprite = this.physics.add.sprite(data.x, data.y, tex)
      .setCollideWorldBounds(true)
      .setDepth(10);

    this.cameras.main.startFollow(this.mySprite, true, 0.08, 0.08);

    this.myLabel = this.add.text(data.x, data.y - 26, '▶ You', {
      fontFamily     : 'monospace',
      fontSize       : '11px',
      color          : '#ffd700',
      stroke         : '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(11);
  }

  _spawnOther(data) {
    const tex = this._texForStatus(data.status, false);
    const sprite = this.add.sprite(data.x, data.y, tex).setDepth(9);

    const labelColor = data.status === 'zombie' ? '#81c784'
                     : data.status === 'dead'   ? '#546e7a'
                     : '#4fc3f7';

    const label = this.add.text(
      data.x,
      data.y - 26,
      data.username || data.id.slice(0, 6),
      {
        fontFamily     : 'monospace',
        fontSize       : '10px',
        color          : labelColor,
        stroke         : '#000000',
        strokeThickness : 3,
      }
    ).setOrigin(0.5, 0).setDepth(10);

    if (data.status === 'dead') {
      sprite.setAlpha(0.35);
      label.setAlpha(0.25);
    }

    this.others[data.id] = { sprite, label, status: data.status };
  }

  _texForStatus(status, isMe) {
    if (isMe)              return status === 'zombie' ? 'p_me_z'  : 'p_me';
    if (status === 'dead') return 'p_dead';
    return status === 'zombie' ? 'p_zombie' : 'p_human';
  }

  // ── Minimap ───────────────────────────────────────────────────────────────
  _createMinimap() {
    const W = 160, H = 100;
    const PX = this.cameras.main.width  - W - 14;
    const PY = 14;

    this.miniCam = this.cameras.add(PX, PY, W, H)
      .setZoom(W / this.mapW)
      .setBackgroundColor(0x060e1a)
      .setAlpha(0.75);
    this.miniCam.setBounds(0, 0, this.mapW, this.mapH);

    // Minimap border — drawn in screen space via a fixed camera overlay
    this.minimapBorder = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(200);
    this.minimapBorder.lineStyle(1, 0x1e3a4a);
    this.minimapBorder.strokeRect(PX - 1, PY - 1, W + 2, H + 2);

    this.add.text(PX + 4, PY + H - 14, 'MAP', {
      fontFamily: 'monospace', fontSize: '9px', color: '#1e3a4a',
    }).setScrollFactor(0).setDepth(201);
  }

  // ── Socket events (Phaser side) ───────────────────────────────────────────
  _bindSocketEvents() {
    const socket = getSocket();

    // ── Other player moved ─────────────────────────────────────────────────
    this._onPlayerMoved = ({ id, x, y }) => {
      const p = this.others[id];
      if (!p) return;
      this.tweens.add({
        targets : [p.sprite],
        x, y,
        duration: 55,
        ease    : 'Linear',
      });
      this.tweens.add({
        targets : [p.label],
        x,
        y       : y - 26,
        duration: 55,
        ease    : 'Linear',
      });
    };

    // ── Status changed ─────────────────────────────────────────────────────
    this._onStatusChanged = ({ playerId, status }) => {
      if (playerId === this.myId) {
        this.myStatus = status;
        this.mySprite?.setTexture(status === 'zombie' ? 'p_me_z' : 'p_me');
      } else {
        const p = this.others[playerId];
        if (!p) return;
        p.status = status;
        p.sprite.setTexture(status === 'zombie' ? 'p_zombie' : 'p_human');
        p.label.setColor(status === 'zombie' ? '#81c784' : '#4fc3f7');
      }
      this._showFX(playerId, status);
    };

    // ── Player eliminated ──────────────────────────────────────────────────
    this._onEliminated = ({ playerId }) => {
      const p = this.others[playerId];
      if (p) {
        p.status = 'dead';
        this.tweens.add({ targets: p.sprite, alpha: 0.3, duration: 400 });
        this.tweens.add({ targets: p.label,  alpha: 0.2, duration: 400 });
        p.sprite.setTexture('p_dead');
      }
    };

    // ── Match ended — stop sending movement ────────────────────────────────
    this._onMatchEnd = () => {
      if (this.mySprite) this.mySprite.setVelocity(0, 0);
    };

    socket.on('playerMoved',        this._onPlayerMoved);
    socket.on('playerStatusChanged',this._onStatusChanged);
    socket.on('playerEliminated',   this._onEliminated);
    socket.on('matchEnd',           this._onMatchEnd);
  }

  // ── Status visual effect ──────────────────────────────────────────────────
  _showFX(playerId, status) {
    let x, y;
    if (playerId === this.myId && this.mySprite) {
      x = this.mySprite.x; y = this.mySprite.y;
    } else {
      const p = this.others[playerId];
      if (!p) return;
      x = p.sprite.x; y = p.sprite.y;
    }

    const label = status === 'zombie' ? '☣ INFECTED' : '✚ CURED';
    const color  = status === 'zombie' ? '#ef5350'    : '#26c6da';

    const txt = this.add.text(x, y - 30, label, {
      fontFamily     : 'monospace',
      fontSize       : '13px',
      color,
      stroke         : '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(20);

    this.tweens.add({
      targets : txt,
      y       : y - 80,
      alpha   : 0,
      duration: 1600,
      ease    : 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  // ── Scene shutdown — clean up listeners ───────────────────────────────────
  shutdown() {
    const socket = getSocket();
    socket.off('playerMoved',        this._onPlayerMoved);
    socket.off('playerStatusChanged',this._onStatusChanged);
    socket.off('playerEliminated',   this._onEliminated);
    socket.off('matchEnd',           this._onMatchEnd);
  }
}
