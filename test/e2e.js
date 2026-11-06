// Browser end-to-end test (Playwright): 3 real browser pages play through the UI.
//   node test/e2e.js [base|cnk] [outDir]
// Covers: host settings slider + mode defaults, lobby settings sync, setup by clicking the
// canvas, rolling, prompts (discard / robber / steal), building, bank trade, a forced
// endgame that wins through the UI at a custom VP target, and "New game" reset.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
process.env.PORT = 0;
const { server, rooms } = require('../server');

const MODE = process.argv[2] || 'base';
const OUT = process.argv[3] || path.join(__dirname, 'e2e-shots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, `${MODE}-${name}.png`) }); }

// Click a pickable board target (vertex/edge/hex) chosen from the renderer's live filter.
async function clickTarget(page, pick = 'first') {
  const pt = await page.evaluate((pick) => {
    const r = Render.inst; if (!r.pick) return null;
    const topo = r.state.map.topo; const cands = [];
    if (r.pick.kind === 'vertex') for (const v of topo.vertices) { if (r.pick.filter(v)) { const p = r.toScreen(v.x, v.y); cands.push({ ...p, score: v.hexes.length }); } }
    if (r.pick.kind === 'edge') for (const e of topo.edges) { if (r.pick.filter(e)) { const a = topo.vertices[e.a], b = topo.vertices[e.b]; const p = r.toScreen((a.x + b.x) / 2, (a.y + b.y) / 2); cands.push({ ...p, score: 0 }); } }
    if (r.pick.kind === 'hex') for (const h of topo.hexes) { if (r.pick.filter(h)) { const p = r.toScreen(h.x, h.y); cands.push({ ...p, score: h.num ? 6 - Math.abs(7 - h.num) : 0 }); } }
    if (!cands.length) return null;
    const rect = r.canvas.getBoundingClientRect();
    // only targets on screen, best-scored first
    const vis = cands.filter(c => c.x > 10 && c.y > 10 && c.x < rect.width - 10 && c.y < rect.height - 10);
    const list = (vis.length ? vis : cands).sort((a, b) => b.score - a.score);
    const c = pick === 'random' ? list[Math.floor(Math.random() * list.length)] : list[0];
    return { x: rect.left + c.x, y: rect.top + c.y };
  }, pick);
  if (!pt) throw new Error('no pickable target');
  await page.mouse.click(pt.x, pt.y);
}

async function state(page) { return page.evaluate(() => UI.state); }
async function myId(page) { return page.evaluate(() => Net.playerId); }
async function clickButton(page, text) {
  const b = page.locator('#actionButtons button', { hasText: text }).first();
  await b.click();
}
async function waitFor(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(50); }
  throw new Error('timeout: ' + fn.toString().slice(0, 120));
}

// Resolve whatever choice this page is being asked for, through the UI.
async function resolvePrompts(pages) {
  for (let round = 0; round < 20; round++) {
    let any = false;
    for (const page of pages) {
      const s = await state(page); const me = await myId(page);
      const pr = (s.prompts || []).find(p => p.playerId === me);
      if (!pr) continue;
      any = true;
      const modalOpen = await page.locator('#modal:not(.hidden)').count();
      const picking = await page.evaluate(() => !!Render.inst.pick);
      if (!modalOpen && !picking) { await page.locator('#turnStatus').click(); await sleep(80); }
      if (pr.kind === 'discard' || pr.kind === 'give' || pr.kind === 'take_cards') {
        // Card picker: only cards you hold are shown; tap a stack to move one card to the pile.
        const shown = await page.evaluate(() => [...document.querySelectorAll('#modal .cp-hand .cp-stack')].map(e => e.dataset.k));
        if (pr.kind === 'discard') {
          const h = await page.evaluate(() => UI.me.hand);
          const held = Object.entries({ ...h.r, ...h.c }).filter(([, n]) => n > 0).map(([k]) => k);
          assert.deepStrictEqual(shown.slice().sort(), held.sort(), 'discard shows exactly the cards you hold');
          assert(await page.locator('#modal .cp-hand .cp-stack img').first().isVisible(), 'cards shown with their art');
        }
        for (let i = 0; i < pr.count; i++) {
          await page.locator('#modal .cp-hand .cp-stack:not([disabled])').first().click();
        }
        assert.strictEqual(await page.locator('#modal .cp-pile .cp-card').count(), pr.count, 'picked cards land in the pile');
        if (pr.kind === 'discard' && !global.__pileShot) { global.__pileShot = 1; await shot(page, '05b-discard-picked'); }
        if (pr.count > 0) {
          await page.locator('#modal .cp-pile .cp-card').first().click();          // tap a picked card: it goes back
          assert.strictEqual(await page.locator('#modal .cp-pile .cp-card').count(), pr.count - 1, 'tap returns a card');
          assert(await page.locator('#scOk').isDisabled(), 'confirm waits for the full count');
          await page.locator('#modal .cp-hand .cp-stack:not([disabled])').first().click();
        }
        await page.locator('#scOk').click();
      } else if (['robber', 'move_knight', 'treason_remove', 'free_road'].includes(pr.kind)) {
        await clickTarget(page);
      } else {
        await page.locator('#modal .chip').first().click();
      }
      await sleep(150);
    }
    if (!any) return;
  }
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  const mkPage = async (w = 1280, h = 820) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    return page;
  };
  const host = await mkPage();
  const ok = (m) => console.log('  ok  ' + m);

  // ---- Home: advanced settings + VP slider ----
  await host.fill('#hostName', 'Hana');
  const vpVal = () => host.locator('#hostSettings [data-value="vpTarget"]').textContent();
  assert.strictEqual(await vpVal(), '10');
  await host.locator('#modeRow .mode-opt[data-mode="cnk"]').click();
  assert.strictEqual(await vpVal(), '13');
  await host.locator('#modeRow .mode-opt[data-mode="base"]').click();
  assert.strictEqual(await vpVal(), '10');
  ok('mode switch sets VP default (base 10 / C&K 13)');
  // every integer 10..20 via keyboard on the slider
  const slider = host.locator('#hostSettings [data-range="vpTarget"]');
  await slider.focus();
  for (let v = 11; v <= 20; v++) { await host.keyboard.press('ArrowRight'); assert.strictEqual(await vpVal(), String(v)); }
  await host.keyboard.press('ArrowRight'); assert.strictEqual(await vpVal(), '20', 'max 20');
  for (let i = 0; i < 15; i++) await host.keyboard.press('ArrowLeft');
  assert.strictEqual(await vpVal(), '10', 'min 10');
  ok('VP slider steps through every value 10..20 and stops at both ends');
  if (MODE === 'cnk') await host.locator('#modeRow .mode-opt[data-mode="cnk"]').click();
  const target = MODE === 'cnk' ? 14 : 11;
  await slider.focus();
  const startVal = +(await vpVal());
  for (let i = startVal; i < target; i++) await host.keyboard.press('ArrowRight');
  assert.strictEqual(await vpVal(), String(target));
  await host.locator('#hostSettings [data-range="discardLimit"]').focus();
  await host.keyboard.press('ArrowRight');  // 8
  await host.locator('#hostSettings [data-range="turnTimer"]').focus();
  for (let i = 0; i < 6; i++) await host.keyboard.press('ArrowRight'); // 300s
  await shot(host, '01-home-settings');
  await host.click('#hostBtn');
  await waitFor(async () => (await state(host)) && (await state(host)).phase === 'lobby');
  let s = await state(host);
  assert.deepStrictEqual([s.settings.vpTarget, s.settings.discardLimit, s.settings.turnTimer, s.mode], [target, 8, 300, MODE]);
  ok(`room created with settings from the panel (VP ${target}, discard 8, timer 5 min, ${MODE})`);

  // ---- Guests join ----
  const code = await host.evaluate(() => Net.code);
  const g1 = await mkPage(), g2 = await mkPage(390, 844); // second guest on a phone-sized screen
  for (const [p, n] of [[g1, 'Gus'], [g2, 'Pia']]) {
    await p.click('[data-tab="join"]');
    await p.fill('#joinName', n); await p.fill('#joinCode', code);
    await p.click('#joinBtn');
  }
  await waitFor(async () => (await state(host)).players.length === 3);
  // host bumps VP in lobby; guests see it
  await host.locator('#lobbySettings [data-range="vpTarget"]').focus();
  await host.keyboard.press('ArrowRight');
  await waitFor(async () => (await state(g1)).settings.vpTarget === target + 1);
  await host.keyboard.press('ArrowLeft');
  await waitFor(async () => (await state(g2)).settings.vpTarget === target);
  assert.strictEqual(await g1.locator('#lobbySettings [data-range="vpTarget"]').isDisabled(), true);
  ok('lobby: host edits settings live; guests see them read-only');
  await shot(host, '02-lobby'); await shot(g2, '02-lobby-phone');

  await host.locator('#lpStart').click();
  await waitFor(async () => (await state(host)).phase === 'setup_1');
  const pages = [host, g1, g2];
  global.__pages = pages;
  const byId = async (id) => { for (const p of pages) if (await myId(p) === id) return p; };

  for (const p of pages) await waitFor(() => p.evaluate(() => Assets.ready));
  ok('sprite atlases loaded on every page');

  // ---- Setup through the canvas ----
  while (['setup_1', 'setup_2'].includes((await state(host)).phase)) {
    const cur = await byId((await state(host)).currentPlayerId);
    // Touch placement: the valid spots are already showing — tap one, then tap a road; it confirms itself.
    const placed = (t) => t.players.reduce((a, p) => a + p.roads.length, 0);
    const before = placed(await state(host));
    await waitFor(() => cur.evaluate(() => Render.inst.pick && Render.inst.pick.kind === 'vertex'));
    await clickTarget(cur);
    await waitFor(() => cur.evaluate(() => Render.inst.pick && Render.inst.pick.kind === 'edge'));
    await clickTarget(cur);
    await waitFor(async () => { const t = await state(host); return placed(t) === before + 1 && (t.phase === 'roll' || t.setupState.building == null); });
    await sleep(120);
  }
  assert.strictEqual(await host.locator('#actionButtons button', { hasText: /Place|Confirm/ }).count(), 0, 'no place/confirm buttons');
  ok('setup by touch: spots shown automatically, tap settlement then road, auto-confirmed');
  s = await state(host);
  assert.strictEqual(s.phase, 'roll');
  for (const p of s.players) assert.strictEqual(p.settlements.length + p.cities.length, 2);
  if (MODE === 'cnk') assert.ok(s.players.every(p => p.cities.length === 1), 'C&K: second placement is a city');
  ok('setup completed by clicking the board' + (MODE === 'cnk' ? ' (cities in round 2)' : ''));
  await shot(host, '03-after-setup');

  // ---- A few real turns: roll, resolve prompts, build if possible, bank trade, end ----
  const room = rooms.get(code);
  for (let turn = 0; turn < 8; turn++) {
    s = await state(host);
    const cur = await byId(s.currentPlayerId);
    await cur.locator('#dice').click();
    await waitFor(async () => (await state(cur)).rollSeq > s.rollSeq);
    await sleep(700);
    await resolvePrompts(pages);
    await waitFor(async () => !(await state(cur)).busy);
    // give the current player a road's worth and build it through the UI
    const gp = room.game.current();
    gp.hand.r.wood += 1; gp.hand.r.brick += 1; room.game.pushLog('(test) +road');
    await cur.evaluate(() => Net.send('chat', { text: 'tick' })); // harmless round trip
    await cur.evaluate(() => 0);
    // trigger fresh state via a no-op-ish request: open bank modal reflects new hand after next broadcast
    await cur.evaluate(() => Net.send('trade_cancel'));
    await waitFor(async () => { const st = await state(cur); const me = st.players.find(p => p.id === st.currentPlayerId); return me.hand && me.hand.r.wood >= 1 && me.hand.r.brick >= 1; });
    const roadsBefore = (await state(cur)).players.find(p => p.id === s.currentPlayerId).roads.length;
    await cur.locator('#actionButtons .action-build', { hasText: 'Road' }).click();
    await clickTarget(cur);
    await waitFor(async () => (await state(cur)).players.find(p => p.id === s.currentPlayerId).roads.length === roadsBefore + 1);
    if (turn === 1) {
      gp.hand.r.ore += 4; await cur.evaluate(() => Net.send('trade_cancel'));
      await sleep(150);
      await clickButton(cur, 'Bank');
      await cur.locator('#modal .chip[data-g="ore"]').click();
      await cur.locator('#modal .chip[data-t="wheat"]').click();
      await cur.locator('#tConfirm').click();
      await waitFor(async () => (await state(cur)).tradeHistory.some(h => h.kind === 'bank'));
      ok('bank trade through the modal');
    }
    if (turn === 2) { await shot(cur, '04-midgame'); await shot(g2, '04-midgame-phone'); }
    if (turn === 3) {
      // Player trade through the card-art composer and offer panel: one guest declines, one accepts.
      const others = room.game.players.filter(p => p.id !== gp.id);
      gp.hand.r.sheep += 1; others[0].hand.r.ore += 1;
      await cur.evaluate(() => Net.send('trade_cancel'));
      await waitFor(async () => (await state(cur)).players.find(p => p.id === gp.id).hand.r.sheep >= 1);
      await clickButton(cur, 'Trade');
      await cur.locator('#modal [data-market="ore"]').click();
      await cur.locator('#modal [data-hand="sheep"]').click();
      assert.strictEqual(await cur.locator('#modal .tr-row-get .tr-c[data-k="ore"] i').textContent(), '1', 'asked-for card shows a count');
      assert.strictEqual(await cur.locator('#modal [data-market="sheep"]').isDisabled(), true, 'cannot ask for a type you offer');
      await shot(cur, '04b-trade-compose');
      await cur.locator('#tcSend').click();
      const accepter = await byId(others[0].id), decliner = await byId(others[1].id);
      await waitFor(() => accepter.locator('#tradeBar #tAccept').isVisible());
      assert.strictEqual(await accepter.locator('#tradeBar .tr-row-get .tr-c img[alt="sheep"]').count(), 1, 'guest sees what they get');
      await decliner.locator('#tradeBar #tReject').click();
      await waitFor(async () => (await cur.locator(`#tradeBar .tr-p[data-pid="${others[1].id}"]`).getAttribute('data-st')) === 'decline');
      await accepter.locator('#tradeBar #tAccept').click();
      await waitFor(async () => (await cur.locator(`#tradeBar .tr-p[data-pid="${others[0].id}"]`).getAttribute('data-st')) === 'accept');
      await shot(cur, '04c-trade-offer'); await shot(accepter, '04d-trade-incoming');
      await cur.locator(`#tradeBar .tr-p[data-pid="${others[0].id}"]`).click();
      await waitFor(async () => (await state(cur)).tradeHistory.some(h => h.kind === 'p2p'));
      await waitFor(async () => (await cur.locator('#tradeBar').count()) === 0);
      ok('player trade with card art: compose, decline shows ✗, accept shows ✓, confirm trades');
    }
    await cur.locator('#endTurnBtn').click();
    await waitFor(async () => (await state(host)).currentPlayerId !== s.currentPlayerId);
  }
  ok('8 turns played through the UI: roll, prompts, road building, end turn');

  // ---- Forced 7: discard + robber + steal via UI ----
  s = await state(host);
  {
    const cur = await byId(s.currentPlayerId);
    const g = room.game;
    for (const p of g.players) if (p.id !== s.currentPlayerId) p.hand.r.sheep += 10;
    g.alchemyDice = { red: 3, yellow: 4 };
    if (MODE === 'cnk') { g.robberActive = true; g.robberHex = g.robberHome ?? 0; }
    await cur.locator('#dice').click();
    await waitFor(async () => (await state(host)).prompts.length > 0);
    await shot(await byId(g.players.find(p => p.id !== s.currentPlayerId).id), '05-discard-prompt');
    await resolvePrompts(pages);
    await waitFor(async () => !(await state(host)).busy);
    assert.ok(g.players.every(p => p.id === s.currentPlayerId || require('../src/game').cardCount(p.hand) <= g.handLimit(p) + 6));
    ok('rolling a 7: discards + robber + steal resolved through the UI');
    await cur.locator('#endTurnBtn').click();
    await waitFor(async () => (await state(host)).currentPlayerId !== s.currentPlayerId);
  }

  // ---- C&K specific: recruit + activate a knight, improve a track, play a progress card ----
  if (MODE === 'cnk') {
    s = await state(host);
    const cur = await byId(s.currentPlayerId);
    await cur.locator('#dice').click();
    await waitFor(async () => (await state(host)).phase === 'main');
    await resolvePrompts(pages); await waitFor(async () => !(await state(host)).busy);
    const gp = room.game.current();
    Object.assign(gp.hand.r, { sheep: gp.hand.r.sheep + 1, ore: gp.hand.r.ore + 1, wheat: gp.hand.r.wheat + 1 });
    gp.hand.c.cloth += 1;
    gp.ck.progress.push('irrigation');
    // A barbarian attack may already have reduced this player's only city; improvements need one.
    if (!gp.cities.length && gp.settlements.length) gp.cities.push(gp.settlements.pop());
    await cur.evaluate(() => Net.send('trade_cancel'));
    await sleep(200);
    await cur.locator('#actionButtons .action-build', { hasText: 'Knight' }).click();
    await clickTarget(cur);
    await waitFor(async () => Object.keys((await state(cur)).players.find(p => p.id === gp.id).ck.knights).length === 1);
    await clickButton(cur, 'Knights');
    await cur.locator('#modal [data-a="activate"]').first().click();
    await waitFor(async () => Object.values((await state(cur)).players.find(p => p.id === gp.id).ck.knights)[0].active);
    await clickButton(cur, 'Improve');
    await cur.locator('#modal .chip[data-t="trade"]').click();
    await waitFor(async () => (await state(cur)).players.find(p => p.id === gp.id).ck.tracks.trade === 1);
    const wheat0 = gp.hand.r.wheat;
    await clickButton(cur, 'Progress');
    await cur.locator('#modal [data-play="irrigation"]').click();
    await waitFor(async () => !gp.ck.progress.includes('irrigation'));
    await shot(cur, '06-cnk-knight-improve');
    ok(`C&K through the UI: recruit + activate knight, trade level 1, Irrigation (+${gp.hand.r.wheat - wheat0} wheat)`);
    await cur.locator('#endTurnBtn').click();
    await waitFor(async () => (await state(host)).currentPlayerId !== s.currentPlayerId);
  }

  // ---- Endgame: put the current player at target-1, upgrade a city through the UI to win ----
  s = await state(host);
  {
    const g = room.game;
    const cur = await byId(s.currentPlayerId);
    await cur.locator('#dice').click();
    await waitFor(async () => (await state(host)).rollSeq > s.rollSeq);
    await resolvePrompts(pages); await waitFor(async () => !(await state(host)).busy && (await state(host)).phase === 'main');
    const p = g.current();
    const free = g.map.topo.vertices.filter(v => g.canPlaceBuildingAt(v.id)).map(v => v.id);
    while (g.computeVP(p) < g.vpTarget - 1) {
      if (MODE === 'cnk') p.ck.defenders++; else p.newDevCards.push('vp');
    }
    if (!p.settlements.length) { p.settlements.push(free[0]); while (g.computeVP(p) > g.vpTarget - 1) MODE === 'cnk' ? p.ck.defenders-- : p.newDevCards.pop(); }
    Object.assign(p.hand.r, { wheat: 2, ore: 3 });
    await cur.evaluate(() => Net.send('trade_cancel'));
    await sleep(200);
    assert.strictEqual(g.phase, 'main', 'not over at target-1');
    await cur.locator('#actionButtons .action-build', { hasText: /^\s*\S*City\s*\d/ }).first().click();
    await clickTarget(cur);
    await waitFor(async () => (await state(host)).phase === 'end');
    s = await state(host);
    assert.strictEqual(s.winner, p.id);
    assert.strictEqual(s.players.find(x => x.id === p.id).vp, s.vpTarget);
    await waitFor(async () => (await host.locator('#lobbyPanel:not(.hidden) .lp-title').count()) > 0);
    await shot(host, '07-winner');
    ok(`game won through the UI at exactly the custom target (${s.vpTarget} VP); results screen shown`);
  }

  // ---- New game resets everything but keeps players + settings ----
  const hostIsHost = await host.evaluate(() => UI.state.hostId === Net.playerId);
  assert.ok(hostIsHost);
  await host.locator('#lpRestart').click();
  await waitFor(async () => (await state(host)).phase === 'lobby');
  s = await state(host);
  assert.strictEqual(s.vpTarget, target);
  assert.ok(s.players.every(p => p.roads.length === 0 && p.handCount === 0 && p.vp === 0));
  assert.strictEqual(s.tradeHistory.length, 0);
  ok('New game: clean lobby, same players and settings');

  // ---- Reload + rejoin ----
  await g1.reload();
  await g1.locator('#rejoinBtn:not(.hidden)').click();
  await waitFor(async () => (await state(g1)) && (await state(g1)).players.length === 3);
  ok('reloaded tab rejoins its seat');

  const relevant = errors.filter(e => !/favicon|ERR_NAME|fonts\.g/.test(e));
  if (relevant.length) { console.log('Browser errors:', relevant); process.exitCode = 1; }
  else ok('no browser console errors');
  await browser.close();
  process.exit(process.exitCode || 0);
})().catch(async e => {
  console.error('FAIL', e);
  try { for (const [i, p] of (global.__pages || []).entries()) { await p.screenshot({ path: path.join(OUT, `${MODE}-fail-${i}.png`) }); console.log('toasts', i, await p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent))); } } catch {}
  process.exit(1);
});
