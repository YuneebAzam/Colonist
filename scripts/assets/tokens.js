// Category 3 — number tokens and neutral pawns, 128x128.
const { CHIT } = require('./palette');
const { doc, text, pts } = require('./svg');

function disc(ring) {
  return `<circle cx="64" cy="64" r="52" fill="${CHIT.rim}" stroke="#141414" stroke-width="3"/>` +
    `<circle cx="64" cy="64" r="47" fill="${CHIT.surface}" stroke="${ring}" stroke-width="2"/>`;
}

function number(n) {
  const hot = n === 6 || n === 8;
  const ink = hot ? CHIT.hot : CHIT.ink;
  const pips = 6 - Math.abs(7 - n);
  let body = disc(hot ? CHIT.hot : CHIT.ring) +
    text(64, 68, String(n), { 'font-size': 44, 'font-weight': 800, fill: ink });
  for (let i = 0; i < pips; i++) {
    const x = 64 + 9 * (i - (pips - 1) / 2);
    body += `<circle cx="${+x.toFixed(2)}" cy="88" r="3" fill="${ink}"/>`;
  }
  return doc(128, 128, '', body);
}

function robber() {
  const body = disc('#E53935') +
    `<ellipse cx="64" cy="98" rx="30" ry="8" fill="#263238"/>` +
    `<path d="M 40 98 C 40 70, 46 56, 64 56 C 82 56, 88 70, 88 98 Z" fill="#263238"/>` +
    `<circle cx="64" cy="44" r="18" fill="#263238"/>` +
    `<path d="M 50 44 Q 64 36 78 44 L 78 48 Q 64 42 50 48 Z" fill="#E53935"/>`;
  return doc(128, 128, '', body);
}

function merchant() {
  const body = disc('#FFD166') +
    `<ellipse cx="64" cy="98" rx="28" ry="7" fill="#4A148C"/>` +
    `<polygon points="${pts([[64, 40], [88, 98], [40, 98]])}" fill="#7B1FA2" stroke="#4A148C" stroke-width="3"/>` +
    `<circle cx="64" cy="36" r="13" fill="#7B1FA2" stroke="#4A148C" stroke-width="3"/>` +
    `<rect x="46" y="70" width="36" height="6" rx="3" fill="#FFD166"/>` +
    `<polygon points="${pts([[54, 26], [58, 18], [64, 24], [70, 18], [74, 26]])}" fill="#FFD166"/>`;
  return doc(128, 128, '', body);
}

function entries() {
  const nums = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  return [
    ...nums.map(n => ({ id: 'token_' + n, path: `tokens/token_${n}.svg`, w: 128, h: 128, atlas: 'pieces_hud', build: () => number(n) })),
    { id: 'token_robber', path: 'tokens/token_robber.svg', w: 128, h: 128, atlas: 'pieces_hud', build: robber },
    { id: 'token_merchant', path: 'tokens/token_merchant.svg', w: 128, h: 128, atlas: 'pieces_hud', build: merchant },
  ];
}

module.exports = { entries };
