// Card/hand helpers shared by the base engine and the C&K layer.
const C = require('./constants');

const ALL_CARD_KEYS = [...C.RESOURCES, ...C.COMMODITIES];

function emptyHand() {
  const r = {}, c = {};
  for (const x of C.RESOURCES) r[x] = 0;
  for (const x of C.COMMODITIES) c[x] = 0;
  return { r, c };
}

function kindOf(key) {
  if (C.RESOURCES.includes(key)) return 'r';
  if (C.COMMODITIES.includes(key)) return 'c';
  return null;
}

function cardCount(hand) {
  return Object.values(hand.r).reduce((a, b) => a + b, 0) +
         Object.values(hand.c).reduce((a, b) => a + b, 0);
}

function handHas(hand, cards) {
  for (const [k, v] of Object.entries(cards)) {
    const kind = kindOf(k);
    if (!kind || (hand[kind][k] ?? 0) < v) return false;
  }
  return true;
}
function canAfford(hand, cost) { return handHas(hand, cost); }
function pay(hand, cost) {
  for (const [k, v] of Object.entries(cost)) hand[kindOf(k)][k] -= v;
}
function addCards(hand, cards) {
  for (const [k, v] of Object.entries(cards)) hand[kindOf(k)][k] += v;
}
function handToBag(hand) {
  const bag = [];
  for (const k of ALL_CARD_KEYS) for (let i = 0; i < hand[kindOf(k)][k]; i++) bag.push(k);
  return bag;
}

// Validates a {key: count} card map. Only positive integers of allowed keys.
function cleanCards(o, allowed) {
  const out = {};
  if (o == null || typeof o !== 'object') return out;
  for (const [k, v] of Object.entries(o)) {
    if (!allowed.includes(k)) throw new Error(`invalid card type: ${k}`);
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`invalid amount for ${k}`);
    if (n > 0) out[k] = n;
  }
  return out;
}
function countCards(o) { return Object.values(o).reduce((a, b) => a + b, 0); }

module.exports = {
  ALL_CARD_KEYS, emptyHand, kindOf, cardCount, handHas, canAfford, pay, addCards,
  handToBag, cleanCards, countCards,
};
