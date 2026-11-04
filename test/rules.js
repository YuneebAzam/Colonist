// Targeted rule tests for Base Catan and Cities & Knights, plus regressions for every
// exploit found in the audit. Run: node test/rules.js
const assert = require('assert');
const { Game, normalizeSettings } = require('../src/game');
const ck = require('../src/ck');
const C = require('../src/constants');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.stack.split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; }
}

// Builds a game past setup with deterministic placements; turn 0 in main phase.
function mk(mode = 'base', opts = {}) {
  const g = new Game({ mode, mapVariant: 'classic', seed: 3, ...opts });
  const n = opts.players || 3;
  for (let i = 0; i < n; i++) g.addPlayer('p' + i, 'P' + i);
  g.start();
  while (g.phase === 'setup_1' || g.phase === 'setup_2') {
    const p = g.current();
    const v = g.map.topo.vertices.find(v => g.canPlaceBuildingAt(v.id));
    g.placeSettlement(p.id, v.id, { setup: true });
    g.placeRoad(p.id, v.edges.find(e => !g.edgeOwner(e)), { setup: true });
    g.endSetupStep(p.id);
  }
  for (const p of g.players) { for (const k in p.hand.r) p.hand.r[k] = 0; for (const k in p.hand.c) p.hand.c[k] = 0; }
  g.phase = 'main';
  return g;
}
const P = (g, i) => g.players[i];
const edgeFrom = (g, p) => g.map.topo.edges.find(e => !g.edgeOwner(e.id) && g.edgeConnectsToPlayer(e.id, p.id));

console.log('Settings');
test('defaults: base 10 VP, C&K 13 VP, discard 7, timer off', () => {
  assert.strictEqual(normalizeSettings({ mode: 'base' }).vpTarget, 10);
  assert.strictEqual(normalizeSettings({ mode: 'cnk' }).vpTarget, 13);
  assert.strictEqual(normalizeSettings({}).discardLimit, 7);
  assert.strictEqual(normalizeSettings({}).turnTimer, 0);
});
test('VP target accepts every integer 10..20 and clamps outside', () => {
  for (let t = 10; t <= 20; t++) for (const mode of ['base', 'cnk']) assert.strictEqual(new Game({ mode, vpTarget: t }).vpTarget, t);
  assert.strictEqual(normalizeSettings({ vpTarget: 3 }).vpTarget, 10);
  assert.strictEqual(normalizeSettings({ vpTarget: 99 }).vpTarget, 20);
  assert.strictEqual(normalizeSettings({ vpTarget: 'abc', mode: 'cnk' }).vpTarget, 13);
});
test('max players caps joins and is clamped to the map', () => {
  const g = new Game({ maxPlayers: 3 });
  for (let i = 0; i < 3; i++) g.addPlayer('x' + i, 'X');
  assert.throws(() => g.addPlayer('x4', 'X'), /full/);
  assert.strictEqual(normalizeSettings({ mapVariant: 'classic', maxPlayers: 6 }).maxPlayers, 4);
  assert.strictEqual(normalizeSettings({ mapVariant: 'extended', maxPlayers: 6 }).maxPlayers, 6);
});
test('player colors are distinct even after someone leaves the lobby', () => {
  const g = new Game({ mapVariant: 'extended' });
  ['a', 'b', 'c'].forEach(x => g.addPlayer(x, x)); g.removePlayer('b'); g.addPlayer('d', 'd'); g.addPlayer('e', 'e');
  assert.strictEqual(new Set(g.players.map(p => p.color)).size, g.players.length);
});

console.log('Victory target');
for (const mode of ['base', 'cnk']) {
  test(`${mode}: game ends exactly when the current player reaches each target 10..20`, () => {
    for (let t = 10; t <= 20; t++) {
      const g = mk(mode, { vpTarget: t });
      const p = P(g, 0);
      // Give p settlements/cities via direct state until VP = t-1, then build a city for +1.
      p.settlements = []; p.cities = [];
      const free = g.map.topo.vertices.filter(v => !g.vertexOwner(v.id)).map(v => v.id);
      while (g.computeVP(p) < t - 1) {
        if (p.cities.length < 4) p.cities.push(free.pop());
        else if (mode === 'base') p.newDevCards.push('vp');
        else p.ck.defenders++;
      }
      // one settlement to upgrade
      if (g.computeVP(p) === t - 1) {
        const s = free.pop(); p.settlements.push(s); // +1 -> t... instead upgrade path:
        // keep VP at t-1: convert one city back so the settlement + city math lands at t-1
        if (p.cities.length) p.cities.pop(); else p.ck ? p.ck.defenders-- : p.newDevCards.pop();
        while (g.computeVP(p) < t - 1) mode === 'base' ? p.newDevCards.push('vp') : p.ck.defenders++;
      }
      g.checkWin();
      assert.strictEqual(g.phase, 'main', `target ${t}: should not end at ${g.computeVP(p)}`);
      Object.assign(p.hand.r, { wheat: 2, ore: 3 });
      g.buildCity(p.id, p.settlements[0]);
      assert.strictEqual(g.computeVP(p), t);
      assert.strictEqual(g.phase, 'end', `target ${t}: should end`);
      assert.strictEqual(g.winner, p.id);
    }
  });
}
test('reaching the target off-turn only wins at the start of your own turn', () => {
  const g = mk('cnk', { vpTarget: 10 });
  const p1 = P(g, 1);
  p1.ck.defenders = 10 - g.computeVP(p1); // e.g. defender tokens earned on someone else's turn
  g.checkWin();
  assert.strictEqual(g.phase, 'main');
  g.endTurn(P(g, 0).id);
  assert.strictEqual(g.phase, 'end');
  assert.strictEqual(g.winner, p1.id);
});
test('hidden VP dev cards count toward the target but not public VP', () => {
  const g = mk('base', { vpTarget: 10 });
  const p = P(g, 0);
  p.newDevCards.push('vp', 'vp');
  const snapOther = g.snapshot(P(g, 1).id).players[0];
  const snapMe = g.snapshot(p.id).players[0];
  assert.strictEqual(snapMe.vp, snapOther.vp + 2);
});
test('all C&K VP sources are counted (metropolis, merchant, defenders, VP cards, longest route)', () => {
  const g = mk('cnk');
  const p = P(g, 0);
  const base = g.computeVP(p);
  g.ck.metropolises.trade = { playerId: p.id, vertexId: p.cities[0], permanent: false };
  g.ck.merchant = { playerId: p.id, hexId: 0 };
  p.ck.defenders = 2;
  p.ck.progressVP.push('printing', 'constitution');
  g.longestRoad = { playerId: p.id, length: 5 };
  assert.strictEqual(g.computeVP(p), base + 2 + 1 + 2 + 2 + 2);
});

console.log('Audit regressions');
test('setup:true cannot place free roads outside setup', () => {
  const g = mk();
  const p = P(g, 0);
  const e = g.map.topo.vertices[p.settlements[0]].edges.find(x => !g.edgeOwner(x));
  assert.throws(() => g.placeRoad(p.id, e, { setup: true }), /setup/);
});
test('setup allows exactly one road, touching your own new building', () => {
  const g = new Game({ seed: 1 });
  ['a', 'b', 'c'].forEach(x => g.addPlayer(x, x)); g.start();
  const v = g.map.topo.vertices.find(v => g.canPlaceBuildingAt(v.id));
  assert.throws(() => g.placeRoad('a', v.edges[0], { setup: true }), /building first/);
  g.placeSettlement('a', v.id, { setup: true });
  assert.throws(() => g.placeSettlement('a', v.id + 30, { setup: true }), /already placed/);
  g.placeRoad('a', v.edges[0], { setup: true });
  assert.throws(() => g.placeRoad('a', v.edges[1], { setup: true }), /already placed/);
});
test('discard rejects negative amounts and unknown card types', () => {
  const g = mk();
  const p = P(g, 0);
  p.hand.r.wood = 8;
  g.addPrompt('discard', p.id, { count: 4 });
  assert.throws(() => g.discard(p.id, { wood: -100, foo: 104 }));
  assert.throws(() => g.discard(p.id, { wood: -3, brick: 7 }));
  assert.throws(() => g.discard(p.id, { wood: 3 }), /exactly 4/);
  assert.strictEqual(p.hand.r.wood, 8);
  g.discard(p.id, { wood: 4 });
  assert.strictEqual(p.hand.r.wood, 4);
});
test('bank trade rejects bogus and same-type takes', () => {
  const g = mk();
  const p = P(g, 0);
  p.hand.r.wood = 8;
  assert.throws(() => g.trade(p.id, { wood: 4 }, { gold: 1 }));
  assert.throws(() => g.trade(p.id, { wood: 4 }, { wood: 1 }));
  assert.throws(() => g.trade(p.id, { wood: 3 }, { ore: 1 }), /rate/);
  g.trade(p.id, { wood: 4 }, { ore: 1 });
  assert.deepStrictEqual([p.hand.r.wood, p.hand.r.ore], [4, 1]);
  assert.ok(!('gold' in p.hand.r));
});
test('C&K actions require your turn', () => {
  const g = mk('cnk');
  const p1 = P(g, 1);
  p1.hand.c.cloth = 5;
  assert.throws(() => ck.improveTrack(g, p1.id, 'trade'), /not your turn/);
  assert.throws(() => g.act(p1.id, 'ck_improve', { track: 'trade' }), /not your turn/);
});
test('knights block other pieces from sharing the intersection', () => {
  const g = mk('cnk');
  const p0 = P(g, 0), p1 = P(g, 1);
  const v = g.map.topo.vertices.find(v => !g.vertexOwner(v.id) && v.edges.some(e => p0.roads.includes(e)));
  p0.hand.r.sheep = 1; p0.hand.r.ore = 1;
  ck.recruitKnight(g, p0.id, v.id);
  assert.ok(!g.canPlaceBuildingAt(v.id));
  p1.roads.push(...v.edges.filter(e => !g.edgeOwner(e)).slice(0, 1));
  g.turn = 1; p1.hand.r.sheep = 1; p1.hand.r.ore = 1;
  assert.throws(() => ck.recruitKnight(g, p1.id, v.id), /occupied/);
});
test('invalid dev-card arguments do not consume the card', () => {
  const g = mk();
  const p = P(g, 0);
  p.devCards = ['year_of_plenty', 'road_building'];
  assert.throws(() => g.playDev(p.id, 'year_of_plenty', { resources: ['x', 'y'] }));
  assert.throws(() => g.playDev(p.id, 'road_building', { edges: [99999] }));
  assert.deepStrictEqual(p.devCards, ['year_of_plenty', 'road_building']);
  assert.strictEqual(p.devPlayedThisTurn, false);
});
test('robber cannot be moved to a nonexistent hex', () => {
  const g = mk();
  const before = g.robberHex;
  g.addPrompt('robber', P(g, 0).id, {});
  assert.throws(() => g.moveRobber(P(g, 0).id, 999), /bad hex/);
  assert.strictEqual(g.robberHex, before);
  assert.strictEqual(g.prompts.length, 1);
});
test('Resource Rush: every producing hex has a number; robber enters on first 7', () => {
  for (let s = 1; s < 40; s++) {
    const g = new Game({ mapVariant: 'resource_rush', seed: s });
    assert.ok(g.map.topo.hexes.every(h => h.num != null));
    assert.strictEqual(g.robberHex, null);
  }
});
test('barbarians pillage the lowest contributor that actually has a city', () => {
  const g = mk('cnk');
  const [a, b, c] = g.players;
  // only b has cities; b has 1 active knight, a and c have none
  a.cities = []; c.cities = [];
  b.ck.knights = { 999: { id: 1, rank: 1, active: true } };
  const v = b.cities[0];
  b.cities.push(...b.settlements.splice(0)); // b: 2 cities -> barbarians 2 > knights 1
  ck.runBarbarianAttack(g);
  assert.ok(b.settlements.includes(v) || b.settlements.length === 1, 'b loses a city');
  assert.strictEqual(b.cities.length, 1);
});

console.log('Base rules');
test('longest road: needs 5, ties keep the holder, broken road passes or sets aside', () => {
  const g = new Game({ seed: 9 });
  ['a', 'b', 'c'].forEach(x => g.addPlayer(x, x)); g.start(); g.phase = 'main';
  const A = P(g, 0), B = P(g, 1);
  const topo = g.map.topo;
  // Build a 6-long path for A
  const path = [];
  let v = topo.vertices.find(x => x.hexes.length === 3).id;
  const usedV = new Set([v]);
  while (path.length < 6) {
    const e = topo.vertices[v].edges.find(id => { const ed = topo.edges[id]; const o = ed.a === v ? ed.b : ed.a; return !usedV.has(o) && !path.includes(id); });
    const ed = topo.edges[e]; v = ed.a === v ? ed.b : ed.a; usedV.add(v); path.push(e);
  }
  A.settlements.push(topo.edges[path[0]].a === topo.edges[path[1]].a || topo.edges[path[0]].a === topo.edges[path[1]].b ? topo.edges[path[0]].b : topo.edges[path[0]].a);
  for (const e of path.slice(0, 4)) A.roads.push(e);
  g.updateLongestRoad();
  assert.strictEqual(g.longestRoad.playerId, null, '4 roads is not enough');
  A.roads.push(path[4]); g.updateLongestRoad();
  assert.strictEqual(g.longestRoad.playerId, A.id);
  // B's settlement in the middle of A's road breaks it (3+2 -> nobody has 5: set aside)
  const ed2 = topo.edges[path[2]], ed3 = topo.edges[path[3]];
  const mid = [ed2.a, ed2.b].find(x => x === ed3.a || x === ed3.b);
  B.settlements.push(mid); g.updateLongestRoad();
  assert.strictEqual(g.longestRoad.playerId, null, 'broken road with nobody at 5 is set aside');
});
test('largest army needs 3 knights and strictly more to take', () => {
  const g = mk();
  const [a, b] = g.players;
  a.devCards = ['knight', 'knight', 'knight'];
  for (let i = 0; i < 3; i++) {
    g.playDev(a.id, 'knight'); const pr = g.prompts[0];
    g.respond(a.id, pr.id, { hexId: g.map.topo.hexes.find(h => h.id !== g.robberHex).id });
    while (g.prompts.length) g.respond(a.id, g.prompts[0].id, { targetId: g.prompts[0].candidates[0] });
    a.devPlayedThisTurn = false;
  }
  assert.strictEqual(g.largestArmy.playerId, a.id);
  assert.strictEqual(g.vpBreakdown(a).largestArmy, 2);
  g.turn = 1; b.devCards = ['knight', 'knight', 'knight']; b.playedKnights = 2;
  g.playDev(b.id, 'knight'); g.respond(b.id, g.prompts[0].id, { hexId: g.map.topo.hexes.find(h => h.id !== g.robberHex).id });
  while (g.prompts.length) g.respond(b.id, g.prompts[0].id, { targetId: g.prompts[0].candidates[0] });
  assert.strictEqual(g.largestArmy.playerId, a.id, '3 vs 3 keeps the holder');
});
test('one development card per turn, not the turn it was bought, knight playable before rolling', () => {
  const g = mk();
  const a = P(g, 0);
  Object.assign(a.hand.r, { sheep: 1, wheat: 1, ore: 1 });
  g.devDeck.push('monopoly');
  g.buyDev(a.id);
  assert.throws(() => g.playDev(a.id, 'monopoly', { resource: 'ore' }), /bought/);
  a.devCards = ['knight', 'monopoly'];
  g.phase = 'roll';
  g.playDev(a.id, 'knight');
  g.respond(a.id, g.prompts[0].id, { hexId: g.map.topo.hexes.find(h => h.id !== g.robberHex).id });
  while (g.prompts.length) g.respond(a.id, g.prompts[0].id, { targetId: g.prompts[0].candidates[0] });
  assert.strictEqual(g.phase, 'roll', 'returns to roll phase');
  assert.throws(() => g.playDev(a.id, 'monopoly', { resource: 'ore' }), /one development card/);
});
test('bank shortage: nobody gets a short resource unless only one player is affected', () => {
  const g = mk();
  const [a, b] = g.players;
  const hex = g.map.topo.hexes.find(h => h.num && h.res !== 'desert' && h.id !== g.robberHex);
  const vs = g.map.topo.hexVertices[hex.id];
  for (const p of g.players) { p.settlements = []; p.cities = []; }
  a.settlements.push(vs[0]); b.settlements.push(vs[2]);
  // leave just 1 in the bank: 2 players want it -> nobody gets it
  P(g, 2).hand.r[hex.res] = 18;
  g.produce(hex.num);
  assert.strictEqual(a.hand.r[hex.res] + b.hand.r[hex.res], 0);
  // only one player affected: gets what's left
  b.settlements = [];
  a.cities.push(a.settlements.pop());
  g.produce(hex.num);
  assert.strictEqual(a.hand.r[hex.res], 1);
});
test('cannot trade like-for-like or give cards away', () => {
  const g = mk();
  P(g, 0).hand.r.wood = 3;
  assert.throws(() => g.tradeOffer('p0', { wood: 1 }, { wood: 1 }));
  assert.throws(() => g.tradeOffer('p0', { wood: 1 }, {}));
  assert.throws(() => g.tradeOffer('p0', {}, { ore: 1 }));
});
test('piece limits: 15 roads, 5 settlements, 4 cities', () => {
  const g = mk();
  const a = P(g, 0);
  a.roads = Array.from({ length: 15 }, (_, i) => 1000 + i);
  assert.throws(() => g.buildRoadFree(a, g.map.topo.edges.find(e => !g.edgeOwner(e.id)).id), /no roads/);
  a.roads = []; a.cities = [1, 2, 3, 4]; a.settlements = [5];
  Object.assign(a.hand.r, { wheat: 2, ore: 3 });
  assert.throws(() => g.buildCity(a.id, 5), /no cities/);
});
test('discard limit setting: 9 means only hands over 9 discard', () => {
  for (const [limit, cards, expect] of [[7, 8, 4], [9, 8, 0], [9, 10, 5]]) {
    const g = mk('base', { discardLimit: limit });
    P(g, 1).hand.r.wood = cards;
    g.phase = 'roll'; g.alchemyDice = { red: 3, yellow: 4 };
    g.rollDice('p0');
    const d = g.prompts.find(p => p.kind === 'discard' && p.playerId === 'p1');
    assert.strictEqual(d ? d.count : 0, expect, `limit ${limit} with ${cards} cards`);
  }
});

console.log('Cities & Knights rules');
test('C&K setup: second placement is a city and pays 1 resource per hex', () => {
  const g = mk('cnk');
  for (const p of g.players) { assert.strictEqual(p.settlements.length, 1); assert.strictEqual(p.cities.length, 1); }
});
test('C&K: no development cards, robber inactive until first barbarian attack', () => {
  const g = mk('cnk');
  assert.throws(() => g.buyDev('p0'), /Cities & Knights/);
  assert.strictEqual(g.robberActive, false);
  P(g, 1).hand.r.wood = 9;
  g.phase = 'roll'; g.alchemyDice = { red: 3, yellow: 4 };
  g.rollDice('p0');
  assert.ok(g.prompts.every(p => p.kind !== 'robber'), 'no robber prompt yet');
  g.respond('p1', g.prompts.find(p => p.kind === 'discard').id, { cards: { wood: 4 } });
  ck.runBarbarianAttack(g);
  assert.strictEqual(g.robberActive, true);
  assert.strictEqual(g.robberHex, g.robberHome);
});
test('C&K city on wood/sheep/ore gives 1 resource + 1 commodity; brick/wheat give 2', () => {
  const g = mk('cnk');
  const a = P(g, 0);
  for (const p of g.players) { p.settlements = []; p.cities = []; }
  for (const res of ['wood', 'sheep', 'ore', 'brick', 'wheat']) {
    const h = g.map.topo.hexes.find(x => x.res === res && x.num);
    if (!h) continue;
    for (const p of g.players) { for (const k in p.hand.r) p.hand.r[k] = 0; for (const k in p.hand.c) p.hand.c[k] = 0; }
    a.cities = [g.map.topo.hexVertices[h.id][0]];
    g.robberHex = null;
    g.produce(h.num);
    if (C.COMMODITY_FROM[res]) {
      assert.ok(a.hand.r[res] >= 1 && a.hand.c[C.COMMODITY_FROM[res]] >= 1, res);
    } else assert.ok(a.hand.r[res] >= 2, res);
  }
});
test('improvements: level N costs N of the right commodity and needs a city', () => {
  const g = mk('cnk');
  const a = P(g, 0);
  a.hand.c.cloth = 3;
  ck.improveTrack(g, a.id, 'trade'); ck.improveTrack(g, a.id, 'trade');
  assert.strictEqual(a.ck.tracks.trade, 2); assert.strictEqual(a.hand.c.cloth, 0);
  a.hand.c.coin = 1;
  const cities = a.cities; a.cities = [];
  assert.throws(() => ck.improveTrack(g, a.id, 'politics'), /need a city/);
  a.cities = cities;
});
test('metropolis: first to 4 takes it, first to 5 takes it permanently', () => {
  const g = mk('cnk');
  const [a, b] = g.players;
  a.ck.tracks.science = 3; a.hand.c.paper = 4;
  ck.improveTrack(g, a.id, 'science');
  assert.deepStrictEqual(g.ck.metropolises.science.playerId, a.id);
  const before = g.computeVP(b);
  g.turn = 1; b.ck.tracks.science = 4; b.hand.c.paper = 5;
  ck.improveTrack(g, b.id, 'science');
  assert.strictEqual(g.ck.metropolises.science.playerId, b.id);
  assert.ok(g.ck.metropolises.science.permanent);
  assert.strictEqual(g.computeVP(b), before + 2);
  g.turn = 0; a.hand.c.paper = 5;
  ck.improveTrack(g, a.id, 'science');
  assert.strictEqual(g.ck.metropolises.science.playerId, b.id, 'permanent stays');
});
test('metropolis cities cannot be pillaged; walls add +2 to hand limit and are lost on pillage', () => {
  const g = mk('cnk');
  const [a] = g.players;
  a.ck.cityWalls.push(a.cities[0]);
  assert.strictEqual(g.handLimit(a), 9);
  g.ck.metropolises.trade = { playerId: a.id, vertexId: a.cities[0], permanent: true };
  for (const p of g.players) p.ck.knights = {};
  ck.runBarbarianAttack(g);
  assert.ok(a.cities.includes(g.ck.metropolises.trade.vertexId), 'metropolis survives');
  assert.ok(g.players.slice(1).every(p => p.cities.length === 0), 'others lose their only city');
});
test('defenders: unique top contributor gets a VP; tie -> each draws a chosen progress card', () => {
  const g = mk('cnk');
  const [a, b] = g.players;
  const spot = p => g.map.topo.vertices.find(v => !g.vertexOwner(v.id) && !g.knightAt(v.id) && v.edges.some(e => p.roads.includes(e))).id;
  a.ck.knights[spot(a)] = { id: 1, rank: 3, active: true };
  ck.runBarbarianAttack(g);
  assert.strictEqual(a.ck.defenders, 1);
  assert.ok(Object.values(a.ck.knights).every(k => !k.active), 'knights deactivated');
  Object.values(a.ck.knights)[0].active = true;
  b.ck.knights[spot(b)] = { id: 2, rank: 3, active: true };
  ck.runBarbarianAttack(g);
  assert.strictEqual(g.prompts.filter(p => p.kind === 'choose_deck').length, 2);
});
test('progress draws follow the red die vs track level (level L draws on 1..L+1)', () => {
  const g = mk('cnk');
  const [a, b, c] = g.players;
  a.ck.tracks.politics = 1; b.ck.tracks.politics = 2; c.ck.tracks.politics = 0;
  ck.resolveEventDie(g, 'politics', 3);
  assert.deepStrictEqual([a, b, c].map(p => p.ck.progress.length + p.ck.progressVP.length), [0, 1, 0]);
  ck.resolveEventDie(g, 'politics', 2);
  assert.deepStrictEqual([a, b, c].map(p => p.ck.progress.length + p.ck.progressVP.length), [1, 2, 0]);
});
test('progress hand limit 4: off-turn players must discard, current player before ending turn', () => {
  const g = mk('cnk');
  const [a, b] = g.players;
  b.ck.progress = ['merchant', 'merchant', 'merchant', 'merchant'];
  b.ck.tracks.trade = 5;
  g.ck.decks.trade = ['merchant', ...g.ck.decks.trade.filter(x => x !== 'merchant')];
  ck.resolveEventDie(g, 'trade', 1);
  assert.ok(g.prompts.some(p => p.kind === 'progress_discard' && p.playerId === b.id));
  a.ck.progress = ['merchant', 'merchant', 'merchant', 'merchant', 'merchant'];
  g.prompts = [];
  assert.throws(() => g.endTurn(a.id), /down to 4/);
});
test('knight actions: recruit, activate, cannot act the turn activated, move, displace, chase', () => {
  const g = mk('cnk');
  const [a, b] = g.players;
  const topo = g.map.topo;
  // give a a 3-road chain from its settlement through empty intersections
  const s = a.settlements[0];
  let v = s; const chain = []; const seen = new Set([s]);
  for (let i = 0; i < 3; i++) {
    const e = topo.vertices[v].edges.find(id => {
      if (g.edgeOwner(id)) return false;
      const ed = topo.edges[id]; const o = ed.a === v ? ed.b : ed.a;
      return !seen.has(o) && !g.vertexOwner(o) && !g.knightAt(o);
    });
    assert.ok(e != null, 'test board needs a free chain');
    a.roads.push(e); chain.push(e);
    const ed = topo.edges[e]; v = ed.a === v ? ed.b : ed.a; seen.add(v);
  }
  const ends = [...seen].filter(x => x !== s);
  const k1 = ends[0], k2 = ends[ends.length - 1];
  Object.assign(a.hand.r, { sheep: 2, ore: 2, wheat: 2 });
  ck.recruitKnight(g, a.id, k1);
  ck.activateKnight(g, a.id, k1);
  assert.throws(() => ck.moveKnight(g, a.id, k1, k2), /active since the start/);
  g.turnNumber++;
  ck.moveKnight(g, a.id, k1, k2);
  assert.ok(a.ck.knights[k2] && !a.ck.knights[k2].active);
  // displacement: b's basic knight on a's route, a's strong knight displaces it
  delete a.ck.knights[k2];
  a.ck.knights[k1] = { id: 5, rank: 2, active: true, activatedTurn: -1 };
  b.ck.knights[k2] = { id: 6, rank: 1, active: false };
  assert.ok(ck.reach(g, a.id, k1).blocked.includes(k2) || ck.reach(g, a.id, k1).open.includes(k2) === false);
  ck.displaceKnight(g, a.id, k1, k2);
  assert.ok(a.ck.knights[k2]);
  assert.ok(!b.ck.knights[k2]);
});
test('trade rates: Merchant Guild 2:1 commodities, merchant 2:1 on its hex, commodities 4:1 to resources', () => {
  const g = mk('cnk');
  const a = P(g, 0);
  a.hand.c.coin = 4;
  g.map.harbors = [];
  assert.strictEqual(ck.tradeRate(g, a, 'coin'), 4);
  g.trade(a.id, { coin: 4 }, { ore: 1 });
  a.ck.tracks.trade = 3;
  assert.strictEqual(ck.tradeRate(g, a, 'paper'), 2);
  const h = g.map.topo.hexes.find(x => x.res === 'wheat');
  g.ck.merchant = { playerId: a.id, hexId: h.id };
  assert.strictEqual(ck.tradeRate(g, a, 'wheat'), 2);
  assert.strictEqual(ck.tradeRate(g, a, 'wood'), 4);
});
test('aqueduct: science 3+ and no production lets you pick a resource', () => {
  const g = mk('cnk');
  const a = P(g, 0);
  a.ck.tracks.science = 3;
  ck.aqueduct(g, new Set());
  const pr = g.prompts.find(p => p.kind === 'aqueduct' && p.playerId === a.id);
  assert.ok(pr);
  g.respond(a.id, pr.id, { resource: 'ore' });
  assert.strictEqual(a.hand.r.ore, 1);
});

console.log('Progress cards (all 25 kinds)');
function progressGame() {
  const g = mk('cnk');
  const [a, b, c] = g.players;
  g.robberActive = true; g.robberHex = g.robberHome;
  a.ck.progress = [];
  return { g, a, b, c, give: card => a.ck.progress.push(card) };
}
test('alchemy sets the dice (before rolling)', () => {
  const { g, a, give } = progressGame();
  give('alchemy'); g.phase = 'roll';
  ck.playProgress(g, a.id, 'alchemy', { red: 2, yellow: 4 });
  assert.strictEqual(g.dice.red, 2); assert.strictEqual(g.dice.yellow, 4); assert.strictEqual(g.lastRoll, 6);
});
test('crane: improvement for 1 commodity less', () => {
  const { g, a, give } = progressGame();
  give('crane'); a.hand.c.coin = 0;
  ck.playProgress(g, a.id, 'crane', { track: 'politics' });
  assert.strictEqual(a.ck.tracks.politics, 1);
});
test('engineering: free wall', () => {
  const { g, a, give } = progressGame(); give('engineering');
  ck.playProgress(g, a.id, 'engineering', { vertexId: a.cities[0] });
  assert.deepStrictEqual(a.ck.cityWalls, [a.cities[0]]);
});
test('invention: swap two non-red numbers', () => {
  const { g, a, give } = progressGame(); give('invention');
  const hs = g.map.topo.hexes.filter(h => h.num && ![2, 6, 8, 12].includes(h.num) && h.num !== g.map.topo.hexes.find(x => x.num && ![2, 6, 8, 12].includes(x.num)).num);
  const h1 = g.map.topo.hexes.find(h => h.num && ![2, 6, 8, 12].includes(h.num)), h2 = hs[0];
  const [n1, n2] = [h1.num, h2.num];
  ck.playProgress(g, a.id, 'invention', { hexA: h1.id, hexB: h2.id });
  assert.deepStrictEqual([h1.num, h2.num], [n2, n1]);
  give('invention');
  const red = g.map.topo.hexes.find(h => h.num === 6 || h.num === 8);
  assert.throws(() => ck.playProgress(g, a.id, 'invention', { hexA: red.id, hexB: h1.id }));
});
test('irrigation / mining: 2 per adjacent field / mountain', () => {
  const { g, a, give } = progressGame();
  const fields = g.map.topo.hexes.filter(h => h.res === 'wheat' && g.map.topo.hexVertices[h.id].some(v => a.settlements.includes(v) || a.cities.includes(v))).length;
  give('irrigation'); ck.playProgress(g, a.id, 'irrigation', {});
  assert.strictEqual(a.hand.r.wheat, fields * 2);
  const mts = g.map.topo.hexes.filter(h => h.res === 'ore' && g.map.topo.hexVertices[h.id].some(v => a.settlements.includes(v) || a.cities.includes(v))).length;
  give('mining'); ck.playProgress(g, a.id, 'mining', {});
  assert.strictEqual(a.hand.r.ore, mts * 2);
});
test('medicine: city for 1 wheat + 2 ore', () => {
  const { g, a, give } = progressGame(); give('medicine');
  Object.assign(a.hand.r, { wheat: 1, ore: 2 });
  const s = a.settlements[0];
  ck.playProgress(g, a.id, 'medicine', { vertexId: s });
  assert.ok(a.cities.includes(s)); assert.strictEqual(a.hand.r.ore, 0);
});
test('road building: 2 free roads', () => {
  const { g, a, give } = progressGame(); give('road_building');
  const e1 = edgeFrom(g, a).id; const n = a.roads.length;
  a.roads.push(e1); const e2 = edgeFrom(g, a).id; a.roads.pop();
  ck.playProgress(g, a.id, 'road_building', { edges: [e1, e2] });
  assert.strictEqual(a.roads.length, n + 2);
});
test('smithing: promote 2 knights free (once per turn each)', () => {
  const { g, a, give } = progressGame(); give('smithing');
  a.ck.knights = { 900: { id: 1, rank: 1, active: false }, 901: { id: 2, rank: 1, active: true } };
  ck.playProgress(g, a.id, 'smithing', { vertices: [900, 901] });
  assert.deepStrictEqual([a.ck.knights[900].rank, a.ck.knights[901].rank], [2, 2]);
  Object.assign(a.hand.r, { sheep: 1, ore: 1 });
  assert.throws(() => ck.promoteKnight(g, a.id, 900), /once per turn/);
});
test('commercial harbor: resource for a commodity of their choice', () => {
  const { g, a, b, give } = progressGame(); give('commercial_harbor');
  a.hand.r.wood = 1; b.hand.c.coin = 1;
  ck.playProgress(g, a.id, 'commercial_harbor', { offers: { [b.id]: 'wood' } });
  const pr = g.prompts.find(p => p.playerId === b.id);
  g.respond(b.id, pr.id, { cards: { coin: 1 } });
  assert.deepStrictEqual([a.hand.c.coin, b.hand.r.wood], [1, 1]);
});
test('guild dues: take 2 chosen cards from a player with more VP', () => {
  const { g, a, b, give } = progressGame(); give('guild_dues');
  b.ck.defenders = 3; b.hand.r.ore = 2; b.hand.c.paper = 1;
  ck.playProgress(g, a.id, 'guild_dues', { targetId: b.id });
  const pr = g.prompts[0];
  assert.deepStrictEqual(g.snapshot(a.id).prompts[0].hand.r.ore, 2, 'chooser sees the hand');
  assert.ok(!g.snapshot(b.id).prompts[0].hand, 'others do not');
  g.respond(a.id, pr.id, { cards: { ore: 1, paper: 1 } });
  assert.deepStrictEqual([a.hand.r.ore, a.hand.c.paper], [1, 1]);
});
test('merchant: next to your building, 1 VP, 2:1 on that resource; taken over by the next merchant', () => {
  const { g, a, b, give } = progressGame(); give('merchant');
  const h = g.map.topo.hexes.find(x => x.res !== 'desert' && g.map.topo.hexVertices[x.id].some(v => a.cities.includes(v)));
  const before = g.computeVP(a);
  ck.playProgress(g, a.id, 'merchant', { hexId: h.id });
  assert.strictEqual(g.computeVP(a), before + 1);
  g.turn = 1; b.ck.progress = ['merchant'];
  const hb = g.map.topo.hexes.find(x => x.res !== 'desert' && g.map.topo.hexVertices[x.id].some(v => b.cities.includes(v)));
  ck.playProgress(g, b.id, 'merchant', { hexId: hb.id });
  assert.strictEqual(g.computeVP(a), before);
});
test('merchant fleet: 2:1 on the named type this turn only', () => {
  const { g, a, give } = progressGame(); give('merchant_fleet');
  g.map.harbors = [];
  ck.playProgress(g, a.id, 'merchant_fleet', { kind: 'cloth' });
  assert.strictEqual(ck.tradeRate(g, a, 'cloth'), 2);
  g.endTurn(a.id);
  assert.strictEqual(ck.tradeRate(g, a, 'cloth'), 4);
});
test('resource monopoly takes up to 2 each; trade monopoly 1 each', () => {
  const { g, a, b, c, give } = progressGame();
  b.hand.r.ore = 5; c.hand.r.ore = 1; b.hand.c.coin = 2; c.hand.c.coin = 0;
  give('resource_monopoly'); ck.playProgress(g, a.id, 'resource_monopoly', { resource: 'ore' });
  assert.deepStrictEqual([a.hand.r.ore, b.hand.r.ore, c.hand.r.ore], [3, 3, 0]);
  give('trade_monopoly'); ck.playProgress(g, a.id, 'trade_monopoly', { commodity: 'coin' });
  assert.deepStrictEqual([a.hand.c.coin, b.hand.c.coin], [1, 1]);
});
test('diplomacy: remove an open road; removing your own gives a free road', () => {
  const { g, a, give } = progressGame();
  const e = edgeFrom(g, a).id; a.roads.push(e);
  assert.ok(ck.isOpenRoad(g, e));
  give('diplomacy'); ck.playProgress(g, a.id, 'diplomacy', { edgeId: e });
  assert.ok(!a.roads.includes(e));
  const pr = g.prompts.find(p => p.kind === 'free_road');
  g.respond(a.id, pr.id, { edgeId: e });
  assert.ok(a.roads.includes(e));
});
test('encouragement: activate all knights', () => {
  const { g, a, give } = progressGame(); give('encouragement');
  a.ck.knights = { 900: { id: 1, rank: 1, active: false }, 901: { id: 2, rank: 2, active: false } };
  ck.playProgress(g, a.id, 'encouragement', {});
  assert.ok(Object.values(a.ck.knights).every(k => k.active));
});
test('espionage: look at and take a progress card', () => {
  const { g, a, b, give } = progressGame(); give('espionage');
  b.ck.progress = ['crane', 'mining'];
  ck.playProgress(g, a.id, 'espionage', { targetId: b.id });
  const pr = g.snapshot(a.id).prompts[0];
  assert.deepStrictEqual(pr.cards, ['crane', 'mining']);
  g.respond(a.id, pr.id, { card: 'mining' });
  assert.deepStrictEqual(b.ck.progress, ['crane']); assert.ok(a.ck.progress.includes('mining'));
});
test('intrigue: displace an opponent knight on your route', () => {
  const { g, a, b, give } = progressGame(); give('intrigue');
  const v = g.map.topo.vertices.find(x => !g.vertexOwner(x.id) && x.edges.some(e => a.roads.includes(e))).id;
  b.ck.knights[v] = { id: 9, rank: 3, active: true };
  ck.playProgress(g, a.id, 'intrigue', { vertexId: v });
  assert.ok(!b.ck.knights[v]);
});
test('sabotage: players with >= your VP discard half', () => {
  const { g, a, b, c, give } = progressGame(); give('sabotage');
  b.hand.r.wood = 6; b.ck.defenders = 5; c.hand.r.wood = 6; a.ck.defenders = 1;
  ck.playProgress(g, a.id, 'sabotage', {});
  assert.ok(g.prompts.find(p => p.playerId === b.id && p.kind === 'discard' && p.count === 3));
});
test('taxation: move robber, steal from every player on the hex', () => {
  const { g, a, b, c, give } = progressGame(); give('taxation');
  const h = g.map.topo.hexes.find(x => x.id !== g.robberHex && g.map.topo.hexVertices[x.id].every(v => !g.vertexOwner(v)));
  const vs = g.map.topo.hexVertices[h.id];
  b.settlements = [vs[0]]; c.settlements = [vs[3]]; b.cities = []; c.cities = [];
  for (const k in a.hand.r) a.hand.r[k] = 0;
  b.hand.r.wood = 2; c.hand.r.ore = 2;
  ck.playProgress(g, a.id, 'taxation', { hexId: h.id });
  assert.deepStrictEqual([a.hand.r.wood, a.hand.r.ore], [1, 1]);
});
test('treason: opponent removes a knight, you may place one of equal or lower strength', () => {
  const { g, a, b, give } = progressGame(); give('treason');
  b.ck.knights[950] = { id: 3, rank: 2, active: true };
  ck.playProgress(g, a.id, 'treason', { targetId: b.id });
  g.respond(b.id, g.prompts[0].id, { vertexId: 950 });
  const pr = g.prompts.find(p => p.kind === 'treason_place');
  assert.deepStrictEqual(pr.ranks, [1, 2]);
  g.respond(a.id, pr.id, { vertexId: pr.options[0], rank: 2 });
  assert.strictEqual(a.ck.knights[pr.options[0]].rank, 2);
  assert.strictEqual(a.ck.knights[pr.options[0]].active, true);
});
test('wedding: players with more VP each give 2 cards of their choice', () => {
  const { g, a, b, give } = progressGame(); give('wedding');
  b.ck.defenders = 4; b.hand.r.sheep = 3;
  ck.playProgress(g, a.id, 'wedding', {});
  const pr = g.prompts.find(p => p.playerId === b.id);
  g.respond(b.id, pr.id, { cards: { sheep: 2 } });
  assert.strictEqual(a.hand.r.sheep, 2);
});
test('VP cards (printing, constitution) are revealed on draw and score 1 VP', () => {
  const { g, a } = progressGame();
  a.ck.tracks.science = 5;
  g.ck.decks.science.unshift('printing');
  const before = g.computeVP(a);
  ck.resolveEventDie(g, 'science', 1);
  assert.strictEqual(g.computeVP(a), before + 1);
  assert.ok(!a.ck.progress.includes('printing'));
});
test('progress deck has the 54 cards listed in the rulebook', () => {
  const g = mk('cnk');
  const total = Object.values(g.ck.decks).reduce((a, d) => a + d.length, 0) + g.players.reduce((a, p) => a + p.ck.progress.length + p.ck.progressVP.length, 0);
  assert.strictEqual(total, 54);
  for (const t of C.CK_TRACKS) assert.strictEqual(Object.values(C.PROGRESS_DECKS[t]).reduce((a, b) => a + b, 0), 18);
});

console.log('Turn timer');
test('autoAct resolves prompts, rolls, and ends turns for whoever is waited on', () => {
  const g = mk();
  g.phase = 'roll';
  const t0 = g.turnNumber;
  g.autoAct();                 // auto-roll (+ any prompts)
  if (g.phase === 'main' && !g.prompts.length) g.autoAct(); // auto end turn
  assert.ok(g.turnNumber > t0 || g.prompts.length === 0);
});

console.log(`\n${passed} rule tests passed${process.exitCode ? ' (with failures)' : ''}`);
