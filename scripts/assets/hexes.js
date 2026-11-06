// Category 1 — terrain hexes, 512x512. Spec geometry is pointy-top; flat(id) gives the
// rotated flat-top variant the board renderer packs into the atlas (plan D3).
const { RES } = require('./palette');
const { doc, linear, pts } = require('./svg');

const SHORE = [[256, 14], [466, 135], [466, 377], [256, 498], [46, 377], [46, 135]];
const INNER = [[256, 35], [447, 146], [447, 366], [256, 477], [65, 366], [65, 146]];
const toFlat = ([x, y]) => [512 - y, x];

// Point on a ring around the centre (angle in degrees, 0 = up).
const ring = (deg, r) => [256 + r * Math.sin(deg * Math.PI / 180), 256 - r * Math.cos(deg * Math.PI / 180)];
const n = (v) => +v.toFixed(1);

const pine = (x, y, s, c) => {
  const t = (dy, w) => `<polygon points="${pts([[x, y - s + dy], [x + w, y + dy * 0.5], [x - w, y + dy * 0.5]])}" fill="${c}"/>`;
  return `<rect x="${n(x - s * 0.08)}" y="${n(y)}" width="${n(s * 0.16)}" height="${n(s * 0.35)}" fill="#3E2A1A"/>` +
    t(0, s * 0.55) + t(-s * 0.3, s * 0.45) + t(-s * 0.6, s * 0.34);
};

const MOTIFS = {
  wood(c) {
    let out = '';
    [[0, 150], [45, 140], [90, 150], [135, 140], [180, 150], [225, 140], [270, 150], [315, 140]].forEach(([a, r], i) => {
      const [x, y] = ring(a, r); out += pine(x, y + 10, i % 2 ? 46 : 54, i % 2 ? '#1E4F2C' : c.accent);
    });
    [[22, 100], [112, 100], [202, 100], [292, 100]].forEach(([a, r]) => { const [x, y] = ring(a, r); out += pine(x, y + 8, 30, '#245F35'); });
    return out;
  },
  brick(c) {
    let out = '';
    for (let i = 0; i < 4; i++) {
      const r = 105 + i * 22;
      out += `<path d="M ${n(256 - r)} ${n(256 + r * 0.25)} Q 256 ${n(256 - r * 0.9)} ${n(256 + r)} ${n(256 + r * 0.25)}" fill="none" stroke="${i % 2 ? c.accent : '#6E2412'}" stroke-width="6" stroke-linecap="round" opacity="0.7"/>`;
    }
    for (const a of [60, 180, 300]) {
      const [x, y] = ring(a, 140);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3 - row; col++) {
        out += `<rect x="${n(x - 30 + col * 20 + row * 10)}" y="${n(y + 10 - row * 12)}" width="18" height="10" rx="2" fill="${c.accent}" stroke="#5A1E0E" stroke-width="2"/>`;
      }
    }
    return out;
  },
  sheep(c) {
    let out = '';
    for (const [d, o] of [[110, 0.5], [150, 0.4], [185, 0.3]]) {
      out += `<path d="M ${256 - d * 1.2} ${256 + d * 0.55} C ${256 - d * 0.4} ${256 + d * 0.2}, ${256 + d * 0.4} ${256 + d * 0.9}, ${256 + d * 1.2} ${256 + d * 0.5}" fill="none" stroke="${c.accent}" stroke-width="7" opacity="${o}"/>`;
      out += `<path d="M ${256 - d * 1.2} ${256 - d * 0.5} C ${256 - d * 0.4} ${256 - d * 0.9}, ${256 + d * 0.4} ${256 - d * 0.2}, ${256 + d * 1.2} ${256 - d * 0.55}" fill="none" stroke="${c.accent}" stroke-width="7" opacity="${o}"/>`;
    }
    for (const a of [30, 120, 210, 300]) {
      const [x, y] = ring(a, 135);
      out += `<g><rect x="${n(x - 16)}" y="${n(y + 8)}" width="5" height="14" fill="#141414"/><rect x="${n(x + 10)}" y="${n(y + 8)}" width="5" height="14" fill="#141414"/>` +
        `<ellipse cx="${n(x)}" cy="${n(y)}" rx="26" ry="17" fill="#FAF6EC" stroke="#141414" stroke-width="3"/>` +
        `<circle cx="${n(x + 24)}" cy="${n(y - 6)}" r="9" fill="#37474F"/></g>`;
    }
    return out;
  },
  wheat(c) {
    let out = '';
    for (let i = -6; i <= 6; i++) {
      const o = i * 34;
      out += `<line x1="${256 + o - 200}" y1="${256 + 200}" x2="${256 + o + 200}" y2="${256 - 200}" stroke="${i % 2 ? c.accent : '#C98E14'}" stroke-width="8" opacity="0.45"/>`;
    }
    for (const a of [0, 120, 240]) {
      const [x, y] = ring(a, 140);
      for (const dx of [-12, 0, 12]) {
        out += `<line x1="${n(x)}" y1="${n(y + 34)}" x2="${n(x + dx)}" y2="${n(y - 26)}" stroke="#8A5A06" stroke-width="4"/>`;
        for (let k = 0; k < 4; k++) out += `<ellipse cx="${n(x + dx * (1 - k * 0.15))}" cy="${n(y - 24 + k * 10)}" rx="5" ry="8" fill="${c.accent}" stroke="#8A5A06" stroke-width="1.5"/>`;
      }
      out += `<rect x="${n(x - 16)}" y="${n(y + 8)}" width="32" height="7" rx="3" fill="#8A5A06"/>`;
    }
    return out;
  },
  ore(c) {
    let out = '';
    for (const [a, s] of [[0, 64], [72, 56], [144, 64], [216, 56], [288, 64]]) {
      const [x, y] = ring(a, 145);
      out += `<polygon points="${pts([[x - s, y + s * 0.55], [x - s * 0.15, y - s * 0.75], [x + s * 0.2, y - s * 0.3], [x + s * 0.45, y - s * 0.6], [x + s, y + s * 0.55]])}" fill="#4A545E" stroke="#2B3138" stroke-width="3"/>` +
        `<polygon points="${pts([[x - s * 0.15, y - s * 0.75], [x - s * 0.32, y - s * 0.32], [x - s * 0.05, y - s * 0.42]])}" fill="#98A6B5"/>` +
        `<polyline points="${pts([[x - s * 0.4, y + s * 0.3], [x - s * 0.1, y], [x + s * 0.15, y + s * 0.2], [x + s * 0.4, y - s * 0.1]])}" fill="none" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>`;
    }
    return out;
  },
  desert(c) {
    let out = '';
    for (const [dy, o] of [[-130, 0.55], [-60, 0.4], [20, 0.5], [95, 0.4], [160, 0.55]]) {
      out += `<path d="M 40 ${256 + dy} Q 180 ${256 + dy - 45} 300 ${256 + dy} T 480 ${256 + dy}" fill="none" stroke="${c.accent}" stroke-width="9" stroke-linecap="round" opacity="${o}"/>`;
    }
    for (const [a, r, s] of [[50, 120, 1], [180, 70, 1.2], [300, 125, 0.9]]) {
      const [x, y] = ring(a, r);
      out += `<g fill="#3E7D3A" stroke="#1F4A1E" stroke-width="3">` +
        `<rect x="${n(x - 9 * s)}" y="${n(y - 40 * s)}" width="${n(18 * s)}" height="${n(70 * s)}" rx="${n(9 * s)}"/>` +
        `<path d="M ${n(x - 9 * s)} ${n(y)} h ${n(-14 * s)} v ${n(-24 * s)}" fill="none" stroke-width="${n(9 * s)}" stroke="#3E7D3A" stroke-linecap="round"/>` +
        `<path d="M ${n(x + 9 * s)} ${n(y - 10 * s)} h ${n(14 * s)} v ${n(-20 * s)}" fill="none" stroke-width="${n(9 * s)}" stroke="#3E7D3A" stroke-linecap="round"/></g>`;
    }
    return out;
  },
  ocean(c) {
    let out = '';
    for (const [x, y] of [[150, 130], [330, 110], [110, 250], [256, 220], [400, 250], [170, 370], [340, 380], [256, 320]]) {
      out += `<path d="M ${x - 34} ${y} q 17 -16 34 0 t 34 0" fill="none" stroke="${c.accent}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>`;
    }
    return out;
  },
  gold(c) {
    let out = `<path d="M 60 120 C 180 180, 140 300, 260 330 S 400 400, 460 380" fill="none" stroke="#2E86C1" stroke-width="34" stroke-linecap="round" opacity="0.85"/>` +
      `<path d="M 60 120 C 180 180, 140 300, 260 330 S 400 400, 460 380" fill="none" stroke="#7FC4EE" stroke-width="6" stroke-dasharray="14 18" opacity="0.8"/>`;
    for (const [x, y] of [[150, 100], [380, 150], [120, 400], [400, 300], [330, 430]]) {
      out += `<polygon points="${pts([[x - 30, y + 18], [x - 10, y - 22], [x + 28, y - 8], [x + 24, y + 20]])}" fill="#6B5A2E" stroke="#3E3318" stroke-width="3"/>`;
    }
    for (const [x, y, r] of [[190, 160], [360, 200], [180, 330], [300, 390], [420, 340]].map(p => [...p, 9])) {
      out += `<polygon points="${pts([[x, y - r], [x + r, y], [x, y + r * 0.8], [x - r, y]])}" fill="${c.accent}" stroke="#856404" stroke-width="2"/>`;
    }
    return out;
  },
};

function build(res, flatTop) {
  const c = RES[res];
  const shore = flatTop ? SHORE.map(toFlat) : SHORE;
  const inner = flatTop ? INNER.map(toFlat) : INNER;
  const defs = linear('g', c.top, c.bot) + `<clipPath id="clip"><polygon points="${pts(inner)}"/></clipPath>`;
  const ocean = res === 'ocean';
  let body = `<polygon points="${pts(shore)}" fill="${ocean ? c.top : '#DFC28B'}" stroke="${ocean ? c.bot : '#8C6D3B'}" stroke-width="4"/>`;
  body += `<polygon points="${pts(inner)}" fill="url(#g)" stroke="${c.accent}" stroke-width="3"/>`;
  body += `<g clip-path="url(#clip)">${MOTIFS[res](c)}</g>`;
  if (!['desert', 'ocean'].includes(res)) {
    body += '<circle cx="256" cy="256" r="58" fill="rgba(20,20,20,0.22)" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>';
  }
  return doc(512, 512, defs, body);
}

const IDS = Object.keys(RES);
function entries() {
  return IDS.map(r => ({ id: 'hex_' + r, path: `hexes/hex_${r}.svg`, w: 512, h: 512, atlas: 'hexes', build: () => build(r, false) }));
}
function flat(id) { return build(id.replace(/^hex_/, ''), true); }

module.exports = { entries, flat };
