// Catan server: Express for static + ws for rooms.
// Each room has one Game instance; actions are server-authoritative.
// A socket's player identity is bound when it creates/joins/rejoins a room — the
// playerId field in client messages is ignored, so nobody can act for someone else.

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { nanoid } = require('nanoid');

const { Game, normalizeSettings } = require('./src/game');
const { MAPS, MODES } = require('./src/board');
const C = require('./src/constants');

const PORT = process.env.PORT || 3005;
const ROOM_IDLE_MS = 30 * 60 * 1000; // empty rooms survive 30 min so players can rejoin
const LOBBY_GRACE_MS = 30 * 1000;  // a reload in the lobby keeps your seat this long
const TIMER_SCALE = Number(process.env.CATAN_TIMER_SCALE || 1); // tests only: speeds the turn timer up
const RESUME_GRACE_MS = 5000; // after a resume, a nearly-expired turn still gets this long

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/maps',  (req, res) => res.json(MAPS));
app.get('/api/modes', (req, res) => res.json(MODES));
app.get('/api/settings', (req, res) => res.json({
  limits: C.SETTINGS_LIMITS, defaultVp: C.DEFAULT_VP, defaultDiscardLimit: C.DEFAULT_DISCARD_LIMIT,
}));
app.get('/api/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// code -> { code, game, sockets: Map<pid, ws>, tokens: Map<token, pid>, hostId, timer, deadline, timerKey, idleTimer }
const rooms = new Map();

function newSeed() { return crypto.randomInt(0, 2 ** 31); }

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room) {
  scheduleTimer(room);
  for (const [pid, ws] of room.sockets) {
    const state = room.game.snapshot(pid);
    state.hostId = room.hostId;
    state.deadline = room.deadline;
    state.paused = !!room.paused;
    state.serverNow = Date.now();
    send(ws, { type: 'state', state });
  }
}

// ---- Turn timer: when the game has been waiting on the same thing for too long, auto-act.
function scheduleTimer(room) {
  const g = room.game;
  const secs = g.settings.turnTimer;
  const running = secs > 0 && !['lobby', 'end'].includes(g.phase);
  if (room.paused) { clearTimeout(room.timer); room.timer = null; room.deadline = null; return; }
  if (!running) {
    clearTimeout(room.timer); room.timer = null; room.deadline = null; room.timerKey = null;
    return;
  }
  const key = `${g.turnNumber}|${g.phase}|${g.turn}|${g.prompts.map(p => p.id).join(',')}`;
  if (key === room.timerKey && room.timer) return;
  room.timerKey = key;
  clearTimeout(room.timer);
  // After a resume, finish the interrupted wait instead of starting a fresh one.
  const ms = room.resumeMs != null ? room.resumeMs : secs * 1000 * TIMER_SCALE;
  room.resumeMs = null;
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    room.timer = null;
    try { g.autoAct(); } catch (e) { console.error('autoAct failed:', e); }
    broadcast(room);
  }, ms);
}

function makeGame(settings, players = []) {
  const game = new Game({ ...settings, seed: newSeed() });
  for (const p of players) game.addPlayer(p.id, p.name);
  return game;
}

function addToRoom(room, ws, name) {
  const pid = nanoid(10);
  room.game.addPlayer(pid, name);
  const token = nanoid(24);
  room.tokens.set(token, pid);
  bind(room, ws, pid);
  return { pid, token };
}

function bind(room, ws, pid) {
  const prev = room.sockets.get(pid);
  if (prev && prev !== ws) { prev.ctx = null; try { prev.close(); } catch {} }
  room.sockets.set(pid, ws);
  ws.ctx = { code: room.code, pid };
  const p = room.game.players.find(x => x.id === pid);
  if (p) p.connected = true;
  clearTimeout(room.idleTimer);
}

function cleanCode(c) {
  const code = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code;
}

wss.on('connection', (ws) => {
  ws.ctx = null;
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return send(ws, { type: 'error', message: 'bad json' }); }
    if (!msg || typeof msg.type !== 'string') return send(ws, { type: 'error', message: 'bad message' });
    try {
      handle(ws, msg);
    } catch (e) {
      send(ws, { type: 'error', message: e.message || String(e) });
    }
  });
  ws.on('close', () => onClose(ws));
});

function onClose(ws, explicit = false) {
  if (!ws.ctx) return;
  const { code, pid } = ws.ctx;
  const room = rooms.get(code);
  if (!room || room.sockets.get(pid) !== ws) return;
  room.sockets.delete(pid);
  const p = room.game.players.find(x => x.id === pid);
  if (p) p.connected = false;
  if (room.game.phase === 'lobby') {
    // Keep the lobby seat briefly so a page reload can rejoin; then free it.
    setTimeout(() => {
      const r = rooms.get(code);
      if (!r || r.sockets.has(pid) || r.game.phase !== 'lobby') return;
      if (r.game.removePlayer(pid)) {
        for (const [t, id] of r.tokens) if (id === pid) r.tokens.delete(t);
        broadcast(r);
      }
    }, explicit ? 0 : LOBBY_GRACE_MS);
  }
  if (room.hostId === pid) {
    // hand host to a connected player
    const next = [...room.sockets.keys()][0];
    if (next) { room.hostId = next; room.game.pushLog(`${room.game.getPlayer(next).name} is now the host`); }
  }
  if (room.sockets.size === 0) {
    clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => {
      if (room.sockets.size === 0) { clearTimeout(room.timer); rooms.delete(code); }
    }, ROOM_IDLE_MS);
  } else {
    broadcast(room);
  }
}

function requireRoom(ws) {
  if (!ws.ctx) throw new Error('join a room first');
  const room = rooms.get(ws.ctx.code);
  if (!room) throw new Error('room no longer exists');
  return { room, pid: ws.ctx.pid };
}

function handle(ws, msg) {
  switch (msg.type) {
    case 'create': {
      if (ws.ctx) throw new Error('already in a room');
      let code = cleanCode(msg.code);
      if (code && (code.length < 3 || code.length > 8)) throw new Error('room code must be 3-8 letters/digits');
      if (!code) do { code = nanoid(5).toUpperCase().replace(/[^A-Z0-9]/g, 'X'); } while (rooms.has(code));
      if (rooms.has(code)) throw new Error('room code already in use');
      const settings = normalizeSettings({ ...(msg.settings || {}), mapVariant: msg.mapVariant ?? msg.settings?.mapVariant, mode: msg.mode ?? msg.settings?.mode });
      const room = { code, game: makeGame(settings), sockets: new Map(), tokens: new Map(), hostId: null };
      rooms.set(code, room);
      const { pid, token } = addToRoom(room, ws, msg.name || 'Host');
      room.hostId = pid;
      send(ws, { type: 'joined', code, playerId: pid, token, host: true });
      broadcast(room);
      break;
    }
    case 'join': {
      if (ws.ctx) throw new Error('already in a room');
      const code = cleanCode(msg.code);
      const room = rooms.get(code);
      if (!room) throw new Error('no such room');
      const { pid, token } = addToRoom(room, ws, msg.name || 'Player');
      if (!room.hostId || !room.sockets.has(room.hostId)) room.hostId = pid;
      send(ws, { type: 'joined', code, playerId: pid, token, host: pid === room.hostId });
      broadcast(room);
      break;
    }
    case 'rejoin': {
      if (ws.ctx) throw new Error('already in a room');
      const room = rooms.get(cleanCode(msg.code));
      if (!room) throw new Error('that game no longer exists');
      const pid = room.tokens.get(String(msg.token || ''));
      if (!pid || !room.game.players.some(p => p.id === pid)) throw new Error('cannot rejoin that game');
      bind(room, ws, pid);
      if (!room.hostId || !room.sockets.has(room.hostId)) room.hostId = pid;
      room.game.pushLog(`${room.game.getPlayer(pid).name} reconnected`);
      send(ws, { type: 'joined', code: room.code, playerId: pid, token: msg.token, host: pid === room.hostId });
      broadcast(room);
      break;
    }
    case 'leave': {
      const { room, pid } = requireRoom(ws);
      if (room.game.phase === 'lobby') {
        for (const [t, id] of room.tokens) if (id === pid) room.tokens.delete(t);
      }
      onClose(ws, true);
      ws.ctx = null;
      send(ws, { type: 'left' });
      break;
    }
    case 'update_settings': {
      const { room, pid } = requireRoom(ws);
      if (room.hostId !== pid) throw new Error('only the host can change settings');
      if (room.game.phase !== 'lobby') throw new Error('settings are locked once the game starts');
      const old = room.game.settings;
      const incoming = { ...old, ...(msg.settings || {}) };
      if (incoming.mode !== old.mode && !(msg.settings && 'vpTarget' in msg.settings)) {
        incoming.vpTarget = C.DEFAULT_VP[incoming.mode === 'cnk' ? 'cnk' : 'base'];
      }
      const settings = normalizeSettings(incoming);
      if (room.game.players.length > settings.maxPlayers) {
        throw new Error(`${room.game.players.length} players are already in the room`);
      }
      const players = room.game.players.map(p => ({ id: p.id, name: p.name }));
      if (settings.mode !== old.mode || settings.mapVariant !== old.mapVariant) {
        room.game = makeGame(settings, players); // fresh board/rules for the new mode or map
      } else {
        room.game.settings = settings;
      }
      for (const p of room.game.players) p.connected = room.sockets.has(p.id);
      room.game.pushLog('settings updated');
      broadcast(room);
      break;
    }
    case 'pause':
    case 'resume': {
      // Host-only: freeze the game (turn timer stopped, game actions refused) and pick it back up.
      const { room, pid } = requireRoom(ws);
      if (room.hostId !== pid) throw new Error('only the host can pause or resume');
      if (['lobby', 'end'].includes(room.game.phase)) throw new Error('the game is not running');
      if (msg.type === 'pause') {
        if (room.paused) return;
        room.paused = { remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null };
        room.game.pushLog(`${room.game.getPlayer(pid).name} paused the game`);
      } else {
        if (!room.paused) return;
        const left = room.paused.remainingMs;
        room.resumeMs = left == null ? null : Math.max(left, RESUME_GRACE_MS * TIMER_SCALE);
        room.paused = null;
        room.timer = null;
        room.game.pushLog(`${room.game.getPlayer(pid).name} resumed the game`);
      }
      broadcast(room);
      break;
    }
    case 'start_game': {
      const { room, pid } = requireRoom(ws);
      if (room.hostId !== pid) throw new Error('only the host can start');
      room.game.start();
      broadcast(room);
      break;
    }
    case 'restart': {
      // Back to a fresh lobby with the same players and settings. Nothing from the old game carries over.
      const { room, pid } = requireRoom(ws);
      if (room.hostId !== pid) throw new Error('only the host can restart');
      const players = room.game.players.filter(p => room.sockets.has(p.id)).map(p => ({ id: p.id, name: p.name }));
      for (const [t, id] of room.tokens) if (!players.some(p => p.id === id)) room.tokens.delete(t);
      room.game = makeGame(room.game.settings, players);
      room.paused = null; room.resumeMs = null;
      for (const p of room.game.players) p.connected = true;
      room.game.pushLog('new game — host can adjust settings and start');
      broadcast(room);
      break;
    }
    case 'chat': {
      const { room, pid } = requireRoom(ws);
      const player = room.game.getPlayer(pid);
      const text = (msg.text || '').toString().slice(0, 200);
      if (!text.trim()) return;
      for (const ws2 of room.sockets.values()) {
        send(ws2, { type: 'chat', from: player.name, color: player.color, text });
      }
      break;
    }
    default: {
      // Game action. The acting player is always the socket's bound player.
      const { room, pid } = requireRoom(ws);
      if (room.paused) throw new Error('game is paused');
      room.game.act(pid, msg.type, msg);
      broadcast(room);
    }
  }
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Catan server on http://localhost:${PORT}`);
    console.log('Share your room code with friends. To play across networks, use a tunnel:');
    console.log('  cloudflared tunnel --url http://localhost:' + PORT);
    console.log('(Override with PORT=xxxx node server.js)');
  });
}

module.exports = { server, rooms };
