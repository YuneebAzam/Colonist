// HUD region contents, run from test/e2e-layout.js after the layout checks (game is in setup_1).
module.exports = async ({ host, phone, MODE, assert, ok, waitFor }) => {
  const facts = (page) => page.evaluate(() => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
    const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
    return {
      rosterCards: qa('#players .pcard').length,
      activeCards: qa('#players .pcard.turn').length,
      tracks: qa('#players .pc-tracks').filter(shown).map(e => e.textContent.trim()),
      vpBadges: qa('#players .pcard img[src*="hud_victory_point"]').length,
      diceImgs: qa('#dice img').filter(shown).map(i => i.getAttribute('src')),
      limit: (q('#hand .hand-limit') || {}).textContent,
      trays: qa('#hand .tray').filter(shown).length,
      slots: qa('#hand .tray .slot').filter(shown).map(e => e.dataset.res),
      barb: shown(q('#barbarianHud')),
      barbCells: qa('#barbarianHud .bh-cell').length,
      shipCells: qa('#barbarianHud .bh-cell img[src*="hud_barbarian_ship"]').length,
      robberAsleep: !!q('#barbarianHud img[src*="hud_robber_asleep"]'),
      metroChips: qa('#barbarianHud .bh-metro').length,
      strength: (q('#barbarianHud .bh-strength') || {}).textContent,
      primaryInCluster: !!q('#turnCluster #primaryAction'),
      logIcons: qa('#log .l').length,
      logNamesColoured: qa('#log b[style*="color"]').length,
    };
  });
  const f = await facts(host);
  assert.strictEqual(f.rosterCards, 3, 'three roster cards');
  assert.strictEqual(f.activeCards, 1, 'one active-turn card');
  assert.strictEqual(f.vpBadges, 3, 'VP badge per player');
  assert.strictEqual(f.trays, MODE === 'cnk' ? 2 : 1, 'dock trays');
  assert.deepStrictEqual(f.slots, MODE === 'cnk' ? ['wood', 'brick', 'sheep', 'wheat', 'ore', 'paper', 'cloth', 'coin'] : ['wood', 'brick', 'sheep', 'wheat', 'ore'], 'dock slots');
  assert(/^\d+\/\d+$/.test(f.limit || ''), `hand limit badge "${f.limit}"`);
  assert.strictEqual(f.diceImgs.length, MODE === 'cnk' ? 3 : 2, `dice images ${f.diceImgs}`);
  assert(f.diceImgs[0].includes('die_white_') && f.diceImgs[1].includes('die_red_'), 'white + red die');
  assert(f.logNamesColoured >= 1, 'log lines colour player names');
  if (MODE === 'cnk') {
    assert.strictEqual(f.tracks.length, 3, 'track badges on every card');
    assert(f.tracks.every(t => /\d\/\d\/\d/.test(t)), `track text ${f.tracks}`);
    assert(f.diceImgs[2].includes('die_event_'), 'event die');
    assert(f.barb, 'barbarian HUD visible in C&K');
    assert.strictEqual(f.barbCells, 8, '8 barbarian track cells');
    assert.strictEqual(f.shipCells, 1, 'ship in one cell');
    assert(f.robberAsleep, 'robber asleep before the first attack');
    assert.strictEqual(f.metroChips, 3, '3 metropolis chips');
    assert(/^B \d+ vs K \d+$/.test((f.strength || '').trim()), `strength text "${f.strength}"`);
  } else {
    assert.strictEqual(f.tracks.length, 0, 'no track badges in base');
    assert.strictEqual(f.barb, false, 'no barbarian HUD in base');
  }
  const pf = await facts(phone);
  assert.strictEqual(pf.rosterCards, 3, 'phone roster');
  assert.strictEqual(pf.diceImgs.length, MODE === 'cnk' ? 3 : 2, 'phone dice');
  // Pause / Reset in the match bar (host only)
  const vis = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);
  assert(await vis(host, '#pauseBtn') && await vis(host, '#resetBtn'), 'host sees pause + reset');
  assert(!(await vis(phone, '#pauseBtn')) && !(await vis(phone, '#resetBtn')), 'guest does not');
  const live = (page) => page.evaluate(() => [...document.querySelectorAll('#actionButtons button, #primaryAction')]
    .filter(b => !b.disabled && !b.classList.contains('hidden')).length);
  assert((await live(host)) > 0, 'host has live action buttons before pausing');
  await host.locator('#pauseBtn').click();
  await waitFor(() => phone.evaluate(() => UI.state.paused));
  await waitFor(() => vis(phone, '#pausedBanner'));
  await waitFor(async () => (await live(host)) === 0);
  assert.strictEqual((await host.locator('#pauseBtn').textContent()).trim(), '▶', 'pause button flips to resume');
  await host.locator('#pauseBtn').click();
  await waitFor(async () => !(await vis(phone, '#pausedBanner')));
  await waitFor(async () => (await live(host)) > 0);
  await host.locator('#resetBtn').click();
  await waitFor(() => vis(host, '#modal:not(.hidden) #rsConfirm'));
  await host.locator('#modal #rsCancel').click();
  assert.notStrictEqual(await host.evaluate(() => UI.state.phase), 'lobby', 'cancel keeps the game');
  const rolling = await host.evaluate(() => { UI.animateDice({ red: 3, yellow: 4, event: UI.state.cnk ? 'trade' : null }); return document.querySelectorAll('#dice img.die.rolling').length; });
  assert.strictEqual(rolling, MODE === 'cnk' ? 3 : 2, 'dice shake while rolling');
  ok('dice roll animation marks every die as rolling');
  ok('match bar: host pause shows a paused banner to guests, resume clears it; reset asks first');

  ok(`HUD content (${MODE}): roster badges, ${f.trays} dock tray(s) + limit ${f.limit}, ${f.diceImgs.length} dice${MODE === 'cnk' ? ', barbarian track + robber + metropolis chips' : ''}`);
};
