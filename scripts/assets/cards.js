// Categories 4-6 — resource/commodity cards, card backs, development cards and
// Cities & Knights progress cards (2025 deck, plan D1), 400x560.
const C = require('../../src/constants');
const CardText = require('../../public/js/cardtext');
const { CARD_ACCENT, CARD_TINT, COMM, TRACK, HUD } = require('./palette');
const { doc, text, esc, wrap, FONT } = require('./svg');
const { place } = require('./glyphs');

const W = 400, H = 560;
const RULE_CHARS = 34;

function shell(accent) {
  return `<rect x="8" y="8" width="384" height="544" rx="22" fill="${HUD.primary}" stroke="${accent}" stroke-width="4"/>` +
    `<rect x="22" y="22" width="356" height="516" rx="16" fill="${HUD.elevated}"/>`;
}
function pip(cx, cy, glyph, accent, tint, rotate) {
  const g = `<circle cx="${cx}" cy="${cy}" r="22" fill="${tint}" stroke="${accent}" stroke-width="3"/>` + place(glyph, cx, cy, 30, accent);
  return rotate ? `<g transform="rotate(180 ${cx} ${cy})">${g}</g>` : g;
}
function banner(y, title, accent) {
  return `<rect x="60" y="${y - 30}" width="280" height="44" rx="22" fill="${HUD.primary}" stroke="${accent}" stroke-width="3"/>` +
    text(200, y, title, { 'font-size': 26, 'font-weight': 800, fill: accent, 'letter-spacing': 2 });
}

// Resource and commodity cards.
function resourceCard(id, glyph, accent, tint) {
  const body = shell(accent) +
    `<rect x="22" y="22" width="356" height="516" rx="16" fill="${tint}" opacity="0.35"/>` +
    pip(58, 58, glyph, accent, tint) + pip(342, 502, glyph, accent, tint, true) +
    `<circle cx="200" cy="250" r="110" fill="${tint}" stroke="${accent}" stroke-width="6"/>` +
    place(glyph, 200, 250, 150, accent) +
    banner(445, CardText.TITLE(id), accent);
  return doc(W, H, '', body);
}

// Card backs: a lattice motif + emblem.
function backCard(title, accent, tint, glyph) {
  let lattice = '';
  for (let y = 60; y < 520; y += 46) for (let x = 50 + ((y / 46) % 2) * 23; x < 360; x += 46) {
    lattice += `<polygon points="${x},${y - 14} ${x + 12},${y - 7} ${x + 12},${y + 7} ${x},${y + 14} ${x - 12},${y + 7} ${x - 12},${y - 7}" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.25"/>`;
  }
  const body = shell(accent) + `<rect x="22" y="22" width="356" height="516" rx="16" fill="${tint}"/>` + lattice +
    `<circle cx="200" cy="250" r="110" fill="${HUD.primary}" stroke="${accent}" stroke-width="6"/>` +
    place(glyph, 200, 250, 140, accent) + banner(445, title, accent);
  return doc(W, H, '', body);
}

// Development / progress card with a rules box.
function rulesCard(title, rule, accent, glyph, corner) {
  const lines = wrap(rule, RULE_CHARS);
  const tspans = lines.map((l, i) => `<tspan x="200" dy="${i ? 24 : 0}">${esc(l)}</tspan>`).join('');
  const top = 424 - (lines.length - 1) * 12;
  const body = shell(accent) +
    `<rect x="50" y="40" width="300" height="44" rx="22" fill="${HUD.primary}" stroke="${accent}" stroke-width="3"/>` +
    text(200, 70, title, { 'font-size': title.length > 16 ? 19 : 22, 'font-weight': 800, fill: accent, 'letter-spacing': 1 }) +
    (corner ? pip(58, 130, corner, accent, HUD.primary) : '') +
    `<circle cx="200" cy="210" r="88" fill="${HUD.primary}" stroke="${accent}" stroke-width="5"/>` +
    place(glyph, 200, 210, 120, accent) +
    `<rect x="36" y="340" width="328" height="168" rx="12" fill="${HUD.primary}" stroke="${accent}" stroke-width="2" stroke-opacity="0.5"/>` +
    `<text x="200" y="${top}" font-family="${FONT}" font-size="17" font-weight="600" fill="#ECEFF1" text-anchor="middle">${tspans}</text>`;
  return doc(W, H, '', body);
}

const DEV = [
  { eng: 'knight',         id: 'knight',         accent: '#E53935', glyph: 'helm' },
  { eng: 'vp',             id: 'victory_point',  accent: '#FFD166', glyph: 'star' },
  { eng: 'road_building',  id: 'road_building',  accent: '#68B678', glyph: 'road' },
  { eng: 'year_of_plenty', id: 'year_of_plenty', accent: '#FFB300', glyph: 'plenty' },
  { eng: 'monopoly',       id: 'monopoly',       accent: '#00E5FF', glyph: 'monopoly' },
];

const PROGRESS_GLYPH = {
  alchemy: 'dice', crane: 'crane', engineering: 'wall', invention: 'swap', irrigation: 'drop', medicine: 'cross',
  mining: 'pick', road_building: 'road', smithing: 'anvil', printing: 'book',
  commercial_harbor: 'ship', guild_dues: 'purse', merchant: 'pawn', merchant_fleet: 'ship', trade_monopoly: 'cloth', resource_monopoly: 'scale',
  diplomacy: 'scroll', encouragement: 'banner', espionage: 'eye', intrigue: 'dagger', sabotage: 'bomb', taxation: 'bag',
  treason: 'broken', wedding: 'rings', constitution: 'scroll',
};
const TRACK_GLYPH = { trade: 'scale', politics: 'crown', science: 'gear' };

function entries() {
  const out = [];
  const add = (id, dir, build) => out.push({ id, path: `cards/${dir}/${id}.svg`, w: W, h: H, atlas: 'cards', build });
  for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore']) add('card_' + r, 'resources', () => resourceCard(r, r, CARD_ACCENT[r], CARD_TINT[r]));
  for (const [c, v] of Object.entries(COMM)) add('card_' + c, 'resources', () => resourceCard(c, c, v.accent, v.tint));
  const BACKS = [
    ['resource', 'RESOURCE', '#00E5FF', '#141414', 'gear'],
    ['development', 'DEVELOPMENT', '#FFB300', '#141414', 'shield'],
    ['trade', 'TRADE', '#FFD166', '#2B2108', 'scale'],
    ['politics', 'POLITICS', '#00E5FF', '#082430', 'crown'],
    ['science', 'SCIENCE', '#4CE08A', '#092B1A', 'gear'],
  ];
  for (const [id, title, accent, tint, glyph] of BACKS) add('card_back_' + id, 'backs', () => backCard(title, accent, tint, glyph));
  for (const d of DEV) add('dev_' + d.id, 'development', () => rulesCard(CardText.TITLE(d.id), CardText.DEV[d.eng], d.accent, d.glyph));
  for (const [track, deck] of Object.entries(C.PROGRESS_DECKS)) {
    for (const id of Object.keys(deck)) {
      add(`prog_${track}_${id}`, 'progress', () => rulesCard(CardText.TITLE(id), CardText.PROGRESS[id], TRACK[track], PROGRESS_GLYPH[id], TRACK_GLYPH[track]));
    }
  }
  return out;
}

module.exports = { entries };
