#!/usr/bin/env node
// Rasterizes the SVG manifest in headless Chromium (the preinstalled Playwright one) and packs
// four WebP sprite atlases + JSON frame maps into public/assets/atlases. Hexes use the flat-top
// variant the board draws (plan D3). Outputs are committed; `npm start` never needs Chromium.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { entries } = require('./assets/manifest');
const { flat } = require('./assets/hexes');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'atlases');
const GRID = {
  hexes:      { cols: 4,  w: 512, h: 512 },
  ports:      { cols: 4,  w: 256, h: 256 },
  cards:      { cols: 7,  w: 400, h: 560 },
  pieces_hud: { cols: 10, w: 128, h: 128 },
};

function layout(name, list) {
  const g = GRID[name];
  const rows = Math.ceil(list.length / g.cols);
  const size = { w: g.cols * g.w, h: rows * g.h };
  const frames = {};
  list.forEach((e, i) => { frames[e.id] = { x: (i % g.cols) * g.w, y: Math.floor(i / g.cols) * g.h, w: g.w, h: g.h }; });
  return { size, frames, cell: g.w === g.h ? g.w : [g.w, g.h] };
}

(async () => {
  const all = entries();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  for (const name of Object.keys(GRID)) {
    const list = all.filter(e => e.atlas === name);
    const { size, frames, cell } = layout(name, list);
    const sprites = list.map(e => ({
      src: 'data:image/svg+xml;base64,' + Buffer.from(name === 'hexes' ? flat(e.id) : e.build()).toString('base64'),
      ...frames[e.id],
    }));
    const dataUrl = await page.evaluate(async ({ size, sprites }) => {
      const c = document.createElement('canvas');
      c.width = size.w; c.height = size.h;
      const ctx = c.getContext('2d');
      for (const s of sprites) {
        const img = new Image();
        img.src = s.src;
        await img.decode();
        ctx.drawImage(img, s.x, s.y, s.w, s.h);
      }
      return c.toDataURL('image/webp', 0.92);
    }, { size, sprites });
    if (!dataUrl.startsWith('data:image/webp')) throw new Error('this Chromium cannot encode WebP');
    const file = `${name}_atlas.webp`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT, `${name}_atlas.json`), JSON.stringify({ frames, meta: { image: file, size, cell } }, null, 1) + '\n');
    console.log(`${file}: ${list.length} frames, ${size.w}x${size.h}`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
