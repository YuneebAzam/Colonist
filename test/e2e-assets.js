// Browser test for the sprite renderer (Playwright):
//   node test/e2e-assets.js            atlases load; board drawn from sprites, incl. 6-player colours
//   node test/e2e-assets.js --no-atlas atlases 404 -> procedural board, no page errors
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { chromium } = require('playwright');
process.env.PORT = 0;
const { server } = require('../server');

const NO_ATLAS = process.argv.includes('--no-atlas');
const OUT = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (m) => console.log('  ok  ' + m);

async function waitFor(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(50); }
  throw new Error('timeout waiting');
}
function wsClient(port, name, code) {
  return new Promise(res => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'join', name, code })); res(ws); });
  });
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  if (NO_ATLAS) await page.route('**/atlases/**', r => r.fulfill({ status: 404, body: 'gone' }));
  await page.goto(`http://localhost:${port}`);

  await page.fill('#hostName', 'Hana');
  await page.click('#hostBtn');
  await waitFor(() => page.evaluate(() => UI.state && UI.state.phase === 'lobby'));
  const code = await page.evaluate(() => Net.code);
  await page.evaluate(() => Net.send('update_settings', { settings: { mapVariant: 'extended', maxPlayers: 6 } }));
  await waitFor(() => page.evaluate(() => UI.state.settings.maxPlayers === 6));
  const guests = [];
  for (const n of ['Gus', 'Pia', 'Ola', 'Rex', 'Uma']) guests.push(await wsClient(port, n, code));
  await waitFor(() => page.evaluate(() => UI.state.players.length === 6));
  await page.evaluate(() => Net.send('start_game'));
  await waitFor(() => page.evaluate(() => UI.state.phase === 'setup_1')).catch(async e => { console.log('toasts', await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent)), await page.evaluate(() => UI.state.players.length)); throw e; });

  if (NO_ATLAS) {
    await sleep(1500);
    assert.strictEqual(await page.evaluate(() => Assets.ready), false, 'atlases must not be ready');
    const painted = await page.evaluate(() => {
      const c = document.getElementById('board'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4 * 16) if (d[i] > 0) n++; return n;
    });
    assert(painted > 1000, `procedural board painted (${painted} sampled px)`);
    await page.screenshot({ path: path.join(OUT, 'assets-no-atlas.png') });
    assert.deepStrictEqual(pageErrors, [], 'no page errors');
    const other = consoleErrors.filter(e => !/Failed to load resource/.test(e));
    assert.deepStrictEqual(other, [], 'no console errors besides the blocked atlas requests');
    ok('atlases blocked: board still drawn procedurally, no page errors');
  } else {
    await waitFor(() => page.evaluate(() => Assets.ready));
    ok('sprite atlases load');
    // Inject a 6-player position so every colour, piece kind and knight state is drawn.
    const drawn = await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(UI.state));
      const colors = ['#E53935', '#00B0FF', '#FB8C00', '#ECEFF1', '#2E9D47', '#7B4A2E'];
      const base = s.players[0];
      s.players = colors.map((color, i) => ({ ...base, id: 'p' + i, name: 'P' + i, color,
        settlements: [], cities: [], roads: [], ck: { knights: {}, cityWalls: [], tracks: {} } }));
      const V = s.map.topo.vertices, E = s.map.topo.edges;
      s.players.forEach((p, i) => {
        p.settlements.push(V[i * 8].id); p.cities.push(V[i * 8 + 3].id); p.ck.cityWalls.push(V[i * 8 + 3].id);
        p.roads.push(E[i * 10].id);
        p.ck.knights[V[i * 8 + 5].id] = { rank: (i % 3) + 1, active: i % 2 === 1 };
      });
      s.cnk = true;
      s.ck = { metropolises: { trade: { playerId: 'p0', vertexId: V[3].id } }, merchant: { hexId: 1, playerId: 'p1' } };
      s.robberHex = 0;
      const seen = new Set(); const orig = Assets.draw;
      Assets.draw = function (ctx, id, ...rest) { seen.add(id); return orig.call(this, ctx, id, ...rest); };
      Render.inst.setState(s);
      Assets.draw = orig;
      return [...seen];
    });
    const need = ['hex_wood', 'hex_desert', 'token_6', 'token_robber', 'token_merchant', 'piece_metropolis_trade',
      'piece_settlement_brown', 'piece_city_green', 'piece_city_wall_white', 'piece_road_blue',
      'knight_basic_inactive_red', 'knight_strong_active_blue', 'knight_mighty_inactive_orange', 'knight_basic_active_white',
      'port_3to1', 'port_pier'];
    for (const id of need) assert(drawn.includes(id), `sprite ${id} drawn (drew: ${drawn.join(',')})`);
    await page.screenshot({ path: path.join(OUT, 'assets-6p.png') });
    ok(`board drawn from sprites: ${drawn.length} distinct sprites incl. all 6 colours`);
    assert.deepStrictEqual(pageErrors.concat(consoleErrors.filter(e => !/favicon/.test(e))), [], 'no browser errors');
    ok('no browser console errors');
  }
  for (const g of guests) g.close();
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
