// Headless bot players for UI demos. Joins the given room and plays simple turns:
// setup placements, rolling, answering prompts (discard / robber / steal) and ending turns.
// Usage: node test/bots.js ROOMCODE Bob Cass     (server on PORT or 3005)
const WebSocket = require('ws');
const [,, code, ...names] = process.argv;
if (!code || names.length < 1) {
  console.log('usage: node test/bots.js ROOMCODE Bob Cass');
  process.exit(1);
}
const PORT = process.env.PORT || 3005;

for (const name of names) createBot(name);

function createBot(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const bot = { name, ws, pid: null, state: null, busy: false };
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', code, name })));
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'joined') { bot.pid = msg.playerId; console.log(`[${name}] joined`); }
    if (msg.type === 'state') { bot.state = msg.state; setTimeout(() => act(bot), 300); }
    if (msg.type === 'error') console.error(`[${name}] error:`, msg.message);
  });
}

function send(bot, type, extra = {}) { bot.ws.send(JSON.stringify({ type, ...extra })); }

function act(bot) {
  const s = bot.state; if (!s || !bot.pid) return;
  const me = s.players.find(p => p.id === bot.pid); if (!me) return;
  const topo = s.map.topo;
  const taken = new Set(s.players.flatMap(p => [...p.settlements, ...p.cities]));
  const pr = s.prompts.find(p => p.playerId === bot.pid);
  if (pr) {
    if (pr.kind === 'discard' || pr.kind === 'give') {
      const cards = {}; let left = pr.count;
      for (const [k, v] of Object.entries({ ...me.hand.r, ...me.hand.c })) {
        if (left <= 0) break;
        if (pr.only === 'commodity' && !['paper', 'cloth', 'coin'].includes(k)) continue;
        const n = Math.min(v, left); if (n) { cards[k] = n; left -= n; }
      }
      return send(bot, 'respond', { promptId: pr.id, answer: { cards } });
    }
    if (pr.kind === 'robber') return send(bot, 'respond', { promptId: pr.id, answer: { hexId: topo.hexes.find(h => h.id !== s.robberHex).id } });
    if (pr.kind === 'steal') return send(bot, 'respond', { promptId: pr.id, answer: { targetId: pr.candidates[0] } });
    if (pr.kind === 'aqueduct') return send(bot, 'respond', { promptId: pr.id, answer: { resource: 'ore' } });
    if (pr.kind === 'progress_discard') return send(bot, 'respond', { promptId: pr.id, answer: { card: pr.cards[0] } });
    if (pr.kind === 'choose_deck') return send(bot, 'respond', { promptId: pr.id, answer: { track: 'science' } });
    if (pr.kind === 'move_knight') return send(bot, 'respond', { promptId: pr.id, answer: { vertexId: pr.options[0] } });
    return send(bot, 'respond', { promptId: pr.id, answer: { skip: true } });
  }
  if (s.currentPlayerId !== bot.pid || s.busy) return;
  if (s.phase === 'setup_1' || s.phase === 'setup_2') {
    if (s.setupState.building == null) {
      const v = topo.vertices.find(v => !taken.has(v.id) && topo.vAdj[v.id].every(n => !taken.has(n)));
      return send(bot, 'place_settlement', { vertexId: v.id, setup: true });
    }
    if (s.setupState.road == null) {
      const e = topo.vertices[s.setupState.building].edges.find(id => !s.players.some(p => p.roads.includes(id)));
      return send(bot, 'place_road', { edgeId: e, setup: true });
    }
    return send(bot, 'end_setup');
  }
  if (s.phase === 'roll') return send(bot, 'roll');
  if (s.phase === 'main') {
    if (s.cnk && me.ck.progress.length > 4) return send(bot, 'ck_discard_progress', { card: me.ck.progress[0] });
    return send(bot, 'end_turn');
  }
}

console.log(`bots joining ${code} as:`, names.join(', '));
