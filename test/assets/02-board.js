// Task 2: hexes, harbors, number tokens.
module.exports = ({ assert, svg, step }) => {
  const SHORE = 'points="256,14 466,135 466,377 256,498 46,377 46,135"';
  const INNER = 'points="256,35 447,146 447,366 256,477 65,366 65,146"';
  for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore', 'desert', 'ocean', 'gold']) {
    const s = svg('hex_' + r);
    assert(s.includes(SHORE), `hex_${r} shoreline`);
    const recess = s.includes('<circle cx="256" cy="256" r="58"');
    assert.strictEqual(recess, !['desert', 'ocean'].includes(r), `hex_${r} recess`);
  }
  assert(svg('hex_wood').includes(INNER), 'hex_wood inner terrain polygon');
  assert(svg('hex_wood').includes('fill="#DFC28B"') && svg('hex_wood').includes('stroke="#8C6D3B"'), 'shore colours');
  assert(svg('hex_ore').includes('stroke="#00E5FF"'), 'ore accent stroke');
  const { flat } = require('../../scripts/assets/hexes');
  const f = flat('hex_wood');
  assert(f.includes('points="498,256 377,466 135,466 14,256 135,46 377,46"'), 'flat-top shoreline');
  assert(f.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"'), 'flat variant header');
  step('hexes: geometry, recess, flat-top variant');

  for (const n of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
    const s = svg('token_' + n);
    const pips = (s.match(/<circle [^>]*r="3"/g) || []).length;
    assert.strictEqual(pips, 6 - Math.abs(7 - n), `token_${n} pips`);
    assert(s.includes(`>${n}</text>`), `token_${n} numeral`);
    assert(s.includes('<circle cx="64" cy="64" r="52" fill="#F5EFE0" stroke="#141414" stroke-width="3"'), `token_${n} disc`);
    const hot = n === 6 || n === 8;
    assert.strictEqual(s.includes('fill="#E53935"'), hot, `token_${n} hot colour`);
  }
  assert(svg('token_robber').includes('#263238') && svg('token_merchant').includes('#7B1FA2'), 'pawns');
  step('tokens: pips, numerals, hot 6/8, pawns');

  const SAIL = '<rect x="68" y="52" width="120" height="96" rx="12"';
  for (const p of ['3to1', 'wood', 'brick', 'sheep', 'wheat', 'ore']) {
    const s = svg('port_' + p);
    assert(s.includes(SAIL), `port_${p} sail`);
    assert(s.includes('points="56,164 200,164 176,204 80,204"'), `port_${p} hull`);
    assert(s.includes(p === '3to1' ? '>3:1</text>' : '>2:1</text>'), `port_${p} ratio`);
  }
  assert(!svg('port_pier').includes(SAIL), 'pier has no sail');
  step('ports: hull, sail, ratio labels');
};
