// Formats a game-log line as HTML: escaped text, player names in their colour, resource words as
// 20px icons, a die icon on roll lines, and classes on barbarian / robber events.
// Shared by the browser (window.LogFmt) and node tests (require).
(function (root) {
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore', 'paper', 'cloth', 'coin'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeColor = (c) => (/^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : '#ECEFF1');
  const icon = (id, alt) => `<img class="li" src="assets/icons/${id}.svg" width="20" height="20" alt="${alt}">`;
  const RES_RE = new RegExp(`(?<![\\w-])(${RES.join("|")})(s)?(?![\\w-])`, "gi");

  function format(text, players) {
    let html = esc(text);
    // Resource words first (their markup contains no player names).
    html = html.replace(RES_RE, (m, word) => icon('icon_' + word.toLowerCase(), word.toLowerCase()));
    // Player names, longest first so "Ann" never eats part of "Anna". Only touch text outside tags.
    const ps = (players || []).filter(p => p && p.name).slice().sort((a, b) => b.name.length - a.name.length);
    for (const p of ps) {
      const re = new RegExp(`(^|[^\\w>])(${reEsc(esc(p.name))})(?![\\w<])`, 'g');
      html = html.split(/(<[^>]+>)/).map(part => part.startsWith('<') ? part
        : part.replace(re, (m, pre, name) => `${pre}<b style="color:${safeColor(p.color)}">${name}</b>`)).join('');
    }
    if (/\brolled \d+/i.test(text)) html = icon('die_white_1', 'roll').replace('icons/', 'dice/') + ' ' + html;
    const cls = /barbarian/i.test(text) ? 'ev-barb' : /robber|stole/i.test(text) ? 'ev-rob' : '';
    return cls ? `<span class="${cls}">${html}</span>` : html;
  }

  const api = { format };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LogFmt = api;
})(this);
