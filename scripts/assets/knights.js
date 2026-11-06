// Category 8 — vertex knight tokens, 128x128: 3 tiers x active/inactive x 6 player colours.
const { PLAYERS } = require('./palette');
const { doc, text, pts } = require('./svg');

const K = ' stroke="#141414" stroke-width="3" stroke-linejoin="round"';
const HELM = {
  // Simple kettle helm with a nasal bar.
  basic: (m) => `<path d="M 40 70 L 40 54 Q 40 30 64 30 Q 88 30 88 54 L 88 70 Z" fill="${m}"${K}/>` +
    `<rect x="34" y="66" width="60" height="8" rx="3" fill="${m}"${K}/><rect x="60" y="48" width="8" height="26" fill="#141414"/>`,
  // Visored great helm with side wings.
  strong: (m) => `<path d="M 28 46 L 40 54 L 40 62 L 24 58 Z" fill="${m}"${K}/><path d="M 100 46 L 88 54 L 88 62 L 104 58 Z" fill="${m}"${K}/>` +
    `<path d="M 42 78 L 42 44 Q 42 26 64 26 Q 86 26 86 44 L 86 78 Z" fill="${m}"${K}/>` +
    `<rect x="46" y="48" width="36" height="6" fill="#141414"/><rect x="61" y="54" width="6" height="18" fill="#141414"/>`,
  // Crowned plumed helm with twin swords behind.
  mighty: (m) => `<line x1="30" y1="86" x2="92" y2="26" stroke="#CFD8DC" stroke-width="6"/><line x1="98" y1="86" x2="36" y2="26" stroke="#CFD8DC" stroke-width="6"/>` +
    `<path d="M 64 16 Q 84 6 88 24 Q 76 18 66 28 Z" fill="#E53935"${K}/>` +
    `<path d="M 42 80 L 42 46 Q 42 28 64 28 Q 86 28 86 46 L 86 80 Z" fill="${m}"${K}/>` +
    `<polygon points="${pts([[44, 36], [50, 22], [57, 32], [64, 18], [71, 32], [78, 22], [84, 36]])}" fill="#FFD166"${K}/>` +
    `<rect x="48" y="50" width="32" height="6" fill="#141414"/><rect x="61" y="56" width="6" height="18" fill="#141414"/>`,
};
const STRENGTH = { basic: 1, strong: 2, mighty: 3 };

function build(tier, active, p) {
  const ring = active
    ? `<circle cx="64" cy="64" r="58" fill="none" stroke="#00E5FF" stroke-width="3" opacity="0.45"/><circle cx="64" cy="64" r="54" fill="#141414" stroke="#00E5FF" stroke-width="6"/>`
    : `<circle cx="64" cy="64" r="54" fill="#141414" stroke="#546E7A" stroke-width="4"/>`;
  const metal = active ? '#E0F7FA' : '#90A4AE';
  const helm = HELM[tier](metal);
  const body = ring +
    `<circle cx="64" cy="64" r="44" fill="${p.fill}" stroke="#141414" stroke-width="2"/>` +
    (active ? helm : `<g opacity="0.82">${helm}</g>`) +
    `<rect x="46" y="88" width="36" height="22" rx="11" fill="#141414" stroke="${active ? '#00E5FF' : '#546E7A'}" stroke-width="2"/>` +
    text(64, 105, String(STRENGTH[tier]), { 'font-size': 18, 'font-weight': 800, fill: active ? '#00E5FF' : '#B0BEC5' });
  return doc(128, 128, '', body);
}

function entries() {
  const out = [];
  for (const tier of Object.keys(HELM)) for (const state of ['inactive', 'active']) for (const p of PLAYERS) {
    const id = `knight_${tier}_${state}_${p.key}`;
    out.push({ id, path: `knights/${id}.svg`, w: 128, h: 128, atlas: 'pieces_hud', build: () => build(tier, state === 'active', p) });
  }
  return out;
}

module.exports = { entries };
