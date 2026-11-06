// Task 4: player pieces, knights, dice, HUD icons.
module.exports = ({ assert, svg, all, step }) => {
  const { PLAYERS } = require('../../scripts/assets/palette');
  for (const p of PLAYERS) for (const kind of ['road', 'settlement', 'city', 'city_wall']) {
    const s = svg(`piece_${kind}_${p.key}`);
    assert(s.includes('stroke="#141414"') && s.includes('stroke-width="3.5"'), `piece_${kind}_${p.key} outline`);
    assert(/filter="url\(#sh\)"/.test(s) && s.includes('<feDropShadow dx="0" dy="3" stdDeviation="2.5"'), `piece_${kind}_${p.key} shadow`);
    assert(s.includes(p.fill), `piece_${kind}_${p.key} fill`);
  }
  assert(svg('piece_road_red').includes('<rect x="16" y="46" width="96" height="30" rx="6"'), 'road geometry');
  assert(svg('piece_settlement_red').includes('points="64,23 99,56 29,56"'), 'settlement roof');
  assert(svg('piece_city_red').includes('points="41,14 65,36 17,36"'), 'city spire');
  assert(svg('piece_city_wall_blue').includes('<rect x="10" y="10" width="108" height="108" rx="14" fill="none" stroke="#00B0FF" stroke-width="12"'), 'wall frame');
  for (const t of ['trade', 'politics', 'science']) assert(svg('piece_metropolis_' + t).includes('points="64,11 105,39 105,106 23,106 23,39"'), `metropolis ${t}`);
  step('pieces: 6 colours x road/settlement/city/wall + 3 metropolises');

  const TIERS = { basic: 1, strong: 2, mighty: 3 };
  for (const p of PLAYERS) for (const [tier, str] of Object.entries(TIERS)) for (const state of ['inactive', 'active']) {
    const s = svg(`knight_${tier}_${state}_${p.key}`);
    if (state === 'inactive') assert(s.includes('stroke="#546E7A" stroke-width="4"') && s.includes('opacity="0.82"'), `${tier} inactive ring`);
    else assert(s.includes('stroke="#00E5FF" stroke-width="6"'), `${tier} active ring`);
    assert(s.includes(`<circle cx="64" cy="64" r="44" fill="${p.fill}"`), 'medallion colour');
    assert(s.includes(`>${str}</text>`), `${tier} badge strength`);
  }
  step('knights: 3 tiers x 2 states x 6 colours');

  const GRID = { 1: [[64, 64]], 2: [[38, 38], [90, 90]], 3: [[38, 38], [64, 64], [90, 90]], 4: [[38, 38], [90, 38], [38, 90], [90, 90]],
    5: [[38, 38], [90, 38], [64, 64], [38, 90], [90, 90]], 6: [[38, 38], [38, 64], [38, 90], [90, 38], [90, 64], [90, 90]] };
  for (const col of ['white', 'red']) for (let n = 1; n <= 6; n++) {
    const s = svg(`die_${col}_${n}`);
    const pips = [...s.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="9"/g)].map(m => [+m[1], +m[2]]);
    assert.deepStrictEqual(pips.sort(), GRID[n].slice().sort(), `die_${col}_${n} pips`);
    assert(s.includes('<rect x="12" y="12" width="104" height="104" rx="20"'), 'die body');
  }
  for (const f of ['barbarian', 'trade', 'politics', 'science']) svg('die_event_' + f);
  step('dice: white/red pip grids + 4 event faces');

  const ICONS = ['icon_wood', 'icon_brick', 'icon_sheep', 'icon_wheat', 'icon_ore', 'icon_paper', 'icon_cloth', 'icon_coin',
    'hud_barbarian_ship', 'hud_knight_shield', 'hud_victory_point', 'hud_longest_road', 'hud_largest_army', 'hud_defender_of_catan', 'hud_robber_asleep', 'hud_robber_active'];
  for (const id of ICONS) assert(all.find(e => e.id === id && e.path === `icons/${id}.svg`), id);
  assert(svg('hud_robber_asleep').includes('>Zzz</text>') && svg('hud_robber_active').includes('>!</text>'), 'robber badges');
  step('icons: 16 dock + HUD badges');
};
