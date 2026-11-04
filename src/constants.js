// Shared constants. Keep in sync with public/js if you edit.
const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const COMMODITIES = ['paper', 'cloth', 'coin']; // from wood/sheep/ore cities in C&K
const COMMODITY_FROM = { wood: 'paper', sheep: 'cloth', ore: 'coin' };

const BUILD_COST = {
  road:       { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city:       { wheat: 2, ore: 3 },
  dev:        { sheep: 1, wheat: 1, ore: 1 },
  // C&K
  cityWall:   { brick: 2 },
  knight:     { sheep: 1, ore: 1 },   // recruit and promote
  activate:   { wheat: 1 },
  medicine:   { wheat: 1, ore: 2 },
};

// Supply sizes from the rulebooks.
const PIECES = { roads: 15, settlements: 5, cities: 4 };
const BANK_RESOURCES = 19;      // per resource type
const BANK_COMMODITIES = 12;    // per commodity type (C&K)

const DEV_CARD_DECK = [
  ...Array(14).fill('knight'),
  ...Array(5).fill('vp'),
  ...Array(2).fill('road_building'),
  ...Array(2).fill('year_of_plenty'),
  ...Array(2).fill('monopoly'),
];

// C&K improvement tracks: trade (cloth), politics (coin), science (paper)
const CK_TRACKS = ['trade', 'politics', 'science'];
const CK_COMMODITY_FOR_TRACK = { trade: 'cloth', politics: 'coin', science: 'paper' };
// Level N costs N commodities of that track's type. Level 3 unlocks the track ability,
// level 4 (first) = temporary metropolis, level 5 (first) = permanent metropolis.
const CK_MAX_LEVEL = 5;
const CK_METROPOLIS_LEVEL = 4;
const CK_KNIGHTS_PER_RANK = 2;
const CK_MAX_WALLS = 3;
const CK_BARBARIAN_DISTANCE = 7;
const CK_PROGRESS_HAND_LIMIT = 4;

// 54 progress cards (2025 / 6th-edition rulebook).
const PROGRESS_DECKS = {
  science: {
    alchemy: 2, crane: 2, engineering: 1, invention: 2, irrigation: 2,
    medicine: 2, mining: 2, road_building: 2, smithing: 2, printing: 1,
  },
  trade: {
    commercial_harbor: 2, guild_dues: 2, merchant: 6, merchant_fleet: 2,
    trade_monopoly: 2, resource_monopoly: 4,
  },
  politics: {
    diplomacy: 2, encouragement: 2, espionage: 3, intrigue: 2, sabotage: 2,
    taxation: 2, treason: 2, wedding: 2, constitution: 1,
  },
};
const PROGRESS_VP_CARDS = ['printing', 'constitution'];

// Distinct, colonist-style player colors (red, blue, orange, white, green, brown).
const COLORS = ['#E53935', '#1E6FD9', '#FB8C00', '#F5F5F5', '#2E9D47', '#7B4A2E'];

// Game settings (host-configurable). Defaults per rulebook.
const SETTINGS_LIMITS = {
  vpTarget:     { min: 10, max: 20 },
  maxPlayers:   { min: 3,  max: 6 },
  discardLimit: { min: 5,  max: 20 },
  turnTimer:    [0, 30, 60, 90, 120, 180, 300], // seconds, 0 = off
};
const DEFAULT_VP = { base: 10, cnk: 13 };
const DEFAULT_DISCARD_LIMIT = 7;

module.exports = {
  RESOURCES, COMMODITIES, COMMODITY_FROM,
  BUILD_COST, PIECES, BANK_RESOURCES, BANK_COMMODITIES, DEV_CARD_DECK,
  CK_TRACKS, CK_COMMODITY_FOR_TRACK, CK_MAX_LEVEL, CK_METROPOLIS_LEVEL,
  CK_KNIGHTS_PER_RANK, CK_MAX_WALLS, CK_BARBARIAN_DISTANCE, CK_PROGRESS_HAND_LIMIT,
  PROGRESS_DECKS, PROGRESS_VP_CARDS,
  COLORS, SETTINGS_LIMITS, DEFAULT_VP, DEFAULT_DISCARD_LIMIT,
};
