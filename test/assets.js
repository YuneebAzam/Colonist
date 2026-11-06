// Asset generator tests: manifest shape, per-folder counts, SVG well-formedness,
// determinism, drift between committed files and the generator, and per-category geometry.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { entries } = require('../scripts/assets/manifest');
const C = require('../src/constants');

let ok = 0;
const step = (name) => { ok++; console.log('  ok  ' + name); };

const EXPECTED = { hexes: 8, ports: 7, tokens: 12, cards: 43, pieces: 27, knights: 36, dice: 16, icons: 16, total: 165 };
const all = entries();
const byId = Object.fromEntries(all.map(e => [e.id, e]));
const svg = (id) => { assert(byId[id], `missing asset ${id}`); return byId[id].build(); };
const has = (id) => !!byId[id];

// ---- counts
const counts = {};
for (const e of all) { const f = e.path.split('/')[0]; counts[f] = (counts[f] || 0) + 1; }
const EXACT = has('die_white_1'); // Task 4 completes the set
for (const [f, n] of Object.entries(EXPECTED)) {
  if (f === 'total') continue;
  if (EXACT) assert.strictEqual(counts[f] || 0, n, `${f} count`);
  else assert((counts[f] || 0) <= n, `${f} has ${counts[f]} > ${n}`);
}
if (EXACT) assert.strictEqual(all.length, EXPECTED.total, 'total count');
step(`counts (${all.length} assets${EXACT ? ', exact' : ''})`);

// ---- ids unique, paths unique
assert.strictEqual(new Set(all.map(e => e.id)).size, all.length, 'ids unique');
assert.strictEqual(new Set(all.map(e => e.path)).size, all.length, 'paths unique');
for (const e of all) assert(['hexes', 'ports', 'cards', 'pieces_hud'].includes(e.atlas), `${e.id} atlas`);
step('ids and paths unique, atlases valid');

// ---- well-formed standalone SVG
function balanced(s) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(s))) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== tag) return false; } else stack.push(tag);
  }
  return stack.length === 0;
}
for (const e of all) {
  const s = e.build();
  assert(s.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${e.w} ${e.h}"`), `${e.id} header`);
  assert(balanced(s), `${e.id} unbalanced tags`);
  assert(!/NaN|undefined/.test(s), `${e.id} has NaN/undefined`);
  assert.strictEqual((s.match(/http/g) || []).length, 1, `${e.id} external reference`);
}
step('every SVG is standalone and tag-balanced');

// ---- deterministic output + no drift from committed files
function gen(dir) { execFileSync(process.execPath, [path.join(ROOT, 'scripts/generate-assets.js'), '--out', dir]); }
function readTree(dir) {
  const out = {};
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { if (f !== 'atlases') walk(p); } else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
    }
  })(dir);
  return out;
}
const t1 = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-a-'));
const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-b-'));
gen(t1); gen(t2);
const a = readTree(t1), b = readTree(t2);
assert.deepStrictEqual(a, b, 'generator is deterministic');
assert.strictEqual(Object.keys(a).length, all.length + 1, 'one file per entry + manifest.json');
const committed = path.join(ROOT, 'public/assets');
if (fs.existsSync(path.join(committed, 'manifest.json'))) {
  const c = readTree(committed);
  for (const k of Object.keys(a)) assert.strictEqual(c[k], a[k], `public/assets/${k} differs from the generator (run npm run assets)`);
  step('committed public/assets matches the generator');
}
fs.rmSync(t1, { recursive: true, force: true }); fs.rmSync(t2, { recursive: true, force: true });
step('generator is deterministic');

// ---- player colours: engine uses the palette fills in order
const { PLAYERS } = require('../scripts/assets/palette');
assert.deepStrictEqual(C.COLORS, ['#E53935', '#00B0FF', '#FB8C00', '#ECEFF1', '#2E9D47', '#7B4A2E']);
assert.deepStrictEqual(PLAYERS.map(p => p.fill), C.COLORS);
assert.deepStrictEqual(PLAYERS.map(p => p.key), ['red', 'blue', 'orange', 'white', 'green', 'brown']);
step('player colours match the palette');

// ---- per-category geometry checks live in test/assets/*.js
const catDir = path.join(__dirname, 'assets');
for (const file of (fs.existsSync(catDir) ? fs.readdirSync(catDir) : []).filter(f => f.endsWith('.js')).sort()) {
  require(path.join(__dirname, 'assets', file))({ assert, svg, has, byId, all, step });
}

console.log(`\nassets: ${ok} checks passed`);
