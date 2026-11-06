// Sidebar, hand, action buttons, modal prompts. Exposes window.UI.
(function () {
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const COMM = ['paper', 'cloth', 'coin'];
  const TRACKS = ['trade', 'politics', 'science'];
  const TRACK_COMM = { trade: 'cloth', politics: 'coin', science: 'paper' };
  const TRACK_ABILITY = {
    trade: 'Merchant Guild: trade 2 identical commodities for any 1 card',
    politics: 'Fortress: promote strong knights to mighty',
    science: 'Aqueduct: a free resource when a roll gives you nothing',
  };
  const C_PIECES = { roads: 15, settlements: 5, cities: 4 };
  const COSTS = {
    road:   { wood: 1, brick: 1 },
    settle: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city:   { wheat: 2, ore: 3 },
    dev:    { sheep: 1, wheat: 1, ore: 1 },
    knight: { sheep: 1, ore: 1 },
    wall:   { brick: 2 },
  };
  // Card rules text lives in cardtext.js (shared with the asset generator).
  const DEV_INFO = CardText.DEV;
  const PROGRESS_INFO = CardText.PROGRESS;
  const PROMPT_TEXT = {
    discard: 'Discard cards', robber: 'Move the robber', steal: 'Choose a victim',
    give: 'Give cards', take_cards: 'Take cards', aqueduct: 'Aqueduct: pick a resource',
    progress_discard: 'Discard a progress card', choose_deck: 'Draw a progress card',
    free_road: 'Place a free road', move_knight: 'Move your displaced knight',
    treason_remove: 'Remove one of your knights', treason_place: 'Place a knight', espionage: 'Espionage',
  };
  const pretty = (s) => (s || '').replace(/_/g, ' ');

  const UI = {
    state: null, me: null, maps: [], modes: [],
    _promptOpen: null,

    render(state) {
      this.state = state;
      this.me = state.players.find(p => p.id === Net.playerId);
      this.serverOffset = state.serverNow ? state.serverNow - Date.now() : 0;
      const screen = document.getElementById('screen-game');
      screen.dataset.mode = state.cnk ? 'cnk' : 'base';
      screen.classList.toggle('is-host', state.hostId === Net.playerId);
      this.renderPause();
      // Cancel stale pickers when it's no longer our move
      if (Render.inst && Render.inst.pick && !this.pickStillValid()) {
        Render.inst.cancelPick();
        banner('');
      }
      if (this._promptOpen && !state.prompts.some(p => p.id === this._promptOpen)) {
        this._promptOpen = null;
        closeModal();
        if (Render.inst && Render.inst.pick) { Render.inst.cancelPick(); banner(''); }
      }
      this.renderLobby();
      this.renderPlayers();
      this.renderTurnInfo();
      this.renderDice();
      this.renderCK();
      this.renderActions();
      this.renderLog();
      this.renderHand();
      this.renderOpenTrade();
      if (state.paused) {
        // Nothing can be done while the host has paused: grey out every action, hold prompts back.
        document.querySelectorAll('#actionButtons button, #endTurnBtn').forEach(b => { b.disabled = true; });
        if (Render.inst && Render.inst.pick) { Render.inst.cancelPick(); banner(''); }
        return;
      }
      this.openNextPrompt();
    },

    pickStillValid() {
      const s = this.state;
      if (this._pickPrompt) return s.prompts.some(p => p.id === this._pickPrompt);
      return s.currentPlayerId === Net.playerId && !s.busy &&
        ['main', 'roll', 'setup_1', 'setup_2'].includes(s.phase);
    },

    cancelPrompt() { this._promptOpen = null; this._pickPrompt = null; },

    myPrompts() { return (this.state.prompts || []).filter(p => p.playerId === Net.playerId); },
    canAct() { return this.state.currentPlayerId === Net.playerId && !this.state.busy; },

    // ---------------- Lobby / game over overlay ----------------
    renderLobby() {
      const el = document.getElementById('lobbyPanel');
      const s = this.state;
      if (s.phase !== 'lobby' && s.phase !== 'end') { el.classList.add('hidden'); this._lobbyKey = null; return; }
      el.classList.remove('hidden');
      const isHost = s.hostId === Net.playerId;
      if (s.phase === 'end') {
        const w = s.players.find(p => p.id === s.winner);
        const key = 'end' + s.winner + isHost;
        if (this._lobbyKey === key) return;
        this._lobbyKey = key;
        const rows = s.players.slice().sort((a, b) => b.vp - a.vp).map(p => {
          const b = p.vpBreakdown || {};
          const parts = Object.entries(b).filter(([, v]) => v).map(([k, v]) => `${pretty(k.replace(/([A-Z])/g, '_$1').toLowerCase())} ${v}`).join(' · ');
          return `<div class="lp-player"><span class="dot" style="background:${p.color}"></span><b>${esc(p.name)}</b><span class="lp-vp">${p.vp} VP</span><div class="lp-sub">${esc(parts)}</div></div>`;
        }).join('');
        el.innerHTML = `
          <div class="lp-card">
            <div class="lp-title">🏆 ${esc(w ? w.name : '?')} wins!</div>
            <div class="lp-sub" style="margin-bottom:10px">Reached ${w ? w.vp : '?'} of ${s.vpTarget} points</div>
            <div class="lp-players">${rows}</div>
            ${isHost ? '<button class="cta green" id="lpRestart">New game</button>' : '<div class="lp-sub">Waiting for the host to start a new game…</div>'}
            <button class="chip ghost" id="lpHide" style="margin-top:8px">View board</button>
          </div>`;
        if (isHost) document.getElementById('lpRestart').onclick = () => Net.send('restart');
        document.getElementById('lpHide').onclick = () => el.classList.add('hidden');
        return;
      }
      // Lobby: re-render only when something visible changed (keeps sliders usable)
      const key = JSON.stringify([s.settings, s.players.map(p => [p.id, p.name, p.color, p.connected]), s.hostId]);
      if (this._lobbyKey === key) return;
      this._lobbyKey = key;
      const focused = document.activeElement && el.contains(document.activeElement)
        ? (document.activeElement.dataset.range || document.activeElement.dataset.select) : null;
      const need = Math.max(0, 3 - s.players.length);
      el.innerHTML = `
        <div class="lp-card">
          <div class="lp-title">Room <span class="lp-code">${esc(Net.code || '')}</span></div>
          <div class="lp-sub">${isHost ? 'You are the host — adjust settings, then start.' : 'Waiting for the host to start the game.'}</div>
          <div class="lp-players">
            ${s.players.map(p => `<div class="lp-player"><span class="dot" style="background:${p.color}"></span><b>${esc(p.name)}</b>
              ${p.id === s.hostId ? '<span class="lp-tag">host</span>' : ''}${p.id === Net.playerId ? '<span class="lp-tag">you</span>' : ''}</div>`).join('')}
            <div class="lp-sub">${s.players.length}/${s.settings.maxPlayers} players</div>
          </div>
          <div class="lp-actions">
            ${isHost
              ? `<button class="cta green" id="lpStart" ${need ? 'disabled' : ''}>${need ? `Need ${need} more player${need > 1 ? 's' : ''}` : 'Start game'}</button>`
              : ''}
            <button class="chip ghost" id="lpInvite">⧉ Copy invite link</button>
          </div>
          <div class="sec-label" style="margin:4px 0 0">Room settings${isHost ? '' : ' (host only)'}</div>
          <div class="settings" id="lobbySettings"></div>
        </div>`;
      Settings.render(document.getElementById('lobbySettings'), s.settings, {
        editable: isHost, maps: this.maps, modes: this.modes, showMapMode: true, live: false,
        onChange: (next) => Net.send('update_settings', { settings: next }),
      });
      if (focused) {
        const again = el.querySelector(`[data-range="${focused}"], [data-select="${focused}"]`);
        if (again) again.focus();
      }
      if (isHost && !need) document.getElementById('lpStart').onclick = () => Net.send('start_game');
      document.getElementById('lpInvite').onclick = () => document.getElementById('copyLink').click();
    },

    renderPlayers() {
      const el = document.getElementById('players');
      el.innerHTML = '';
      const s = this.state;
      const target = s.vpTarget || 10;
      s.players.forEach((p) => {
        const row = document.createElement('div');
        const turn = s.currentPlayerId === p.id && s.phase !== 'lobby';
        row.className = 'player-row pcard' + (turn ? ' current turn' : '') + (p.connected ? '' : ' offline');
        row.style.setProperty('--player-color', p.color);
        const vpPct = Math.min(100, (p.vp / target) * 100);
        const initial = (p.name || '?')[0].toUpperCase();
        const trophies = [];
        if (s.longestRoad && s.longestRoad.playerId === p.id) trophies.push(hudImg('hud_longest_road', `${s.cnk ? 'Longest Route' : 'Longest Road'} (+2) · ${s.longestRoad.length}`));
        if (!s.cnk && s.largestArmy && s.largestArmy.playerId === p.id) trophies.push(hudImg('hud_largest_army', 'Largest Army (+2)'));
        if (s.cnk && s.ck) {
          const metros = TRACKS.filter(t => s.ck.metropolises[t] && s.ck.metropolises[t].playerId === p.id);
          for (const t of metros) trophies.push(hudImg('piece_metropolis_' + t, `Metropolis: ${t} (+2)`));
          if (s.ck.merchant && s.ck.merchant.playerId === p.id) trophies.push(hudImg('token_merchant', 'Merchant (+1)'));
          if (p.ck.defenders) trophies.push(hudImg('hud_defender_of_catan', `Defender of Catan (+${p.ck.defenders})`));
          if (p.ck.progressVP.length) trophies.push(`<span class="badge" title="VP progress cards">⭐${p.ck.progressVP.length}</span>`);
        }
        const waiting = (s.waitingOn || []).includes(p.id) && s.phase !== 'lobby';
        row.innerHTML = `
          <div class="player-dot" style="background:${p.color};color:${isLight(p.color) ? '#222' : '#fff'}">
            ${initial}
            ${waiting ? '<span class="pulse"></span>' : ''}
          </div>
          <div class="pc-main">
            <div class="player-name" title="${esc(p.name)}">${esc(p.name)}${p.id === Net.playerId ? ' <span class="pc-you">(you)</span>' : ''}${p.connected ? '' : ' <span class="offline-tag">offline</span>'}</div>
            <div class="vp-bar" title="${p.vp} / ${target} VP"><span style="width:${vpPct}%"></span></div>
            <div class="player-mini">
              <span class="mb" title="Cards in hand">${hudImg('card_back_resource')}${p.handCount}</span>
              ${s.cnk && p.ck ? `
                <span class="mb" title="Progress cards">📜${p.ck.progressCount}</span>
                <span class="mb" title="Active knight strength">${hudImg('hud_knight_shield')}${p.ck.strength}</span>
                <span class="mb pc-tracks" title="Trade / Politics / Science city levels">${p.ck.tracks.trade}/${p.ck.tracks.politics}/${p.ck.tracks.science}</span>`
              : `
                <span class="mb" title="Dev cards">${hudImg('card_back_development')}${p.devCardCount}</span>
                <span class="mb" title="Knights played">${hudImg('hud_largest_army')}${p.playedKnights}</span>`}
              ${trophies.join('')}
            </div>
          </div>
          <span class="player-vp" title="${p.id === Net.playerId ? 'Your total, including hidden VP cards' : 'Visible VP'}">${hudImg('hud_victory_point')}${p.vp}<small>/${target}</small></span>
        `;
        el.appendChild(row);
      });
    },

    renderTurnInfo() {
      const el = document.getElementById('turnInfo');
      const box = document.getElementById('turnStatus');
      const s = this.state;
      const cur = s.players[s.turn];
      const mine = this.myPrompts();
      const mineTurn = s.currentPlayerId === Net.playerId;
      let who, what, act = null;
      if (s.phase === 'lobby') { who = 'Lobby'; what = 'waiting to start'; }
      else if (s.phase === 'end') {
        const w = s.players.find(p => p.id === s.winner);
        who = `🏆 ${esc(w ? w.name : '?')} wins`; what = 'tap for results';
        act = () => { this._lobbyKey = null; this.renderLobby(); };
      } else if (mine.length) {
        who = esc(PROMPT_TEXT[mine[0].kind] || pretty(mine[0].kind)); what = 'tap to choose';
        act = () => this.openPrompt(mine[0], true);
      } else if (s.prompts && s.prompts.length) {
        const names = [...new Set(s.prompts.map(p => s.players.find(x => x.id === p.playerId)?.name))];
        who = 'Waiting'; what = `for ${esc(names.join(', '))}`;
      } else {
        who = mineTurn ? 'Your turn' : `${esc(cur ? cur.name : '—')}'s turn`;
        what = { setup_1: 'place a settlement + road', setup_2: s.cnk ? 'place a city + road' : 'place a settlement + road',
          roll: mineTurn ? 'tap the dice to roll' : 'rolling', main: mineTurn ? 'build, trade or end your turn' : 'playing' }[s.phase] || pretty(s.phase);
      }
      box.classList.toggle('actionable', !!act);
      box.classList.toggle('mine', mineTurn && s.phase !== 'lobby' && s.phase !== 'end');
      box.onclick = act;
      el.innerHTML = `
        ${cur && s.phase !== 'lobby' ? `<span class="ts-dot" style="background:${cur.color}"></span>` : ''}
        <span class="ts-text"><b>${who}</b><small>${what} · first to ${s.vpTarget} VP</small></span>
        <span class="timer hidden" id="turnTimer"></span>`;
      this.tickTimer();
      if (!this._timerInterval) this._timerInterval = setInterval(() => this.tickTimer(), 500);
    },

    tickTimer() {
      const el = document.getElementById('turnTimer');
      const s = this.state;
      if (!el || !s) return;
      if (!s.deadline || s.phase === 'lobby' || s.phase === 'end') { el.classList.add('hidden'); return; }
      const left = Math.max(0, Math.ceil((s.deadline - (Date.now() + (this.serverOffset || 0))) / 1000));
      el.classList.remove('hidden');
      el.classList.toggle('low', left <= 10);
      el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    },

    renderDice() {
      const el = document.getElementById('dice');
      document.getElementById('diceBox').classList.toggle('can-roll', this.canRoll());
      const d = this.state.dice;
      if (!d || !d.red) {
        el.innerHTML = diceHtml({ red: 1, yellow: 1, event: this.state.cnk ? 'barbarian' : null }, true);
        return;
      }
      const key = `${this.state.rollSeq}`;
      if (this._lastDiceKey !== key) {
        this._lastDiceKey = key;
        this.animateDice(d);
      } else if (!this._animating) {
        el.innerHTML = diceHtml(d);
      }
    },

    animateDice(final) {
      const el = document.getElementById('dice');
      let ticks = 0;
      this._animating = true;
      const frame = () => {
        ticks++;
        const r = 1 + Math.floor(Math.random() * 6);
        const y = 1 + Math.floor(Math.random() * 6);
        const ev = ['barbarian', 'trade', 'politics', 'science'][Math.floor(Math.random() * 4)];
        el.innerHTML = diceHtml({ red: r, yellow: y, event: final.event ? ev : null }, false, true);
        if (ticks < 10) {
          setTimeout(frame, 50 + ticks * 10);
        } else {
          this._animating = false;
          el.innerHTML = diceHtml(final);
          this.showResourceGains();
        }
      };
      frame();
    },

    showResourceGains() {
      if (!this.me || !this.me.hand) return;
      const prev = this._prevHand;
      this._prevHand = JSON.parse(JSON.stringify(this.me.hand));
      if (!prev) return;
      const container = document.getElementById('floats');
      for (const r of [...RES, ...COMM]) {
        const kind = RES.includes(r) ? 'r' : 'c';
        const delta = this.me.hand[kind][r] - prev[kind][r];
        if (delta > 0) {
          const f = document.createElement('div');
          f.className = `float-chip ${r}`;
          f.innerHTML = `+${delta} ${Icons[r]}`;
          f.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
          container.appendChild(f);
          setTimeout(() => f.remove(), 1800);
        }
      }
    },

    // ---------------- Cities & Knights panel ----------------
    // Barbarian banner only (city levels live in the Improve menu).
    renderCK() {
      const s = this.state;
      if (!s.cnk || !s.ck || s.phase === 'lobby') { document.getElementById('barbarianHud').innerHTML = ''; return; }
      this.renderBarbarianHud();
    },

    canRoll() {
      const s = this.state;
      return !!s && !s.paused && s.phase === 'roll' && s.currentPlayerId === Net.playerId && !s.busy && !this.myPrompts().length;
    },

    // ---------------- Bottom bar actions + End Turn ----------------
    renderActions() {
      const el = document.getElementById('actionButtons');
      const end = document.getElementById('endTurnBtn');
      const s = this.state, me = this.me;
      el.innerHTML = '';
      end.disabled = true;
      end.querySelector('.et-lbl').textContent = 'End Turn';
      end.onclick = null;
      if (!me || s.phase === 'lobby' || s.phase === 'end') return;

      const myTurn = s.currentPlayerId === Net.playerId && !s.busy;
      const waiting = !!(s.prompts && s.prompts.length);
      const main = myTurn && s.phase === 'main' && !waiting;

      // Setup is pure touch: show the spots, tap a building, tap a road, done.
      if ((s.phase === 'setup_1' || s.phase === 'setup_2') && myTurn && !waiting && !s.paused) this.autoSetupPick();

      const canPay = (c) => Object.entries(c).every(([k, v]) => (me.hand.r[k] || 0) >= v);
      const key = Assets.playerKey(me.color);
      const add = (o) => {
        const b = document.createElement('button');
        b.className = 'bar-btn' + (o.build ? ' action-build' : '') + (o.ok ? '' : ' broke');
        if (o.build) b.dataset.build = o.build;
        b.disabled = !o.ok;
        b.title = o.title;
        b.innerHTML = `${o.img ? `<img src="${o.img}" alt="">` : `<span class="bb-emoji">${o.emoji}</span>`}<span class="lbl">${o.label}</span>${o.badge != null ? `<span class="left">${o.badge}</span>` : ''}`;
        b.onclick = o.on;
        el.appendChild(b);
      };
      const costTip = (c) => Object.entries(c).map(([k, v]) => `${v} ${k}`).join(' + ');

      add({ label: 'Trade', emoji: '🤝', title: 'Trade with players', ok: main, on: () => this.openPlayerTradeModal() });
      add({ label: 'Bank', emoji: '🏦', title: 'Trade with the bank / harbors', ok: main, on: () => this.openBankTradeModal() });
      if (!s.cnk) {
        add({ label: 'Dev', img: Assets.url('card_back_development'), badge: s.devDeckCount, title: `Buy a development card (${costTip(COSTS.dev)})`,
          ok: main && canPay(COSTS.dev) && s.devDeckCount > 0, on: () => Net.send('buy_dev') });
      } else {
        const alchemy = s.phase === 'roll' && myTurn && !waiting && me.ck.progress.includes('alchemy');
        add({ label: 'Progress', img: Assets.url('card_back_science'), badge: me.ck.progress.length, title: 'Play a progress card',
          ok: (main || alchemy) && me.ck.progress.length > 0, on: () => this.openProgressModal() });
      }
      const left = { road: C_PIECES.roads - me.roads.length, settlement: C_PIECES.settlements - me.settlements.length, city: C_PIECES.cities - me.cities.length };
      add({ build: 'road', label: 'Road', img: Assets.url('piece_road_' + key), badge: left.road, title: `Road: ${costTip(COSTS.road)}`,
        ok: main && left.road > 0 && canPay(COSTS.road), on: () => this.pickRoadBuild() });
      add({ build: 'settlement', label: 'Settlement', img: Assets.url('piece_settlement_' + key), badge: left.settlement, title: `Settlement: ${costTip(COSTS.settle)}`,
        ok: main && left.settlement > 0 && canPay(COSTS.settle), on: () => this.pickSettlementBuild() });
      add({ build: 'city', label: 'City', img: Assets.url('piece_city_' + key), badge: left.city, title: `City: ${costTip(COSTS.city)}`,
        ok: main && left.city > 0 && me.settlements.length > 0 && canPay(COSTS.city), on: () => this.pickCityBuild() });
      if (s.cnk) {
        const kLeft = me.ck.knightSupply ? me.ck.knightSupply[1] : 0;
        const wLeft = 3 - me.ck.cityWalls.length;
        add({ build: 'knight', label: 'Knight', img: Assets.url('knight_basic_inactive_' + key), badge: kLeft, title: `Knight: ${costTip(COSTS.knight)}`,
          ok: main && kLeft > 0 && canPay(COSTS.knight), on: () => this.pickKnightBuild() });
        add({ build: 'wall', label: 'Wall', img: Assets.url('piece_city_wall_' + key), badge: wLeft, title: `City wall: ${costTip(COSTS.wall)}`,
          ok: main && wLeft > 0 && canPay(COSTS.wall), on: () => this.pickWallBuild() });
        add({ label: 'Knights', img: Assets.url('hud_knight_shield'), title: 'Activate, promote or move knights', ok: main, on: () => this.openKnightMenu() });
        add({ label: 'Improve', emoji: '🏛', title: 'City improvements (your levels: ' + TRACKS.map(t => `${t} ${me.ck.tracks[t]}`).join(', ') + ')',
          ok: main, on: () => this.openImproveMenu() });
      }

      if (main) {
        const over = s.cnk && me.ck.progress.length > 4;
        end.disabled = false;
        end.querySelector('.et-lbl').textContent = over ? 'Discard' : 'End Turn';
        end.onclick = () => over ? this.openProgressModal(true) : Net.send('end_turn');
      }
    },

    // During setup the valid spots are shown straight away; the road follows; the turn confirms itself.
    autoSetupPick() {
      const st = this.state.setupState || {};
      const pick = Render.inst && Render.inst.pick;
      if (st.building == null) { if (!pick) this.pickSettlementSetup(); return; }
      if (st.road == null) { if (!pick || pick.kind !== 'edge') this.pickRoadSetup(); return; }
      const k = `${this.state.phase}|${this.state.turn}|${st.building}|${st.road}`;
      if (this._setupSent !== k) { this._setupSent = k; Net.send('end_setup'); }
    },

    renderLog() {
      const el = document.getElementById('log');
      const players = this.state.players;
      el.innerHTML = this.state.log.map(l => `<div class="l">${LogFmt.format(l.msg, players)}</div>`).join('');
      el.scrollTop = el.scrollHeight;
    },

    renderHand() {
      const el = document.getElementById('hand');
      el.innerHTML = '';
      if (!this.me || !this.me.hand) return;
      const slot = (kind, r) => {
        const n = this.me.hand[kind][r] || 0;
        const d = document.createElement('div');
        d.className = `slot card ${r}${n === 0 ? ' zero' : ''}`;
        d.dataset.res = r;
        d.title = `${n} ${r}`;
        d.innerHTML = n > 0
          ? `<img class="mini" src="${Assets.url('card_' + r)}" alt="${r}"><span class="cnt">${n}</span>`
          : `<img class="ico" src="${Assets.url('icon_' + r)}" alt="${r}"><span class="cnt">0</span>`;
        return d;
      };
      const tray = (cls) => { const t = document.createElement('div'); t.className = 'tray ' + cls; el.appendChild(t); return t; };
      const limit = document.createElement('div');
      limit.className = 'hand-limit' + (this.me.handCount > this.me.handLimit ? ' over' : '');
      limit.title = 'Cards in hand / discard limit on a 7';
      limit.textContent = `${this.me.handCount}/${this.me.handLimit}`;

      const left = tray('tray-res');
      for (const r of RES) left.appendChild(slot('r', r));
      let extra = null;
      if (this.state.cnk) {
        const right = tray('tray-comm');
        for (const c of COMM) right.appendChild(slot('c', c));
        right.appendChild(limit);
        // Progress cards live behind the Progress button in the bar.
      } else {
        left.appendChild(limit);
        const cards = [...(this.me.devCards || []), ...(this.me.newDevCards || [])];
        if (cards.length) {
          extra = document.createElement('div');
          extra.className = 'card dev-card';
          extra.innerHTML = `<span class="icon">${Icons.dev}</span><span class="n">${cards.length}</span><span class="k">dev</span>`;
          extra.title = cards.map(pretty).join(', ') + ' — tap to play';
          extra.onclick = () => this.openPlayDevModal();
        }
      }
      if (extra) el.appendChild(extra);
      if (!this._prevHand) this._prevHand = JSON.parse(JSON.stringify(this.me.hand));
    },

    // ---------------- Pause (host-only control; everyone sees the banner) ----------------
    renderPause() {
      const s = this.state;
      const btn = document.getElementById('pauseBtn');
      btn.textContent = s.paused ? '▶' : '⏸';
      btn.title = s.paused ? 'Resume the game' : 'Pause the game';
      let b = document.getElementById('pausedBanner');
      if (s.paused && !b) {
        b = document.createElement('div');
        b.id = 'pausedBanner'; b.className = 'paused-banner';
        b.textContent = '⏸ Game paused by the host';
        document.getElementById('boardWrap').appendChild(b);
      }
      if (!s.paused && b) b.remove();
    },

    confirmReset() {
      openModal(`
        <h3>Reset this game?</h3>
        <p class="sec-hint" style="font-size:13px">Everyone goes back to the lobby. This game's board, hands and points are lost.</p>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:14px">
          <button class="chip" id="rsCancel">Cancel</button>
          <button class="chip on danger" id="rsConfirm">Reset game</button>
        </div>`);
      document.getElementById('rsCancel').onclick = closeModal;
      document.getElementById('rsConfirm').onclick = () => { closeModal(); Net.send('restart'); };
    },

    // ---------------- Barbarian / robber / metropolis banner (C&K) ----------------
    renderBarbarianHud() {
      const el = document.getElementById('barbarianHud');
      const s = this.state, c = s.ck;
      const at = c.barbarianMax - c.barbarianDistance; // 0 = just set sail, max = landing
      const cells = [];
      for (let i = 0; i <= c.barbarianMax; i++) {
        cells.push(`<span class="bh-cell${i === at ? ' ship' : ''}${i === c.barbarianMax ? ' land' : ''}">${i === at ? hudImg('hud_barbarian_ship', `${c.barbarianDistance} to go`) : ''}</span>`);
      }
      const losing = c.barbarianStrength > c.knightStrength;
      const robber = s.robberActive
        ? hudImg('hud_robber_active', 'Robber active')
        : hudImg('hud_robber_asleep', 'Robber asleep until the first barbarian attack');
      const metros = TRACKS.map(t => {
        const m = c.metropolises[t];
        const owner = m && s.players.find(p => p.id === m.playerId);
        return `<span class="bh-metro${owner ? ' held' : ''}" title="${t} metropolis${owner ? ': ' + esc(owner.name) : ' (unclaimed)'}">${hudImg('piece_metropolis_' + t)}${owner ? `<i style="background:${owner.color}"></i>` : ''}</span>`;
      }).join('');
      el.innerHTML = `
        <div class="bh-track" title="Barbarian ship: ${c.barbarianDistance} steps to go">${cells.join('')}</div>
        <div class="bh-strength ${losing ? 'bad' : 'ok'}" title="Barbarians (cities) vs active knights">B ${c.barbarianStrength} vs K ${c.knightStrength}</div>
        <div class="bh-robber">${robber}<span>${s.robberActive ? 'Robber active' : 'Robber asleep'}</span></div>
        <div class="bh-metros">${metros}</div>`;
    },

    // ---------------- Prompts (choices the server is waiting on) ----------------
    openNextPrompt() {
      const mine = this.myPrompts();
      if (!mine.length || this._promptOpen) return;
      const pr = mine[0];
      this._seenPrompts = this._seenPrompts || new Set();
      if (this._seenPrompts.has(pr.id)) return; // user dismissed it; reopen via the action button
      this._seenPrompts.add(pr.id);
      this.openPrompt(pr);
    },

    openPrompt(pr) {
      const s = this.state;
      closeModalSilently();
      if (Render.inst && Render.inst.pick) Render.inst.cancelPick();
      this._promptOpen = pr.id;
      const answer = (a) => { Net.send('respond', { promptId: pr.id, answer: a }); };
      const dismiss = () => { this._promptOpen = null; this._pickPrompt = null; };
      const me = this.me;
      switch (pr.kind) {
        case 'discard':
          return this.selectCardsModal({
            title: pr.reason === 'sabotage' ? 'Sabotage!' : 'Discard Cards',
            message: pr.reason === 'sabotage'
              ? `You have at least as many points as the saboteur. Discard ${pr.count} of your ${me.handCount} cards.`
              : `7 was rolled! You have ${me.handCount} cards, more than your limit of ${me.handLimit}. Discard ${pr.count} of them.`,
            count: pr.count, hand: me.hand, keys: s.cnk ? [...RES, ...COMM] : RES,
            onDone: (cards) => answer({ cards }), onCancel: dismiss,
          });
        case 'give': {
          const to = s.players.find(p => p.id === pr.toId);
          return this.selectCardsModal({
            title: `Give ${pr.count} ${pr.only === 'commodity' ? 'commodity' : 'card'}${pr.count > 1 ? 's' : ''} to ${to ? to.name : '?'} (${pretty(pr.reason || '')})`,
            count: pr.count, hand: me.hand, keys: pr.only === 'commodity' ? COMM : [...RES, ...COMM],
            onDone: (cards) => answer({ cards }), onCancel: dismiss,
          });
        }
        case 'take_cards': {
          const from = s.players.find(p => p.id === pr.fromId);
          return this.selectCardsModal({
            title: `Guild Dues — take ${pr.count} from ${from ? from.name : '?'}`,
            count: pr.count, hand: pr.hand, keys: [...RES, ...COMM],
            onDone: (cards) => answer({ cards }), onCancel: dismiss,
          });
        }
        case 'robber': {
          this._pickPrompt = pr.id;
          banner(pr.taxation ? 'Taxation — move the robber' : 'Move the robber to a new hex');
          Render.inst.startPick('hex', (h) => h.id !== s.robberHex, (hId) => { banner(''); this._pickPrompt = null; answer({ hexId: hId }); });
          return;
        }
        case 'steal':
          return this.choosePlayerModal('Choose a victim', pr.candidates, (id) => answer({ targetId: id }), dismiss);
        case 'aqueduct':
          return this.openPickResourceModal('Aqueduct — you got nothing this roll. Take 1 resource:', (r) => answer({ resource: r }), RES.filter(r => (s.bank[r] || 0) > 0), dismiss);
        case 'progress_discard':
          return this.chooseCardModal('Too many progress cards — discard one', pr.cards || me.ck.progress, (c) => answer({ card: c }), dismiss);
        case 'choose_deck':
          openModal(`<h3>Tied defenders — draw a progress card</h3>
            <div class="row">${TRACKS.map(t => `<button class="chip" data-t="${t}">${t} (${s.ck.deckCounts[t]})</button>`).join('')}</div>`);
          onModalClose(dismiss);
          document.querySelectorAll('.chip[data-t]').forEach(b => b.onclick = () => { answer({ track: b.dataset.t }); closeModal(); });
          return;
        case 'free_road': {
          this._pickPrompt = pr.id;
          bannerWithSkip(`Place a free road${pr.remaining > 1 ? ` (${pr.remaining} left)` : ''}`, () => { Render.inst.cancelPick(); this._pickPrompt = null; answer({ skip: true }); });
          Render.inst.startPick('edge', (e) => this.canBuildRoad(e.id), (eId) => { banner(''); this._pickPrompt = null; answer({ edgeId: eId }); });
          return;
        }
        case 'move_knight': {
          this._pickPrompt = pr.id;
          banner('Your knight was displaced — pick where it goes');
          Render.inst.startPick('vertex', (v) => pr.options.includes(v.id), (vId) => { banner(''); this._pickPrompt = null; answer({ vertexId: vId }); });
          return;
        }
        case 'treason_remove': {
          this._pickPrompt = pr.id;
          const by = s.players.find(p => p.id === pr.byId);
          banner(`Treason by ${by ? by.name : '?'} — remove one of your knights`);
          Render.inst.startPick('vertex', (v) => !!(me.ck.knights[v.id]), (vId) => { banner(''); this._pickPrompt = null; answer({ vertexId: vId }); });
          return;
        }
        case 'treason_place': {
          const place = (rank) => {
            closeModalSilently();
            this._pickPrompt = pr.id;
            bannerWithSkip(`Place your level ${rank} knight`, () => { Render.inst.cancelPick(); this._pickPrompt = null; answer({ skip: true }); });
            Render.inst.startPick('vertex', (v) => pr.options.includes(v.id), (vId) => { banner(''); this._pickPrompt = null; answer({ vertexId: vId, rank }); });
          };
          if (pr.ranks.length === 1) return place(pr.ranks[0]);
          openModal(`<h3>Treason — choose a knight level</h3>
            <div class="row">${pr.ranks.map(r => `<button class="chip" data-r="${r}">Level ${r}</button>`).join('')}
            <button class="chip ghost" id="tpSkip">Skip</button></div>`);
          onModalClose(dismiss);
          document.querySelectorAll('.chip[data-r]').forEach(b => b.onclick = () => place(+b.dataset.r));
          document.getElementById('tpSkip').onclick = () => { answer({ skip: true }); closeModal(); };
          return;
        }
        case 'espionage': {
          const t = s.players.find(p => p.id === pr.targetId);
          openModal(`<h3>Espionage — ${esc(t ? t.name : '?')}'s progress cards</h3>
            <div class="row" style="flex-direction:column;align-items:stretch">
              ${(pr.cards || []).map(c => `<button class="chip prog" data-c="${c}"><b>${pretty(c)}</b><span>${esc(PROGRESS_INFO[c] || '')}</span></button>`).join('')}
            </div>
            <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="chip ghost" id="eSkip">Take nothing</button></div>`);
          onModalClose(dismiss);
          document.querySelectorAll('.chip[data-c]').forEach(b => b.onclick = () => { answer({ card: b.dataset.c }); closeModal(); });
          document.getElementById('eSkip').onclick = () => { answer({ skip: true }); closeModal(); };
          return;
        }
        default:
          toast('Unknown choice: ' + pr.kind);
      }
    },

    // ---------------- Board rule helpers (mirror the server for highlighting) ----------------
    ownerOf(v) { return ownerOf(this.state, v); },
    knightAt(v) {
      for (const p of this.state.players) if (p.ck && p.ck.knights && p.ck.knights[v]) return { player: p, knight: p.ck.knights[v] };
      return null;
    },
    blockedFor(v, pid) {
      const o = this.ownerOf(v);
      if (o && o.id !== pid) return true;
      const k = this.knightAt(v);
      return !!(k && k.player.id !== pid);
    },
    edgeTaken(eId) { return this.state.players.some(p => p.roads.includes(eId)); },
    canPlaceBuilding(vId) {
      const topo = this.state.map.topo;
      if (this.ownerOf(vId) || this.knightAt(vId)) return false;
      return topo.vAdj[vId].every(nb => !this.ownerOf(nb));
    },
    canBuildRoad(eId) {
      const s = this.state, me = this.me, topo = s.map.topo;
      if (this.edgeTaken(eId)) return false;
      const e = topo.edges[eId];
      for (const x of [e.a, e.b]) {
        if (me.settlements.includes(x) || me.cities.includes(x)) return true;
        if (this.blockedFor(x, me.id)) continue;
        if (topo.vertices[x].edges.some(o => o !== eId && me.roads.includes(o))) return true;
      }
      return false;
    },
    reach(pid, from) {
      const s = this.state, topo = s.map.topo;
      const p = s.players.find(x => x.id === pid);
      const roads = new Set(p.roads);
      const seen = new Set([from]); const open = [], blocked = []; const q = [from];
      while (q.length) {
        const u = q.shift();
        for (const eId of topo.vertices[u].edges) {
          if (!roads.has(eId)) continue;
          const e = topo.edges[eId]; const w = e.a === u ? e.b : e.a;
          if (seen.has(w)) continue;
          seen.add(w);
          if (this.blockedFor(w, pid)) { blocked.push(w); continue; }
          open.push(w); q.push(w);
        }
      }
      return { open, blocked };
    },
    isOpenRoad(eId) {
      const s = this.state, topo = s.map.topo;
      const owner = s.players.find(p => p.roads.includes(eId));
      if (!owner) return false;
      const e = topo.edges[eId];
      return [e.a, e.b].some(x => {
        if (owner.settlements.includes(x) || owner.cities.includes(x) || (owner.ck && owner.ck.knights[x])) return false;
        return !topo.vertices[x].edges.some(o => o !== eId && owner.roads.includes(o));
      });
    },
    knightCanAct(k) { return k.active && k.activatedTurn !== this.state.turnNumber; },

    // ---------------- picker flows ----------------
    pickSettlementSetup() {
      banner(`Tap a spot for your ${this.state.cnk && this.state.phase === 'setup_2' ? 'city' : 'settlement'}`);
      Render.inst.startPick('vertex', (v) => this.canPlaceBuilding(v.id), (vId) => {
        Net.send('place_settlement', { vertexId: vId, setup: true });
        banner('');
      });
    },
    pickRoadSetup() {
      const b = this.state.setupState.building;
      banner('Tap an edge for your road');
      Render.inst.startPick('edge', (e) => !this.edgeTaken(e.id) && (e.a === b || e.b === b), (eId) => {
        Net.send('place_road', { edgeId: eId, setup: true });
        banner('');
      });
    },
    pickSettlementBuild() {
      const myRoadEdges = new Set(this.me.roads);
      banner('Pick an intersection to build a settlement');
      Render.inst.startPick('vertex', (v) => this.canPlaceBuilding(v.id) && v.edges.some(e => myRoadEdges.has(e)), (vId) => {
        Net.send('place_settlement', { vertexId: vId });
        banner('');
      });
    },
    pickRoadBuild() {
      banner('Pick an edge to build a road');
      Render.inst.startPick('edge', (e) => this.canBuildRoad(e.id), (eId) => {
        Net.send('place_road', { edgeId: eId }); banner('');
      });
    },
    pickCityBuild() {
      banner('Pick your settlement to upgrade');
      Render.inst.startPick('vertex', (v) => this.me.settlements.includes(v.id), (vId) => {
        Net.send('build_city', { vertexId: vId }); banner('');
      });
    },
    pickKnightBuild() {
      const myRoadEdges = new Set(this.me.roads);
      banner('Pick an intersection on your roads for your knight');
      Render.inst.startPick('vertex', (v) => !this.ownerOf(v.id) && !this.knightAt(v.id) && v.edges.some(e => myRoadEdges.has(e)), (vId) => {
        Net.send('ck_knight_build', { vertexId: vId }); banner('');
      });
    },
    pickWallBuild() {
      banner('Pick a city to wall');
      Render.inst.startPick('vertex', (v) => this.me.cities.includes(v.id) && !this.me.ck.cityWalls.includes(v.id), (vId) => {
        Net.send('ck_wall', { vertexId: vId }); banner('');
      });
    },
    pickFreeRoads(title, max, cb) {
      const picked = [];
      const next = () => {
        bannerWithSkip(`${title} — road ${picked.length + 1}/${max}`, picked.length ? () => { Render.inst.cancelPick(); banner(''); cb(picked); } : null, picked.length ? 'Done' : null);
        Render.inst.startPick('edge', (e) => {
          if (picked.includes(e.id) || this.edgeTaken(e.id)) return false;
          // allow chaining off a road picked a moment ago
          this.me.roads.push(...picked);
          const ok = this.canBuildRoad(e.id);
          this.me.roads.splice(this.me.roads.length - picked.length, picked.length);
          return ok;
        }, (eId) => {
          picked.push(eId);
          if (picked.length >= max) { banner(''); cb(picked); } else next();
        });
      };
      next();
    },

    // ---------------- modals ----------------
    // Card picker: your cards (only the kinds you hold) sit at the bottom as stacks; tap one to move a
    // card up to the pile, tap a card in the pile to put it back; ✓ confirms once the count is right.
    selectCardsModal({ title, message = '', count, hand, keys, onDone, onCancel }) {
      const picks = {};
      for (const k of keys) picks[k] = 0;
      const have = (k) => RES.includes(k) ? (hand.r[k] || 0) : (hand.c[k] || 0);
      const card = (k) => `<img src="${Assets.url('card_' + k)}" alt="${k}" draggable="false">`;
      const render = () => {
        const used = Object.values(picks).reduce((a, b) => a + b, 0);
        const pile = keys.flatMap(k => Array(picks[k]).fill(k));
        const stacks = keys.filter(k => have(k) > 0).map(k => {
          const left = have(k) - picks[k];
          const shown = Math.max(1, Math.min(left, 6));
          return `<button class="cp-stack${left ? '' : ' empty'}" data-k="${k}" ${left && used < count ? '' : 'disabled'} title="${left} ${k}">
            <span class="cp-fan" style="--n:${shown}">${Array(shown).fill(card(k)).join('')}</span>
            <span class="cp-count">${left}</span></button>`;
        }).join('');
        openModal(`
          <div class="cardpick">
            <div class="cp-head">
              <img class="cp-badge" src="${Assets.url('card_back_resource')}" alt="">
              <div><h3 class="cp-title">${esc(title)} <span>(${used}/${count})</span></h3>
                ${message ? `<p class="cp-msg">${esc(message)}</p>` : ''}</div>
            </div>
            <div class="cp-pile">${pile.length
              ? pile.map(k => `<button class="cp-card" data-k="${k}" title="Put back">${card(k)}</button>`).join('')
              : '<span class="cp-hint">Tap your cards below to pick them</span>'}</div>
            <div class="cp-foot">
              <button class="chip ghost" id="scLater">Later</button>
              <button class="cp-ok" id="scOk" title="Confirm" ${used !== count ? 'disabled' : ''}>✓</button>
            </div>
            <div class="cp-hand">${stacks || '<span class="cp-hint">No cards</span>'}</div>
          </div>`);
        document.getElementById('modal').classList.add('modal-cardpick');
        onModalClose(() => { document.getElementById('modal').classList.remove('modal-cardpick'); if (onCancel) onCancel(); });
        document.querySelectorAll('#modal .cp-stack').forEach(b => b.onclick = (e) => {
          e.stopPropagation();
          const k = b.dataset.k;
          if (picks[k] < have(k) && used < count) { picks[k]++; render(); }
        });
        document.querySelectorAll('#modal .cp-card').forEach(b => b.onclick = (e) => {
          e.stopPropagation();
          const k = b.dataset.k;
          if (picks[k] > 0) { picks[k]--; render(); }
        });
        document.getElementById('scLater').onclick = () => { closeModal(); };
        document.getElementById('scOk').onclick = () => {
          document.getElementById('modal').classList.remove('modal-cardpick');
          onDone(strip(picks)); closeModalSilently();
        };
      };
      render();
    },

    choosePlayerModal(title, ids, cb, onCancel) {
      const s = this.state;
      openModal(`<h3>${esc(title)}</h3>
        <div class="row">${ids.map(id => {
          const p = s.players.find(x => x.id === id);
          return `<button class="chip" data-id="${id}"><span class="dot" style="background:${p.color}"></span>
            ${esc(p.name)} (${p.handCount} cards · ${p.vp} VP)</button>`;
        }).join('')}</div>`);
      onModalClose(onCancel);
      document.querySelectorAll('.chip[data-id]').forEach(b => {
        b.onclick = () => { cb(b.dataset.id); closeModal(); };
      });
    },

    chooseCardModal(title, cards, cb, onCancel) {
      openModal(`<h3>${esc(title)}</h3>
        <div class="row" style="flex-direction:column;align-items:stretch">
          ${cards.map(c => `<button class="chip prog" data-c="${c}"><b>${pretty(c)}</b><span>${esc(PROGRESS_INFO[c] || '')}</span></button>`).join('')}
        </div>`);
      onModalClose(onCancel);
      document.querySelectorAll('.chip[data-c]').forEach(b => b.onclick = () => { cb(b.dataset.c); closeModal(); });
    },

    openPlayerTradeModal() {
      const keys = this.state.cnk ? [...RES, ...COMM] : RES;
      const have = (k) => RES.includes(k) ? (this.me.hand.r[k] || 0) : (this.me.hand.c[k] || 0);
      const give = {}, want = {};
      for (const r of keys) { give[r] = 0; want[r] = 0; }
      const render = () => {
        const canOffer = keys.some(r => give[r] > 0) && keys.some(r => want[r] > 0) && !keys.some(r => give[r] && want[r]);
        openModal(`
          <h3>Propose a trade</h3>
          <div class="sec-label">You give</div>
          <div class="row">${keys.map(r => `
            <div class="counter-chip-ui">
              <span class="icon">${Icons[r]}</span>
              <span class="rbtn" data-op="-" data-side="give" data-r="${r}">−</span>
              <span class="rnum">${give[r]}</span>
              <span class="rbtn" data-op="+" data-side="give" data-r="${r}">+</span>
              <span class="rhave">/ ${have(r)}</span>
            </div>`).join('')}
          </div>
          <div class="sec-label" style="margin-top:18px">You want</div>
          <div class="row">${keys.map(r => `
            <div class="counter-chip-ui">
              <span class="icon">${Icons[r]}</span>
              <span class="rbtn" data-op="-" data-side="want" data-r="${r}">−</span>
              <span class="rnum">${want[r]}</span>
              <span class="rbtn" data-op="+" data-side="want" data-r="${r}">+</span>
            </div>`).join('')}
          </div>
          <div class="sec-hint">Both sides need cards, and you can't trade a type for itself.</div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip ghost" id="pCancel">Cancel</button>
            <button class="chip on" id="pSend" ${canOffer ? '' : 'disabled'}>Send offer</button>
          </div>
        `);
        document.querySelectorAll('[data-op]').forEach(b => {
          b.onclick = (e) => {
            e.stopPropagation();
            const r = b.dataset.r, side = b.dataset.side, op = b.dataset.op;
            const bag = side === 'give' ? give : want;
            if (op === '+') {
              if (side === 'give' && bag[r] >= have(r)) return;
              bag[r]++;
            } else if (bag[r] > 0) bag[r]--;
            render();
          };
        });
        document.getElementById('pCancel').onclick = closeModal;
        document.getElementById('pSend').onclick = () => {
          Net.send('trade_offer', { give: strip(give), want: strip(want) });
          closeModal();
        };
      };
      render();
    },

    renderOpenTrade() {
      const t = this.state.openTrade;
      let bar = document.getElementById('tradeBar');
      if (!t) { if (bar) bar.remove(); return; }
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'tradeBar';
        bar.className = 'trade-bar';
        document.getElementById('boardWrap').appendChild(bar);
      }
      const keys = this.state.cnk ? [...RES, ...COMM] : RES;
      const from = this.state.players.find(p => p.id === t.fromId);
      const fmtIcons = (o) => keys.filter(r => (o[r] || 0) > 0)
        .map(r => `<span class="trade-pill ${r}">${o[r]}${Icons[r]}</span>`).join('') || '<span style="color:var(--fg-mute)">—</span>';
      const isMine = t.fromId === Net.playerId;
      const accepters = Object.keys(t.responses).filter(id => t.responses[id] === 'accept');
      const counterers = Object.keys(t.counters || {});
      const myCounter = (t.counters || {})[Net.playerId];
      const already = t.responses[Net.playerId] === 'accept';

      if (isMine) {
        const options = [];
        for (const id of accepters) {
          const p = this.state.players.find(x => x.id === id);
          options.push(`
            <button class="chip on confirm-chip" data-accept="${id}">
              <span style="color:${p.color}">●</span> Confirm with ${esc(p.name)}
            </button>`);
        }
        for (const id of counterers) {
          const p = this.state.players.find(x => x.id === id);
          const c = t.counters[id];
          options.push(`
            <button class="chip confirm-chip counter-chip" data-accept="${id}" title="Accept this counter">
              <span style="color:${p.color}">●</span> ${esc(p.name)}'s counter:
              <span class="mini-trade">${fmtIcons(c.give)} <span class="arrow">→</span> ${fmtIcons(c.want)}</span>
            </button>`);
        }
        bar.innerHTML = `
          <div class="t-head">
            <strong>Your offer</strong>
            <span class="mini-trade">${fmtIcons(t.give)} <span class="arrow">→</span> ${fmtIcons(t.want)}</span>
          </div>
          <div class="t-body">
            ${options.length === 0
              ? '<span style="color:var(--fg-dim); font-size:12px">waiting for responses…</span>'
              : options.join('')}
            <button class="chip ghost" id="tCancelOffer">Cancel</button>
          </div>`;
        bar.querySelectorAll('[data-accept]').forEach(b => {
          b.onclick = () => Net.send('trade_accept', { otherId: b.dataset.accept });
        });
        document.getElementById('tCancelOffer').onclick = () => Net.send('trade_cancel');
      } else {
        const status = already ? 'Accepted' : myCounter ? 'Countered' : '';
        bar.innerHTML = `
          <div class="t-head">
            <strong>${esc(from.name)}</strong> offers
            <span class="mini-trade">${fmtIcons(t.give)} <span class="arrow">→</span> ${fmtIcons(t.want)}</span>
            ${status ? `<span class="status-pill">${status}</span>` : ''}
          </div>
          <div class="t-body">
            <button class="chip on" id="tAccept" ${already ? 'disabled' : ''}>${already ? '✓ Accepted' : 'Accept'}</button>
            <button class="chip" id="tCounter">${myCounter ? 'Edit counter' : 'Counter'}</button>
            <button class="chip ghost" id="tReject">${already || myCounter ? 'Withdraw' : 'Pass'}</button>
          </div>`;
        document.getElementById('tAccept').onclick = () => Net.send('trade_respond', { accept: true });
        document.getElementById('tReject').onclick = () => Net.send('trade_respond', { accept: false });
        document.getElementById('tCounter').onclick = () => this.openCounterModal(t);
      }
    },

    openCounterModal(trade) {
      const keys = this.state.cnk ? [...RES, ...COMM] : RES;
      const have = (k) => RES.includes(k) ? (this.me.hand.r[k] || 0) : (this.me.hand.c[k] || 0);
      const give = {}, want = {};
      for (const r of keys) { give[r] = 0; want[r] = 0; }
      // Preseed with inverse of their offer as starting point
      for (const [k, v] of Object.entries(trade.give)) want[k] = v;
      for (const [k, v] of Object.entries(trade.want)) give[k] = Math.min(v, have(k));
      const render = () => {
        const canSend = keys.some(r => give[r] > 0) && keys.some(r => want[r] > 0) && !keys.some(r => give[r] && want[r]);
        openModal(`
          <h3>Counter-offer</h3>
          <div class="sec-label">You give (from your hand)</div>
          <div class="row">${keys.map(r => `
            <div class="counter-chip-ui">
              <span class="icon">${Icons[r]}</span>
              <span class="rbtn" data-op="-" data-side="give" data-r="${r}">−</span>
              <span class="rnum">${give[r]}</span>
              <span class="rbtn" data-op="+" data-side="give" data-r="${r}">+</span>
              <span class="rhave">/ ${have(r)}</span>
            </div>`).join('')}
          </div>
          <div class="sec-label" style="margin-top:18px">You want (from ${esc(this.state.players.find(p => p.id === trade.fromId).name)})</div>
          <div class="row">${keys.map(r => `
            <div class="counter-chip-ui">
              <span class="icon">${Icons[r]}</span>
              <span class="rbtn" data-op="-" data-side="want" data-r="${r}">−</span>
              <span class="rnum">${want[r]}</span>
              <span class="rbtn" data-op="+" data-side="want" data-r="${r}">+</span>
            </div>`).join('')}
          </div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip ghost" id="cCancel">Cancel</button>
            <button class="chip on" id="cSend" ${canSend ? '' : 'disabled'}>Send counter</button>
          </div>
        `);
        document.querySelectorAll('[data-op]').forEach(b => {
          b.onclick = (e) => {
            e.stopPropagation();
            const r = b.dataset.r, side = b.dataset.side, op = b.dataset.op;
            const bag = side === 'give' ? give : want;
            if (op === '+') {
              if (side === 'give' && bag[r] >= have(r)) return;
              bag[r]++;
            } else if (bag[r] > 0) bag[r]--;
            render();
          };
        });
        document.getElementById('cCancel').onclick = closeModal;
        document.getElementById('cSend').onclick = () => {
          Net.send('trade_counter', { give: strip(give), want: strip(want) });
          closeModal();
        };
      };
      render();
    },

    openBankTradeModal() {
      const keys = this.state.cnk ? [...RES, ...COMM] : RES;
      const rates = this.me.tradeRates || {};
      const have = (k) => RES.includes(k) ? (this.me.hand.r[k] || 0) : (this.me.hand.c[k] || 0);
      const bank = this.state.bank || {};
      let give = null, take = null;
      const render = () => {
        openModal(`
          <h3>Trade with bank</h3>
          <div class="sec-label">Give (your rate)</div>
          <div class="row">${keys.map(r => `
            <button class="chip ${give === r ? 'on' : ''}" data-g="${r}" ${have(r) < rates[r] ? 'disabled' : ''}>
              ${Icons[r]} ${r} ${rates[r]}:1 <small>(${have(r)})</small>
            </button>`).join('')}</div>
          <div class="sec-label" style="margin-top:16px">Take (bank stock)</div>
          <div class="row">${keys.map(r => `
            <button class="chip ${take === r ? 'on' : ''}" data-t="${r}" ${!bank[r] || r === give ? 'disabled' : ''}>${Icons[r]} ${r} <small>(${bank[r] ?? 0})</small></button>
          `).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip" id="tCancel">Cancel</button>
            <button class="chip on" id="tConfirm" ${!give || !take || give === take ? 'disabled' : ''}>Trade</button>
          </div>
        `);
        document.querySelectorAll('.chip[data-g]').forEach(b => b.onclick = () => { give = b.dataset.g; if (take === give) take = null; render(); });
        document.querySelectorAll('.chip[data-t]').forEach(b => b.onclick = () => { take = b.dataset.t; render(); });
        document.getElementById('tCancel').onclick = closeModal;
        document.getElementById('tConfirm').onclick = () => {
          Net.send('bank_trade', { give: { [give]: rates[give] }, take: { [take]: 1 } });
          closeModal();
        };
      };
      render();
    },

    // ---------------- Base: development cards ----------------
    openPlayDevModal() {
      const me = this.me;
      const playable = me.devCards || [];
      const fresh = me.newDevCards || [];
      openModal(`
        <h3>Development cards</h3>
        ${me.devPlayedThisTurn ? '<div class="sec-hint">You already played a development card this turn.</div>' : ''}
        <div class="row" style="flex-direction:column;align-items:stretch">
          ${playable.map(c => `<button class="chip prog" data-c="${c}" ${c === 'vp' || me.devPlayedThisTurn ? 'disabled' : ''}>
            <b>${pretty(c)}</b><span>${esc(DEV_INFO[c] || '')}</span></button>`).join('')}
          ${fresh.map(c => `<button class="chip prog" disabled><b>${pretty(c)} <small>(new)</small></b><span>${c === 'vp' ? esc(DEV_INFO.vp) : 'Playable from your next turn.'}</span></button>`).join('')}
          ${!playable.length && !fresh.length ? '<div class="sec-hint">No cards.</div>' : ''}
        </div>
      `);
      document.querySelectorAll('.chip[data-c]').forEach(b => {
        b.onclick = () => {
          const c = b.dataset.c;
          closeModal();
          if (c === 'knight') {
            Net.send('play_dev', { card: c, args: {} });
          } else if (c === 'year_of_plenty') {
            this.openPickTwoResourcesModal('Year of Plenty — pick 2 resources', (a, b2) => {
              Net.send('play_dev', { card: c, args: { resources: [a, b2] } });
            });
          } else if (c === 'monopoly') {
            this.openPickResourceModal('Monopoly — pick a resource', (r) => {
              Net.send('play_dev', { card: c, args: { resource: r } });
            });
          } else if (c === 'road_building') {
            this.pickFreeRoads('Road Building', 2, (edges) => Net.send('play_dev', { card: c, args: { edges } }));
          }
        };
      });
    },

    openPickResourceModal(title, cb, keys = RES, onCancel) {
      openModal(`
        <h3>${esc(title)}</h3>
        <div class="row">${keys.map(r => `<button class="chip" data-r="${r}">${Icons[r]} ${r}</button>`).join('')}</div>
      `);
      onModalClose(onCancel);
      document.querySelectorAll('.chip[data-r]').forEach(b => {
        b.onclick = () => { cb(b.dataset.r); closeModal(); };
      });
    },
    openPickTwoResourcesModal(title, cb) {
      const picks = [];
      const render = () => {
        openModal(`
          <h3>${esc(title)} (${picks.length}/2)</h3>
          <div class="row">${RES.map(r => `<button class="chip ${picks.includes(r) ? 'on' : ''}" data-r="${r}">${Icons[r]} ${r}${picks.filter(x => x === r).length > 1 ? ' ×2' : ''}</button>`).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip" id="pReset">Reset</button>
            <button class="chip" id="pCancel">Cancel</button>
            <button class="chip on" id="pConfirm" ${picks.length !== 2 ? 'disabled' : ''}>OK</button>
          </div>
        `);
        document.querySelectorAll('.chip[data-r]').forEach(b => {
          b.onclick = () => { if (picks.length < 2) picks.push(b.dataset.r); render(); };
        });
        document.getElementById('pReset').onclick = () => { picks.length = 0; render(); };
        document.getElementById('pCancel').onclick = () => { closeModal(); };
        document.getElementById('pConfirm').onclick = () => { cb(picks[0], picks[1]); closeModal(); };
      };
      render();
    },

    // ---------------- C&K: progress cards ----------------
    openProgressModal(discardMode = false) {
      const me = this.me, s = this.state;
      const cards = me.ck.progress || [];
      const canPlay = (c) => s.currentPlayerId === me.id && !s.busy &&
        (c === 'alchemy' ? s.phase === 'roll' : s.phase === 'main');
      openModal(`
        <h3>Progress cards <span style="color:var(--fg-mute);font-size:13px">(${cards.length}/4)</span></h3>
        ${discardMode ? '<div class="sec-hint">You hold more than 4 — play or discard down to 4 before ending your turn.</div>' : ''}
        <div class="row" style="flex-direction:column;align-items:stretch">
          ${cards.map((c, i) => `<div class="prog-row">
              <button class="chip prog" data-play="${c}" ${canPlay(c) ? '' : 'disabled'}><b>${pretty(c)}</b><span>${esc(PROGRESS_INFO[c] || '')}</span></button>
              ${s.currentPlayerId === me.id ? `<button class="chip ghost" data-discard="${c}" title="Discard">🗑</button>` : ''}
            </div>`).join('') || '<div class="sec-hint">No progress cards yet. They are drawn when the event die shows a city gate matching a track you have improved.</div>'}
        </div>
        ${me.ck.progressVP.length ? `<div class="sec-hint">Played VP cards: ${me.ck.progressVP.map(pretty).join(', ')}</div>` : ''}
      `);
      document.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { closeModal(); this.playProgressCard(b.dataset.play); });
      document.querySelectorAll('[data-discard]').forEach(b => b.onclick = () => { Net.send('ck_discard_progress', { card: b.dataset.discard }); closeModal(); });
    },

    playProgressCard(card) {
      const s = this.state, me = this.me, topo = s.map.topo;
      const send = (args = {}) => Net.send('ck_play', { card, args });
      const others = s.players.filter(p => p.id !== me.id);
      const mineVerts = new Set([...me.settlements, ...me.cities]);
      const pickVertex = (title, filter, cb) => { banner(title); Render.inst.startPick('vertex', filter, (v) => { banner(''); cb(v); }); };
      const pickHex = (title, filter, cb) => { banner(title); Render.inst.startPick('hex', filter, (h) => { banner(''); cb(h); }); };
      switch (card) {
        case 'alchemy': {
          let red = 1, yellow = 1;
          const render = () => {
            openModal(`<h3>Alchemy — set the production dice</h3>
              <div class="sec-label">Red die</div><div class="row">${[1, 2, 3, 4, 5, 6].map(n => `<button class="chip ${red === n ? 'on' : ''}" data-red="${n}">${n}</button>`).join('')}</div>
              <div class="sec-label" style="margin-top:12px">Yellow die</div><div class="row">${[1, 2, 3, 4, 5, 6].map(n => `<button class="chip ${yellow === n ? 'on' : ''}" data-yellow="${n}">${n}</button>`).join('')}</div>
              <div class="sec-hint">Total ${red + yellow}${red + yellow === 7 ? ' — robber!' : ''}. The red die also decides progress card draws.</div>
              <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="chip ghost" id="aCancel">Cancel</button><button class="chip on" id="aOk">Roll</button></div>`);
            document.querySelectorAll('[data-red]').forEach(b => b.onclick = () => { red = +b.dataset.red; render(); });
            document.querySelectorAll('[data-yellow]').forEach(b => b.onclick = () => { yellow = +b.dataset.yellow; render(); });
            document.getElementById('aCancel').onclick = closeModal;
            document.getElementById('aOk').onclick = () => { send({ red, yellow }); closeModal(); };
          };
          return render();
        }
        case 'crane':
          return this.openImproveMenu(true);
        case 'engineering':
          return pickVertex('Engineering — pick a city for a free wall', v => me.cities.includes(v.id) && !me.ck.cityWalls.includes(v.id), v => send({ vertexId: v }));
        case 'invention': {
          const ok = h => h.num != null && ![2, 6, 8, 12].includes(h.num);
          return pickHex('Invention — pick the first number disc', ok, a =>
            pickHex('Invention — pick the second number disc', h => ok(h) && h.id !== a, b => send({ hexA: a, hexB: b })));
        }
        case 'medicine':
          return pickVertex('Medicine — pick a settlement to upgrade (1 wheat + 2 ore)', v => me.settlements.includes(v.id), v => send({ vertexId: v }));
        case 'road_building':
          return this.pickFreeRoads('Road Building', 2, edges => send({ edges }));
        case 'smithing': {
          const picked = [];
          const canPromote = (v) => {
            const k = me.ck.knights[v]; if (!k) return false;
            if (k.rank >= 3 || k.promotedTurn === s.turnNumber) return false;
            return !(k.rank === 2 && me.ck.tracks.politics < 3);
          };
          const next = () => {
            bannerWithSkip(`Smithing — pick knight ${picked.length + 1}/2`, picked.length ? () => { Render.inst.cancelPick(); banner(''); send({ vertices: picked }); } : null, 'Done');
            Render.inst.startPick('vertex', v => canPromote(v.id) && !picked.includes(v.id), v => {
              picked.push(v);
              if (picked.length >= 2 || !Object.keys(me.ck.knights).some(x => canPromote(+x) && !picked.includes(+x))) { banner(''); send({ vertices: picked }); }
              else next();
            });
          };
          return next();
        }
        case 'irrigation': case 'mining': case 'encouragement': case 'sabotage': case 'wedding':
          return send({});
        case 'commercial_harbor': {
          const offers = {};
          const render = () => {
            openModal(`<h3>Commercial Harbor</h3>
              <div class="sec-hint">Offer each player one of your resources. They must give you a commodity of their choice (if they have none, you keep your card).</div>
              ${others.map(o => `<div class="sec-label" style="margin-top:10px"><span class="dot" style="background:${o.color}"></span> ${esc(o.name)}</div>
                <div class="row">${RES.map(r => `<button class="chip ${offers[o.id] === r ? 'on' : ''}" data-o="${o.id}" data-r="${r}" ${(me.hand.r[r] || 0) - Object.values(offers).filter(x => x === r).length + (offers[o.id] === r ? 1 : 0) <= 0 ? 'disabled' : ''}>${Icons[r]}</button>`).join('')}
                  <button class="chip ghost ${!offers[o.id] ? 'on' : ''}" data-o="${o.id}" data-r="">none</button></div>`).join('')}
              <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="chip ghost" id="chCancel">Cancel</button><button class="chip on" id="chOk">Play</button></div>`);
            document.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { if (b.dataset.r) offers[b.dataset.o] = b.dataset.r; else delete offers[b.dataset.o]; render(); });
            document.getElementById('chCancel').onclick = closeModal;
            document.getElementById('chOk').onclick = () => { send({ offers }); closeModal(); };
          };
          return render();
        }
        case 'guild_dues': {
          const richer = others.filter(o => o.publicVp > me.vp).map(o => o.id);
          if (!richer.length) return toast('Nobody has more VP than you');
          return this.choosePlayerModal('Guild Dues — take 2 cards from…', richer, id => send({ targetId: id }));
        }
        case 'merchant':
          return pickHex('Merchant — pick a hex next to one of your buildings', h => h.res !== 'desert' && topo.hexVertices[h.id].some(v => mineVerts.has(v)), h => send({ hexId: h }));
        case 'merchant_fleet':
          return this.openPickResourceModal('Merchant Fleet — trade this type 2:1 this turn', k => send({ kind: k }), [...RES, ...COMM]);
        case 'resource_monopoly':
          return this.openPickResourceModal('Resource Monopoly — each player gives you up to 2', r => send({ resource: r }));
        case 'trade_monopoly':
          return this.openPickResourceModal('Trade Monopoly — each player gives you 1', c => send({ commodity: c }), COMM);
        case 'diplomacy': {
          banner('Diplomacy — pick an open road to remove');
          return Render.inst.startPick('edge', e => this.isOpenRoad(e.id), e => { banner(''); send({ edgeId: e }); });
        }
        case 'espionage':
          return this.choosePlayerModal('Espionage — look at whose progress cards?', others.filter(o => o.ck.progressCount).map(o => o.id), id => send({ targetId: id }));
        case 'intrigue':
          return pickVertex("Intrigue — pick an opponent's knight on your road", v => {
            const k = this.knightAt(v.id); return k && k.player.id !== me.id && v.edges.some(e => me.roads.includes(e));
          }, v => send({ vertexId: v }));
        case 'taxation':
          if (!s.robberActive) return toast('The robber is not on the board until the first barbarian attack');
          return pickHex('Taxation — move the robber', h => h.id !== s.robberHex, h => send({ hexId: h }));
        case 'treason':
          return this.choosePlayerModal('Treason — which player removes a knight?', others.filter(o => Object.keys(o.ck.knights).length).map(o => o.id), id => send({ targetId: id }));
        default:
          return send({});
      }
    },

    // ---------------- C&K: improvements & knights ----------------
    openImproveMenu(crane = false) {
      const me = this.me, s = this.state;
      const rows = TRACKS.map(t => {
        const lvl = me.ck.tracks[t];
        const next = lvl + 1;
        const comm = TRACK_COMM[t];
        const cost = Math.max(0, next - (crane ? 1 : 0));
        const m = s.ck.metropolises[t];
        const holder = m ? s.players.find(p => p.id === m.playerId) : null;
        const ok = lvl < 5 && me.cities.length > 0 && (me.hand.c[comm] || 0) >= cost;
        return `<div class="imp-row ${t}">
          <div class="imp-head"><b>${t}</b> <span class="imp-lvl">level ${lvl}/5</span>
            ${holder ? `<span class="lp-tag">🏰 ${esc(holder.name)}${m.permanent ? ' (permanent)' : ''}</span>` : ''}</div>
          <div class="trk-bar big">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</div>
          <div class="sec-hint">${esc(TRACK_ABILITY[t])} (level 3) · progress cards on red 1–${lvl + 1}</div>
          <button class="chip ${ok ? 'on' : ''}" data-t="${t}" ${ok ? '' : 'disabled'}>
            ${lvl >= 5 ? 'Maxed' : `Level ${next} for ${cost} ${Icons[comm]} ${comm}`}</button>
        </div>`;
      }).join('');
      openModal(`<h3>${crane ? 'Crane — improve for 1 less' : 'City improvements'}</h3>
        ${me.cities.length ? '' : '<div class="sec-hint">You need at least one city to improve.</div>'}
        ${rows}`);
      document.querySelectorAll('.chip[data-t]').forEach(b => {
        b.onclick = () => {
          closeModal();
          if (crane) Net.send('ck_play', { card: 'crane', args: { track: b.dataset.t } });
          else Net.send('ck_improve', { track: b.dataset.t });
        };
      });
    },

    openKnightMenu() {
      const me = this.me, s = this.state;
      const knights = Object.entries(me.ck.knights);
      const rankName = { 1: 'basic', 2: 'strong', 3: 'mighty' };
      const robberAdj = s.robberActive && s.robberHex != null ? s.map.topo.hexVertices[s.robberHex] : [];
      const rows = knights.map(([vid, k]) => {
        const v = +vid;
        const canAct = this.knightCanAct(k);
        const r = this.reach(me.id, v);
        const moves = r.open.filter(x => !this.ownerOf(x) && !this.knightAt(x));
        const displace = r.blocked.filter(x => { const t = this.knightAt(x); return t && t.player.id !== me.id && t.knight.rank < k.rank; });
        const promoteOk = k.rank < 3 && k.promotedTurn !== s.turnNumber && !(k.rank === 2 && me.ck.tracks.politics < 3) && me.ck.knightSupply[k.rank + 1] > 0;
        return `<div class="kn-row">
          <span class="kn-badge ${k.active ? 'on' : ''}">${k.rank}</span>
          <span style="flex:1"><b>${rankName[k.rank]}</b> · ${k.active ? (canAct ? 'active' : 'active (next turn)') : 'inactive'}</span>
          <button class="chip" data-a="promote" data-v="${v}" ${promoteOk ? '' : 'disabled'} title="1 sheep + 1 ore${k.rank === 2 ? ' · needs politics 3' : ''}">Promote</button>
          <button class="chip" data-a="activate" data-v="${v}" ${k.active ? 'disabled' : ''} title="1 wheat">Activate</button>
          <button class="chip" data-a="move" data-v="${v}" ${canAct && moves.length ? '' : 'disabled'}>Move</button>
          <button class="chip" data-a="displace" data-v="${v}" ${canAct && displace.length ? '' : 'disabled'}>Displace</button>
          <button class="chip" data-a="chase" data-v="${v}" ${canAct && robberAdj.includes(v) ? '' : 'disabled'}>Chase robber</button>
        </div>`;
      }).join('');
      openModal(`<h3>Your knights</h3>
        <div class="sec-hint">Supply: basic ${me.ck.knightSupply[1]} · strong ${me.ck.knightSupply[2]} · mighty ${me.ck.knightSupply[3]}.
        Knights activated this turn can act from your next turn. Acting makes a knight inactive.</div>
        ${rows || '<div class="sec-hint">No knights yet — use the Knight button to recruit one (1 sheep + 1 ore).</div>'}`);
      document.querySelectorAll('[data-a]').forEach(b => {
        b.onclick = () => {
          const v = +b.dataset.v, a = b.dataset.a;
          closeModal();
          if (a === 'promote') return Net.send('ck_knight_promote', { vertexId: v });
          if (a === 'activate') return Net.send('ck_knight_activate', { vertexId: v });
          if (a === 'chase') return Net.send('ck_knight_chase', { vertexId: v });
          const k = me.ck.knights[v];
          const r = this.reach(me.id, v);
          if (a === 'move') {
            banner('Move knight — pick an empty intersection on your roads');
            Render.inst.startPick('vertex', x => r.open.includes(x.id) && !this.ownerOf(x.id) && !this.knightAt(x.id), to => { banner(''); Net.send('ck_knight_move', { from: v, to }); });
          } else {
            banner("Displace — pick a weaker opponent's knight");
            Render.inst.startPick('vertex', x => { const t = this.knightAt(x.id); return r.blocked.includes(x.id) && t && t.player.id !== me.id && t.knight.rank < k.rank; },
              to => { banner(''); Net.send('ck_knight_displace', { from: v, to }); });
          }
        };
      });
    },

    openHistoryModal() {
      const history = (this.state && this.state.tradeHistory) || [];
      const players = this.state ? this.state.players : [];
      const keys = [...RES, ...COMM];
      const nameOf = (id) => {
        const p = players.find(x => x.id === id);
        return p ? p.name : '?';
      };
      const colorOf = (id) => {
        const p = players.find(x => x.id === id);
        return p ? p.color : 'var(--fg-mute)';
      };
      const fmt = (o) => keys.filter(r => (o[r] || 0) > 0)
        .map(r => `<span class="trade-pill ${r}">${o[r]}${Icons[r]}</span>`).join('') || '—';
      const dot = (id) => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorOf(id)};margin:0 4px -1px 0"></span>`;

      const rows = history.length === 0
        ? '<div style="color:var(--fg-mute);text-align:center;padding:30px 0;font-size:13px">No trades yet</div>'
        : history.slice().reverse().map(h => {
            const time = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (h.kind === 'bank') {
              return `<div class="hist-row">
                <span class="hist-time">${time}</span>
                <span class="hist-parties">${dot(h.fromId)}${esc(nameOf(h.fromId))} <span class="hist-arrow">⇄ BANK</span></span>
                <span class="hist-trade">${fmt(h.give)}<span class="arrow">→</span>${fmt(h.take)}</span>
              </div>`;
            }
            return `<div class="hist-row">
              <span class="hist-time">${time}</span>
              <span class="hist-parties">${dot(h.fromId)}${esc(nameOf(h.fromId))} <span class="hist-arrow">⇄</span> ${dot(h.toId)}${esc(nameOf(h.toId))}</span>
              <span class="hist-trade">${fmt(h.give)}<span class="arrow">→</span>${fmt(h.take)}</span>
            </div>`;
          }).join('');

      const totals = {};
      for (const p of players) totals[p.id] = { out: 0, in: 0 };
      for (const h of history) {
        const outCount = Object.values(h.give).reduce((a, b) => a + b, 0);
        const inCount  = Object.values(h.take).reduce((a, b) => a + b, 0);
        if (totals[h.fromId]) { totals[h.fromId].out += outCount; totals[h.fromId].in += inCount; }
        if (h.toId && totals[h.toId]) { totals[h.toId].out += inCount; totals[h.toId].in += outCount; }
      }
      const totalsHtml = players.map(p => `
        <div class="hist-total">
          ${dot(p.id)}<span style="font-weight:600">${esc(p.name)}</span>
          <span class="hist-total-nums">
            <span title="Given">−${totals[p.id].out}</span>
            <span title="Received">+${totals[p.id].in}</span>
          </span>
        </div>`).join('');

      openModal(`
        <h3>Trade history <span style="color:var(--fg-mute);font-weight:500;font-size:13px;margin-left:8px">${history.length} trade${history.length === 1 ? '' : 's'}</span></h3>
        <div class="hist-totals">${totalsHtml}</div>
        <div class="hist-list">${rows}</div>
        <div class="row" style="justify-content:flex-end;margin-top:16px">
          <button class="chip ghost" id="hClose">Close</button>
        </div>
      `);
      document.getElementById('hClose').onclick = closeModal;
    },
  };

  // The engine's yellow die is drawn as the white production die.
  function diceHtml(d, idle = false, rolling = false) {
    const die = (id, title) => `<img class="die${idle ? ' idle' : ''}${rolling ? ' rolling' : ''}" src="${Assets.url(id)}" width="52" height="52" alt="${title}" title="${title}">`;
    return die('die_white_' + d.yellow, `white ${d.yellow}`) + die('die_red_' + d.red, `red ${d.red}`) +
      (d.event ? die('die_event_' + d.event, `event: ${d.event}`) : '');
  }
  function hudImg(id, title = '') {
    return `<img class="hi" src="${Assets.url(id)}" width="18" height="18" alt=""${title ? ` title="${esc(title)}"` : ''}>`;
  }
  function btnEl(label, onClick, span = false, cls = '') {
    const b = document.createElement('button');
    b.textContent = label; b.onclick = onClick;
    if (span) b.style.gridColumn = 'span 2';
    if (cls) b.className = cls;
    return b;
  }
  function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function isLight(hex) {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 180;
  }
  function pips(n) {
    const dots = {
      1: [[2,2]],
      2: [[1,1],[3,3]],
      3: [[1,1],[2,2],[3,3]],
      4: [[1,1],[3,1],[1,3],[3,3]],
      5: [[1,1],[3,1],[2,2],[1,3],[3,3]],
      6: [[1,1],[3,1],[1,2],[3,2],[1,3],[3,3]],
    }[n] || [[2,2]];
    const w = 42;
    const cells = dots.map(([x, y]) => `<circle cx="${x * 10}" cy="${y * 10}" r="3.2" fill="currentColor"/>`).join('');
    return `<svg viewBox="0 0 40 40" width="${w}" height="${w}">${cells}</svg>`;
  }
  function strip(o) { const out = {}; for (const [k, v] of Object.entries(o)) if (v > 0) out[k] = v; return out; }
  function ownerOf(s, vId) {
    for (const p of s.players) if (p.settlements.includes(vId) || p.cities.includes(vId)) return p;
    return null;
  }
  let modalCloseCb = null;
  function openModal(html) {
    const m = document.getElementById('modal');
    m.classList.remove('modal-cardpick');
    document.getElementById('modalBody').innerHTML = html;
    m.classList.remove('hidden');
    modalCloseCb = null;
  }
  function onModalClose(cb) { modalCloseCb = cb || null; }
  function closeModalSilently() {
    modalCloseCb = null;
    document.getElementById('modal').classList.add('hidden');
  }
  function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    const cb = modalCloseCb; modalCloseCb = null;
    if (cb) cb();
  }
  function banner(msg) {
    const b = document.getElementById('banner');
    if (!msg) { b.classList.add('hidden'); b.innerHTML = ''; return; }
    b.innerHTML = `${esc(msg)} <span class="banner-cancel" title="Cancel (Esc)">✕</span>`;
    b.classList.remove('hidden');
    const cancel = b.querySelector('.banner-cancel');
    cancel.onclick = () => {
      if (Render.inst) Render.inst.cancelPick();
      if (UI._pickPrompt) { UI._promptOpen = null; UI._pickPrompt = null; }
      banner('');
      setTimeout(() => UI.state && UI.renderActions(), 0); // setup spots come straight back
    };
  }
  function bannerWithSkip(msg, onSkip, label = 'Skip') {
    banner(msg);
    if (!onSkip) return;
    const b = document.getElementById('banner');
    const btn = document.createElement('button');
    btn.className = 'chip on banner-skip';
    btn.textContent = label;
    btn.onclick = () => { banner(''); onSkip(); };
    b.insertBefore(btn, b.querySelector('.banner-cancel'));
  }

  window.UI = UI;
  window.closeModal = closeModal;
  window.banner = banner;
})();
