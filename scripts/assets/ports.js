// Category 2 — harbor ships and the pier connector, 256x256.
const { doc, text, pts } = require('./svg');

const PORTS = [
  { id: '3to1',  sail: '#00E5FF', ratio: '3:1', emblem: 'compass' },
  { id: 'wood',  sail: '#68B678', ratio: '2:1', emblem: 'wood',  color: '#2D6A3E' },
  { id: 'brick', sail: '#E88364', ratio: '2:1', emblem: 'brick', color: '#C85232' },
  { id: 'sheep', sail: '#AED581', ratio: '2:1', emblem: 'sheep', color: '#7CB342' },
  { id: 'wheat', sail: '#FFD54F', ratio: '2:1', emblem: 'wheat', color: '#E5A922' },
  { id: 'ore',   sail: '#98A6B5', ratio: '2:1', emblem: 'ore',   color: '#64707D' },
];

// Emblems centred on (128, 88), about 44px wide.
function emblem(kind, c) {
  const x = 128, y = 88;
  switch (kind) {
    case 'compass':
      return `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="#141414" stroke-width="3"/>` +
        `<polygon points="${pts([[x, y - 18], [x + 6, y], [x, y + 18], [x - 6, y]])}" fill="#00E5FF" stroke="#141414" stroke-width="2"/>` +
        text(x, y + 5, '?', { 'font-size': 16, 'font-weight': 800, fill: '#141414' });
    case 'wood':
      return `<rect x="${x - 3}" y="${y + 8}" width="6" height="12" fill="#3E2A1A"/>` +
        `<polygon points="${pts([[x, y - 22], [x + 18, y + 10], [x - 18, y + 10]])}" fill="${c}" stroke="#141414" stroke-width="2"/>`;
    case 'brick':
      return [[-16, 2], [2, 2], [-7, -10]].map(([dx, dy]) => `<rect x="${x + dx}" y="${y + dy}" width="16" height="10" rx="2" fill="${c}" stroke="#141414" stroke-width="2"/>`).join('');
    case 'sheep':
      return `<ellipse cx="${x - 2}" cy="${y + 2}" rx="18" ry="12" fill="#FAF6EC" stroke="${c}" stroke-width="3"/><circle cx="${x + 16}" cy="${y - 4}" r="7" fill="${c}"/>`;
    case 'wheat':
      return `<line x1="${x}" y1="${y + 20}" x2="${x}" y2="${y - 18}" stroke="${c}" stroke-width="3"/>` +
        [-12, -2, 8].map(dy => `<ellipse cx="${x - 6}" cy="${y + dy}" rx="4" ry="7" fill="${c}" transform="rotate(-25 ${x - 6} ${y + dy})"/><ellipse cx="${x + 6}" cy="${y + dy}" rx="4" ry="7" fill="${c}" transform="rotate(25 ${x + 6} ${y + dy})"/>`).join('');
    case 'ore':
      return `<polygon points="${pts([[x - 18, y + 14], [x - 8, y - 16], [x + 10, y - 12], [x + 20, y + 14]])}" fill="${c}" stroke="#141414" stroke-width="2"/>` +
        `<polygon points="${pts([[x - 8, y - 16], [x - 2, y + 2], [x + 10, y - 12]])}" fill="#98A6B5"/>`;
  }
  return '';
}

function ship(p) {
  const body =
    `<line x1="128" y1="40" x2="128" y2="166" stroke="#4E342E" stroke-width="6"/>` +
    `<rect x="68" y="52" width="120" height="96" rx="12" fill="#FAF6EC" stroke="${p.sail}" stroke-width="5"/>` +
    emblem(p.emblem, p.color) +
    text(128, 132, p.ratio, { 'font-size': 28, 'font-weight': 800, fill: '#141414' }) +
    `<polygon points="56,164 200,164 176,204 80,204" fill="#6D4C41" stroke="#141414" stroke-width="4"/>` +
    `<line x1="72" y1="180" x2="184" y2="180" stroke="#4E342E" stroke-width="3"/>`;
  return doc(256, 256, '', body);
}

function pier() {
  // Two wooden legs and a plank deck, drawn horizontally; the renderer stretches/rotates it.
  const body =
    `<rect x="16" y="104" width="224" height="22" rx="4" fill="#8D6E63" stroke="#141414" stroke-width="4"/>` +
    [40, 88, 136, 184].map(x => `<line x1="${x}" y1="106" x2="${x}" y2="124" stroke="#5D4037" stroke-width="3"/>`).join('') +
    `<rect x="44" y="126" width="14" height="40" fill="#5D4037" stroke="#141414" stroke-width="3"/>` +
    `<rect x="198" y="126" width="14" height="40" fill="#5D4037" stroke="#141414" stroke-width="3"/>`;
  return doc(256, 256, '', body);
}

function entries() {
  return [
    ...PORTS.map(p => ({ id: 'port_' + p.id, path: `ports/port_${p.id}.svg`, w: 256, h: 256, atlas: 'ports', build: () => ship(p) })),
    { id: 'port_pier', path: 'ports/port_pier.svg', w: 256, h: 256, atlas: 'ports', build: pier },
  ];
}

module.exports = { entries };
