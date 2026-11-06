// HUD layout test (Playwright): desktop 1280x720 host + an iPhone 13 guest + a socket guest.
//   node test/e2e-layout.js [base|cnk]
// Checks the perimeter HUD regions exist, don't overlap on desktop, leave the board centre clear,
// cause no horizontal scroll, hide C&K-only regions in base, and fill with the right content.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { chromium, devices } = require('playwright');
process.env.PORT = 0;
const { server } = require('../server');

const MODE = process.argv[2] || 'base';
const OUT = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (m) => console.log('  ok  ' + m);
async function waitFor(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(50); }
  throw new Error('timeout waiting');
}

const DESKTOP_REGIONS = ['#matchHeader', '#zoomCtl', '#players', '#logChat', '#hud', '#turnCluster'];

async function layoutFacts(page) {
  return page.evaluate((ids) => {
    const vis = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : false; };
    const out = { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, innerH: innerHeight, rects: {} };
    for (const id of [...ids, '#barbarianHud', '#chatToggle']) out.rects[id] = vis(id);
    const c = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    out.centre = c ? (c.id || c.className) : null;
    out.mode = document.getElementById('screen-game').dataset.mode;
    return out;
  }, DESKTOP_REGIONS);
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, url = `http://localhost:${port}`;
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errors.push(m.text()); }); };
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); watch(host);
  await host.goto(url);
  await host.fill('#hostName', 'Hana');
  if (MODE === 'cnk') await host.locator('#modeRow .mode-opt[data-mode="cnk"]').click();
  await host.click('#hostBtn');
  await waitFor(() => host.evaluate(() => UI.state && UI.state.phase === 'lobby'));
  const code = await host.evaluate(() => Net.code);
  const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage(); watch(phone);
  await phone.goto(url);
  await phone.click('[data-tab="join"]'); await phone.fill('#joinName', 'Pia'); await phone.fill('#joinCode', code); await phone.click('#joinBtn');
  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'join', name: 'Gus', code }));
  await waitFor(() => host.evaluate(() => UI.state.players.length === 3));
  await host.evaluate(() => Net.send('start_game'));
  await waitFor(() => host.evaluate(() => UI.state.phase === 'setup_1'));
  await waitFor(() => phone.evaluate(() => UI.state && UI.state.phase === 'setup_1'));
  await sleep(400);

  // ---- desktop
  const d = await layoutFacts(host);
  assert.strictEqual(d.mode, MODE, 'screen-game data-mode');
  assert(d.scrollW <= d.innerW, `desktop horizontal scroll (${d.scrollW} > ${d.innerW})`);
  for (const id of DESKTOP_REGIONS) assert(d.rects[id], `desktop: ${id} visible`);
  if (MODE === 'base') assert.strictEqual(d.rects['#barbarianHud'], false, 'base: barbarian HUD hidden');
  const shown = [...DESKTOP_REGIONS, '#barbarianHud'].filter(id => d.rects[id]);
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
    assert(!overlap(d.rects[shown[i]], d.rects[shown[j]]), `desktop: ${shown[i]} overlaps ${shown[j]} ${JSON.stringify([d.rects[shown[i]], d.rects[shown[j]]])}`);
  }
  assert.strictEqual(d.centre, 'board', `desktop: board centre covered by ${d.centre}`);
  await host.screenshot({ path: path.join(OUT, `layout-${MODE}-desktop.png`) });
  ok(`desktop 1280x720 (${MODE}): ${shown.length} HUD regions, no overlap, board centre clear, no h-scroll`);

  // ---- phone
  const p = await layoutFacts(phone);
  assert(p.scrollW <= p.innerW, `phone horizontal scroll (${p.scrollW} > ${p.innerW})`);
  for (const id of ['#matchHeader', '#players', '#hud', '#turnCluster', '#chatToggle']) assert(p.rects[id], `phone: ${id} visible`);
  assert.strictEqual(p.rects['#logChat'], false, 'phone: log/chat collapsed');
  if (MODE === 'base') assert.strictEqual(p.rects['#barbarianHud'], false, 'phone base: barbarian HUD hidden');
  assert.strictEqual(p.centre, 'board', `phone: board centre covered by ${p.centre}`);
  await phone.screenshot({ path: path.join(OUT, `layout-${MODE}-phone.png`) });
  await phone.locator('#chatToggle').click();
  await waitFor(async () => (await layoutFacts(phone)).rects['#logChat']);
  await phone.screenshot({ path: path.join(OUT, `layout-${MODE}-phone-chat.png`) });
  await phone.locator('#chatToggle').click();
  await waitFor(async () => (await layoutFacts(phone)).rects['#logChat'] === false);
  ok(`phone (${MODE}): strip roster, collapsed chat drawer opens/closes, board centre clear, no h-scroll`);

  // ---- phone host: host-only buttons + an 8-character code must not slide under the zoom pill
  for (const width of [360, 375]) {
    const ph = await (await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage(); watch(ph);
    await ph.goto(url);
    await ph.fill('#hostName', 'Hal'); await ph.fill('#hostCode', `LONGCD${width % 100}`);
    await ph.click('#hostBtn');
    await waitFor(() => ph.evaluate(() => UI.state && UI.state.phase === 'lobby'));
    const c2 = await ph.evaluate(() => Net.code);
    const extra = [];
    for (const n of ['A1', 'B2']) { const w2 = new WebSocket(`ws://localhost:${port}`); await new Promise(r => w2.on('open', r)); w2.send(JSON.stringify({ type: 'join', name: n, code: c2 })); extra.push(w2); }
    await waitFor(() => ph.evaluate(() => UI.state.players.length === 3));
    await ph.evaluate(() => Net.send('start_game'));
    await waitFor(() => ph.evaluate(() => UI.state.phase === 'setup_1'));
    await sleep(300);
    const hits = await ph.evaluate(() => ['#pauseBtn', '#resetBtn', '#copyLink', '#rulesBtn2', '#chatToggle', '#zoomIn', '#zoomOut', '#zoomFit'].map(sel => {
      const r = document.querySelector(sel).getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return [sel, hit && (hit.closest(sel) ? 'ok' : (hit.id || hit.className))];
    }));
    for (const [sel, hit] of hits) assert.strictEqual(hit, 'ok', `phone host ${width}px: ${sel} covered by ${hit}`);
    const sw = await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(sw, `phone host ${width}px: horizontal scroll`);
    await ph.screenshot({ path: path.join(OUT, `layout-${MODE}-phone-host-${width}.png`) });
    for (const w2 of extra) w2.close();
    await ph.context().close();
  }
  ok('phone host at 360/375px with an 8-character code: every header and zoom button is tappable');

  // ---- content (Task 8 extends this block)
  const contentFile = path.join(__dirname, 'e2e-layout-content.js');
  if (fs.existsSync(contentFile)) await require(contentFile)({ host, phone, MODE, assert, ok, waitFor, sleep, OUT });

  assert.deepStrictEqual(errors, [], 'no browser errors');
  ok('no browser console errors');
  ws.close(); await browser.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
