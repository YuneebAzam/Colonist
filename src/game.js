// Core game state + rule engine. Server-authoritative.
// Base Catan + Cities & Knights (mode-specific rules live in ./ck.js).
//
// Flow model:
//  - `phase` is the coarse turn phase (lobby / setup_1 / setup_2 / roll / main / end).
//  - `prompts` are choices the game is waiting on (discard, move robber, pick victim,
//    progress-card reactions...). Several can be open at once (e.g. everyone discarding).
//    While any prompt or queued step exists, normal actions are blocked.
//  - `steps` are continuations that run, in order, once all prompts are answered
//    (e.g. "after discards, move the robber, then continue the turn").

const { makeMap, shuffle } = require('./board');
const C = require('./constants');
const ck = require('./ck');

const PHASE = {
  LOBBY: 'lobby',
  SETUP_1: 'setup_1',          // first settlement + road, players in order
  SETUP_2: 'setup_2',          // second settlement (city in C&K) + road, reverse order
  ROLL: 'roll',                // start of turn
  MAIN: 'main',                // trade / build / play cards
  END: 'end',
};

const {
  ALL_CARD_KEYS, emptyHand, kindOf, cardCount, handHas, canAfford, pay, addCards,
  handToBag, cleanCards, countCards,
} = require('./cards');

function clampInt(v, min, max, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

function normalizeSettings(opts = {}) {
  const L = C.SETTINGS_LIMITS;
  const mode = opts.mode === 'cnk' ? 'cnk' : 'base';
  const mapVariant = opts.mapVariant || 'classic';
  const { MAPS } = require('./board');
  const mapInfo = MAPS.find(m => m.id === mapVariant);
  if (!mapInfo) throw new Error(`unknown map variant ${mapVariant}`);
  const maxForMap = Math.max(mapInfo.maxPlayers, L.maxPlayers.min);
  return {
    mapVariant,
    mode,
    vpTarget: clampInt(opts.vpTarget, L.vpTarget.min, L.vpTarget.max, C.DEFAULT_VP[mode]),
    maxPlayers: clampInt(opts.maxPlayers, L.maxPlayers.min, maxForMap, maxForMap),
    discardLimit: clampInt(opts.discardLimit, L.discardLimit.min, L.discardLimit.max, C.DEFAULT_DISCARD_LIMIT),
    turnTimer: L.turnTimer.includes(Number(opts.turnTimer)) ? Number(opts.turnTimer) : 0,
  };
}

class Game {
  constructor(opts = {}) {
    this.settings = normalizeSettings(opts);
    const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 2 ** 31));
    const rand = mulberry32(seed >>> 0);
    this._rand = rand;
    this.map = makeMap(this.settings.mapVariant, rand);
    this.mode = this.settings.mode;           // 'base' | 'cnk'
    this.cnk = this.mode === 'cnk';
    this.players = [];
    this.turn = 0;               // index into players
    this.turnNumber = 0;         // increments every turn (used for once-per-turn rules)
    this.phase = PHASE.LOBBY;
    this.lastRoll = null;
    this.dice = { red: 0, yellow: 0, event: null };
    // In C&K the robber waits beside the barbarian track until the first attack.
    this.robberHome = this.map.robberHex;
    this.robberActive = !this.cnk;
    this.robberHex = this.cnk ? null : this.map.robberHex;
    this.devDeck = this.cnk ? [] : shuffle(C.DEV_CARD_DECK.slice(), rand);
    this.log = [];
    this.winner = null;
    this.longestRoad = { playerId: null, length: 0 };
    this.largestArmy = { playerId: null, size: 0 };
    this.prompts = [];
    this.steps = [];
    this._promptSeq = 0;
    this.setupState = { building: null, road: null };
    this.openTrade = null;            // { fromId, give, want, responses:{pid:'accept'}, counters:{pid:{give,want}} }
    this.tradeHistory = [];           // { kind: 'p2p'|'bank', fromId, toId?, give, take, t }
    this.alchemyDice = null;
    this.ck = this.cnk ? ck.initCKState(this) : null;
  }

  get vpTarget() { return this.settings.vpTarget; }

  // ---------------- Lobby ----------------

  addPlayer(id, name) {
    if (this.phase !== PHASE.LOBBY) throw new Error('game already started');
    if (this.players.length >= this.settings.maxPlayers) throw new Error('room is full');
    const used = new Set(this.players.map(p => p.color));
    const color = C.COLORS.find(c => !used.has(c));
    this.players.push({
      id, name: String(name || 'Player').slice(0, 20), color,
      hand: emptyHand(),
      roads: [], settlements: [], cities: [],
      devCards: [], newDevCards: [], playedKnights: 0, devPlayedThisTurn: false,
      ck: this.cnk ? ck.initPlayer() : null,
    });
    this.pushLog(`${this.players[this.players.length - 1].name} joined`);
  }

  removePlayer(id) {
    if (this.phase !== PHASE.LOBBY) return false; // mid-game players stay (can rejoin)
    const p = this.players.find(x => x.id === id);
    if (!p) return false;
    this.players = this.players.filter(x => x.id !== id);
    this.pushLog(`${p.name} left`);
    return true;
  }

  start() {
    if (this.phase !== PHASE.LOBBY) throw new Error('game already started');
    if (this.players.length < C.SETTINGS_LIMITS.maxPlayers.min) {
      throw new Error(`need at least ${C.SETTINGS_LIMITS.maxPlayers.min} players`);
    }
    this.phase = PHASE.SETUP_1;
    this.turn = 0;
    this.setupState = { building: null, road: null };
    this.pushLog(`game starts — first to ${this.vpTarget} VP wins. Place your first settlement and road`);
  }

  current() { return this.players[this.turn]; }

  // ---------------- Setup ----------------

  placeSettlement(playerId, vertexId, { setup = false } = {}) {
    const p = this.getPlayer(playerId);
    const v = this.map.topo.vertices[vertexId];
    if (!v) throw new Error('bad vertex');

    if (setup) {
      this.assertTurn(p);
      if (this.phase !== PHASE.SETUP_1 && this.phase !== PHASE.SETUP_2) throw new Error('not setup phase');
      if (this.setupState.building != null) throw new Error('already placed this round');
      if (!this.canPlaceBuildingAt(vertexId)) throw new Error('too close to another building');
      if (this.cnk && this.phase === PHASE.SETUP_2) {
        p.cities.push(vertexId); // C&K: the second placement is a city
        this.pushLog(`${p.name} placed a city`);
      } else {
        p.settlements.push(vertexId);
        this.pushLog(`${p.name} placed a settlement`);
      }
      this.setupState.building = vertexId;
      this.updateLongestRoad();
      return;
    }

    this.guardMain(p);
    if (p.settlements.length >= C.PIECES.settlements) throw new Error('no settlements left in your supply');
    if (!canAfford(p.hand, C.BUILD_COST.settlement)) throw new Error('cannot afford');
    if (!this.canPlaceBuildingAt(vertexId)) throw new Error('vertex occupied or too close to another building');
    if (!this.vertexConnectedToPlayerRoad(vertexId, p.id)) throw new Error('must connect to your road');
    pay(p.hand, C.BUILD_COST.settlement);
    p.settlements.push(vertexId);
    this.pushLog(`${p.name} built a settlement`);
    this.updateLongestRoad(); // a settlement can cut an opponent's road
    this.checkWin();
  }

  placeRoad(playerId, edgeId, { setup = false } = {}) {
    const p = this.getPlayer(playerId);
    const e = this.map.topo.edges[edgeId];
    if (!e) throw new Error('bad edge');
    if (this.edgeOwner(edgeId)) throw new Error('edge taken');

    if (setup) {
      this.assertTurn(p);
      if (this.phase !== PHASE.SETUP_1 && this.phase !== PHASE.SETUP_2) throw new Error('not setup phase');
      if (this.setupState.building == null) throw new Error('place your building first');
      if (this.setupState.road != null) throw new Error('already placed a road this round');
      if (e.a !== this.setupState.building && e.b !== this.setupState.building) {
        throw new Error('road must touch your new building');
      }
      p.roads.push(edgeId);
      this.setupState.road = edgeId;
      this.pushLog(`${p.name} placed a road`);
      this.updateLongestRoad();
      return;
    }

    this.guardMain(p);
    if (!canAfford(p.hand, C.BUILD_COST.road)) throw new Error('cannot afford');
    this.buildRoadFree(p, edgeId, { validateOnly: true });
    pay(p.hand, C.BUILD_COST.road);
    this.buildRoadFree(p, edgeId);
  }

  // Shared by paid roads, Road Building and Diplomacy. Does not check turn/phase.
  buildRoadFree(p, edgeId, { validateOnly = false } = {}) {
    const e = this.map.topo.edges[edgeId];
    if (!e) throw new Error('bad edge');
    if (this.edgeOwner(edgeId)) throw new Error('edge taken');
    if (p.roads.length >= C.PIECES.roads) throw new Error('no roads left in your supply');
    if (!this.edgeConnectsToPlayer(edgeId, p.id)) throw new Error('road must connect to your network');
    if (validateOnly) return;
    p.roads.push(edgeId);
    this.pushLog(`${p.name} built a road`);
    this.updateLongestRoad();
    this.checkWin();
  }

  endSetupStep(playerId) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.SETUP_1 && this.phase !== PHASE.SETUP_2) throw new Error('not setup');
    if (this.setupState.building == null || this.setupState.road == null) {
      throw new Error('place your building and road first');
    }
    if (this.phase === PHASE.SETUP_1) {
      this.setupState = { building: null, road: null };
      if (this.turn < this.players.length - 1) {
        this.turn++;
      } else {
        this.phase = PHASE.SETUP_2;
        this.pushLog('setup round 2 — reverse order' + (this.cnk ? ' (place a city)' : ''));
      }
      return;
    }
    // Round 2: 1 resource per adjacent producing hex of the second building.
    const gained = {};
    for (const hid of this.map.topo.vertices[this.setupState.building].hexes) {
      const h = this.map.topo.hexes[hid];
      if (C.RESOURCES.includes(h.res) && this.bankCount(h.res) > 0) {
        p.hand.r[h.res] += 1;
        gained[h.res] = (gained[h.res] || 0) + 1;
      }
    }
    this.setupState = { building: null, road: null };
    if (this.turn > 0) {
      this.turn--;
    } else {
      this.phase = PHASE.ROLL;
      this.turnNumber = 1;
      this.pushLog(`${this.current().name} to roll`);
    }
  }

  // ---------------- Rolling & production ----------------

  rollDice(playerId) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.ROLL) throw new Error('not roll phase');
    this.assertNoPending();

    let red, yellow;
    if (this.alchemyDice) {
      ({ red, yellow } = this.alchemyDice);
      this.alchemyDice = null;
    } else {
      red = 1 + Math.floor(this._rand() * 6);
      yellow = 1 + Math.floor(this._rand() * 6);
    }
    const sum = red + yellow;
    this.dice = { red, yellow, event: null };
    this.lastRoll = sum;
    this.rollSeq = (this.rollSeq || 0) + 1;
    if (this.cnk) {
      // Event die: 3 ship faces, 1 face per improvement track.
      const faces = ['barbarian', 'barbarian', 'barbarian', 'trade', 'politics', 'science'];
      this.dice.event = faces[Math.floor(this._rand() * 6)];
    }
    this.phase = PHASE.MAIN;
    this.pushLog(`${p.name} rolled ${sum}${this.dice.event ? ` (${this.dice.event})` : ''}`);

    // C&K: resolve the event die before production.
    if (this.cnk) this.steps.push(() => ck.resolveEventDie(this, this.dice.event, red));
    this.steps.push(() => (sum === 7 ? this.resolveSeven() : this.produce(sum)));
    this.runSteps();
  }

  resolveSeven() {
    for (const pl of this.players) {
      const limit = this.handLimit(pl);
      const n = cardCount(pl.hand);
      if (n > limit) this.addPrompt('discard', pl.id, { count: Math.floor(n / 2), reason: 'seven' });
    }
    this.steps.unshift(() => {
      if (this.robberActive) this.addPrompt('robber', this.current().id, {});
      else this.pushLog('the robber is not active until the barbarians first attack');
    });
  }

  handLimit(p) {
    return this.settings.discardLimit + (this.cnk ? 2 * p.ck.cityWalls.length : 0);
  }

  produce(sum) {
    const demand = {}; // key -> Map(playerId -> n)
    const want = (pl, key, n) => {
      if (!demand[key]) demand[key] = new Map();
      demand[key].set(pl.id, (demand[key].get(pl.id) || 0) + n);
    };
    for (const h of this.map.topo.hexes) {
      if (h.num !== sum || h.id === this.robberHex || !C.RESOURCES.includes(h.res)) continue;
      for (const vId of this.map.topo.hexVertices[h.id]) {
        const owner = this.vertexOwner(vId);
        if (!owner) continue;
        if (!owner.cities.includes(vId)) { want(owner, h.res, 1); continue; }
        if (this.cnk && C.COMMODITY_FROM[h.res]) {
          want(owner, h.res, 1);
          want(owner, C.COMMODITY_FROM[h.res], 1);
        } else {
          want(owner, h.res, 2);
        }
      }
    }
    const received = new Set();
    for (const [key, m] of Object.entries(demand)) {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      const avail = this.bankCount(key);
      if (total <= avail) {
        for (const [pid, n] of m) { this.getPlayer(pid).hand[kindOf(key)][key] += n; received.add(pid); }
      } else if (m.size === 1) {
        const [pid] = [...m.keys()];
        if (avail > 0) { this.getPlayer(pid).hand[kindOf(key)][key] += avail; received.add(pid); }
        this.pushLog(`bank short of ${key}`);
      } else {
        this.pushLog(`bank short of ${key} — nobody receives it`);
      }
    }
    if (this.cnk) ck.aqueduct(this, received);
  }

  // ---------------- Robber ----------------

  stealOne(thief, victim) {
    const bag = handToBag(victim.hand);
    if (bag.length === 0) {
      this.pushLog(`${thief.name} robbed ${victim.name} (nothing to take)`);
      return null;
    }
    const key = bag[Math.floor(this._rand() * bag.length)];
    victim.hand[kindOf(key)][key] -= 1;
    thief.hand[kindOf(key)][key] += 1;
    this.pushLog(`${thief.name} robbed ${victim.name}`);
    return key;
  }

  robberStealCandidates(hexId, thiefId) {
    const ids = new Set();
    for (const vId of this.map.topo.hexVertices[hexId]) {
      const owner = this.vertexOwner(vId);
      if (owner && owner.id !== thiefId && cardCount(owner.hand) > 0) ids.add(owner.id);
    }
    return [...ids];
  }

  placeRobber(p, hexId, { taxation = false } = {}) {
    const hex = this.map.topo.hexes[hexId];
    if (!hex) throw new Error('bad hex');
    if (hexId === this.robberHex) throw new Error('must move to a new hex');
    this.robberHex = hexId;
    this.pushLog(`${p.name} moved the robber`);
    const candidates = this.robberStealCandidates(hexId, p.id);
    if (taxation) {
      for (const id of candidates) this.stealOne(p, this.getPlayer(id));
    } else if (candidates.length === 1) {
      this.stealOne(p, this.getPlayer(candidates[0]));
    } else if (candidates.length > 1) {
      this.addPrompt('steal', p.id, { candidates });
    }
  }

  // Legacy entry points (robber/steal are prompts now; these route to them).
  moveRobber(playerId, hexId) {
    const pr = this.prompts.find(x => x.kind === 'robber' && x.playerId === playerId);
    if (!pr) throw new Error('not robber phase');
    this.respond(playerId, pr.id, { hexId });
  }
  chooseStealTarget(playerId, targetId) {
    const pr = this.prompts.find(x => x.kind === 'steal' && x.playerId === playerId);
    if (!pr) throw new Error('not steal phase');
    this.respond(playerId, pr.id, { targetId });
  }
  discard(playerId, cards) {
    const pr = this.prompts.find(x => x.kind === 'discard' && x.playerId === playerId);
    if (!pr) throw new Error('nothing to discard');
    this.respond(playerId, pr.id, { cards });
  }

  // ---------------- Prompts ----------------

  addPrompt(kind, playerId, data = {}) {
    const pr = { id: ++this._promptSeq, kind, playerId, ...data };
    this.prompts.push(pr);
    return pr;
  }

  respond(playerId, promptId, answer = {}) {
    const pr = this.prompts.find(x => x.id === Number(promptId));
    if (!pr) throw new Error('that choice is no longer pending');
    if (pr.playerId !== playerId) throw new Error('not your choice to make');
    const handler = PROMPT_HANDLERS[pr.kind] || ck.PROMPT_HANDLERS[pr.kind];
    if (!handler) throw new Error('unknown prompt');
    handler(this, pr, answer || {});  // throws on invalid answer, leaving the prompt open
    this.prompts = this.prompts.filter(x => x !== pr);
    this.runSteps();
  }

  runSteps() {
    while (this.prompts.length === 0 && this.steps.length && this.phase !== PHASE.END) {
      const step = this.steps.shift();
      step();
    }
    this.checkWin();
  }

  assertNoPending() {
    if (this.prompts.length || this.steps.length) throw new Error('waiting for pending choices');
  }

  guardMain(p) {
    this.assertTurn(p);
    if (this.phase !== PHASE.MAIN) throw new Error('not main phase');
    this.assertNoPending();
  }

  // ---------------- Build ----------------

  buildCity(playerId, vertexId, { cost = C.BUILD_COST.city } = {}) {
    const p = this.getPlayer(playerId);
    this.guardMain(p);
    if (!p.settlements.includes(vertexId)) throw new Error('must upgrade your own settlement');
    if (p.cities.length >= C.PIECES.cities) throw new Error('no cities left in your supply');
    if (!canAfford(p.hand, cost)) throw new Error('cannot afford');
    pay(p.hand, cost);
    p.settlements = p.settlements.filter(v => v !== vertexId);
    p.cities.push(vertexId);
    this.pushLog(`${p.name} built a city`);
    this.checkWin();
  }

  buyDev(playerId) {
    const p = this.getPlayer(playerId);
    if (this.cnk) throw new Error('no development cards in Cities & Knights');
    this.guardMain(p);
    if (this.devDeck.length === 0) throw new Error('development deck is empty');
    if (!canAfford(p.hand, C.BUILD_COST.dev)) throw new Error('cannot afford');
    pay(p.hand, C.BUILD_COST.dev);
    const card = this.devDeck.pop();
    p.newDevCards.push(card);
    this.pushLog(`${p.name} bought a development card`);
    this.checkWin(); // a VP card can win immediately
  }

  playDev(playerId, card, args = {}) {
    const p = this.getPlayer(playerId);
    if (this.cnk) throw new Error('no development cards in Cities & Knights');
    this.assertTurn(p);
    if (this.phase !== PHASE.ROLL && this.phase !== PHASE.MAIN) throw new Error('cannot play cards now');
    this.assertNoPending();
    if (p.devPlayedThisTurn) throw new Error('only one development card per turn');
    if (card === 'vp') throw new Error('victory point cards count automatically');
    const idx = p.devCards.indexOf(card);
    if (idx === -1) throw new Error("you don't have that card (cards can't be played the turn they're bought)");

    // Validate everything before consuming the card.
    let apply;
    switch (card) {
      case 'knight':
        apply = () => {
          p.playedKnights += 1;
          this.pushLog(`${p.name} played a knight`);
          this.updateLargestArmy();
          this.addPrompt('robber', p.id, {});
        };
        break;
      case 'road_building': {
        const edges = (Array.isArray(args.edges) ? args.edges : []).map(Number);
        if (edges.length < 1 || edges.length > 2) throw new Error('pick 1 or 2 roads');
        // Dry run: each road must be legal given the ones before it. No state is kept.
        const before = p.roads.slice();
        try {
          for (const e of edges) { this.buildRoadFree(p, e, { validateOnly: true }); p.roads.push(e); }
        } finally {
          p.roads = before;
        }
        apply = () => {
          for (const e of edges) this.buildRoadFree(p, e);
          this.pushLog(`${p.name} played road building`);
        };
        break;
      }
      case 'year_of_plenty': {
        const res = Array.isArray(args.resources) ? args.resources : [];
        if (res.length !== 2 || !res.every(r => C.RESOURCES.includes(r))) throw new Error('pick 2 resources');
        const need = {};
        for (const r of res) need[r] = (need[r] || 0) + 1;
        for (const [r, n] of Object.entries(need)) if (this.bankCount(r) < n) throw new Error(`bank has no ${r} left`);
        apply = () => {
          addCards(p.hand, need);
          this.pushLog(`${p.name} played year of plenty`);
        };
        break;
      }
      case 'monopoly': {
        const res = args.resource;
        if (!C.RESOURCES.includes(res)) throw new Error('bad resource');
        apply = () => {
          let total = 0;
          for (const pl of this.players) {
            if (pl.id === p.id) continue;
            total += pl.hand.r[res];
            pl.hand.r[res] = 0;
          }
          p.hand.r[res] += total;
          this.pushLog(`${p.name} monopolized ${res} (+${total})`);
        };
        break;
      }
      default: throw new Error('cannot play that card');
    }
    p.devCards.splice(idx, 1);
    p.devPlayedThisTurn = true;
    apply();
    this.runSteps();
  }

  // ---------------- Bank / harbor trade ----------------

  tradeRate(player, key) {
    if (this.cnk) return ck.tradeRate(this, player, key);
    return this.harborRate(player, key);
  }

  harborRate(player, res) {
    const myVerts = new Set([...player.settlements, ...player.cities]);
    let rate = 4;
    for (const harbor of this.map.harbors) {
      const edge = this.map.topo.edges[harbor.edgeId];
      if (!myVerts.has(edge.a) && !myVerts.has(edge.b)) continue;
      if (harbor.type === '3:1') rate = Math.min(rate, 3);
      else if (harbor.type === res) rate = Math.min(rate, 2);
    }
    return rate;
  }

  tradableKeys() { return this.cnk ? ALL_CARD_KEYS : C.RESOURCES; }

  trade(playerId, give, take) {
    const p = this.getPlayer(playerId);
    this.guardMain(p);
    const keys = this.tradableKeys();
    give = cleanCards(give, keys); take = cleanCards(take, keys);
    const giveKeys = Object.keys(give), takeKeys = Object.keys(take);
    if (giveKeys.length !== 1 || takeKeys.length !== 1) throw new Error('trade one type for one type');
    const gKey = giveKeys[0], tKey = takeKeys[0];
    if (gKey === tKey) throw new Error("can't trade a card for the same type");
    const rate = this.tradeRate(p, gKey);
    const times = take[tKey];
    if (give[gKey] !== rate * times) throw new Error(`rate is ${rate}:1`);
    if (!handHas(p.hand, give)) throw new Error('insufficient cards');
    if (this.bankCount(tKey) < times) throw new Error(`bank has no ${tKey} left`);
    pay(p.hand, give);
    addCards(p.hand, take);
    this.pushLog(`${p.name} traded ${give[gKey]} ${gKey} for ${times} ${tKey}`);
    this.recordTrade({ kind: 'bank', fromId: p.id, give, take });
  }

  recordTrade(entry) {
    this.tradeHistory.push({ t: Date.now(), ...entry });
    if (this.tradeHistory.length > 200) this.tradeHistory.shift();
  }

  // ---------------- Turn end ----------------

  endTurn(playerId) {
    const p = this.getPlayer(playerId);
    this.guardMain(p);
    if (this.cnk && p.ck.progress.length > C.CK_PROGRESS_HAND_LIMIT) {
      throw new Error(`play or discard progress cards down to ${C.CK_PROGRESS_HAND_LIMIT}`);
    }
    p.devCards.push(...p.newDevCards);
    p.newDevCards = [];
    p.devPlayedThisTurn = false;
    if (this.cnk) ck.endTurnCleanup(this, p);
    this.openTrade = null;
    this.turn = (this.turn + 1) % this.players.length;
    this.turnNumber++;
    this.phase = PHASE.ROLL;
    this.pushLog(`${this.current().name} to roll`);
    // Points gained on someone else's turn win at the start of your own turn.
    this.checkWin();
  }

  // ---------------- Player-to-player trade ----------------

  tradeOffer(playerId, give, want) {
    const p = this.getPlayer(playerId);
    this.guardMain(p);
    const keys = this.tradableKeys();
    give = cleanCards(give, keys); want = cleanCards(want, keys);
    validateTradeTerms(give, want);
    if (!handHas(p.hand, give)) throw new Error("you don't have those cards");
    this.openTrade = { fromId: p.id, give, want, responses: {}, counters: {} };
    this.pushLog(`${p.name} offers a trade`);
  }

  tradeRespond(playerId, accept) {
    if (!this.openTrade) throw new Error('no open trade');
    if (playerId === this.openTrade.fromId) throw new Error("can't respond to your own offer");
    const p = this.getPlayer(playerId);
    if (accept) {
      if (!handHas(p.hand, this.openTrade.want)) throw new Error("you don't have the requested cards");
      this.openTrade.responses[p.id] = 'accept';
      delete this.openTrade.counters[p.id];
      this.pushLog(`${p.name} accepts the offer`);
    } else {
      this.openTrade.responses[p.id] = 'decline';
      delete this.openTrade.counters[p.id];
      this.pushLog(`${p.name} declines the offer`);
    }
  }

  tradeCounter(playerId, give, want) {
    // Counterer proposes their own give/want (from their POV)
    if (!this.openTrade) throw new Error('no open trade');
    if (playerId === this.openTrade.fromId) throw new Error("can't counter your own offer");
    const p = this.getPlayer(playerId);
    const keys = this.tradableKeys();
    give = cleanCards(give, keys); want = cleanCards(want, keys);
    validateTradeTerms(give, want);
    if (!handHas(p.hand, give)) throw new Error("you don't have those cards");
    this.openTrade.counters[p.id] = { give, want };
    delete this.openTrade.responses[p.id];
    this.pushLog(`${p.name} counters the offer`);
  }

  tradeAccept(playerId, otherId) {
    const p = this.getPlayer(playerId);
    this.guardMain(p);
    if (!this.openTrade || this.openTrade.fromId !== p.id) throw new Error('not your offer');
    const other = this.getPlayer(otherId);
    let fromMeToThem, fromThemToMe;
    if (this.openTrade.responses[otherId] === 'accept') {
      fromMeToThem = this.openTrade.give;
      fromThemToMe = this.openTrade.want;
    } else if (this.openTrade.counters[otherId]) {
      fromThemToMe = this.openTrade.counters[otherId].give;
      fromMeToThem = this.openTrade.counters[otherId].want;
    } else {
      throw new Error('that player neither accepted nor countered');
    }
    if (!handHas(p.hand, fromMeToThem)) throw new Error('you no longer have those cards');
    if (!handHas(other.hand, fromThemToMe)) throw new Error(`${other.name} no longer has those cards`);
    pay(p.hand, fromMeToThem); addCards(other.hand, fromMeToThem);
    pay(other.hand, fromThemToMe); addCards(p.hand, fromThemToMe);
    this.pushLog(`${p.name} trades with ${other.name}`);
    this.recordTrade({ kind: 'p2p', fromId: p.id, toId: other.id, give: fromMeToThem, take: fromThemToMe });
    this.openTrade = null;
  }

  tradeCancel(playerId) {
    const p = this.getPlayer(playerId);
    if (!this.openTrade) return;
    if (this.openTrade.fromId !== p.id) throw new Error('not your offer');
    this.openTrade = null;
    this.pushLog(`${p.name} cancelled the trade`);
  }

  // ---------------- Helpers ----------------

  getPlayer(id) {
    const p = this.players.find(x => x.id === id);
    if (!p) throw new Error('no such player');
    return p;
  }
  assertTurn(p) {
    if (this.phase === PHASE.LOBBY || this.phase === PHASE.END) throw new Error('game is not running');
    if (this.players[this.turn].id !== p.id) throw new Error('not your turn');
  }
  pushLog(msg) {
    this.log.push({ t: Date.now(), msg });
    if (this.log.length > 300) this.log.shift();
  }

  bankCount(key) {
    const kind = kindOf(key);
    if (!kind) return 0;
    if (kind === 'c' && !this.cnk) return 0;
    const total = kind === 'r' ? C.BANK_RESOURCES : C.BANK_COMMODITIES;
    return total - this.players.reduce((a, p) => a + p.hand[kind][key], 0);
  }

  vertexOwner(vId) {
    for (const p of this.players) {
      if (p.settlements.includes(vId) || p.cities.includes(vId)) return p;
    }
    return null;
  }
  edgeOwner(eId) {
    for (const p of this.players) if (p.roads.includes(eId)) return p;
    return null;
  }
  knightAt(vId) {
    if (!this.cnk) return null;
    for (const p of this.players) if (p.ck.knights[vId]) return { player: p, knight: p.ck.knights[vId] };
    return null;
  }
  // Opponent building or knight at vId (breaks roads / routes for `pid`).
  vertexBlockedFor(vId, pid) {
    const owner = this.vertexOwner(vId);
    if (owner && owner.id !== pid) return true;
    const k = this.knightAt(vId);
    return !!(k && k.player.id !== pid);
  }
  canPlaceBuildingAt(vId) {
    if (!this.map.topo.vertices[vId]) return false;
    if (this.vertexOwner(vId) || this.knightAt(vId)) return false;
    return this.map.topo.vAdj[vId].every(nb => !this.vertexOwner(nb));
  }

  vertexConnectedToPlayerRoad(vId, pid) {
    const v = this.map.topo.vertices[vId];
    const p = this.getPlayer(pid);
    return v.edges.some(e => p.roads.includes(e));
  }
  edgeConnectsToPlayer(eId, pid) {
    const e = this.map.topo.edges[eId];
    const p = this.getPlayer(pid);
    for (const x of [e.a, e.b]) {
      if (p.settlements.includes(x) || p.cities.includes(x)) return true;
      if (this.vertexBlockedFor(x, pid)) continue; // opponent piece breaks continuity
      const v = this.map.topo.vertices[x];
      if (v.edges.some(o => o !== eId && p.roads.includes(o))) return true;
    }
    return false;
  }

  updateLongestRoad() {
    const lens = new Map(this.players.map(p => [p.id, longestRoadForPlayer(this, p)]));
    const max = Math.max(0, ...lens.values());
    const holder = this.longestRoad.playerId;
    const leaders = [...lens].filter(([, l]) => l === max && l >= 5).map(([id]) => id);
    let next = holder;
    if (holder && lens.get(holder) >= 5 && lens.get(holder) === max) {
      next = holder;                       // still longest (ties keep the card)
    } else if (leaders.length === 1) {
      next = leaders[0];                   // a single clear leader takes it
    } else {
      next = null;                         // tie for the new longest, or nobody has 5: set aside
    }
    if (next !== holder) {
      if (next) this.pushLog(`${this.getPlayer(next).name} takes ${this.cnk ? 'longest route' : 'longest road'} (${max})`);
      else if (holder) this.pushLog(`${this.cnk ? 'longest route' : 'longest road'} is set aside`);
    }
    this.longestRoad = { playerId: next, length: next ? lens.get(next) : 0 };
    this.roadLengths = Object.fromEntries(lens);
  }

  updateLargestArmy() {
    const p = this.current();
    if (p.playedKnights >= 3 && p.playedKnights > this.largestArmy.size && this.largestArmy.playerId !== p.id) {
      this.largestArmy = { playerId: p.id, size: p.playedKnights };
      this.pushLog(`${p.name} takes largest army (${p.playedKnights})`);
    } else if (this.largestArmy.playerId === p.id) {
      this.largestArmy.size = p.playedKnights;
    }
    this.checkWin();
  }

  // Victory points. `hidden` includes unrevealed development VP cards.
  vpBreakdown(p) {
    const b = {
      settlements: p.settlements.length,
      cities: p.cities.length * 2,
      longestRoad: this.longestRoad.playerId === p.id ? 2 : 0,
      largestArmy: !this.cnk && this.largestArmy.playerId === p.id ? 2 : 0,
      devVp: [...p.devCards, ...p.newDevCards].filter(c => c === 'vp').length,
    };
    if (this.cnk) Object.assign(b, ck.vpBreakdown(this, p));
    return b;
  }
  computeVP(p, { hidden = true } = {}) {
    const b = this.vpBreakdown(p);
    let total = 0;
    for (const [k, v] of Object.entries(b)) if (hidden || k !== 'devVp') total += v;
    return total;
  }

  checkWin() {
    if (this.phase === PHASE.LOBBY || this.phase === PHASE.END) return;
    if (this.phase === PHASE.SETUP_1 || this.phase === PHASE.SETUP_2) return;
    const p = this.current();
    if (!p) return;
    const total = this.computeVP(p);
    if (total >= this.vpTarget) {
      this.winner = p.id;
      this.phase = PHASE.END;
      this.prompts = [];
      this.steps = [];
      this.openTrade = null;
      this.pushLog(`${p.name} wins with ${total} VP!`);
    }
  }

  // ---------------- Generic action dispatch (used by server) ----------------

  act(playerId, type, m = {}) {
    switch (type) {
      case 'place_settlement': return this.placeSettlement(playerId, Number(m.vertexId), { setup: !!m.setup });
      case 'place_road':       return this.placeRoad(playerId, Number(m.edgeId), { setup: !!m.setup });
      case 'end_setup':        return this.endSetupStep(playerId);
      case 'roll':             return this.rollDice(playerId);
      case 'respond':          return this.respond(playerId, m.promptId, m.answer);
      case 'discard':          return this.discard(playerId, m.cards || {});
      case 'move_robber':      return this.moveRobber(playerId, Number(m.hexId));
      case 'steal':            return this.chooseStealTarget(playerId, m.targetId);
      case 'build_city':       return this.buildCity(playerId, Number(m.vertexId));
      case 'buy_dev':          return this.buyDev(playerId);
      case 'play_dev':         return this.playDev(playerId, m.card, m.args || {});
      case 'bank_trade':       return this.trade(playerId, m.give, m.take);
      case 'trade_offer':      return this.tradeOffer(playerId, m.give || {}, m.want || {});
      case 'trade_respond':    return this.tradeRespond(playerId, !!m.accept);
      case 'trade_counter':    return this.tradeCounter(playerId, m.give || {}, m.want || {});
      case 'trade_accept':     return this.tradeAccept(playerId, m.otherId);
      case 'trade_cancel':     return this.tradeCancel(playerId);
      case 'end_turn':         return this.endTurn(playerId);
      default:
        if (this.cnk && type.startsWith('ck_')) return ck.act(this, playerId, type, m);
        throw new Error('unknown action: ' + type);
    }
  }

  // ---------------- Turn timer: act on behalf of whoever we're waiting on ----------------

  autoAct() {
    if (this.phase === PHASE.LOBBY || this.phase === PHASE.END) return;
    // 1. Answer every open prompt with a legal choice.
    for (let guard = 0; guard < 50 && this.prompts.length; guard++) {
      const pr = this.prompts[0];
      const answer = autoAnswer(this, pr);
      try { this.respond(pr.playerId, pr.id, answer); }
      catch (e) { this.prompts = this.prompts.filter(x => x !== pr); this.runSteps(); }
    }
    if (this.phase === PHASE.END) return;
    const p = this.current();
    if (this.phase === PHASE.SETUP_1 || this.phase === PHASE.SETUP_2) {
      if (this.setupState.building == null) {
        const v = this.map.topo.vertices.find(v => this.canPlaceBuildingAt(v.id));
        this.placeSettlement(p.id, v.id, { setup: true });
      }
      if (this.setupState.road == null) {
        const vv = this.map.topo.vertices[this.setupState.building];
        const e = vv.edges.find(id => !this.edgeOwner(id));
        this.placeRoad(p.id, e, { setup: true });
      }
      this.endSetupStep(p.id);
      this.pushLog(`${p.name} ran out of time (auto-placed)`);
      return;
    }
    if (this.phase === PHASE.ROLL) {
      this.rollDice(p.id);
      this.pushLog(`${p.name} ran out of time (auto-rolled)`);
      if (this.prompts.length) this.autoAct();
      return;
    }
    if (this.phase === PHASE.MAIN) {
      this.openTrade = null;
      if (this.cnk) {
        while (p.ck.progress.length > C.CK_PROGRESS_HAND_LIMIT) ck.discardProgress(this, p, p.ck.progress[0]);
      }
      this.endTurn(p.id);
      this.pushLog(`${p.name} ran out of time`);
    }
  }

  // Who the game is currently waiting on (for the turn timer / UI).
  waitingOn() {
    if (this.prompts.length) return [...new Set(this.prompts.map(p => p.playerId))];
    if (this.phase === PHASE.LOBBY || this.phase === PHASE.END) return [];
    return [this.current().id];
  }

  // Serialize state for a given viewer (hides opponents' hands and secret cards)
  snapshot(viewerId) {
    const ended = this.phase === PHASE.END;
    const prompts = this.prompts.map(pr => publicPrompt(this, pr, viewerId));
    return {
      map: this.map,
      cnk: this.cnk,
      mode: this.mode,
      settings: this.settings,
      vpTarget: this.vpTarget,
      phase: this.phase,
      turn: this.turn,
      turnNumber: this.turnNumber,
      currentPlayerId: this.players[this.turn]?.id ?? null,
      dice: this.dice,
      lastRoll: this.lastRoll,
      rollSeq: this.rollSeq || 0,
      robberHex: this.robberHex,
      robberActive: this.robberActive,
      winner: this.winner,
      log: this.log.slice(-60),
      longestRoad: this.longestRoad,
      largestArmy: this.largestArmy,
      prompts,
      busy: this.prompts.length > 0 || this.steps.length > 0,
      waitingOn: this.waitingOn(),
      setupState: this.setupState,
      openTrade: this.openTrade,
      tradeHistory: this.tradeHistory,
      devDeckCount: this.devDeck.length,
      bank: Object.fromEntries(this.tradableKeys().map(k => [k, this.bankCount(k)])),
      ck: this.cnk ? ck.publicState(this) : null,
      players: this.players.map(p => {
        const me = p.id === viewerId;
        const show = me || ended;
        return {
          id: p.id, name: p.name, color: p.color,
          connected: p.connected !== false,
          roads: p.roads, settlements: p.settlements, cities: p.cities,
          vp: this.computeVP(p, { hidden: show }),
          publicVp: this.computeVP(p, { hidden: false }),
          vpBreakdown: show ? this.vpBreakdown(p) : { ...this.vpBreakdown(p), devVp: 0 },
          roadLength: this.roadLengths ? this.roadLengths[p.id] || 0 : 0,
          handCount: cardCount(p.hand),
          hand: me ? p.hand : null,
          handLimit: this.handLimit(p),
          devCardCount: p.devCards.length + p.newDevCards.length,
          devCards: show ? p.devCards : null,
          newDevCards: show ? p.newDevCards : null,
          devPlayedThisTurn: p.devPlayedThisTurn,
          playedKnights: p.playedKnights,
          tradeRates: me ? Object.fromEntries(this.tradableKeys().map(k => [k, this.tradeRate(p, k)])) : null,
          ck: this.cnk ? ck.publicPlayer(this, p, show) : null,
        };
      }),
    };
  }
}

function validateTradeTerms(give, want) {
  if (!countCards(give) || !countCards(want)) throw new Error('both sides must offer cards (no gifts)');
  for (const k of Object.keys(give)) if (want[k]) throw new Error(`can't trade ${k} for ${k}`);
}

// ---------------- Prompt handlers (base) ----------------

const PROMPT_HANDLERS = {
  discard(game, pr, ans) {
    const p = game.getPlayer(pr.playerId);
    const cards = cleanCards(ans.cards, game.tradableKeys());
    if (countCards(cards) !== pr.count) throw new Error(`must discard exactly ${pr.count}`);
    if (!handHas(p.hand, cards)) throw new Error("you don't have those cards");
    pay(p.hand, cards);
    game.pushLog(`${p.name} discarded ${pr.count}`);
  },
  robber(game, pr, ans) {
    game.placeRobber(game.getPlayer(pr.playerId), Number(ans.hexId), { taxation: !!pr.taxation });
  },
  steal(game, pr, ans) {
    if (!pr.candidates.includes(ans.targetId)) throw new Error('bad target');
    game.stealOne(game.getPlayer(pr.playerId), game.getPlayer(ans.targetId));
  },
  // Generic "give N of your cards to someone" (Wedding, Commercial Harbor).
  give(game, pr, ans) {
    const p = game.getPlayer(pr.playerId);
    const allowed = pr.only === 'commodity' ? C.COMMODITIES : game.tradableKeys();
    const cards = cleanCards(ans.cards, allowed);
    if (countCards(cards) !== pr.count) throw new Error(`choose exactly ${pr.count}`);
    if (!handHas(p.hand, cards)) throw new Error("you don't have those cards");
    const to = game.getPlayer(pr.toId);
    pay(p.hand, cards); addCards(to.hand, cards);
    game.pushLog(`${p.name} gave ${pr.count} card${pr.count > 1 ? 's' : ''} to ${to.name}`);
  },
  free_road(game, pr, ans) {
    const p = game.getPlayer(pr.playerId);
    if (ans.skip) { game.pushLog(`${p.name} skipped a free road`); return; }
    game.buildRoadFree(p, Number(ans.edgeId));
    if (pr.remaining > 1) game.addPrompt('free_road', p.id, { remaining: pr.remaining - 1, source: pr.source });
  },
};

function autoAnswer(game, pr) {
  const p = game.getPlayer(pr.playerId);
  const pickCards = (n, allowed) => {
    const bag = handToBag(p.hand).filter(k => allowed.includes(k));
    const out = {};
    for (let i = 0; i < n && bag.length; i++) {
      const j = Math.floor(game._rand() * bag.length);
      const k = bag.splice(j, 1)[0];
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  };
  switch (pr.kind) {
    case 'discard': return { cards: pickCards(pr.count, game.tradableKeys()) };
    case 'give': return { cards: pickCards(pr.count, pr.only === 'commodity' ? C.COMMODITIES : game.tradableKeys()) };
    case 'robber': {
      const opts = game.map.topo.hexes.filter(h => h.id !== game.robberHex);
      // prefer a hex that hurts someone else and not ourselves
      const good = opts.find(h => game.robberStealCandidates(h.id, p.id).length &&
        !game.map.topo.hexVertices[h.id].some(v => game.vertexOwner(v) === p));
      return { hexId: (good || opts.find(h => h.res === 'desert') || opts[0]).id };
    }
    case 'steal': return { targetId: pr.candidates[0] };
    case 'free_road': return { skip: true };
    default: return ck.autoAnswer(game, pr);
  }
}

function publicPrompt(game, pr, viewerId) {
  const base = { id: pr.id, kind: pr.kind, playerId: pr.playerId };
  const mine = pr.playerId === viewerId;
  for (const [k, v] of Object.entries(pr)) {
    if (k.startsWith('_')) continue;            // private server-side data
    if (!mine && k === 'secret') continue;      // only the chooser sees secret info
    base[k] = v;
  }
  if (mine && game.cnk) Object.assign(base, ck.promptPrivateView(game, pr));
  return base;
}

function longestRoadForPlayer(game, p) {
  if (p.roads.length === 0) return 0;
  const edgeIds = new Set(p.roads);
  const topo = game.map.topo;
  let best = 0;
  const visit = (vertex, used) => {
    let localBest = used.size;
    // an opponent's building or knight at this vertex ends the route here
    if (game.vertexBlockedFor(vertex, p.id)) return localBest;
    for (const eId of topo.vertices[vertex].edges) {
      if (!edgeIds.has(eId) || used.has(eId)) continue;
      const e = topo.edges[eId];
      const other = e.a === vertex ? e.b : e.a;
      used.add(eId);
      localBest = Math.max(localBest, visit(other, used));
      used.delete(eId);
    }
    return localBest;
  };
  for (const id of p.roads) {
    const e = topo.edges[id];
    for (const v of [e.a, e.b]) best = Math.max(best, visit(v, new Set([id])));
  }
  return best;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = {
  Game, PHASE, emptyHand, cardCount, normalizeSettings, __autoAnswer: autoAnswer,
  kindOf, handHas, pay, addCards, cleanCards, countCards, handToBag, canAfford,
};
