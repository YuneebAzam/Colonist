// Emblems drawn in a box centred on (0,0), roughly 100 units across (-50..50).
// place(name, cx, cy, size, fg, bg) positions one with a transform. Shared by cards, icons and dice.
const { pts } = require('./svg');

const K = '#141414';
const P = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}"${extra}/>`;
const S = (w = 4) => ` stroke="${K}" stroke-width="${w}" stroke-linejoin="round"`;

const G = {
  wood: (c) => `<rect x="-6" y="18" width="12" height="26" fill="#5D4037"${S(3)}/>` + P([[0, -46], [30, -6], [-30, -6]], c, S(3)) + P([[0, -28], [36, 22], [-36, 22]], c, S(3)),
  brick: (c) => [[-38, 8], [2, 8], [-18, -16], [-58 + 40, 32]].slice(0, 3).map(([x, y]) => `<rect x="${x}" y="${y}" width="36" height="20" rx="3" fill="${c}"${S(3)}/>`).join('') + `<rect x="-38" y="32" width="76" height="12" rx="3" fill="${c}" opacity="0.7"${S(3)}/>`,
  sheep: (c) => `<rect x="-24" y="16" width="7" height="22" fill="${K}"/><rect x="14" y="16" width="7" height="22" fill="${K}"/>` +
    [[-22, -2], [-6, -12], [12, -4], [-12, 10], [8, 10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="18" fill="#FAF6EC"/>`).join('') +
    `<ellipse cx="-4" cy="0" rx="34" ry="22" fill="none"${S(3)}/><ellipse cx="34" cy="-12" rx="12" ry="15" fill="${c}"${S(3)}/>`,
  wheat: (c) => `<line x1="0" y1="46" x2="0" y2="-40" stroke="${c}" stroke-width="5"/>` +
    [-30, -14, 2, 18].map(y => `<ellipse cx="-10" cy="${y}" rx="7" ry="13" fill="${c}" transform="rotate(-30 -10 ${y})"${S(2)}/><ellipse cx="10" cy="${y}" rx="7" ry="13" fill="${c}" transform="rotate(30 10 ${y})"${S(2)}/>`).join('') +
    `<ellipse cx="0" cy="-44" rx="6" ry="11" fill="${c}"${S(2)}/>`,
  ore: (c) => P([[-44, 30], [-22, -30], [4, -18], [22, -40], [46, 30]], '#4A545E', S(3)) +
    P([[-22, -30], [-30, -4], [-8, -12]], '#98A6B5') + `<polyline points="-26,14 -8,-2 6,10 24,-12" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
  paper: (c) => `<rect x="-30" y="-38" width="60" height="76" rx="4" fill="#FAF6EC"${S(3)}/>` +
    `<rect x="-36" y="-44" width="72" height="12" rx="6" fill="${c}"${S(3)}/><rect x="-36" y="32" width="72" height="12" rx="6" fill="${c}"${S(3)}/>` +
    [-18, -6, 6, 18].map(y => `<line x1="-20" y1="${y}" x2="20" y2="${y}" stroke="${c}" stroke-width="3"/>`).join('') +
    `<path d="M 26 -40 Q 48 -10 18 22 L 14 18 Q 34 -8 22 -38 Z" fill="#FAF6EC"${S(2)}/>`,
  cloth: (c) => `<path d="M -42 -26 Q 0 -44 42 -26 L 42 30 Q 0 12 -42 30 Z" fill="${c}"${S(3)}/>` +
    `<path d="M -42 -14 Q 0 -32 42 -14" fill="none" stroke="#FFF3B0" stroke-width="4"/><path d="M -42 18 Q 0 0 42 18" fill="none" stroke="#FFF3B0" stroke-width="4"/>`,
  coin: (c) => `<circle cx="0" cy="0" r="40" fill="${c}"${S(4)}/><circle cx="0" cy="0" r="30" fill="none" stroke="${K}" stroke-width="2"/>` +
    P([[-16, 14], [-16, -8], [-8, -8], [-8, -16], [0, -10], [8, -16], [8, -8], [16, -8], [16, 14]], K),
  // tracks
  scale: (c) => `<line x1="0" y1="-38" x2="0" y2="38" stroke="${c}" stroke-width="6"/><line x1="-36" y1="-24" x2="36" y2="-24" stroke="${c}" stroke-width="6"/>` +
    `<path d="M -48 6 L -36 -24 L -24 6 Z" fill="none" stroke="${c}" stroke-width="3"/><path d="M -50 6 Q -36 22 -22 6 Z" fill="${c}"/>` +
    `<path d="M 24 6 L 36 -24 L 48 6 Z" fill="none" stroke="${c}" stroke-width="3"/><path d="M 22 6 Q 36 22 50 6 Z" fill="${c}"/><rect x="-18" y="36" width="36" height="8" rx="3" fill="${c}"/>`,
  crown: (c) => P([[-40, 26], [-44, -22], [-20, 0], [0, -34], [20, 0], [44, -22], [40, 26]], c, S(3)) + `<rect x="-40" y="26" width="80" height="12" rx="3" fill="${c}"${S(3)}/>`,
  gear: (c) => {
    let t = '';
    for (let i = 0; i < 8; i++) t += `<rect x="-8" y="-46" width="16" height="18" rx="3" fill="${c}" transform="rotate(${i * 45})"/>`;
    return t + `<circle cx="0" cy="0" r="32" fill="${c}"/><circle cx="0" cy="0" r="13" fill="${K}"/>`;
  },
  // development
  helm: (c) => `<path d="M -32 30 L -32 -8 Q -32 -42 0 -42 Q 32 -42 32 -8 L 32 30 Z" fill="${c}"${S(4)}/>` +
    `<rect x="-26" y="-6" width="52" height="8" fill="${K}"/><rect x="-4" y="2" width="8" height="26" fill="${K}"/>`,
  star: (c) => { const a = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 20 : 46, t = Math.PI / 5 * i - Math.PI / 2; a.push([r * Math.cos(t), r * Math.sin(t)]); } return P(a, c, S(3)); },
  road: (c) => `<path d="M -30 46 Q -10 0 -20 -46 L 20 -46 Q 10 0 30 46 Z" fill="${c}"${S(3)}/>` + [-30, -6, 18].map(y => `<rect x="-3" y="${y}" width="6" height="14" fill="#FAF6EC"/>`).join(''),
  plenty: (c) => `<rect x="-40" y="-36" width="44" height="64" rx="6" fill="${c}"${S(3)} transform="rotate(-12)"/><rect x="-4" y="-30" width="44" height="64" rx="6" fill="${c}"${S(3)} transform="rotate(12)"/>` +
    `<path d="M 0 -8 v 20 M -10 2 h 20" stroke="${K}" stroke-width="5"/>`,
  monopoly: (c) => `<path d="M -34 -34 L -34 10 A 34 34 0 0 0 34 10 L 34 -34 L 14 -34 L 14 10 A 14 14 0 0 1 -14 10 L -14 -34 Z" fill="${c}"${S(3)}/>` +
    `<rect x="-34" y="-44" width="20" height="12" fill="#FAF6EC"${S(3)}/><rect x="14" y="-44" width="20" height="12" fill="#FAF6EC"${S(3)}/>`,
  // science
  dice: (c) => `<rect x="-44" y="-30" width="44" height="44" rx="8" fill="#FAF6EC"${S(3)} transform="rotate(-10 -22 -8)"/><rect x="4" y="-8" width="44" height="44" rx="8" fill="#D32F2F"${S(3)} transform="rotate(10 26 14)"/>` +
    `<circle cx="-22" cy="-8" r="5" fill="${K}"/><circle cx="18" cy="6" r="4" fill="#FFD166"/><circle cx="34" cy="22" r="4" fill="#FFD166"/>`,
  crane: (c) => `<line x1="-30" y1="44" x2="-30" y2="-40" stroke="${c}" stroke-width="8"/><line x1="-38" y1="-36" x2="40" y2="-36" stroke="${c}" stroke-width="8"/>` +
    `<line x1="30" y1="-36" x2="30" y2="0" stroke="${K}" stroke-width="3"/><rect x="18" y="0" width="24" height="20" fill="#FAF6EC"${S(3)}/><line x1="-30" y1="-12" x2="-6" y2="-36" stroke="${c}" stroke-width="5"/>`,
  wall: (c) => `<path d="M -44 40 L -44 -20 L -32 -20 L -32 -32 L -20 -32 L -20 -20 L -6 -20 L -6 -32 L 6 -32 L 6 -20 L 20 -20 L 20 -32 L 32 -32 L 32 -20 L 44 -20 L 44 40 Z" fill="${c}"${S(3)}/>` +
    `<path d="M -10 40 L -10 12 Q 0 0 10 12 L 10 40 Z" fill="${K}"/>`,
  swap: (c) => `<circle cx="-24" cy="-16" r="18" fill="#FAF6EC"${S(3)}/><circle cx="24" cy="16" r="18" fill="#FAF6EC"${S(3)}/>` +
    `<path d="M -4 -36 Q 30 -36 34 -8" fill="none" stroke="${c}" stroke-width="5"/>${P([[26, -10], [42, -10], [34, 2]], c)}` +
    `<path d="M 4 36 Q -30 36 -34 8" fill="none" stroke="${c}" stroke-width="5"/>${P([[-26, 10], [-42, 10], [-34, -2]], c)}`,
  drop: (c) => `<path d="M 0 -46 Q 36 0 30 18 A 30 30 0 0 1 -30 18 Q -36 0 0 -46 Z" fill="${c}"${S(3)}/><path d="M -14 14 A 14 14 0 0 0 0 28" fill="none" stroke="#FAF6EC" stroke-width="4"/>`,
  cross: (c) => `<rect x="-14" y="-40" width="28" height="80" rx="4" fill="${c}"${S(3)}/><rect x="-40" y="-14" width="80" height="28" rx="4" fill="${c}"${S(3)}/>`,
  pick: (c) => `<line x1="-30" y1="40" x2="20" y2="-20" stroke="#8D6E63" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M -10 -44 Q 30 -40 46 0 Q 24 -22 -6 -30 Z" fill="${c}"${S(3)}/>`,
  anvil: (c) => `<path d="M -44 -20 L 30 -20 Q 46 -20 46 -10 L 20 -6 L 14 14 L 26 30 L -26 30 L -14 14 L -20 -6 L -44 -10 Z" fill="${c}"${S(3)}/>` +
    `<rect x="-6" y="-44" width="12" height="20" fill="#8D6E63"${S(2)}/><rect x="-18" y="-50" width="36" height="12" rx="3" fill="#78909C"${S(2)}/>`,
  book: (c) => `<path d="M 0 -30 Q -24 -42 -46 -30 L -46 34 Q -24 22 0 34 Q 24 22 46 34 L 46 -30 Q 24 -42 0 -30 Z" fill="#FAF6EC"${S(3)}/>` +
    `<line x1="0" y1="-30" x2="0" y2="34" stroke="${K}" stroke-width="3"/>` + [-14, -2, 10].map(y => `<line x1="-36" y1="${y}" x2="-10" y2="${y}" stroke="${c}" stroke-width="3"/><line x1="10" y1="${y}" x2="36" y2="${y}" stroke="${c}" stroke-width="3"/>`).join(''),
  // trade
  ship: (c) => `<line x1="0" y1="-46" x2="0" y2="18" stroke="#5D4037" stroke-width="5"/>` + P([[4, -40], [34, 6], [4, 6]], '#FAF6EC', S(3)) + P([[-4, -30], [-28, 6], [-4, 6]], c, S(3)) +
    P([[-44, 16], [44, 16], [30, 40], [-30, 40]], '#6D4C41', S(3)),
  purse: (c) => `<path d="M -30 -20 Q -44 40 0 40 Q 44 40 30 -20 Z" fill="${c}"${S(3)}/><path d="M -30 -20 Q -14 -30 -22 -44 L 22 -44 Q 14 -30 30 -20" fill="${c}"${S(3)}/>` +
    `<line x1="-30" y1="-20" x2="30" y2="-20" stroke="${K}" stroke-width="4"/><circle cx="0" cy="10" r="10" fill="#FFD166"${S(2)}/>`,
  pawn: (c) => `<ellipse cx="0" cy="38" rx="30" ry="8" fill="${c}"${S(3)}/>` + P([[0, -16], [24, 38], [-24, 38]], c, S(3)) + `<circle cx="0" cy="-26" r="14" fill="${c}"${S(3)}/>`,
  // politics
  scroll: (c) => `<rect x="-34" y="-36" width="68" height="72" rx="4" fill="#FAF6EC"${S(3)}/>` + [-20, -8, 4].map(y => `<line x1="-22" y1="${y}" x2="22" y2="${y}" stroke="#78909C" stroke-width="3"/>`).join('') +
    `<circle cx="14" cy="22" r="12" fill="${c}"${S(3)}/>`,
  banner: (c) => `<line x1="-30" y1="-46" x2="-30" y2="46" stroke="#8D6E63" stroke-width="6"/><path d="M -30 -42 L 40 -42 L 28 -18 L 40 6 L -30 6 Z" fill="${c}"${S(3)}/>`,
  eye: (c) => `<path d="M -46 0 Q 0 -40 46 0 Q 0 40 -46 0 Z" fill="#FAF6EC"${S(3)}/><circle cx="0" cy="0" r="16" fill="${c}"${S(3)}/><circle cx="0" cy="0" r="6" fill="${K}"/>`,
  dagger: (c) => P([[0, -48], [10, -10], [10, 14], [-10, 14], [-10, -10]], '#CFD8DC', S(3)) + `<rect x="-24" y="14" width="48" height="9" rx="3" fill="${c}"${S(3)}/><rect x="-6" y="23" width="12" height="22" fill="#8D6E63"${S(2)}/>`,
  bomb: (c) => `<circle cx="-4" cy="10" r="32" fill="#263238"${S(3)}/><path d="M 18 -14 Q 30 -36 44 -34" fill="none" stroke="#8D6E63" stroke-width="4"/>` +
    P([[44, -48], [50, -36], [40, -30], [36, -40]], c),
  bag: (c) => `<path d="M -32 40 Q -42 -8 -12 -22 L 12 -22 Q 42 -8 32 40 Z" fill="${c}"${S(3)}/><path d="M -12 -22 L -18 -40 L 18 -40 L 12 -22" fill="${c}"${S(3)}/>` +
    `<path d="M -8 4 Q 0 -6 8 4 Q 0 14 -8 4" fill="none" stroke="${K}" stroke-width="3"/>`,
  broken: (c) => `<g transform="rotate(-40)"><rect x="-5" y="-46" width="10" height="34" fill="#CFD8DC"${S(3)}/><rect x="-16" y="-12" width="32" height="8" fill="${c}"${S(3)}/></g>` +
    `<g transform="rotate(30)"><rect x="-5" y="4" width="10" height="34" fill="#CFD8DC"${S(3)}/></g>`,
  rings: (c) => `<circle cx="-14" cy="6" r="24" fill="none" stroke="${c}" stroke-width="8"/><circle cx="14" cy="6" r="24" fill="none" stroke="#FFD166" stroke-width="8"/>` + P([[14, -30], [22, -40], [6, -40]], '#E1F5FE', S(2)),
  // hud
  shield: (c) => `<path d="M 0 -46 L 40 -32 L 40 2 Q 40 32 0 48 Q -40 32 -40 2 L -40 -32 Z" fill="${c}"${S(3)}/>` + `<path d="M -18 14 L -18 -6 Q -18 -22 0 -22 Q 18 -22 18 -6 L 18 14 Z" fill="${K}"/>`,
  laurel: (c) => [-1, 1].map(s => [0, 1, 2, 3].map(i => `<ellipse cx="${s * (28 + i * 2)}" cy="${30 - i * 18}" rx="7" ry="13" fill="${c}" transform="rotate(${s * (20 + i * 12)} ${s * (28 + i * 2)} ${30 - i * 18})"/>`).join('')).join('') + G_star_small(c),
  swords: (c) => `<g transform="rotate(45)"><rect x="-4" y="-48" width="8" height="70" fill="#CFD8DC"${S(2)}/><rect x="-14" y="20" width="28" height="7" fill="${c}"/></g><g transform="rotate(-45)"><rect x="-4" y="-48" width="8" height="70" fill="#CFD8DC"${S(2)}/><rect x="-14" y="20" width="28" height="7" fill="${c}"/></g>` +
    `<path d="M 0 -18 L 20 -10 L 20 6 Q 20 22 0 30 Q -20 22 -20 6 L -20 -10 Z" fill="${c}"${S(3)}/>`,
  wings: (c) => `<path d="M -8 -10 Q -40 -40 -48 -6 Q -36 -8 -40 10 Q -26 6 -24 22 Q -14 10 -8 16 Z" fill="${c}"${S(2)}/><path d="M 8 -10 Q 40 -40 48 -6 Q 36 -8 40 10 Q 26 6 24 22 Q 14 10 8 16 Z" fill="${c}"${S(2)}/>` +
    `<path d="M 0 -26 L 18 -18 L 18 4 Q 18 24 0 34 Q -18 24 -18 4 L -18 -18 Z" fill="#FAF6EC"${S(3)}/>`,
  hood: (c) => `<path d="M -34 44 Q -40 -36 0 -42 Q 40 -36 34 44 Z" fill="${c}"${S(3)}/><ellipse cx="0" cy="0" rx="20" ry="16" fill="${K}"/>`,
  longship: (c) => `<path d="M -48 4 L 48 4 Q 40 30 0 30 Q -40 30 -48 4 Z" fill="${c}"${S(3)}/><path d="M -48 4 Q -56 -10 -44 -16" fill="none" stroke="${c}" stroke-width="5"/>` +
    `<line x1="0" y1="4" x2="0" y2="-44" stroke="#5D4037" stroke-width="5"/>` + P([[0, -42], [30, -36], [30, -6], [0, -10]], '#FAF6EC', S(3)) + [-30, -12, 6, 24].map(x => `<circle cx="${x}" cy="14" r="5" fill="#FFD166"${S(1.5)}/>`).join(''),
  gate: (c) => `<path d="M -40 40 L -40 -14 Q -40 -44 0 -44 Q 40 -44 40 -14 L 40 40 Z" fill="${c}"${S(3)}/><path d="M -20 40 L -20 0 Q -20 -20 0 -20 Q 20 -20 20 0 L 20 40 Z" fill="${K}"/>`,
};
function G_star_small(c) { const a = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22, t = Math.PI / 5 * i - Math.PI / 2; a.push([r * Math.cos(t), r * Math.sin(t)]); } return P(a, c, S(2)); }

function place(name, cx, cy, size, color) {
  if (!G[name]) throw new Error('no glyph ' + name);
  const k = +(size / 100).toFixed(4);
  return `<g transform="translate(${cx} ${cy}) scale(${k})">${G[name](color)}</g>`;
}

module.exports = { place, GLYPHS: Object.keys(G) };
