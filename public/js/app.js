// App entry: screen routing, home form, wire up Net + UI + Render.
(async function () {
  // Theme toggle: light ⇄ dark
  const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t);
  let stored = null;
  try { stored = localStorage.getItem('catan.theme'); } catch {}
  if (stored) applyTheme(stored);
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('catan.theme', next); } catch {}
  }
  document.getElementById('themeToggle').onclick = toggleTheme;

  // Populate maps + modes
  const [maps, modes] = await Promise.all([
    fetch('/api/maps').then(r => r.json()),
    fetch('/api/modes').then(r => r.json()),
  ]);
  UI.maps = maps; UI.modes = modes;
  const mapSel = document.getElementById('mapSelect');
  for (const m of maps) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = `${m.label} — ${m.hint}`;
    mapSel.appendChild(o);
  }

  // Host settings: map + mode + advanced settings (points to win, players, discard, timer)
  let hostSettings = Settings.defaults('base', 'classic', maps);
  const modeRow = document.getElementById('modeRow');
  function renderModes() {
    modeRow.innerHTML = '';
    for (const m of modes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-opt' + (m.id === hostSettings.mode ? ' on' : '');
      btn.dataset.mode = m.id;
      btn.innerHTML = `<div class="m-title">${m.label}</div><div class="m-sub">${m.hint}</div>`;
      btn.onclick = () => setHost(Settings.applyChange(hostSettings, 'mode', m.id, maps));
      modeRow.appendChild(btn);
    }
  }
  function renderHostSettings() {
    Settings.render(document.getElementById('hostSettings'), hostSettings, {
      editable: true, maps, modes,
      onChange: (next) => setHost(next, /*fromSlider*/ true),
    });
  }
  function setHost(next, fromSlider = false) {
    const structural = next.mode !== hostSettings.mode || next.mapVariant !== hostSettings.mapVariant;
    hostSettings = next;
    if (structural || !fromSlider) { renderModes(); renderHostSettings(); }
  }
  mapSel.onchange = () => setHost(Settings.applyChange(hostSettings, 'mapVariant', mapSel.value, maps));
  renderModes(); renderHostSettings();

  // Prefill from URL
  const q = new URLSearchParams(location.search);
  if (q.get('r')) document.getElementById('joinCode').value = q.get('r').toUpperCase();

  await Net.connect();

  // Offer to rejoin a game we were in (reload / crashed tab)
  const saved = Net.saved();
  const rejoinBtn = document.getElementById('rejoinBtn');
  if (saved) {
    rejoinBtn.textContent = `↻ Rejoin game ${saved.code}`;
    rejoinBtn.classList.remove('hidden');
    rejoinBtn.onclick = () => Net.rejoin(saved.code, saved.token);
  }

  Net.on('error', (m) => {
    if (m === 'cannot rejoin that game' || m === 'that game no longer exists') rejoinBtn.classList.add('hidden');
    toast(m);
  });
  Net.on('status', (s) => {
    if (s === 'offline') toast('Connection lost — reconnecting…', 4000);
    if (s === 'online') toast('Reconnected', 1500);
  });

  Net.on('joined', () => {
    document.getElementById('screen-home').classList.add('hidden');
    document.getElementById('screen-game').classList.remove('hidden');
    document.getElementById('roomCode').textContent = Net.code;
    // layout is now final; make sure the canvas has real dimensions before drawing
    requestAnimationFrame(() => Render.inst && Render.inst.resize());
  });

  // Hoist renderer onto window.Render.inst
  const canvas = document.getElementById('board');
  Render.inst = new Render.Renderer(canvas);

  // Zoom controls
  document.getElementById('zoomIn') .onclick = () => Render.inst.zoom(1.2);
  document.getElementById('zoomOut').onclick = () => Render.inst.zoom(1 / 1.2);
  document.getElementById('zoomFit').onclick = () => Render.inst.recenter();

  Net.on('state', (state) => {
    Render.inst.setState(state);
    UI.render(state);
  });

  Net.on('chat', (msg) => {
    const log = document.getElementById('chatLog');
    const d = document.createElement('div');
    d.className = 'msg';
    d.innerHTML = `<span class="dot" style="background:${msg.color}"></span> <b>${escape(msg.from)}:</b> ${escape(msg.text)}`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  });

  document.getElementById('hostBtn').onclick = () => {
    const name = document.getElementById('hostName').value.trim() || 'Host';
    const code = document.getElementById('hostCode').value.trim();
    Net.send('create', { name, code, settings: hostSettings });
  };

  // --- Tabs on home: switch which card is highlighted / focused ---
  function pickTab(tab) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.navitem[data-pick-tab]').forEach(b => b.classList.toggle('active', b.dataset.pickTab === tab));
    document.querySelectorAll('.panel[data-card]').forEach(c => {
      c.style.boxShadow = c.dataset.card === tab
        ? '0 0 0 3px var(--yellow), var(--shadow-1)'
        : 'var(--shadow-1)';
    });
    if (tab === 'host') document.getElementById('hostName').focus();
    if (tab === 'join') document.getElementById('joinName').focus();
  }
  document.querySelectorAll('[data-tab], [data-pick-tab]').forEach(b => {
    b.onclick = () => pickTab(b.dataset.tab || b.dataset.pickTab);
  });

  // --- Rules modal ---
  function openRules() {
    const s = UI.state;
    const target = s ? s.vpTarget : null;
    const html = `
      <h3>How to play</h3>
      <div style="font-size:13px;line-height:1.55;color:var(--fg);font-weight:600;max-height:60vh;overflow-y:auto">
        <p><strong style="color:var(--yellow)">Goal</strong> — be first to reach the room's points target on your own turn
        (${target ? `<strong>${target} VP</strong> in this room` : 'default <strong>10 VP</strong> base, <strong>13 VP</strong> Cities &amp; Knights; the host can pick 10–20'}).
        Settlement 1 · City 2 · Longest Road 2 · Largest Army 2 · VP card 1.</p>

        <p><strong style="color:var(--yellow)">Setup</strong> — each player places a settlement and a road, then a second round in reverse order
        (in Cities &amp; Knights the second piece is a <em>city</em>). You collect 1 resource per hex next to your second piece.</p>

        <p><strong style="color:var(--yellow)">Each turn</strong></p>
        <ol style="margin:4px 0 10px 20px;padding:0">
          <li>Roll. Each hex with that number pays touching settlements (1) and cities (2). If the bank runs short of a resource, nobody gets it — unless only one player is owed.</li>
          <li>On a <strong>7</strong>: everyone over the discard limit (default 7) discards half, then the roller moves the robber and steals 1 card.</li>
          <li>Trade with players (no gifts, no like-for-like) or the bank: 4:1, 3:1 / 2:1 at harbors.</li>
          <li>Build or buy development cards. One dev card per turn, any time — even before rolling — but not the turn you bought it.</li>
        </ol>

        <p><strong style="color:var(--yellow)">Build costs</strong> — Road: wood+brick · Settlement: wood+brick+sheep+wheat · City: 2 wheat + 3 ore · Dev card: sheep+wheat+ore.
        Supply: 15 roads, 5 settlements, 4 cities.</p>

        <p><strong style="color:var(--yellow)">Cities &amp; Knights</strong> — 3 dice: the event die moves the barbarian ship or draws progress cards
        (red die ≤ your track level + 1). Cities on forest/pasture/mountains give 1 resource + 1 commodity (paper/cloth/coin).
        Commodities buy improvements: Trade = cloth, Politics = coin, Science = paper (level N costs N). Level 3 unlocks
        Merchant Guild (2:1 commodities) / Fortress (mighty knights) / Aqueduct (a free resource when you get nothing);
        first to level 4 takes the metropolis (+2 VP), first to 5 keeps it for good.
        Knights: recruit 1 sheep + 1 ore, promote the same, activate 1 wheat. Active knights can move, displace weaker knights or chase the robber.
        When the ship lands, barbarian strength (cities) vs active knights: lose and the weakest defenders lose a city; win and the top defender gets 1 VP.
        The robber stays off the board until the first attack. City walls (2 brick) raise your discard limit by 2.</p>

        <p><strong style="color:var(--yellow)">Board shortcuts</strong></p>
        <ul style="margin:4px 0 10px 20px;padding:0">
          <li>Mouse wheel or +/− buttons = zoom. Drag the board to pan. ⤢ fits the whole map.</li>
          <li>Hover any hex for a tooltip (resource, number, roll probability).</li>
          <li>Esc or right-click cancels an active placement.</li>
        </ul>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="chip on" id="rClose">Got it</button>
      </div>
    `;
    const m = document.getElementById('modal');
    document.getElementById('modalBody').innerHTML = html;
    m.classList.remove('hidden');
    document.getElementById('rClose').onclick = closeModal;
  }
  document.getElementById('rulesNav').onclick = openRules;
  document.getElementById('rulesBtn').onclick  = openRules;
  document.getElementById('rulesBtn2').onclick = openRules;

  // --- Global keyboard: Esc cancels pickers / closes modal ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('modal').classList.contains('hidden')) {
        closeModal();
      } else if (Render.inst && Render.inst.pick) {
        Render.inst.cancelPick();
        UI.cancelPrompt();
        banner('');
      }
    }
  });
  // Right-click on board cancels active pick
  document.getElementById('board').addEventListener('contextmenu', (e) => {
    if (Render.inst && Render.inst.pick) {
      e.preventDefault();
      Render.inst.cancelPick();
      UI.cancelPrompt();
      banner('');
    }
  });
  document.getElementById('joinBtn').onclick = () => {
    const name = document.getElementById('joinName').value.trim() || 'Player';
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!code) return toast('Enter a room code');
    Net.send('join', { name, code });
  };

  document.getElementById('copyLink').onclick = () => {
    const url = `${location.origin}?r=${Net.code}`;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('copyLink');
      const old = btn.textContent; btn.textContent = '✓';
      setTimeout(() => (btn.textContent = old), 1000);
    }).catch(() => toast(url, 5000));
  };

  document.getElementById('historyBtn').onclick = () => UI.openHistoryModal();

  // Log / Chat tabs, and the drawer toggle used on narrow screens
  const logChat = document.getElementById('logChat');
  logChat.querySelectorAll('.lc-tab[data-pane]').forEach(tab => {
    tab.onclick = () => {
      logChat.querySelectorAll('.lc-tab[data-pane]').forEach(t => t.classList.toggle('on', t === tab));
      logChat.querySelectorAll('.lc-pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== tab.dataset.pane));
      if (tab.dataset.pane === 'chat') document.getElementById('chatInput').focus();
    };
  });
  document.getElementById('chatToggle').onclick = () => logChat.classList.toggle('open');

  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      Net.send('chat', { text: e.target.value.trim() });
      e.target.value = '';
    }
  });

  // Close modal on backdrop click
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  function escape(s) {
    return (s || '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
})();

// Small non-blocking notifications instead of alert()
function toast(msg, ms = 2600) {
  let wrap = document.getElementById('toasts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toasts'; wrap.className = 'toasts';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms - 300);
  setTimeout(() => t.remove(), ms);
}
