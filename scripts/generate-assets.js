#!/usr/bin/env node
// Writes every SVG in the manifest to public/assets (or --out <dir>), plus manifest.json { id: path }.
const fs = require('fs');
const path = require('path');
const { entries } = require('./assets/manifest');

const i = process.argv.indexOf('--out');
const out = path.resolve(i > 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'public', 'assets'));

const list = entries();
const map = {};
for (const e of list) {
  const file = path.join(out, e.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, e.build());
  map[e.id] = e.path;
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(map, null, 1) + '\n');
if (require.main === module && !process.argv.includes('--quiet')) console.log(`wrote ${list.length} SVGs to ${path.relative(process.cwd(), out) || out}`);
