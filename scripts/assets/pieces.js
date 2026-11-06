// Category 7 — player pieces and metropolis citadels, 128x128. Six player colours (plan D2).
const { PLAYERS, TRACK } = require('./palette');
const { doc, shadow, pts } = require('./svg');

const O = ' stroke="#141414" stroke-width="3.5" stroke-linejoin="round"';
const METRO = {
  trade:    { fill: TRACK.trade,    shade: '#B5830B', spec: '#FFF3B0' },
  politics: { fill: TRACK.politics, shade: '#007799', spec: '#B3F7FF' },
  science:  { fill: TRACK.science,  shade: '#1B8A4B', spec: '#B8F7D2' },
};

const DRAW = {
  road: (c) => `<rect x="16" y="46" width="96" height="30" rx="6" fill="${c.fill}"${O}/>` +
    `<rect x="20" y="50" width="88" height="10" rx="3" fill="${c.spec}"/>`,
  settlement: (c) => `<rect x="37" y="54" width="54" height="45" fill="${c.fill}"${O}/>` +
    `<polygon points="64,23 99,56 29,56" fill="${c.shade}"${O}/>` +
    `<line x1="42" y1="60" x2="86" y2="60" stroke="${c.spec}" stroke-width="3"/>` +
    `<rect x="56" y="71" width="16" height="28" fill="#141414"/>`,
  city: (c) => `<rect x="21" y="59" width="78" height="41" fill="${c.fill}"${O}/>` +
    `<rect x="21" y="34" width="40" height="66" fill="${c.fill}"${O}/>` +
    `<polygon points="41,14 65,36 17,36" fill="${c.shade}"${O}/>` +
    `<polygon points="80,41 104,60 59,60" fill="${c.shade}"${O}/>` +
    `<line x1="26" y1="40" x2="56" y2="40" stroke="${c.spec}" stroke-width="3"/>` +
    `<rect x="35" y="48" width="12" height="14" fill="#141414"/><rect x="70" y="74" width="14" height="26" fill="#141414"/>`,
  city_wall: (c) => `<rect x="10" y="10" width="108" height="108" rx="14" fill="none" stroke="${c.fill}" stroke-width="12"/>` +
    `<rect x="4" y="4" width="120" height="120" rx="18" fill="none"${O}/><rect x="16" y="16" width="96" height="96" rx="10" fill="none"${O}/>` +
    [[4, 4], [100, 4], [4, 100], [100, 100]].map(([x, y]) => `<rect x="${x}" y="${y}" width="24" height="24" rx="3" fill="${c.shade}"${O}/>`).join('') +
    `<line x1="40" y1="10" x2="88" y2="10" stroke="${c.spec}" stroke-width="3"/>`,
  metropolis: (c) => `<polygon points="64,11 105,39 105,106 23,106 23,39" fill="${c.fill}"${O}/>` +
    `<circle cx="64" cy="52" r="26" fill="${c.shade}"${O}/>` +
    `<path d="M 46 46 A 20 20 0 0 1 64 32" fill="none" stroke="${c.spec}" stroke-width="4" stroke-linecap="round"/>` +
    `<rect x="48" y="66" width="32" height="40" rx="16" fill="#141414"/>` +
    `<rect x="28" y="60" width="12" height="16" rx="2" fill="${c.shade}"/><rect x="88" y="60" width="12" height="16" rx="2" fill="${c.shade}"/>` +
    `<polygon points="${pts([[64, 0], [74, 8], [64, 16]])}" fill="${c.spec}"${O}/>`,
};

function build(kind, c) {
  return doc(128, 128, shadow('sh'), `<g filter="url(#sh)">${DRAW[kind](c)}</g>`);
}

function entries() {
  const out = [];
  for (const kind of ['road', 'settlement', 'city', 'city_wall']) {
    for (const p of PLAYERS) {
      const id = `piece_${kind}_${p.key}`;
      out.push({ id, path: `pieces/${id}.svg`, w: 128, h: 128, atlas: 'pieces_hud', build: () => build(kind, p) });
    }
  }
  for (const [t, c] of Object.entries(METRO)) {
    const id = 'piece_metropolis_' + t;
    out.push({ id, path: `pieces/${id}.svg`, w: 128, h: 128, atlas: 'pieces_hud', build: () => build('metropolis', c) });
  }
  return out;
}

module.exports = { entries };
