FRONTLINE V21 — ONLINE MULTIPLAYER ALPHA

Includes the existing four-mission single-player campaign (index.html), plus a separate real multiplayer prototype (multiplayer.html) and a Node.js WebSocket server (server.js).

RUN LOCALLY:
1. Install Node.js 20 or newer.
2. Open a terminal in this folder.
3. Run: npm install
4. Run: npm start
5. Open http://localhost:8080 on your PC.

PLAY WITH FRIENDS ON DIFFERENT PHONES / PCS:
Deploy this Node.js folder to a public hosting service supporting persistent Node servers and WebSockets (e.g. Render or Railway). Set the start command to npm start and install command to npm install. The host supplies PORT. Visit https://YOUR-SERVER-ADDRESS/multiplayer.html from each device. Use Create Private and share the room code, or join public matches. Use HTTPS/WSS for public access.

If keeping the campaign on Cloudflare Pages, upload index.html, multiplayer.html, menu-background.png there. To connect its multiplayer page to your hosted WebSocket server, open multiplayer.html?server=wss://YOUR-SERVER-ADDRESS. The multiplayer server must be deployed separately; uploading only these HTML files to Cloudflare Pages will NOT enable online play.

IMPLEMENTED:
- 16-player rooms, public or private code, TDM and FFA.
- Four loadouts (assault, sniper, medic, heavy), medic H heal.
- Network-synced players, movement, hits, health, kills, respawns and scoreboard.
- 8v8 teams with first to 75 kills; FFA first to 30.
- PC mouse/keyboard and mobile virtual controls.
- Existing campaign retained separately.

ALPHA LIMITATIONS:
- This is a basic multiplayer proof of concept, not yet a production-ready shooter.
- No Zombies mode yet, no authentication, no persistent progression.
- Player motion and hits are server-checked, but full obstacle collision, anti-cheat, interpolation, gun animations, and advanced matchmaking remain future work.
- The client uses a Three.js CDN, so an internet connection is required.
- A public game server needs monitoring, abuse protection, and hosting costs.
