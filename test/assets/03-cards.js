// Task 3: resource, back, development and progress cards.
module.exports = ({ assert, svg, all, step }) => {
  const C = require('../../src/constants');
  const CardText = require('../../public/js/cardtext');
  const { TRACK } = require('../../scripts/assets/palette');
  const { esc, wrap } = require('../../scripts/assets/svg');

  const progIds = all.filter(e => e.id.startsWith('prog_')).map(e => e.id).sort();
  const want = Object.entries(C.PROGRESS_DECKS).flatMap(([t, d]) => Object.keys(d).map(id => `prog_${t}_${id}`)).sort();
  assert.deepStrictEqual(progIds, want, 'progress card ids match the engine deck');
  assert.deepStrictEqual(Object.keys(CardText.PROGRESS).sort(), Object.values(C.PROGRESS_DECKS).flatMap(Object.keys).sort(), 'every progress card has text');
  step('progress cards: one per engine card type (25)');

  const cards = all.filter(e => e.path.startsWith('cards/'));
  assert.strictEqual(cards.length, 43);
  for (const e of cards) {
    const s = e.build();
    assert(s.includes('<rect x="8" y="8" width="384" height="544" rx="22"'), `${e.id} shell`);
    assert(s.includes('<rect x="22" y="22" width="356" height="516" rx="16"'), `${e.id} inner`);
  }
  step('cards: shell and inner surface on all 43');

  const lineOk = (s) => (s.match(/<tspan[^>]*>([^<]*)<\/tspan>/g) || []).every(t => t.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '_').length <= 34);
  const DEV = { knight: 'knight', vp: 'victory_point', road_building: 'road_building', year_of_plenty: 'year_of_plenty', monopoly: 'monopoly' };
  for (const [eng, id] of Object.entries(DEV)) {
    const s = svg('dev_' + id);
    for (const line of wrap(CardText.DEV[eng], 34)) assert(s.includes('>' + esc(line) + '</tspan>'), `dev_${id} text "${line}"`);
    assert(lineOk(s), `dev_${id} line length`);
  }
  for (const [track, deck] of Object.entries(C.PROGRESS_DECKS)) for (const id of Object.keys(deck)) {
    const s = svg(`prog_${track}_${id}`);
    for (const line of wrap(CardText.PROGRESS[id], 34)) assert(s.includes('>' + esc(line) + '</tspan>'), `prog ${id} text "${line}"`);
    assert(s.includes(`stroke="${TRACK[track]}"`), `prog ${id} accent`);
    assert(lineOk(s), `prog ${id} line length`);
  }
  assert(svg('dev_knight').includes('stroke="#E53935"'), 'dev_knight accent');
  step('dev + progress cards: engine rules text, wrapped, track accents');

  for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore', 'paper', 'cloth', 'coin']) assert(svg('card_' + r).includes('<circle cx="200" cy="250" r="110"'), `card_${r} medallion`);
  for (const b of ['resource', 'development', 'trade', 'politics', 'science']) svg('card_back_' + b);
  assert(svg('card_coin').includes('stroke="#00E5FF"') && svg('card_back_science').includes('stroke="#4CE08A"'), 'frame accents');
  step('resource/commodity cards + 5 backs');
};
