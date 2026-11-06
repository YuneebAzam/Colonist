// Server integration test over real WebSockets: identity binding, rejoin, lobby
// settings (mode switch defaults, VP target), restart, and the turn timer.
const assert = require('assert');
const WebSocket = require('ws');
process.env.PORT = 0;
process.env.CATAN_TIMER_SCALE = '0.01';
const { server, rooms } = require('../server');

function client(port) {
  return new Promise(res => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const c = { ws, state: null, joined: null, errors: [], waiters: [] };
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.type === 'state') c.state = m.state;
      if (m.type === 'joined') c.joined = m;
      if (m.type === 'error') c.errors.push(m.message);
      c.waiters = c.waiters.filter(w => !w(m));
    });
    c.send = (type, extra = {}) => ws.send(JSON.stringify({ type, ...extra }));
    c.next = (pred) => new Promise((r, j) => {
      const t = setTimeout(() => j(new Error('timeout waiting')), 4000);
      c.waiters.push(m => { if (pred(m)) { clearTimeout(t); r(m); return true; } return false; });
    });
    ws.on('open', () => res(c));
  });
}
const isState = m => m.type === 'state';
const isErr = m => m.type === 'error';

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  let ok = 0;
  const step = (name) => { ok++; console.log('  ok  ' + name); };

  const host = await client(port), bob = await client(port), eve = await client(port);
  host.send('create', { name: 'Host', code: 'TEST1', settings: { mode: 'base', mapVariant: 'classic', vpTarget: 15 } });
  await host.next(isState);
  assert.strictEqual(host.state.settings.vpTarget, 15);
  step('create room with custom VP target 15');

  bob.send('join', { code: 'test1', name: 'Bob' }); await bob.next(isState);
  eve.send('join', { code: 'TEST1', name: 'Eve' }); await eve.next(isState);
  await host.next(isState);

  // Eve tries to start the game by spoofing the host's playerId
  eve.send('start_game', { playerId: host.joined.playerId });
  const err = await eve.next(isErr);
  assert.match(err.message, /only the host/);
  assert.strictEqual(rooms.get('TEST1').game.phase, 'lobby');
  step('spoofed playerId cannot act as another player');

  // Non-host cannot change settings
  eve.send('update_settings', { settings: { vpTarget: 12 } });
  await eve.next(isErr);
  step('only host can change settings');

  // Mode switch resets VP to the mode default and rebuilds the game; players kept
  host.send('update_settings', { settings: { mode: 'cnk' } });
  await host.next(m => isState(m) && m.state.mode === 'cnk');
  assert.strictEqual(host.state.settings.vpTarget, 13);
  assert.strictEqual(host.state.players.length, 3);
  host.send('update_settings', { settings: { mode: 'base' } });
  await host.next(m => isState(m) && m.state.mode === 'base');
  assert.strictEqual(host.state.settings.vpTarget, 10);
  host.send('update_settings', { settings: { vpTarget: 17, discardLimit: 9, turnTimer: 30, maxPlayers: 4 } });
  await host.next(m => isState(m) && m.state.settings.vpTarget === 17);
  assert.deepStrictEqual([host.state.settings.discardLimit, host.state.settings.turnTimer], [9, 30]);
  step('mode switch applies defaults (C&K 13, base 10); custom settings stick');

  // Max players below current count is rejected
  host.send('update_settings', { settings: { maxPlayers: 2 } });
  await host.next(m => isState(m) && m.state.settings.maxPlayers === 3);
  const extra = await client(port);
  extra.send('join', { code: 'TEST1', name: 'Extra' });
  assert.match((await extra.next(isErr)).message, /full/);
  host.send('update_settings', { settings: { maxPlayers: 4 } });
  await host.next(m => isState(m) && m.state.settings.maxPlayers === 4);
  step('max players clamps to 3..map max and blocks extra joins');

  host.send('start_game');
  await host.next(m => isState(m) && m.state.phase === 'setup_1');
  assert.strictEqual(rooms.get('TEST1').game.vpTarget, 17);
  assert.ok(host.state.deadline > Date.now(), 'turn timer running');
  step('start game: VP target 17 reaches the engine, timer deadline is broadcast');

  // A late joiner is rejected; Bob disconnects and rejoins with his token
  const late = await client(port);
  late.send('join', { code: 'TEST1', name: 'Late' });
  assert.match((await late.next(isErr)).message, /already started/);
  const bobToken = bob.joined.token, bobId = bob.joined.playerId;
  bob.ws.close();
  await host.next(m => isState(m) && m.state.players.find(p => p.id === bobId).connected === false);
  const bob2 = await client(port);
  bob2.send('rejoin', { code: 'TEST1', token: 'wrong' });
  await bob2.next(isErr);
  bob2.send('rejoin', { code: 'TEST1', token: bobToken });
  const j = await bob2.next(m => m.type === 'joined');
  assert.strictEqual(j.playerId, bobId);
  await bob2.next(isState);
  assert.ok(bob2.state.players.find(p => p.id === bobId).connected);
  step('rejoin requires the secret token and restores the same player');

  // Setup actions by the wrong player are rejected
  const cur = host.state.currentPlayerId;
  const notCur = [host, bob2, eve].find(c => c.joined.playerId !== cur);
  notCur.send('end_setup');
  assert.match((await notCur.next(isErr)).message, /not your turn/);
  step('turn order enforced server-side');

  // Restart: back to a fresh lobby with same players + settings
  rooms.get('TEST1').game.players[0].hand.r.ore = 5;
  host.send('restart');
  await host.next(m => isState(m) && m.state.phase === 'lobby');
  const g = rooms.get('TEST1').game;
  assert.strictEqual(g.vpTarget, 17);
  assert.strictEqual(g.players.length, 3);
  assert.ok(g.players.every(p => p.roads.length === 0 && p.settlements.length === 0 && p.hand.r.ore === 0));
  assert.strictEqual(g.tradeHistory.length, 0);
  step('restart returns to a clean lobby (no carried-over state), settings kept');

  // Turn timer (CATAN_TIMER_SCALE=0.01 makes 30s -> 300ms): nobody acts, the timer plays for them.
  host.send('update_settings', { settings: { turnTimer: 30 } });
  await host.next(isState);
  host.send('start_game');
  await host.next(m => isState(m) && m.state.phase === 'setup_1');
  await host.next(m => isState(m) && m.state.phase === 'roll');   // all setup auto-placed
  const g2 = rooms.get('TEST1').game;
  assert.ok(g2.players.every(p => p.settlements.length + p.cities.length === 2 && p.roads.length === 2));
  await host.next(m => isState(m) && m.state.phase === 'main' || m.state?.turnNumber > 1);
  await host.next(m => isState(m) && m.state.turnNumber >= 2);   // auto-rolled, then auto-ended
  step('turn timer auto-places setup, auto-rolls and auto-ends idle turns');

  // ---- Pause / resume (host only), timer frozen while paused, remaining time restored
  eve.send('pause');
  assert.match((await eve.next(isErr)).message, /only the host can pause/);
  step('pause: non-host rejected');

  await host.next(isState);
  host.send('pause');
  const paused = await host.next(m => isState(m) && m.state.paused);
  assert.strictEqual(paused.state.deadline, null, 'no deadline while paused');
  const room = rooms.get('TEST1');
  const remaining = room.paused.remainingMs;
  assert.ok(remaining > 0 && remaining <= 300 + 5, `remaining ${remaining}ms of a 300ms turn`);
  const curC = [host, bob2, eve].find(c => c.joined.playerId === paused.state.currentPlayerId);
  curC.send(paused.state.phase === 'roll' ? 'roll' : 'end_turn');
  assert.match((await curC.next(isErr)).message, /game is paused/);
  step('pause: deadline cleared, game actions rejected while paused');

  const frozen = { turn: room.game.turnNumber, phase: room.game.phase };
  await new Promise(r => setTimeout(r, 1000)); // > 3x the scaled 300ms timer
  assert.deepStrictEqual({ turn: room.game.turnNumber, phase: room.game.phase }, frozen, 'timer did not act while paused');
  host.send('chat', { text: 'still here' });
  await host.next(m => m.type === 'chat');
  step('pause: turn timer frozen; chat still works');

  host.send('resume');
  const resumed = await host.next(m => isState(m) && !m.state.paused);
  assert.ok(resumed.state.deadline, 'deadline back after resume');
  assert.ok(resumed.state.deadline - resumed.state.serverNow <= remaining + 50,
    `resume restores the remaining ${remaining}ms, not a fresh timer (${resumed.state.deadline - resumed.state.serverNow}ms)`);
  step('resume: remaining turn time restored');

  host.send('pause');
  await host.next(m => isState(m) && m.state.paused);
  host.send('restart');
  const fresh = await host.next(m => isState(m) && m.state.phase === 'lobby');
  assert.ok(!fresh.state.paused && !rooms.get('TEST1').paused, 'restart clears pause');
  host.send('pause');
  assert.match((await host.next(isErr)).message, /not running/);
  step('restart clears pause; cannot pause in the lobby');

  console.log(`\n${ok} server tests passed`);
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
