// Full-game simulation: greedy bots play complete games through the real engine API.
// After every action we check invariants (card conservation, piece limits, VP math,
// no negative hands). Used by test/fullgame.js and runnable directly:
//   node test/sim.js base 10      node test/sim.js cnk 13
const assert = require('assert');
const { Game, cardCount } = require('../src/game');
const ck = require('../src/ck');
const C = require('../src/constants');

function checkInvariants(g) {
  const keys = g.cnk ? [...C.RESOURCES, ...C.COMMODITIES] : C.RESOURCES;
  for (const k of keys) {
    const kind = C.RESOURCES.includes(k) ? 'r' : 'c';
    const total = (kind === 'r' ? C.BANK_RESOURCES : C.BANK_COMMODITIES);
    let held = 0;
    for (const p of g.players) {
      assert.ok(Number.isInteger(p.hand[kind][k]) && p.hand[kind][k] >= 0, `bad hand ${k}=${p.hand[kind][k]}`);
      held += p.hand[kind][k];
    }
    assert.ok(held <= total, `${k}: players hold ${held} > supply ${total}`);
    assert.strictEqual(g.bankCount(k), total - held);
  }
  const vertsTaken = new Set(), edgesTaken = new Set();
  for (const p of g.players) {
    assert.ok(p.roads.length <= C.PIECES.roads, 'road limit');
    assert.ok(p.cities.length <= C.PIECES.cities, 'city limit');
    for (const v of [...p.settlements, ...p.cities]) { assert.ok(!vertsTaken.has(v), 'vertex double-booked'); vertsTaken.add(v); }
    for (const e of p.roads) { assert.ok(!edgesTaken.has(e), 'edge double-booked'); edgesTaken.add(e); }
    if (g.cnk) {
      for (const [v, k] of Object.entries(p.ck.knights)) {
        assert.ok(!vertsTaken.has(+v), 'knight on a building');
        vertsTaken.add(+v);
        assert.ok(k.rank >= 1 && k.rank <= 3);
      }
      for (const r of [1, 2, 3]) assert.ok(Object.values(p.ck.knights).filter(k => k.rank === r).length <= 2, 'knight supply');
      assert.ok(p.ck.cityWalls.length <= 3 && p.ck.cityWalls.every(v => p.cities.includes(v)), 'walls only under cities');
    }
  }
  // distance rule
  for (const v of vertsTaken) {
    const isBuilding = g.vertexOwner(v);
    if (!isBuilding) continue;
    for (const nb of g.map.topo.vAdj[v]) assert.ok(!g.vertexOwner(nb), 'distance rule broken');
  }
  if (g.cnk) {
    const owners = Object.values(g.ck.metropolises).filter(Boolean);
    for (const m of owners) assert.ok(g.getPlayer(m.playerId).cities.includes(m.vertexId), 'metropolis must sit on a city');
    assert.strictEqual(new Set(owners.map(m => m.vertexId)).size, owners.length, 'two metropolises on one city');
  }
  if (g.phase !== 'end') {
    for (const p of g.players) {
      if (p === g.current() && !['setup_1', 'setup_2'].includes(g.phase)) {
        assert.ok(g.computeVP(p) < g.vpTarget, `current player has ${g.computeVP(p)} >= ${g.vpTarget} but game not over`);
      }
    }
  } else {
    const w = g.getPlayer(g.winner);
    assert.ok(g.computeVP(w) >= g.vpTarget, 'winner below target');
  }
}

function tryDo(fn) { try { fn(); return true; } catch { return false; } }

function want(g, p, cost) {
  // bank-trade toward a cost if we have surplus
  for (const [need, n] of Object.entries(cost)) {
    while ((p.hand.r[need] || 0) < n) {
      const surplus = C.RESOURCES.find(r => r !== need && p.hand.r[r] - (cost[r] || 0) >= g.tradeRate(p, r));
      if (!surplus) return false;
      if (!tryDo(() => g.trade(p.id, { [surplus]: g.tradeRate(p, surplus) }, { [need]: 1 }))) return false;
    }
  }
  return true;
}

function botMain(g, p, stats) {
  const topo = g.map.topo;
  for (let guard = 0; guard < 60 && g.phase === 'main' && g.current() === p; guard++) {
    if (g.prompts.length) return;
    let did = false;
    // C&K extras first
    if (g.cnk) {
      for (const t of C.CK_TRACKS) {
        if (tryDo(() => ck.improveTrack(g, p.id, t))) { did = true; stats.improve++; }
      }
      for (const card of p.ck.progress.slice()) {
        if (playProgressGreedy(g, p, card)) { did = true; stats.progress++; if (g.prompts.length || g.phase !== 'main') return; }
      }
      // Knights: keep enough active knights to meet the barbarians.
      const strength = Object.values(p.ck.knights).filter(k => k.active).reduce((a, k) => a + k.rank, 0);
      if (strength < p.cities.length + 1) {
        const inactive = Object.entries(p.ck.knights).find(([, k]) => !k.active);
        if (inactive && tryDo(() => ck.activateKnight(g, p.id, +inactive[0]))) { did = true; stats.knight++; }
        else {
          const v = topo.vertices.find(v => tryDo(() => { if (!g.canPlaceBuildingAt(v.id) && g.vertexOwner(v.id)) throw 0; }) &&
            !g.vertexOwner(v.id) && !g.knightAt(v.id) && v.edges.some(e => p.roads.includes(e)));
          if (v && tryDo(() => ck.recruitKnight(g, p.id, v.id))) { did = true; stats.knight++; }
        }
      }
      for (const [v, k] of Object.entries(p.ck.knights)) {
        if (k.rank < 3 && p.hand.r.sheep >= 2 && p.hand.r.ore >= 4 && tryDo(() => ck.promoteKnight(g, p.id, +v))) { did = true; stats.knight++; }
        if (g.robberHex != null && g.robberActive && topo.hexVertices[g.robberHex].includes(+v) &&
            g.map.topo.hexVertices[g.robberHex].some(x => g.vertexOwner(x) === p) &&
            tryDo(() => ck.chaseRobber(g, p.id, +v))) { stats.chase++; return; }
      }
      for (const c of p.cities) if (tryDo(() => ck.buildWall(g, p.id, c))) { did = true; stats.wall++; }
    } else {
      // Base: play a dev card if useful
      const card = p.devCards.find(c => c !== 'vp');
      if (card && !p.devPlayedThisTurn) {
        let ok = false;
        if (card === 'knight') ok = tryDo(() => g.playDev(p.id, 'knight'));
        if (card === 'year_of_plenty') ok = tryDo(() => g.playDev(p.id, card, { resources: ['ore', 'wheat'] }));
        if (card === 'monopoly') ok = tryDo(() => g.playDev(p.id, card, { resource: 'ore' }));
        if (card === 'road_building') {
          const e1 = topo.edges.find(e => !g.edgeOwner(e.id) && g.edgeConnectsToPlayer(e.id, p.id));
          ok = e1 && tryDo(() => g.playDev(p.id, card, { edges: [e1.id] }));
        }
        if (ok) { stats.dev++; return; } // knight opens a robber prompt
      }
    }
    // City
    if (p.settlements.length && (canPay(p, C.BUILD_COST.city) || want(g, p, C.BUILD_COST.city))) {
      if (tryDo(() => g.buildCity(p.id, p.settlements[0]))) { did = true; stats.city++; }
    }
    // Settlement
    const spot = topo.vertices.find(v => g.canPlaceBuildingAt(v.id) && g.vertexConnectedToPlayerRoad(v.id, p.id));
    if (spot && (canPay(p, C.BUILD_COST.settlement) || want(g, p, C.BUILD_COST.settlement))) {
      if (tryDo(() => g.placeSettlement(p.id, spot.id))) { did = true; stats.settlement++; }
    }
    // Road (toward expansion)
    if (!spot || p.roads.length < 6 || cardCount(p.hand) > 7) {
      const e = topo.edges.find(e => !g.edgeOwner(e.id) && g.edgeConnectsToPlayer(e.id, p.id));
      if (e && (canPay(p, C.BUILD_COST.road) || want(g, p, C.BUILD_COST.road)) && tryDo(() => g.placeRoad(p.id, e.id))) { did = true; stats.road++; }
    }
    // Dev card
    if (!g.cnk && canPay(p, C.BUILD_COST.dev) && tryDo(() => g.buyDev(p.id))) { did = true; stats.buydev++; }
    // Occasional p2p trade with the next player
    if (!did && g._rand() < 0.2) {
      const other = g.players[(g.turn + 1) % g.players.length];
      const give = C.RESOURCES.find(r => p.hand.r[r] >= 2), get = C.RESOURCES.find(r => other.hand.r[r] >= 1 && r !== give);
      if (give && get && tryDo(() => g.tradeOffer(p.id, { [give]: 1 }, { [get]: 1 }))) {
        if (tryDo(() => g.tradeRespond(other.id, true)) && tryDo(() => g.tradeAccept(p.id, other.id))) stats.p2p++;
        else tryDo(() => g.tradeCancel(p.id));
      }
    }
    checkInvariants(g);
    if (g.phase === 'end') return;
    if (!did) break;
  }
}

function canPay(p, cost) { return Object.entries(cost).every(([k, v]) => (p.hand.r[k] || 0) >= v); }

function playProgressGreedy(g, p, card) {
  const topo = g.map.topo;
  const others = g.players.filter(o => o !== p);
  const richer = others.find(o => g.computeVP(o) > g.computeVP(p));
  const argsFor = {
    crane: { track: C.CK_TRACKS.find(t => p.ck.tracks[t] < 5 && p.hand.c[C.CK_COMMODITY_FOR_TRACK[t]] >= p.ck.tracks[t]) },
    engineering: { vertexId: p.cities.find(c => !p.ck.cityWalls.includes(c)) },
    invention: (() => { const hs = topo.hexes.filter(h => h.num && ![2, 6, 8, 12].includes(h.num)); return { hexA: hs[0]?.id, hexB: hs[1]?.id }; })(),
    irrigation: {}, mining: {}, encouragement: {}, sabotage: {}, wedding: {},
    medicine: { vertexId: p.settlements[0] },
    road_building: { edges: [topo.edges.find(e => !g.edgeOwner(e.id) && g.edgeConnectsToPlayer(e.id, p.id))?.id].filter(x => x != null) },
    smithing: { vertices: Object.keys(p.ck.knights).slice(0, 2).map(Number) },
    commercial_harbor: (() => { const offers = {}; const r = C.RESOURCES.find(r => p.hand.r[r] > 0); if (r) offers[others[0].id] = r; return { offers }; })(),
    guild_dues: { targetId: richer?.id },
    merchant: { hexId: topo.hexes.find(h => h.res !== 'desert' && topo.hexVertices[h.id].some(v => p.settlements.includes(v) || p.cities.includes(v)))?.id },
    merchant_fleet: { kind: 'ore' },
    resource_monopoly: { resource: 'ore' },
    trade_monopoly: { commodity: 'coin' },
    diplomacy: { edgeId: topo.edges.find(e => g.edgeOwner(e.id) && g.edgeOwner(e.id) !== p && ck.isOpenRoad(g, e.id))?.id },
    espionage: { targetId: others[0].id },
    intrigue: { vertexId: (() => { for (const o of others) for (const v of Object.keys(o.ck.knights)) if (topo.vertices[v].edges.some(e => p.roads.includes(e))) return +v; })() },
    taxation: { hexId: topo.hexes.find(h => h.id !== g.robberHex && g.robberStealCandidates(h.id, p.id).length)?.id },
    treason: { targetId: others.find(o => Object.keys(o.ck.knights).length)?.id },
  };
  if (card === 'alchemy') return false; // played pre-roll
  return tryDo(() => ck.playProgress(g, p.id, card, argsFor[card] || {}));
}

function answerPrompts(g, stats) {
  // Answer via the same auto-answer used by the turn timer.
  for (let i = 0; i < 100 && g.prompts.length; i++) {
    const before = g.prompts.length;
    const pr = g.prompts[0];
    stats.prompts[pr.kind] = (stats.prompts[pr.kind] || 0) + 1;
    const { Game: _G } = require('../src/game');
    // Use the engine's autoAct prompt answering, prompt by prompt.
    const answer = require('../src/game').__autoAnswer
      ? require('../src/game').__autoAnswer(g, pr) : null;
    if (answer) g.respond(pr.playerId, pr.id, answer);
    else throw new Error('no auto answer');
    checkInvariants(g);
    if (g.phase === 'end') return;
    assert.ok(g.prompts.length <= before + 6);
  }
}

function playGame({ mode = 'base', vpTarget, mapVariant = 'classic', players = 4, seed = 1, maxTurns = 1500, discardLimit } = {}) {
  const g = new Game({ mode, vpTarget, mapVariant, seed, discardLimit, maxPlayers: players });
  const names = ['Ava', 'Ben', 'Cat', 'Dev', 'Eli', 'Fay'];
  for (let i = 0; i < players; i++) g.addPlayer('p' + i, names[i]);
  g.start();
  const stats = { improve: 0, progress: 0, knight: 0, wall: 0, chase: 0, dev: 0, city: 0, settlement: 0, road: 0, buydev: 0, p2p: 0, prompts: {}, turns: 0 };
  // Setup
  while (g.phase === 'setup_1' || g.phase === 'setup_2') {
    const p = g.current();
    const spots = g.map.topo.vertices.filter(v => g.canPlaceBuildingAt(v.id));
    // prefer high-production spots
    const score = v => v.hexes.reduce((a, h) => { const n = g.map.topo.hexes[h].num; return a + (n ? 6 - Math.abs(7 - n) : 0); }, 0);
    spots.sort((a, b) => score(b) - score(a));
    g.placeSettlement(p.id, spots[0].id, { setup: true });
    const e = g.map.topo.vertices[spots[0].id].edges.find(id => !g.edgeOwner(id));
    g.placeRoad(p.id, e, { setup: true });
    g.endSetupStep(p.id);
    checkInvariants(g);
  }
  assert.strictEqual(g.phase, 'roll');
  while (g.phase !== 'end' && stats.turns < maxTurns) {
    const p = g.current();
    // C&K alchemy before rolling sometimes
    if (g.cnk && p.ck.progress.includes('alchemy')) tryDo(() => ck.playProgress(g, p.id, 'alchemy', { red: 3, yellow: 3 }));
    else g.rollDice(p.id);
    checkInvariants(g);
    answerPrompts(g, stats);
    if (g.phase === 'end') break;
    botMain(g, p, stats);
    answerPrompts(g, stats);
    if (g.phase === 'end') break;
    if (g.prompts.length === 0 && g.phase === 'main') {
      if (g.cnk) while (p.ck.progress.length > 4) ck.discardProgress(g, p, p.ck.progress[0]);
      g.endTurn(p.id);
      stats.turns++;
      checkInvariants(g);
    }
  }
  return { g, stats };
}

module.exports = { playGame, checkInvariants };

if (require.main === module) {
  const [mode = 'base', vp] = process.argv.slice(2);
  const { g, stats } = playGame({ mode, vpTarget: vp ? +vp : undefined, seed: 7 });
  const w = g.winner && g.getPlayer(g.winner);
  console.log(`${mode} target=${g.vpTarget} phase=${g.phase} turns=${stats.turns}`,
    w ? `winner=${w.name} vp=${g.computeVP(w)} ${JSON.stringify(g.vpBreakdown(w))}` : 'NO WINNER');
  console.log(JSON.stringify(stats));
}
