// Room settings UI (Colonist-style rows: label + value bubble + slider).
// Used by the host card on the home screen and by the lobby panel in-game.
// Exposes window.Settings.
(function () {
  const DEFAULT_VP = { base: 10, cnk: 13 };
  const LIMITS = {
    vpTarget: { min: 10, max: 20 },
    maxPlayers: { min: 3, max: 6 },
    discardLimit: { min: 5, max: 20 },
    turnTimer: [0, 30, 60, 90, 120, 180, 300],
  };

  function fmtTimer(s) {
    if (!s) return 'Off';
    return s < 60 ? `${s}s` : (s % 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s / 60} min`);
  }
  function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function defaults(mode = 'base', mapVariant = 'classic', maps = []) {
    const m = maps.find(x => x.id === mapVariant);
    return {
      mapVariant, mode,
      vpTarget: DEFAULT_VP[mode],
      maxPlayers: m ? Math.max(3, m.maxPlayers) : 4,
      discardLimit: 7,
      turnTimer: 0,
    };
  }

  // Applies a change with the same rules the server uses (mode switch resets VP to the
  // mode default; map change clamps max players).
  function applyChange(s, key, value, maps) {
    const next = { ...s, [key]: value };
    if (key === 'mode' && value !== s.mode) next.vpTarget = DEFAULT_VP[value];
    const m = maps.find(x => x.id === next.mapVariant);
    const maxForMap = m ? Math.max(3, m.maxPlayers) : 6;
    if (key === 'mapVariant') next.maxPlayers = maxForMap;
    next.maxPlayers = Math.max(3, Math.min(maxForMap, next.maxPlayers));
    return next;
  }

  function sliderRow({ key, icon, label, hint, value, min, max, editable, suffix = '' }) {
    const ticks = [];
    for (let v = min; v <= max; v++) ticks.push(v);
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    return `
      <div class="set-row" data-key="${key}">
        <div class="set-head">
          <span class="set-ico">${icon}</span>
          <div class="set-text"><div class="set-label">${label}</div>${hint ? `<div class="set-hint">${hint}</div>` : ''}</div>
          <span class="set-value" data-value="${key}">${value}${suffix}</span>
        </div>
        <input type="range" class="set-range" data-range="${key}" min="${min}" max="${max}" step="1"
               value="${value}" ${editable ? '' : 'disabled'} style="--pct:${pct}%" aria-label="${label}">
        <div class="set-ticks">${ticks.length <= 12 ? ticks.map(t => `<span>${t}</span>`).join('') : `<span>${min}</span><span>${max}</span>`}</div>
      </div>`;
  }

  // opts: { editable, maps, modes, showMapMode, onChange(settings) }
  function render(container, settings, opts) {
    const { editable, maps = [], modes = [], showMapMode = false } = opts;
    const s = settings;
    const map = maps.find(m => m.id === s.mapVariant);
    const maxForMap = map ? Math.max(3, map.maxPlayers) : 6;
    const timerIdx = Math.max(0, LIMITS.turnTimer.indexOf(s.turnTimer));
    container.innerHTML = `
      ${showMapMode ? `
        <div class="set-row">
          <div class="set-head"><span class="set-ico">🗺️</span><div class="set-text"><div class="set-label">Map</div></div></div>
          <select data-select="mapVariant" ${editable ? '' : 'disabled'}>
            ${maps.map(m => `<option value="${m.id}" ${m.id === s.mapVariant ? 'selected' : ''}>${esc(m.label)} — ${esc(m.hint)}</option>`).join('')}
          </select>
        </div>
        <div class="set-row">
          <div class="set-head"><span class="set-ico">🎲</span><div class="set-text"><div class="set-label">Mode</div></div></div>
          <div class="mode-row">
            ${modes.map(m => `<button type="button" class="mode-opt ${m.id === s.mode ? 'on' : ''}" data-mode="${m.id}" ${editable ? '' : 'disabled'}>
              <div class="m-title">${esc(m.label)}</div><div class="m-sub">${esc(m.hint)}</div></button>`).join('')}
          </div>
        </div>` : ''}
      ${sliderRow({ key: 'vpTarget', icon: '🏆', label: 'Points to win', hint: `Default: ${DEFAULT_VP[s.mode]} for ${s.mode === 'cnk' ? 'Cities &amp; Knights' : 'base game'}`,
                    value: s.vpTarget, ...LIMITS.vpTarget, editable })}
      ${sliderRow({ key: 'maxPlayers', icon: '👥', label: 'Max players', hint: `This map seats up to ${maxForMap}`,
                    value: s.maxPlayers, min: 3, max: maxForMap, editable })}
      ${sliderRow({ key: 'discardLimit', icon: '🃏', label: 'Card discard limit', hint: `Hands over this discard half on a 7${s.mode === 'cnk' ? ' (+2 per city wall)' : ''}`,
                    value: s.discardLimit, ...LIMITS.discardLimit, editable })}
      <div class="set-row" data-key="turnTimer">
        <div class="set-head">
          <span class="set-ico">⏱️</span>
          <div class="set-text"><div class="set-label">Turn timer</div><div class="set-hint">When time runs out the game acts for the waiting player</div></div>
          <span class="set-value" data-value="turnTimer">${fmtTimer(s.turnTimer)}</span>
        </div>
        <input type="range" class="set-range" data-range="turnTimer" min="0" max="${LIMITS.turnTimer.length - 1}" step="1"
               value="${timerIdx}" ${editable ? '' : 'disabled'} style="--pct:${(timerIdx / (LIMITS.turnTimer.length - 1)) * 100}%" aria-label="Turn timer">
        <div class="set-ticks">${LIMITS.turnTimer.map(t => `<span>${fmtTimer(t).replace(' min', 'm')}</span>`).join('')}</div>
      </div>
    `;
    if (!editable) return;
    // Keep the latest settings across successive slider changes (no stale snapshot).
    let current = s;
    const emit = (key, value) => { current = applyChange(current, key, value, maps); opts.onChange(current); };
    container.querySelectorAll('[data-range]').forEach(inp => {
      const key = inp.dataset.range;
      const toValue = () => key === 'turnTimer' ? LIMITS.turnTimer[+inp.value] : +inp.value;
      inp.addEventListener('input', () => {
        const min = +inp.min, max = +inp.max;
        inp.style.setProperty('--pct', `${((+inp.value - min) / (max - min || 1)) * 100}%`);
        const label = container.querySelector(`[data-value="${key}"]`);
        label.textContent = key === 'turnTimer' ? fmtTimer(toValue()) : toValue();
        if (opts.live !== false) emit(key, toValue());
      });
      inp.addEventListener('change', () => emit(key, toValue()));
    });
    container.querySelectorAll('[data-select]').forEach(sel => {
      sel.addEventListener('change', () => emit(sel.dataset.select, sel.value));
    });
    container.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => emit('mode', btn.dataset.mode));
    });
  }

  function summary(s, maps, modes) {
    const m = maps.find(x => x.id === s.mapVariant);
    const mode = modes.find(x => x.id === s.mode);
    return `${esc(m ? m.label : s.mapVariant)} · ${esc(mode ? mode.label : s.mode)} · ${s.vpTarget} VP · ${s.maxPlayers} max · discard >${s.discardLimit} · timer ${fmtTimer(s.turnTimer)}`;
  }

  window.Settings = { render, defaults, applyChange, summary, fmtTimer, DEFAULT_VP, LIMITS };
})();
