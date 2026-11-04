# Nexoryn Catan

Private Catan for 3–6 players. Base game + Cities & Knights (2025 rulebook), 7 maps, a configurable 10–20 VP target, dark/light theme, server-authoritative multiplayer over WebSockets.

## Run it

```bash
npm install
npm start
```

Open `http://localhost:3005` (override with `PORT=xxxx npm start`). Create a room, share the code (or the join link via the ⧉ button) with your friends.

## Play across the internet

Your friends on other networks can't hit `localhost`. Easiest fix is Cloudflare's free quick tunnel. `cloudflared` is already installed on this machine, so you have two ways:

**One-click (Windows):** double-click `start.ps1` — it opens two terminal windows (server + tunnel) for you.

**Manual:**
```bash
# Terminal 1 — the game server (keep running)
npm start
```
```bash
# Terminal 2 — the public tunnel (keep running)
npm run tunnel
```
Cloudflare prints a URL like `https://xxxx-xxxx-xxxx.trycloudflare.com`. **That** URL goes to your friends, along with your room code (or share the ⧉ "copy join link" from inside the game — it already contains the code).

Notes:
- The URL **changes every time** you restart `cloudflared`. For a stable URL, create a named tunnel on your Cloudflare account (free) and bind it to a subdomain you own.
- Close the tunnel window when you're done — Cloudflare's free quick tunnels have no uptime guarantee and shouldn't be left running forever.
- Alternatives: `ngrok http 3005`, Tailscale Funnel, or deploy to Fly / Railway / Render.

## Room settings

Set on the host card (⚙ Advanced settings) and editable by the host in the lobby until the game starts:

| Setting | Range | Default |
|---|---|---|
| Points to win | 10–20 | 10 base, 13 Cities & Knights (switching mode resets to that mode's default) |
| Max players | 3 – map limit (4 or 6) | map limit |
| Card discard limit | 5–20 | 7 (+2 per city wall in C&K) |
| Turn timer | off, 30s, 60s, 90s, 2m, 3m, 5m | off. When it runs out the server acts for whoever it's waiting on (places setup pieces, rolls, discards, ends the turn) |

A player wins as soon as they have the target on **their own** turn. That includes hidden VP cards, and points earned on someone else's turn count from the start of your next turn. After a game the host can start a **New game**: same players and settings, nothing else carried over.

## What's in

- **Base game** (2020 rules): setup with round-2 resources, dice, production with bank-shortage rules (19 of each resource), robber (discard over limit, steal), roads/settlements/cities with piece limits (15/5/4), bank and harbor trade (4:1 / 3:1 / 2:1), player trades with counter-offers (no gifts, no like-for-like), 25 development cards (one per turn, playable before rolling, not the turn bought), Longest Road (5+, ties keep the holder, set aside on a broken tie), Largest Army (3+).
- **Cities & Knights** (2025 / 6th-edition rulebook): city in setup round 2, event die, commodities (paper/cloth/coin), 3 improvement tracks (Trade = cloth, Politics = coin, Science = paper) with the level-3 abilities (Merchant Guild, Fortress, Aqueduct), metropolises (first to 4 takes it temporarily, first to 5 takes it permanently), knights (recruit, promote once per turn, activate, move, displace, chase the robber; they block roads and break Longest Route), city walls (max 3, +2 hand limit), the barbarian ship with attack resolution (pillage cascade, metropolis immunity, Defender VP or a tie-break progress draw), the robber waking after the first attack, the merchant, and **all 54 progress cards** with their rulebook effects, including the 4-card hand limit.
- **Security**: identity is bound to your socket (you can't act as someone else), rejoining requires a secret token, the dice seed is chosen by the server, and every input is validated.
- **Reconnect**: a dropped connection reconnects automatically; a reloaded tab offers "Rejoin game". Lobby seats are held for 30s, mid-game seats for 30 min.
- **7 maps × 2 modes**: Classic (official number spiral), Extended (5–6 player board shape, 11 harbors), Random Small/Large, Desert Land, Resource Rush (no desert: the robber enters on the first 7), Two Islands.
- **Zoom + pan**, **trade history**, **visual ports**, **night mode**, **chat**, and a live log.

## Tests

```bash
npm test          # rule tests, server tests, and ~65 complete bot-played games across both modes
npm run test:e2e  # Playwright: 3 browsers play a game in each mode through the real UI
```

## Files

```
server.js              Express + ws rooms, identity binding, rejoin, settings, restart, turn timer
src/
  constants.js         costs, supply sizes, dev deck, progress decks, settings limits/defaults
  board.js             hex geometry + map variants + harbor placement
  cards.js             hand/card helpers
  game.js              game state + base rule engine + prompts/steps + VP + snapshot
  ck.js                Cities & Knights layer (only used when mode = cnk)
public/
  index.html
  css/style.css        theme tokens + layout
  js/
    net.js             ws client (auto-reconnect + rejoin token)
    settings.js        room settings panel (VP slider etc.)
    render.js          canvas board renderer
    ui.js              sidebar, hand, actions, prompts, modals
    app.js             entry + screen routing
test/                  rules.js, server.js, fullgame.js + sim.js, e2e.js, smoke/trade/counter, bots.js
```

## Keyboard / UX notes

- Discard modal: shift-click a resource chip to decrement.
- Copy join link: top-left ⧉ button in-game, shares `?r=CODE`.
- Night mode: ◐ button, choice persists in localStorage.

## Known limits

- The 5–6 player "special building phase" isn't implemented. The rulebooks provided don't cover it.
- Harbors are spread evenly along the coast rather than in the printed fixed slots.
- Rooms live in memory: restarting the server ends all games.
