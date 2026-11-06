// Small string helpers for building standalone SVG documents.
const FONT = 'Inter, system-ui, sans-serif';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function doc(w, h, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    (defs ? `<defs>${defs}</defs>` : '') + body + '</svg>\n';
}

function linear(id, top, bot) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`;
}

function shadow(id) {
  return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.55"/></filter>`;
}

function attrs(a = {}) {
  return Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join('');
}

function text(x, y, str, a = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" text-anchor="middle"${attrs(a)}>${esc(str)}</text>`;
}

// Greedy word wrap for card rules text.
function wrap(str, maxChars) {
  const lines = [];
  let line = '';
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > maxChars) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines;
}

const pts = (arr) => arr.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' ');

module.exports = { FONT, esc, doc, linear, shadow, attrs, text, wrap, pts };
