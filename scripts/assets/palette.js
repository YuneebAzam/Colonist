// Every colour the asset generator uses, copied from the redesign spec (§1, §4).
// Green and brown are the plan's D2 additions for 5-6 player games.
const PLAYERS = [
  { key: 'red',    fill: '#E53935', shade: '#8E1B18', spec: '#FF8A80' },
  { key: 'blue',   fill: '#00B0FF', shade: '#005B8F', spec: '#80D8FF' },
  { key: 'orange', fill: '#FB8C00', shade: '#9E5100', spec: '#FFD180' },
  { key: 'white',  fill: '#ECEFF1', shade: '#78909C', spec: '#FFFFFF' },
  { key: 'green',  fill: '#2E9D47', shade: '#1B5E2B', spec: '#81C784' },
  { key: 'brown',  fill: '#7B4A2E', shade: '#4A2C1B', spec: '#BCAAA4' },
];

// Terrain hexes: gradient top/bottom + accent (spec Category 1 table).
const RES = {
  wood:   { top: '#2D6A3E', bot: '#184225', accent: '#68B678' },
  brick:  { top: '#C85232', bot: '#8A2F19', accent: '#E88364' },
  sheep:  { top: '#7CB342', bot: '#4B7C1D', accent: '#AED581' },
  wheat:  { top: '#E5A922', bot: '#AD740B', accent: '#FFD54F' },
  ore:    { top: '#64707D', bot: '#3B434C', accent: '#00E5FF' },
  desert: { top: '#D9B36C', bot: '#A37B37', accent: '#F2D7A0' },
  ocean:  { top: '#1B4F72', bot: '#0F2942', accent: '#2E86C1' },
  gold:   { top: '#D4AF37', bot: '#856404', accent: '#FFE066' },
};

// Card frame accents (Category 4) — resource cards use the lighter accent for ore.
const CARD_ACCENT = { wood: '#68B678', brick: '#E88364', sheep: '#AED581', wheat: '#FFD54F', ore: '#98A6B5' };
const CARD_TINT   = { wood: '#184225', brick: '#8A2F19', sheep: '#4B7C1D', wheat: '#AD740B', ore: '#3B434C' };

const COMM = {
  paper: { accent: '#29BB89', tint: '#123D30', track: 'science' },
  cloth: { accent: '#F7B733', tint: '#4A3508', track: 'trade' },
  coin:  { accent: '#00E5FF', tint: '#0A3647', track: 'politics' },
};

const TRACK = { trade: '#FFD166', politics: '#00E5FF', science: '#4CE08A' };

const CHIT = { surface: '#FAF6EC', rim: '#F5EFE0', ink: '#141414', hot: '#E53935', ring: '#B0BEC5' };

const HUD = { primary: '#141414', elevated: '#1E1E24', panel: '#25262E', border: '#2E303A', electric: '#00E5FF' };

module.exports = { PLAYERS, RES, CARD_ACCENT, CARD_TINT, COMM, TRACK, CHIT, HUD };
