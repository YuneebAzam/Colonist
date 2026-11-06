#!/usr/bin/env node
// Post-build check: every manifest SVG exists and is non-empty, and each of the 4 atlases has a
// .webp + .json pair whose frames match the manifest and whose image size matches meta.size.
const fs = require('fs');
const path = require('path');
const { entries } = require('./assets/manifest');

const DIR = path.join(__dirname, '..', 'public', 'assets');
const ATLASES = ['hexes', 'ports', 'cards', 'pieces_hud'];
const problems = [];

// Width/height from a WebP header (VP8X, VP8 lossy or VP8L lossless).
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
  return null;
}

const list = entries();
const manifestFile = path.join(DIR, 'manifest.json');
if (!fs.existsSync(manifestFile)) problems.push('manifest.json missing (run npm run assets)');
for (const e of list) {
  const f = path.join(DIR, e.path);
  if (!fs.existsSync(f)) problems.push(`missing ${e.path}`);
  else if (fs.statSync(f).size === 0) problems.push(`empty ${e.path}`);
}

for (const a of ATLASES) {
  const json = path.join(DIR, 'atlases', `${a}_atlas.json`), webp = path.join(DIR, 'atlases', `${a}_atlas.webp`);
  if (!fs.existsSync(json) || !fs.existsSync(webp)) { problems.push(`atlas ${a} missing (run npm run assets:atlas)`); continue; }
  const meta = JSON.parse(fs.readFileSync(json, 'utf8'));
  const want = list.filter(e => e.atlas === a).map(e => e.id);
  const got = Object.keys(meta.frames || {});
  if (got.length !== want.length) problems.push(`atlas ${a}: ${got.length} frames, manifest has ${want.length}`);
  for (const id of got) if (!want.includes(id)) problems.push(`atlas ${a}: unknown frame ${id}`);
  for (const id of want) if (!got.includes(id)) problems.push(`atlas ${a}: frame ${id} missing`);
  const size = webpSize(fs.readFileSync(webp));
  if (!size) problems.push(`atlas ${a}: not a WebP image`);
  else if (!meta.meta || size.w !== meta.meta.size.w || size.h !== meta.meta.size.h) problems.push(`atlas ${a}: image ${size.w}x${size.h} != meta.size`);
  for (const [id, f] of Object.entries(meta.frames || {})) {
    if (f.x + f.w > meta.meta.size.w || f.y + f.h > meta.meta.size.h) problems.push(`atlas ${a}: frame ${id} outside the image`);
  }
}

if (problems.length) {
  console.error('asset check failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`ok: ${list.length} svgs, ${ATLASES.length} atlases`);
