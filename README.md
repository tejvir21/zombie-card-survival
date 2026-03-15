# Zombie Card Survival

A real-time multiplayer card-based survival game built with React + Phaser on the frontend and Node.js + Express + Socket.IO on the backend. Players duel each other with cards and zombie-themed skills in a fast-paced match.

## 🚀 Features

- Real-time multiplayer lobby and matchmaking
- Live gameplay updates with Socket.IO
- Phaser-based game scene inside React
- Player stats, matches, and leaderboard persistence
- Modular card engine and match manager for custom rules

## 🧱 Project Structure

```
/ (root)
  package.json
  README.md
  /server
    index.js
    package.json
    /engine
      cardEngine.js
      matchManager.js
    /models
      Leaderboard.js
      Match.js
      Player.js
      PlayerCard.js
    /routes
      leaderboard.js
      match.js
    /socket
      handlers.js
  /client
    package.json
    vite.config.js
    /src
      App.jsx
      main.jsx
      index.css
      /components
        /Lobby
          LobbyScreen.jsx
        /Game
          PhaserGame.jsx
          MatchEndScreen.jsx
        /Duel
          DuelScreen.jsx
        /HUD
          GameHUD.jsx
      /scenes
        GameScene.js
      /hooks
        useSocketEvents.js
      /store
        gameStore.js
      /utils
        socket.js
```

## 💻 Prerequisites

- Node.js (v18+ recommended)
- npm

## ▶️ Quick Start

From project root:

```bash
# install all dependencies
npm run install:all

# start both server and client during development
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:3000` (or configured port)

## 🧩 Development Scripts

| Command                        | What it does                                |
| ------------------------------ | ------------------------------------------- |
| `npm run dev`                  | Start server and client concurrently (root) |
| `npm run server:dev`           | Start backend with nodemon                  |
| `npm run client:dev`           | Start Vite dev server                       |
| `npm run build`                | Build the client production bundle          |
| `cd server && npm start`       | Start production server                     |
| `cd client && npm run preview` | Preview built client                        |

## 🛰️ Backend Overview (`server`)

- `index.js`: Express app with Socket.IO and API routes
- `routes/leaderboard.js`, `routes/match.js`: REST endpoints for leaderboard and match state
- `socket/handlers.js`: handles real-time events like join, match start, move actions
- `engine/cardEngine.js`: handles card logic, damage, healing, and turn resolution
- `engine/matchManager.js`: controls match lifecycle, matchmaking, and game flow
- `models/*.js`: player, match, player card, and leaderboard data models (MongoDB or in-memory placeholder)

## 🕹️ Frontend Overview (`client`)

- `src/App.jsx`: main app router and screen management
- `src/components/Lobby/LobbyScreen.jsx`: lobby UI for room selection and matchmaking
- `src/components/Game/PhaserGame.jsx`: embeds Phaser game instance
- `src/components/Game/MatchEndScreen.jsx`: end-of-match results
- `src/components/Duel/DuelScreen.jsx`: card duel UI and turn actions
- `src/components/HUD/GameHUD.jsx`: live match HUD
- `src/hooks/useSocketEvents.js`: Socket event bindings and game state updates
- `src/store/gameStore.js`: Zustand global game state
- `src/utils/socket.js`: socket client initialization
- `src/scenes/GameScene.js`: Phaser scene handling player card sprites and world logic

## 🧠 Socket Protocol (Example)

Socket events likely include:

- `join-lobby`, `create-match`, `start-match`
- `player-action`, `card-played`, `match-state`
- `match-end`, `leaderboard-update`

Check `server/socket/handlers.js` and `client/src/hooks/useSocketEvents.js` to extend event names and data shapes.

## 🛠️ How to Extend

1. Add new cards in `server/engine/cardEngine.js` and update card metadata models.
2. Add new gameplay rules in `server/engine/matchManager.js`.
3. Add client UI actions in `client/src/components/Duel/DuelScreen.jsx` and propagate via socket events.
4. Update the Phaser scene in `client/src/scenes/GameScene.js` for new visual effects.

## ✅ Production Build

```bash
npm run build
cd server
npm start
```

Then open the built client from the server (or serve `client/dist` from your own static host).

## 🧪 Troubleshooting

- If sockets fail to connect, verify server URL in `client/src/utils/socket.js`.
- If server fails to start, check port conflicts and `.env` (if using environment variables).
- Use `npm run server:dev` for auto-reload while editing backend code.

## 📌 Notes

- This project is built as a fast prototype; adjust persistence and security before production.
- Keep socket event contracts stable between client and server.

## 🧾 License

MIT License.
