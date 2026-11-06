// LogFmt.format: escapes, colours player names, inlines resource icons, tags event lines.
const assert = require('assert');
const LogFmt = require('../public/js/logfmt');
let ok = 0;
const step = (n) => { ok++; console.log('  ok  ' + n); };
const P = [{ name: 'Ann', color: '#E53935' }, { name: 'Bo', color: '#00B0FF' }];

let h = LogFmt.format('Ann got 2 wood', P);
assert(h.includes('color:#E53935') && h.includes('>Ann</b>'), h);
assert(h.includes('src="assets/icons/icon_wood.svg"') && h.includes('width="20"') && h.includes('alt="wood"'), h);
step('player name coloured, resource word becomes a 20px icon');

h = LogFmt.format('<script>alert(1)</script>', P);
assert(h.includes('&lt;script&gt;') && !h.includes('<script'), h);
h = LogFmt.format('Ann', [{ name: '<b>x', color: 'red;background:url(x)' }]);
assert(!h.includes('<b>x') && !h.includes('url(x)'), h);
step('text and player names escaped; bad colours rejected');

assert(!LogFmt.format('woodland ore-free orebody', P).includes('<img'), 'word boundaries');
assert((LogFmt.format('Bo gave 3 bricks and 1 ore', P).match(/<img/g) || []).length === 2, 'plurals');
assert(LogFmt.format('Bo took cloth and coin', P).includes('icon_coin.svg'), 'commodities');
step('only whole resource words (incl. plurals and commodities) get icons');

assert(LogFmt.format('Ann rolled 8', P).includes('die_white_1.svg'), 'roll line gets a die icon');
assert(LogFmt.format('Barbarians advance (3 to go)', P).startsWith('<span class="ev-barb">'), 'barbarian class');
assert(LogFmt.format('Bo stole a card from Ann', P).startsWith('<span class="ev-rob">'), 'robber class');
assert(LogFmt.format('Ann moved the robber', P).startsWith('<span class="ev-rob">'), 'robber class 2');
step('roll lines get a die icon; barbarian and robber lines are tagged');

assert(LogFmt.format('Annie joined', P).indexOf('color:#E53935') === -1, 'name match is whole-word');
step('player names match whole words only');
const src = require('fs').readFileSync(require.resolve('../public/js/logfmt'), 'utf8');
assert(!/\(\?<[!=]/.test(src), 'logfmt.js must not use regex lookbehind (Safari < 16.4 fails to parse the whole file)');
step('no regex lookbehind (older Safari can still load the script)');
console.log(`\nlogfmt: ${ok} checks passed`);
