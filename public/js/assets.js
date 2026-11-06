// Sprite atlases for the board and HUD. Assets.load() never rejects: if the atlases are missing
// or fail to decode, Assets.ready stays false and the renderer keeps its procedural drawing.
(function () {
  const ATLASES = ['hexes', 'ports', 'cards', 'pieces_hud'];
  const PLAYER_KEYS = {
    '#E53935': 'red', '#00B0FF': 'blue', '#FB8C00': 'orange',
    '#ECEFF1': 'white', '#2E9D47': 'green', '#7B4A2E': 'brown',
  };
  const frames = {};   // id -> { img, x, y, w, h }
  let manifest = {};   // id -> path under assets/
  const waiting = [];

  async function json(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  const Assets = {
    ready: false,
    async load(base = 'assets/') {
      try { manifest = await json(base + 'manifest.json'); } catch (e) { console.warn('asset manifest unavailable:', e.message); }
      try {
        await Promise.all(ATLASES.map(async (name) => {
          const meta = await json(`${base}atlases/${name}_atlas.json`);
          const img = new Image();
          img.src = `${base}atlases/${meta.meta.image}`;
          await img.decode();
          for (const [id, f] of Object.entries(meta.frames)) frames[id] = { img, x: f.x, y: f.y, w: f.w, h: f.h };
        }));
        Assets.ready = true;
        for (const fn of waiting.splice(0)) { try { fn(); } catch (e) { console.warn(e); } }
      } catch (e) {
        console.warn('sprite atlases unavailable, drawing the board procedurally:', e.message);
      }
    },
    has(id) { return Assets.ready && !!frames[id]; },
    // Draw sprite `id` centred on (cx, cy), scaled to w x h, rotated by rot radians.
    draw(ctx, id, cx, cy, w, h, rot = 0) {
      const f = Assets.ready && frames[id];
      if (!f) return false;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(cx, cy);
      if (rot) ctx.rotate(rot);
      ctx.drawImage(f.img, f.x, f.y, f.w, f.h, -w / 2, -h / 2, w, h);
      ctx.restore();
      return true;
    },
    // Works before the manifest has loaded: ids map to folders by prefix.
    url(id) {
      if (manifest[id]) return 'assets/' + manifest[id];
      const dir = [['icon_', 'icons'], ['hud_', 'icons'], ['die_', 'dice'], ['piece_', 'pieces'], ['knight_', 'knights'],
        ['token_', 'tokens'], ['card_back_', 'cards/backs'], ['card_', 'cards/resources'], ['dev_', 'cards/development'],
        ['prog_', 'cards/progress'], ['port_', 'ports'], ['hex_', 'hexes']].find(([p]) => id.startsWith(p));
      return dir ? `assets/${dir[1]}/${id}.svg` : '';
    },
    playerKey(hex) { return PLAYER_KEYS[String(hex || '').toUpperCase()] || 'white'; },
    onReady(fn) { if (Assets.ready) fn(); else waiting.push(fn); },
  };

  window.Assets = Assets;
  Assets.load();
})();
