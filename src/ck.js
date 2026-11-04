// Cities & Knights layer (rules per the 2025 / 6th-edition rulebook).
// Commodities, city improvements (+ level-3 abilities and metropolises), knights
// (recruit / promote / activate / move / displace / chase the robber), city walls,
// the barbarian ship and attacks, the merchant, and all 54 progress cards.
// Only loaded behaviour-wise when game.cnk is true: base Catan never calls in here.

const C = require('./constants');
const {
  ALL_CARD_KEYS, kindOf, cardCount, handHas, pay, addCards, handToBag, cleanCards, countCards,
} = require('./cards');

const TRACK_OF_CARD = {};
for (const [track, cards] of Object.entries(C.PROGRESS_DECKS)) {
  for (const name of Object.keys(cards)) TRACK_OF_CARD[name] = track;
}

function shuffle(a, rand) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function initCKState(game) {
  const decks = {};
  for (const [track, cards] of Object.entries(C.PROGRESS_DECKS)) {
    const list = [];
    for (const [name, n] of Object.entries(cards)) for (let i = 0; i < n; i++) list.push(name);
    decks[track] = shuffle(list, game._rand);
  }
  return {
    barbarianDistance: C.CK_BARBARIAN_DISTANCE,
    barbarianAttacks: 0,
    metropolises: { trade: null, politics: null, science: null }, // { playerId, vertexId, permanent }
    merchant: null,                                               // { playerId, hexId }
    decks,
    knightSeq: 0,
  };
}

function initPlayer() {
  return {
    tracks: { trade: 0, politics: 0, science: 0 },
    knights: {},      // vertexId -> { id, rank 1-3, active, activatedTurn, promotedTurn }
    cityWalls: [],    // vertexIds of cities with walls
    progress: [],     // progress cards in hand (names)
    progressVP: [],   // victory point progress cards played face up
    defenders: 0,     // "Defender of Catan" VP tokens
    fleet: null,      // Merchant Fleet: card type tradeable 2:1 this turn
  };
}

// ---------------- Event die / progress cards ----------------

function resolveEventDie(game, event, red) {
  if (event === 'barbarian') {
    game.ck.barbarianDistance -= 1;
    game.pushLog(`Barbarians advance (${game.ck.barbarianDistance} to go)`);
    if (game.ck.barbarianDistance <= 0) runBarbarianAttack(game);
    return;
  }
  // City improvement icon: each player whose track level covers the red die draws, in turn order.
  const n = game.players.length;
  for (let i = 0; i < n; i++) {
    const p = game.players[(game.turn + i) % n];
    const lvl = p.ck.tracks[event];
    if (lvl >= 1 && red <= lvl + 1) drawProgress(game, p, event);
  }
}

function drawProgress(game, p, track) {
  const deck = game.ck.decks[track];
  if (!deck.length) { game.pushLog(`the ${track} deck is empty`); return; }
  const card = deck.shift();
  if (C.PROGRESS_VP_CARDS.includes(card)) {
    p.ck.progressVP.push(card);
    game.pushLog(`${p.name} reveals ${pretty(card)} (+1 VP)`);
    return;
  }
  p.ck.progress.push(card);
  game.pushLog(`${p.name} drew a ${track} card`);
  enforceProgressLimit(game, p);
}

function enforceProgressLimit(game, p) {
  // Off-turn players discard down to 4 right away; the current player has until turn end.
  if (p === game.current()) return;
  if (p.ck.progress.length <= C.CK_PROGRESS_HAND_LIMIT) return;
  if (game.prompts.some(x => x.kind === 'progress_discard' && x.playerId === p.id)) return;
  game.addPrompt('progress_discard', p.id, {});
}

function discardProgress(game, p, card) {
  const i = p.ck.progress.indexOf(card);
  if (i === -1) throw new Error("you don't have that card");
  p.ck.progress.splice(i, 1);
  game.ck.decks[TRACK_OF_CARD[card]].push(card); // face down under its deck
  game.pushLog(`${p.name} discarded a progress card`);
}

// ---------------- Barbarians ----------------

function knightStrength(p) {
  return Object.values(p.ck.knights).filter(k => k.active).reduce((a, k) => a + k.rank, 0);
}

function metropolisVertices(game) {
  return new Set(Object.values(game.ck.metropolises).filter(Boolean).map(m => m.vertexId));
}

function runBarbarianAttack(game) {
  game.ck.barbarianAttacks += 1;
  const barbs = game.players.reduce((a, p) => a + p.cities.length, 0);
  const strengths = game.players.map(p => ({ p, s: knightStrength(p) }));
  const defenders = strengths.reduce((a, x) => a + x.s, 0);
  game.pushLog(`⚔ Barbarians attack! Barbarians ${barbs} vs knights ${defenders}`);

  if (defenders >= barbs) {
    const max = Math.max(...strengths.map(x => x.s));
    const top = strengths.filter(x => x.s === max);
    if (max <= 0) {
      game.pushLog('Catan is safe (no knights were needed)');
    } else if (top.length === 1) {
      top[0].p.ck.defenders += 1;
      game.pushLog(`${top[0].p.name} is Defender of Catan (+1 VP)`);
    } else {
      // Tie: each tied player draws a progress card of their choice, starting with the current player.
      const n = game.players.length;
      for (let i = 0; i < n; i++) {
        const p = game.players[(game.turn + i) % n];
        if (top.some(x => x.p === p)) game.addPrompt('choose_deck', p.id, {});
      }
      game.pushLog('Barbarians repelled — tied defenders each draw a progress card');
    }
  } else {
    // Pillage: lowest contributors that have a city without a metropolis lose one.
    const metro = metropolisVertices(game);
    const pillageable = p => p.cities.filter(v => !metro.has(v));
    const eligible = strengths.filter(x => pillageable(x.p).length > 0);
    if (eligible.length) {
      const min = Math.min(...eligible.map(x => x.s));
      for (const { p } of eligible.filter(x => x.s === min)) {
        const options = pillageable(p);
        const v = options.find(c => !p.ck.cityWalls.includes(c)) ?? options[0]; // keep walls if possible
        p.cities = p.cities.filter(c => c !== v);
        p.settlements.push(v);
        if (p.ck.cityWalls.includes(v)) p.ck.cityWalls = p.ck.cityWalls.filter(c => c !== v);
        game.pushLog(`${p.name}'s city is pillaged!`);
      }
    } else {
      game.pushLog('Barbarians win but find no city to pillage');
    }
  }

  // Barbarians return home; all knights become inactive.
  game.ck.barbarianDistance = C.CK_BARBARIAN_DISTANCE;
  for (const p of game.players) for (const k of Object.values(p.ck.knights)) k.active = false;
  if (!game.robberActive) {
    game.robberActive = true;
    game.robberHex = game.robberHome; // desert (or off-board if the map has none)
    game.pushLog('The robber enters the island');
  }
}

// ---------------- Production extras ----------------

function aqueduct(game, received) {
  if (!C.RESOURCES.some(r => game.bankCount(r) > 0)) return; // nothing left to take
  for (const p of game.players) {
    if (p.ck.tracks.science >= 3 && !received.has(p.id)) game.addPrompt('aqueduct', p.id, {});
  }
}

// ---------------- Trade rates ----------------

function tradeRate(game, p, key) {
  const kind = kindOf(key);
  if (!kind) return Infinity;
  let rate = 4;
  const myVerts = new Set([...p.settlements, ...p.cities]);
  for (const h of game.map.harbors) {
    const e = game.map.topo.edges[h.edgeId];
    if (!myVerts.has(e.a) && !myVerts.has(e.b)) continue;
    if (h.type === '3:1') rate = Math.min(rate, 3);
    else if (h.type === key) rate = Math.min(rate, 2);
  }
  if (kind === 'r') {
    const m = game.ck.merchant;
    if (m && m.playerId === p.id && game.map.topo.hexes[m.hexId].res === key) rate = Math.min(rate, 2);
  } else if (p.ck.tracks.trade >= 3) {
    rate = Math.min(rate, 2); // Merchant Guild
  }
  if (p.ck.fleet === key) rate = Math.min(rate, 2);
  return rate;
}

// ---------------- VP ----------------

function vpBreakdown(game, p) {
  return {
    metropolis: Object.values(game.ck.metropolises).filter(m => m && m.playerId === p.id).length * 2,
    merchant: game.ck.merchant && game.ck.merchant.playerId === p.id ? 1 : 0,
    defenders: p.ck.defenders,
    progressVp: p.ck.progressVP.length,
  };
}

// ---------------- Helpers ----------------

function pretty(card) { return card.replace(/_/g, ' '); }

function freeCities(game, p) {
  const metro = metropolisVertices(game);
  return p.cities.filter(v => !metro.has(v));
}

function knightSupply(p, rank) {
  return C.CK_KNIGHTS_PER_RANK - Object.values(p.ck.knights).filter(k => k.rank === rank).length;
}

function ownKnight(p, v) {
  const k = p.ck.knights[v];
  if (!k) throw new Error('no knight of yours there');
  return k;
}

function knightCanAct(game, k) {
  return k.active && k.activatedTurn !== game.turnNumber;
}

function vertexEmpty(game, v) {
  return !game.vertexOwner(v) && !game.knightAt(v);
}

// Vertices reachable from `from` along pid's roads. Own pieces can be passed; other
// players' pieces stop movement (and are reported as `blocked` endpoints).
function reach(game, pid, from) {
  const p = game.getPlayer(pid);
  const roads = new Set(p.roads);
  const seen = new Set([from]);
  const open = [], blocked = [];
  const queue = [from];
  while (queue.length) {
    const u = queue.shift();
    for (const eId of game.map.topo.vertices[u].edges) {
      if (!roads.has(eId)) continue;
      const e = game.map.topo.edges[eId];
      const w = e.a === u ? e.b : e.a;
      if (seen.has(w)) continue;
      seen.add(w);
      if (game.vertexBlockedFor(w, pid)) { blocked.push(w); continue; }
      open.push(w);
      queue.push(w);
    }
  }
  return { open, blocked };
}

function knightPlacementOptions(game, p) {
  return game.map.topo.vertices
    .filter(v => vertexEmpty(game, v.id) && v.edges.some(e => p.roads.includes(e)))
    .map(v => v.id);
}

function isOpenRoad(game, edgeId) {
  const owner = game.edgeOwner(edgeId);
  if (!owner) return false;
  const e = game.map.topo.edges[edgeId];
  return [e.a, e.b].some(x => {
    if (owner.settlements.includes(x) || owner.cities.includes(x) || owner.ck.knights[x]) return false;
    return !game.map.topo.vertices[x].edges.some(o => o !== edgeId && owner.roads.includes(o));
  });
}

function placeKnight(game, p, v, rank, active) {
  p.ck.knights[v] = {
    id: ++game.ck.knightSeq, rank, active,
    activatedTurn: active ? game.turnNumber : -1, promotedTurn: -1,
  };
  game.updateLongestRoad();
}

function removeKnight(game, p, v) {
  const k = p.ck.knights[v];
  delete p.ck.knights[v];
  game.updateLongestRoad();
  return k;
}

// Displaced knight: its owner must move it along their own route, or lose it.
function displace(game, victim, v, k) {
  const { open } = reach(game, victim.id, v);
  const options = open.filter(x => x !== v && vertexEmpty(game, x));
  if (!options.length) {
    game.pushLog(`${victim.name}'s knight had nowhere to go and was removed`);
    game.updateLongestRoad();
    return;
  }
  game.addPrompt('move_knight', victim.id, { from: v, rank: k.rank, active: k.active, options, _knight: k });
}

// ---------------- Actions ----------------

function improveTrack(game, playerId, track, { crane = false, vertexId = null } = {}) {
  const p = game.getPlayer(playerId);
  game.guardMain(p);
  if (!C.CK_TRACKS.includes(track)) throw new Error('bad track');
  doImprove(game, p, track, { crane, vertexId, dry: false });
}

function doImprove(game, p, track, { crane, vertexId, dry }) {
  if (p.cities.length === 0) throw new Error('you need a city to build improvements');
  const current = p.ck.tracks[track];
  if (current >= C.CK_MAX_LEVEL) throw new Error('track maxed');
  const next = current + 1;
  const commodity = C.CK_COMMODITY_FOR_TRACK[track];
  const cost = Math.max(0, next - (crane ? 1 : 0));
  if (p.hand.c[commodity] < cost) throw new Error(`need ${cost} ${commodity}`);

  const m = game.ck.metropolises[track];
  let gain = false, makePermanent = false;
  if (next === C.CK_METROPOLIS_LEVEL && !m) gain = true;
  if (next === C.CK_MAX_LEVEL) {
    if (!m || (!m.permanent && m.playerId !== p.id)) gain = true;
    else if (m.playerId === p.id) makePermanent = true;
  }
  let city = null;
  if (gain) {
    const free = freeCities(game, p);
    if (vertexId != null && free.includes(Number(vertexId))) city = Number(vertexId);
    else city = free[0];
    if (city == null) throw new Error('you need a city without a metropolis to take this metropolis');
  }
  if (dry) return;
  p.hand.c[commodity] -= cost;
  p.ck.tracks[track] = next;
  game.pushLog(`${p.name} improved ${track} to level ${next}`);
  if (gain) {
    if (m) game.pushLog(`${p.name} takes the ${track} metropolis from ${game.getPlayer(m.playerId).name}`);
    else game.pushLog(`${p.name} founds the ${track} metropolis!`);
    game.ck.metropolises[track] = { playerId: p.id, vertexId: city, permanent: next === C.CK_MAX_LEVEL };
  } else if (makePermanent) {
    m.permanent = true;
  }
  game.checkWin();
}

function recruitKnight(game, playerId, v) {
  const p = game.getPlayer(playerId);
  game.guardMain(p);
  if (knightSupply(p, 1) <= 0) throw new Error('no basic knights left — promote one first');
  if (!vertexEmpty(game, v)) throw new Error('intersection occupied');
  if (!game.vertexConnectedToPlayerRoad(v, p.id)) throw new Error('knights must connect to your road');
  if (!handHas(p.hand, C.BUILD_COST.knight)) throw new Error('cannot afford (1 sheep + 1 ore)');
  pay(p.hand, C.BUILD_COST.knight);
  placeKnight(game, p, v, 1, false);
  game.pushLog(`${p.name} recruited a knight`);
}

function checkPromote(game, p, v, extraUsed = {}) {
  const k = ownKnight(p, v);
  if (k.promotedTurn === game.turnNumber) throw new Error('a knight can only be promoted once per turn');
  if (k.rank >= 3) throw new Error('already mighty');
  if (k.rank === 2 && p.ck.tracks.politics < 3) throw new Error('need politics level 3 (Fortress) for mighty knights');
  if (knightSupply(p, k.rank + 1) - (extraUsed[k.rank + 1] || 0) <= 0) {
    throw new Error(`no level ${k.rank + 1} knights left in your supply`);
  }
  return k;
}

function promoteKnight(game, playerId, v, { free = false } = {}) {
  const p = game.getPlayer(playerId);
  game.guardMain(p);
  const k = checkPromote(game, p, v);
  if (!free) {
    if (!handHas(p.hand, C.BUILD_COST.knight)) throw new Error('cannot afford (1 sheep + 1 ore)');
    pay(p.hand, C.BUILD_COST.knight);
  }
  k.rank += 1;
  k.promotedTurn = game.turnNumber;
  game.pushLog(`${p.name} promoted a knight to level ${k.rank}`);
}

function activateKnight(game, playerId, v, { free = false } = {}) {
  const p = game.getPlayer(playerId);
  game.guardMain(p);
  const k = ownKnight(p, v);
  if (k.active) throw new Error('already active');
  if (!free) {
    if (!handHas(p.hand, C.BUILD_COST.activate)) throw new Error('need 1 wheat');
    pay(p.hand, C.BUILD_COST.activate);
  }
  k.active = true;
  k.activatedTurn = game.turnNumber;
  game.pushLog(`${p.name} activated a knight`);
}

function moveKnight(game, playerId, from, to) {
  const p = game.getPlayer(playerId);
  game.guardMain(p);
  const k = ownKnight(p, from);
  if (!knightCanAct(game, k)) throw new Error('knight must be active since the start of your turn');
  const { open } = reach(game, p.id, from);
  if (!open.includes(to) || !vertexEmpty(game, to)) throw new Error('knight cannot reach that intersection');
  delete p.ck.knights[from];
  p.ck.knights[to] = k;
  k.active = false;
  game.updateLongestRoad();
  game.pushLog(`${p.name} moved a knight`);
}

function displaceKnight(game, playerId, from, to) {
  const p = game.getPlayer(playerId);
  game.guardMain(p);
  const k = ownKnight(p, from);
  if (!knightCanAct(game, k)) throw new Error('knight must be active since the start of your turn');
  const target = game.knightAt(to);
  if (!target || target.player.id === p.id) throw new Error("no opponent's knight there");
  if (target.knight.rank >= k.rank) throw new Error('you can only displace weaker knights');
  const { blocked } = reach(game, p.id, from);
  if (!blocked.includes(to)) throw new Error('that knight is not on your route');
  const victimKnight = target.knight;
  delete target.player.ck.knights[to];
  delete p.ck.knights[from];
  p.ck.knights[to] = k;
  k.active = false;
  game.pushLog(`${p.name} displaced ${target.player.name}'s knight`);
  displace(game, target.player, to, victimKnight);
  game.updateLongestRoad();
  game.runSteps();
}

function chaseRobber(game, playerId, v) {
  const p = game.getPlayer(playerId);
  game.guardMain(p);
  if (!game.robberActive || game.robberHex == null) throw new Error('the robber is not on the board');
  const k = ownKnight(p, v);
  if (!knightCanAct(game, k)) throw new Error('knight must be active since the start of your turn');
  if (!game.map.topo.hexVertices[game.robberHex].includes(v)) throw new Error('knight is not next to the robber');
  k.active = false;
  game.pushLog(`${p.name}'s knight chases away the robber`);
  game.addPrompt('robber', p.id, {});
}

function buildWall(game, playerId, v, { free = false } = {}) {
  const p = game.getPlayer(playerId);
  game.guardMain(p);
  checkWall(p, v);
  if (!free) {
    if (!handHas(p.hand, C.BUILD_COST.cityWall)) throw new Error('need 2 brick');
    pay(p.hand, C.BUILD_COST.cityWall);
  }
  p.ck.cityWalls.push(v);
  game.pushLog(`${p.name} built a city wall`);
}

function checkWall(p, v) {
  if (!p.cities.includes(v)) throw new Error('walls go under your cities');
  if (p.ck.cityWalls.includes(v)) throw new Error('already walled');
  if (p.ck.cityWalls.length >= C.CK_MAX_WALLS) throw new Error(`max ${C.CK_MAX_WALLS} city walls`);
}

function adjacentHexesOfType(game, p, res) {
  const mine = new Set([...p.settlements, ...p.cities]);
  return game.map.topo.hexes.filter(h => h.res === res &&
    game.map.topo.hexVertices[h.id].some(v => mine.has(v)));
}

function takeFromBank(game, p, key, n) {
  const got = Math.min(n, game.bankCount(key));
  p.hand[kindOf(key)][key] += got;
  return got;
}

// ---------------- Progress cards ----------------

function playProgress(game, playerId, card, args = {}) {
  const p = game.getPlayer(playerId);
  game.assertTurn(p);
  game.assertNoPending();
  const idx = p.ck.progress.indexOf(card);
  if (idx === -1) throw new Error("you don't have that card");
  if (card === 'alchemy') {
    if (game.phase !== 'roll') throw new Error('Alchemy is played before rolling');
  } else if (game.phase !== 'main') {
    throw new Error('progress cards (except Alchemy) are played after rolling');
  }

  const others = game.players.filter(x => x.id !== p.id);
  const myVp = game.computeVP(p);
  const apply = prepareProgress(game, p, card, args, others, myVp); // validates, returns effect
  p.ck.progress.splice(idx, 1);
  game.ck.decks[TRACK_OF_CARD[card]].push(card);
  game.pushLog(`${p.name} played ${pretty(card)}`);
  apply();
  game.runSteps();
}

function prepareProgress(game, p, card, args, others, myVp) {
  const topo = game.map.topo;
  switch (card) {
    // ---- science ----
    case 'alchemy': {
      const red = Number(args.red), yellow = Number(args.yellow);
      if (![red, yellow].every(n => Number.isInteger(n) && n >= 1 && n <= 6)) throw new Error('pick two dice values 1-6');
      return () => { game.alchemyDice = { red, yellow }; game.steps.push(() => game.rollDice(p.id)); };
    }
    case 'crane': {
      const track = args.track;
      if (!C.CK_TRACKS.includes(track)) throw new Error('pick a track');
      doImprove(game, p, track, { crane: true, vertexId: args.vertexId, dry: true });
      return () => doImprove(game, p, track, { crane: true, vertexId: args.vertexId, dry: false });
    }
    case 'engineering': {
      const v = Number(args.vertexId);
      checkWall(p, v);
      return () => { p.ck.cityWalls.push(v); game.pushLog(`${p.name} built a free city wall`); };
    }
    case 'invention': {
      const a = topo.hexes[Number(args.hexA)], b = topo.hexes[Number(args.hexB)];
      const ok = h => h && h.num != null && ![2, 6, 8, 12].includes(h.num);
      if (!ok(a) || !ok(b) || a === b) throw new Error('pick two different number discs (not 2, 6, 8 or 12)');
      return () => { [a.num, b.num] = [b.num, a.num]; game.pushLog(`${p.name} swapped a ${a.num} and a ${b.num}`); };
    }
    case 'irrigation':
    case 'mining': {
      const res = card === 'irrigation' ? 'wheat' : 'ore';
      return () => {
        const n = adjacentHexesOfType(game, p, res).length * 2;
        const got = takeFromBank(game, p, res, n);
        game.pushLog(`${p.name} takes ${got} ${res}`);
      };
    }
    case 'medicine': {
      const v = Number(args.vertexId);
      if (!p.settlements.includes(v)) throw new Error('pick one of your settlements');
      if (p.cities.length >= C.PIECES.cities) throw new Error('no cities left in your supply');
      if (!handHas(p.hand, C.BUILD_COST.medicine)) throw new Error('need 1 wheat + 2 ore');
      return () => game.buildCity(p.id, v, { cost: C.BUILD_COST.medicine });
    }
    case 'road_building': {
      const edges = (Array.isArray(args.edges) ? args.edges : []).map(Number);
      if (edges.length < 1 || edges.length > 2) throw new Error('pick 1 or 2 roads');
      const before = p.roads.slice();
      try { for (const e of edges) { game.buildRoadFree(p, e, { validateOnly: true }); p.roads.push(e); } }
      finally { p.roads = before; }
      return () => { for (const e of edges) game.buildRoadFree(p, e); };
    }
    case 'smithing': {
      const vs = [...new Set((Array.isArray(args.vertices) ? args.vertices : []).map(Number))];
      if (vs.length < 1 || vs.length > 2) throw new Error('pick 1 or 2 knights');
      const used = {};
      for (const v of vs) { const k = checkPromote(game, p, v, used); used[k.rank + 1] = (used[k.rank + 1] || 0) + 1; }
      return () => {
        for (const v of vs) { const k = p.ck.knights[v]; k.rank += 1; k.promotedTurn = game.turnNumber; }
        game.pushLog(`${p.name} promoted ${vs.length} knight${vs.length > 1 ? 's' : ''} for free`);
      };
    }
    // ---- trade ----
    case 'commercial_harbor': {
      const offers = args.offers && typeof args.offers === 'object' ? args.offers : {};
      const total = {};
      for (const [pid, res] of Object.entries(offers)) {
        if (!others.some(o => o.id === pid)) throw new Error('bad player');
        if (!C.RESOURCES.includes(res)) throw new Error('offer resource cards');
        total[res] = (total[res] || 0) + 1;
      }
      if (!handHas(p.hand, total)) throw new Error("you don't have those resources");
      return () => {
        for (const [pid, res] of Object.entries(offers)) {
          const o = game.getPlayer(pid);
          if (countCards(o.hand.c) === 0) { game.pushLog(`${o.name} has no commodities`); continue; }
          p.hand.r[res] -= 1; o.hand.r[res] += 1;
          game.addPrompt('give', o.id, { toId: p.id, count: 1, only: 'commodity', reason: 'commercial_harbor' });
        }
      };
    }
    case 'guild_dues': {
      const t = others.find(o => o.id === args.targetId);
      if (!t) throw new Error('pick a player');
      if (game.computeVP(t) <= myVp) throw new Error('target must have more VPs than you');
      return () => {
        const n = Math.min(2, cardCount(t.hand));
        if (n > 0) game.addPrompt('take_cards', p.id, { fromId: t.id, count: n });
      };
    }
    case 'merchant': {
      const h = topo.hexes[Number(args.hexId)];
      if (!h || h.res === 'desert') throw new Error('pick a land hex');
      const mine = new Set([...p.settlements, ...p.cities]);
      if (!topo.hexVertices[h.id].some(v => mine.has(v))) throw new Error('merchant must go next to one of your buildings');
      return () => { game.ck.merchant = { playerId: p.id, hexId: h.id }; };
    }
    case 'merchant_fleet': {
      if (!ALL_CARD_KEYS.includes(args.kind)) throw new Error('pick a resource or commodity');
      return () => { p.ck.fleet = args.kind; };
    }
    case 'resource_monopoly': {
      if (!C.RESOURCES.includes(args.resource)) throw new Error('pick a resource');
      return () => {
        let total = 0;
        for (const o of others) { const n = Math.min(2, o.hand.r[args.resource]); o.hand.r[args.resource] -= n; total += n; }
        p.hand.r[args.resource] += total;
        game.pushLog(`${p.name} takes ${total} ${args.resource}`);
      };
    }
    case 'trade_monopoly': {
      if (!C.COMMODITIES.includes(args.commodity)) throw new Error('pick a commodity');
      return () => {
        let total = 0;
        for (const o of others) { const n = Math.min(1, o.hand.c[args.commodity]); o.hand.c[args.commodity] -= n; total += n; }
        p.hand.c[args.commodity] += total;
        game.pushLog(`${p.name} takes ${total} ${args.commodity}`);
      };
    }
    // ---- politics ----
    case 'diplomacy': {
      const e = Number(args.edgeId);
      if (!isOpenRoad(game, e)) throw new Error('pick an open road');
      return () => {
        const owner = game.edgeOwner(e);
        owner.roads = owner.roads.filter(x => x !== e);
        game.updateLongestRoad();
        game.pushLog(`${p.name} removed ${owner === p ? 'their own' : owner.name + "'s"} road`);
        if (owner === p) game.addPrompt('free_road', p.id, { remaining: 1, source: 'diplomacy' });
      };
    }
    case 'encouragement':
      return () => {
        for (const k of Object.values(p.ck.knights)) {
          if (!k.active) { k.active = true; k.activatedTurn = game.turnNumber; }
        }
      };
    case 'espionage': {
      const t = others.find(o => o.id === args.targetId);
      if (!t) throw new Error('pick a player');
      return () => { if (t.ck.progress.length) game.addPrompt('espionage', p.id, { targetId: t.id }); };
    }
    case 'intrigue': {
      const v = Number(args.vertexId);
      const target = game.knightAt(v);
      if (!target || target.player === p) throw new Error("pick an opponent's knight");
      if (!topo.vertices[v].edges.some(e => p.roads.includes(e))) throw new Error('knight must be on one of your routes');
      return () => {
        const k = target.knight;
        delete target.player.ck.knights[v];
        game.pushLog(`${p.name} displaced ${target.player.name}'s knight`);
        displace(game, target.player, v, k);
        game.updateLongestRoad();
      };
    }
    case 'sabotage':
      return () => {
        for (const o of others) {
          const n = Math.floor(cardCount(o.hand) / 2);
          if (game.computeVP(o) >= myVp && n > 0) game.addPrompt('discard', o.id, { count: n, reason: 'sabotage' });
        }
      };
    case 'taxation': {
      if (!game.robberActive) throw new Error('the robber is not active until the first barbarian attack');
      const h = Number(args.hexId);
      if (!topo.hexes[h] || h === game.robberHex) throw new Error('pick a new hex for the robber');
      return () => game.placeRobber(p, h, { taxation: true });
    }
    case 'treason': {
      const t = others.find(o => o.id === args.targetId);
      if (!t) throw new Error('pick a player');
      if (!Object.keys(t.ck.knights).length) throw new Error('that player has no knights');
      return () => game.addPrompt('treason_remove', t.id, { byId: p.id });
    }
    case 'wedding':
      return () => {
        for (const o of others) {
          const n = Math.min(2, cardCount(o.hand));
          if (game.computeVP(o) > myVp && n > 0) game.addPrompt('give', o.id, { toId: p.id, count: n, only: 'any', reason: 'wedding' });
        }
      };
    default:
      throw new Error('cannot play that card');
  }
}

// ---------------- Prompt handlers ----------------

const PROMPT_HANDLERS = {
  aqueduct(game, pr, ans) {
    const p = game.getPlayer(pr.playerId);
    if (ans.skip || !C.RESOURCES.some(r => game.bankCount(r) > 0)) return;
    if (!C.RESOURCES.includes(ans.resource)) throw new Error('pick a resource');
    if (game.bankCount(ans.resource) <= 0) throw new Error('bank has none left');
    p.hand.r[ans.resource] += 1;
    game.pushLog(`${p.name} takes 1 ${ans.resource} (Aqueduct)`);
  },
  progress_discard(game, pr, ans) {
    const p = game.getPlayer(pr.playerId);
    discardProgress(game, p, ans.card);
    if (p.ck.progress.length > C.CK_PROGRESS_HAND_LIMIT) game.addPrompt('progress_discard', p.id, {});
  },
  choose_deck(game, pr, ans) {
    if (!C.CK_TRACKS.includes(ans.track)) throw new Error('pick a deck');
    drawProgress(game, game.getPlayer(pr.playerId), ans.track);
  },
  move_knight(game, pr, ans) {
    const v = Number(ans.vertexId);
    if (!pr.options.includes(v) || !vertexEmpty(game, v)) throw new Error('pick one of the highlighted intersections');
    const p = game.getPlayer(pr.playerId);
    p.ck.knights[v] = pr._knight;
    game.updateLongestRoad();
    game.pushLog(`${p.name} moved their displaced knight`);
  },
  treason_remove(game, pr, ans) {
    const p = game.getPlayer(pr.playerId);
    const v = Number(ans.vertexId);
    const k = ownKnight(p, v);
    removeKnight(game, p, v);
    game.pushLog(`${p.name} removed a knight (Treason)`);
    const by = game.getPlayer(pr.byId);
    const options = knightPlacementOptions(game, by);
    const ranks = [1, 2, 3].filter(r => r <= k.rank && knightSupply(by, r) > 0);
    if (options.length && ranks.length) {
      game.addPrompt('treason_place', by.id, { maxRank: k.rank, ranks, active: k.active, options });
    }
  },
  treason_place(game, pr, ans) {
    if (ans.skip) return;
    const p = game.getPlayer(pr.playerId);
    const v = Number(ans.vertexId);
    const rank = Number(ans.rank ?? Math.max(...pr.ranks));
    if (!pr.options.includes(v) || !vertexEmpty(game, v)) throw new Error('pick a highlighted intersection');
    if (!pr.ranks.includes(rank) || knightSupply(p, rank) <= 0) throw new Error('bad knight level');
    placeKnight(game, p, v, rank, pr.active);
    game.pushLog(`${p.name} placed a knight (Treason)`);
  },
  espionage(game, pr, ans) {
    if (ans.skip) return;
    const p = game.getPlayer(pr.playerId), t = game.getPlayer(pr.targetId);
    const i = t.ck.progress.indexOf(ans.card);
    if (i === -1) throw new Error('that card is not there');
    t.ck.progress.splice(i, 1);
    p.ck.progress.push(ans.card);
    game.pushLog(`${p.name} took a progress card from ${t.name}`);
  },
  take_cards(game, pr, ans) {
    const p = game.getPlayer(pr.playerId), t = game.getPlayer(pr.fromId);
    const cards = cleanCards(ans.cards, ALL_CARD_KEYS);
    if (countCards(cards) !== Math.min(pr.count, cardCount(t.hand))) throw new Error(`take exactly ${pr.count}`);
    if (!handHas(t.hand, cards)) throw new Error("they don't have those cards");
    pay(t.hand, cards); addCards(p.hand, cards);
    game.pushLog(`${p.name} took ${countCards(cards)} cards from ${t.name}`);
  },
};

function autoAnswer(game, pr) {
  const p = game.getPlayer(pr.playerId);
  switch (pr.kind) {
    case 'aqueduct': {
      const r = C.RESOURCES.find(x => game.bankCount(x) > 0);
      return r ? { resource: r } : { skip: true };
    }
    case 'progress_discard': return { card: p.ck.progress[0] };
    case 'choose_deck': return { track: C.CK_TRACKS.find(t => game.ck.decks[t].length) || 'science' };
    case 'move_knight': return { vertexId: pr.options[0] };
    case 'treason_remove': {
      const ks = Object.entries(p.ck.knights).sort((a, b) => a[1].rank - b[1].rank);
      return { vertexId: Number(ks[0][0]) };
    }
    case 'treason_place': return { vertexId: pr.options[0], rank: Math.max(...pr.ranks) };
    case 'espionage': return { skip: true };
    case 'take_cards': {
      const t = game.getPlayer(pr.fromId);
      const bag = handToBag(t.hand).slice(0, pr.count);
      const cards = {};
      for (const k of bag) cards[k] = (cards[k] || 0) + 1;
      return { cards };
    }
    default: return {};
  }
}

// Extra data only the prompt's owner may see.
function promptPrivateView(game, pr) {
  if (pr.kind === 'espionage') return { cards: game.getPlayer(pr.targetId).ck.progress.slice() };
  if (pr.kind === 'take_cards') return { hand: game.getPlayer(pr.fromId).hand };
  if (pr.kind === 'progress_discard') return { cards: game.getPlayer(pr.playerId).ck.progress.slice() };
  return {};
}

function endTurnCleanup(game, p) {
  p.ck.fleet = null;
}

function publicState(game) {
  return {
    barbarianDistance: game.ck.barbarianDistance,
    barbarianMax: C.CK_BARBARIAN_DISTANCE,
    barbarianAttacks: game.ck.barbarianAttacks,
    barbarianStrength: game.players.reduce((a, p) => a + p.cities.length, 0),
    knightStrength: game.players.reduce((a, p) => a + knightStrength(p), 0),
    metropolises: game.ck.metropolises,
    merchant: game.ck.merchant,
    deckCounts: Object.fromEntries(C.CK_TRACKS.map(t => [t, game.ck.decks[t].length])),
  };
}

function publicPlayer(game, p, show) {
  return {
    tracks: p.ck.tracks,
    knights: p.ck.knights,
    cityWalls: p.ck.cityWalls,
    progressCount: p.ck.progress.length,
    progress: show ? p.ck.progress.slice() : null,
    progressVP: p.ck.progressVP,
    defenders: p.ck.defenders,
    fleet: p.ck.fleet,
    strength: knightStrength(p),
    knightSupply: { 1: knightSupply(p, 1), 2: knightSupply(p, 2), 3: knightSupply(p, 3) },
  };
}

function act(game, playerId, type, m) {
  const v = Number(m.vertexId);
  switch (type) {
    case 'ck_improve':         return improveTrack(game, playerId, m.track, { vertexId: m.vertexId });
    case 'ck_knight_build':    return recruitKnight(game, playerId, v);
    case 'ck_knight_promote':  return promoteKnight(game, playerId, v);
    case 'ck_knight_activate': return activateKnight(game, playerId, v);
    case 'ck_knight_move':     return moveKnight(game, playerId, Number(m.from), Number(m.to));
    case 'ck_knight_displace': return displaceKnight(game, playerId, Number(m.from), Number(m.to));
    case 'ck_knight_chase':    return chaseRobber(game, playerId, v);
    case 'ck_wall':            return buildWall(game, playerId, v);
    case 'ck_play':            return playProgress(game, playerId, m.card, m.args || {});
    case 'ck_discard_progress': {
      const p = game.getPlayer(playerId);
      game.assertTurn(p);
      return discardProgress(game, p, m.card);
    }
    default: throw new Error('unknown action: ' + type);
  }
}

module.exports = {
  initCKState, initPlayer, resolveEventDie, runBarbarianAttack, drawProgress, discardProgress,
  aqueduct, tradeRate, vpBreakdown, endTurnCleanup, publicState, publicPlayer,
  improveTrack, recruitKnight, promoteKnight, activateKnight, moveKnight, displaceKnight,
  chaseRobber, buildWall, playProgress, reach, isOpenRoad, knightPlacementOptions,
  PROMPT_HANDLERS, autoAnswer, promptPrivateView, act, TRACK_OF_CARD,
  // legacy name
  buildKnight: recruitKnight,
};
