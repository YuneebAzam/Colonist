// Category 9a — dice faces, 128x128.
const { TRACK } = require('./palette');
const { doc, text } = require('./svg');
const { place } = require('./glyphs');

const L = 38, M = 64, R = 90;
const GRID = {
  1: [[M, M]], 2: [[L, L], [R, R]], 3: [[L, L], [M, M], [R, R]], 4: [[L, L], [R, L], [L, R], [R, R]],
  5: [[L, L], [R, L], [M, M], [L, R], [R, R]], 6: [[L, L], [L, M], [L, R], [R, L], [R, M], [R, R]],
};
const body = (fill) => `<rect x="12" y="12" width="104" height="104" rx="20" fill="${fill}" stroke="#141414" stroke-width="4"/>`;

function face(fill, pip, n) {
  return doc(128, 128, '', body(fill) + GRID[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${pip}"/>`).join(''));
}

const EVENT = {
  barbarian: { color: '#E53935', glyph: 'longship', label: null },
  trade:     { color: TRACK.trade, glyph: 'gate', label: 'TRADE' },
  politics:  { color: TRACK.politics, glyph: 'gate', label: 'POLITICS' },
  science:   { color: TRACK.science, glyph: 'gate', label: 'SCIENCE' },
};
function event(f) {
  const e = EVENT[f];
  const art = e.label ? place(e.glyph, 64, 54, 56, e.color) + text(64, 102, e.label, { 'font-size': e.label.length > 6 ? 13 : 15, 'font-weight': 800, fill: e.color })
    : place(e.glyph, 64, 64, 80, e.color);
  return doc(128, 128, '', body('#1E1E24') + art);
}

function entries() {
  const out = [];
  for (const [col, fill, pip] of [['white', '#FAF6EC', '#141414'], ['red', '#D32F2F', '#FFD166']]) {
    for (let n = 1; n <= 6; n++) out.push({ id: `die_${col}_${n}`, path: `dice/die_${col}_${n}.svg`, w: 128, h: 128, atlas: 'pieces_hud', build: () => face(fill, pip, n) });
  }
  for (const f of Object.keys(EVENT)) out.push({ id: 'die_event_' + f, path: `dice/die_event_${f}.svg`, w: 128, h: 128, atlas: 'pieces_hud', build: () => event(f) });
  return out;
}

module.exports = { entries };
