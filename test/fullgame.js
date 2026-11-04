// Plays many complete games (both modes, all maps, several VP targets) through the engine
// and checks that each ends with a winner at or above the configured target.
const assert = require('assert');
const { playGame } = require('./sim');
const { MAPS } = require('../src/board');

let n = 0, failures = 0;
const runs = [];
for (const mode of ['base', 'cnk']) {
  for (const map of MAPS) {
    for (let seed = 1; seed <= 3; seed++) {
      runs.push({ mode, mapVariant: map.id, players: Math.min(map.maxPlayers, 3 + (seed % 2)), seed });
    }
  }
  for (const vpTarget of [10, 11, 12, 13, 14, 15]) {
    runs.push({ mode, vpTarget, mapVariant: 'extended', players: 3, seed: 100 + vpTarget });
  }
  if (mode === 'cnk') for (const vpTarget of [16, 17, 18, 19, 20]) {
    runs.push({ mode, vpTarget, mapVariant: 'extended', players: 3, seed: vpTarget });
  }
  runs.push({ mode, mapVariant: 'extended', players: 6, seed: 5 });
  runs.push({ mode, mapVariant: 'random_large', players: 5, seed: 6, discardLimit: 9 });
}
for (const r of runs) {
  n++;
  try {
    const { g, stats } = playGame({ ...r, maxTurns: 2500 });
    const expected = r.vpTarget ?? (r.mode === 'cnk' ? 13 : 10);
    assert.strictEqual(g.vpTarget, expected, 'target');
    if (g.phase !== 'end') throw new Error(`no winner after ${stats.turns} turns`);
    const w = g.getPlayer(g.winner);
    assert.ok(g.computeVP(w) >= expected);
    console.log(`ok  ${r.mode.padEnd(4)} ${r.mapVariant.padEnd(13)} p=${r.players} target=${expected} turns=${stats.turns} winnerVP=${g.computeVP(w)}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${JSON.stringify(r)}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
  }
}
console.log(`\n${n - failures}/${n} full games passed`);
if (failures) process.exit(1);
