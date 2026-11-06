// The full asset list. Each category module exports entries(): [{ id, path, w, h, atlas, build }].
const CATEGORIES = ['hexes', 'ports', 'tokens', 'cards', 'pieces', 'knights', 'dice', 'icons'];

function entries() {
  const out = [];
  for (const c of CATEGORIES) {
    let mod;
    try { mod = require('./' + c); } catch (e) { if (e.code === 'MODULE_NOT_FOUND' && e.message.includes(`'./${c}'`)) continue; throw e; }
    out.push(...mod.entries());
  }
  return out;
}

module.exports = { entries, CATEGORIES };
