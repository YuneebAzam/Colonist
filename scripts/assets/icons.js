// Category 9b — dock resource icons and HUD badges, 128x128 circular badges.
const { doc, text } = require('./svg');
const { place } = require('./glyphs');

const badge = (bg, fg, inner) => doc(128, 128, '',
  `<circle cx="64" cy="64" r="58" fill="${bg}" stroke="${fg}" stroke-width="5"/>` + inner);

const ICONS = [
  ['icon_wood',  '#184225', '#68B678', 'wood'],
  ['icon_brick', '#8A2F19', '#E88364', 'brick'],
  ['icon_sheep', '#4B7C1D', '#FAF6EC', 'sheep'],
  ['icon_wheat', '#AD740B', '#FFD54F', 'wheat'],
  ['icon_ore',   '#3B434C', '#00E5FF', 'ore'],
  ['icon_paper', '#123D30', '#29BB89', 'paper'],
  ['icon_cloth', '#4A3508', '#F7B733', 'cloth'],
  ['icon_coin',  '#0A3647', '#00E5FF', 'coin'],
  ['hud_barbarian_ship',    '#2A1215', '#E53935', 'longship'],
  ['hud_knight_shield',     '#1E1E24', '#00E5FF', 'shield'],
  ['hud_victory_point',     '#2B2108', '#FFD166', 'laurel'],
  ['hud_longest_road',      '#1E1E24', '#FFB300', 'road', '2 VP'],
  ['hud_largest_army',      '#1E1E24', '#E53935', 'swords', '2 VP'],
  ['hud_defender_of_catan', '#082430', '#00E5FF', 'wings', '1 VP'],
  ['hud_robber_asleep',     '#1E1E24', '#78909C', 'hood', null, 'Zzz'],
  ['hud_robber_active',     '#2A1215', '#E53935', 'hood', null, '!'],
];

function build([, bg, fg, glyph, vp, mark]) {
  let inner = place(glyph, 64, vp ? 56 : 64, vp ? 66 : 80, fg);
  if (vp) inner += text(64, 108, vp, { 'font-size': 16, 'font-weight': 800, fill: fg });
  if (mark) inner += text(mark === '!' ? 96 : 92, 38, mark, { 'font-size': mark === '!' ? 34 : 20, 'font-weight': 800, fill: mark === '!' ? '#FFD166' : '#B0BEC5' });
  return badge(bg, fg, inner);
}

function entries() {
  return ICONS.map(row => ({ id: row[0], path: `icons/${row[0]}.svg`, w: 128, h: 128, atlas: 'pieces_hud', build: () => build(row) }));
}

module.exports = { entries };
