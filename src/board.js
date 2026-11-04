// Hex board geometry and procedural map generation.
// Axial coordinates (q, r). Flat-top hexes.
// Vertices/edges keyed by rounded world positions so sharing is automatic.

const SIZE = 1; // unit hex radius; actual pixel scale is client-side
const SQRT3 = Math.sqrt(3);

function hexToPixel(q, r) {
  // flat-top
  const x = SIZE * (3 / 2) * q;
  const y = SIZE * SQRT3 * (r + q / 2);
  return { x, y };
}

function hexCornerOffset(i) {
  // flat-top: angles 0,60,...,300
  const a = (Math.PI / 180) * (60 * i);
  return { dx: SIZE * Math.cos(a), dy: SIZE * Math.sin(a) };
}

function key(x, y) {
  return `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
}

function buildTopology(hexCoords) {
  // Returns { hexes, vertices, edges, vAdj, eAdj, hexVertices, hexEdges }
  const hexes = hexCoords.map(([q, r], id) => ({ id, q, r, ...hexToPixel(q, r) }));
  const vertices = new Map();     // key -> { id, x, y, hexes:[hexId], edges:[edgeId] }
  const edges = new Map();        // key -> { id, a, b, hexes:[hexId] }
  const hexVertices = hexes.map(() => []);
  const hexEdges = hexes.map(() => []);

  for (const h of hexes) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const o = hexCornerOffset(i);
      const vx = h.x + o.dx, vy = h.y + o.dy;
      const k = key(vx, vy);
      let v = vertices.get(k);
      if (!v) {
        v = { id: vertices.size, x: vx, y: vy, hexes: [], edges: [] };
        vertices.set(k, v);
      }
      if (!v.hexes.includes(h.id)) v.hexes.push(h.id);
      corners.push(v);
      hexVertices[h.id].push(v.id);
    }
    for (let i = 0; i < 6; i++) {
      const a = corners[i], b = corners[(i + 1) % 6];
      const ek = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      let e = edges.get(ek);
      if (!e) {
        e = { id: edges.size, a: a.id, b: b.id, hexes: [] };
        edges.set(ek, e);
        if (!a.edges.includes(e.id)) a.edges.push(e.id);
        if (!b.edges.includes(e.id)) b.edges.push(e.id);
      }
      if (!e.hexes.includes(h.id)) e.hexes.push(h.id);
      hexEdges[h.id].push(e.id);
    }
  }

  const verts = [...vertices.values()].sort((a, b) => a.id - b.id);
  const es    = [...edges.values()].sort((a, b) => a.id - b.id);

  // Vertex adjacency: vertices connected by an edge
  const vAdj = verts.map(() => []);
  for (const e of es) {
    vAdj[e.a].push(e.b);
    vAdj[e.b].push(e.a);
  }

  return { hexes, vertices: verts, edges: es, vAdj, hexVertices, hexEdges };
}

// --- Hex coord sets for different map sizes ---

function hexagonCoords(radius) {
  // Standard hexagonal arrangement of radius N (center + rings)
  const out = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push([q, r]);
  }
  return out;
}

function stretchedCoords() {
  // 30 hexes for 5-6 players (official 5-6 player extension shape):
  // columns of 3,4,5,6,5,4,3 hexes, centred vertically. In flat-top axial coords a
  // column is a fixed q, and its centre sits at y = r + q/2 (times sqrt3).
  const heights = [3, 4, 5, 6, 5, 4, 3];
  const centre = -0.5; // centre of the 6-tall middle column
  const out = [];
  for (let i = 0; i < heights.length; i++) {
    const q = i - 3, h = heights[i];
    const rStart = Math.round(centre - q / 2 - (h - 1) / 2);
    for (let j = 0; j < h; j++) out.push([q, rStart + j]);
  }
  return out;
}

// --- Resource and number distribution ---

const CLASSIC_TILES = {
  wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1,
};
const EXTENDED_TILES = {
  wood: 6, brick: 5, sheep: 6, wheat: 6, ore: 5, desert: 2,
};
const CLASSIC_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const EXTENDED_NUMBERS = [
  2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6,
  8, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12,
];

// Official "variable set-up" number order (tokens A-R), laid in a spiral.
const SPIRAL_NUMBERS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

function hexDistance(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Spiral order over a radius-2 hexagon: outer ring, then inner ring, then centre.
function spiralOrder(hexes) {
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const byKey = new Map(hexes.map(h => [`${h.q},${h.r}`, h]));
  const order = [];
  for (let radius = 2; radius >= 1; radius--) {
    let q = -radius, r = radius; // start corner
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < radius; step++) {
        const h = byKey.get(`${q},${r}`);
        if (h) order.push(h);
        q += dirs[side][0]; r += dirs[side][1];
      }
    }
  }
  const centre = byKey.get('0,0');
  if (centre) order.push(centre);
  return order;
}

function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tilePool(tilesCount, n) {
  const pool = [];
  for (const [res, k] of Object.entries(tilesCount)) for (let i = 0; i < k; i++) pool.push(res);
  if (pool.length !== n) throw new Error(`tile count ${pool.length} != hex count ${n}`);
  return pool;
}

function redClashes(hexes, tiles) {
  let clashes = 0;
  for (let i = 0; i < hexes.length; i++) {
    if (![6, 8].includes(tiles[i].num)) continue;
    for (let j = i + 1; j < hexes.length; j++) {
      if (![6, 8].includes(tiles[j].num)) continue;
      if (hexDistance(hexes[i], hexes[j]) === 1) clashes++;
    }
  }
  return clashes;
}

// Random resources + random numbers, retrying until no 6/8 are adjacent.
function assignTiles(hexes, tilesCount, numbers, rand = Math.random) {
  const resources = tilePool(tilesCount, hexes.length);
  const producing = resources.filter(r => r !== 'desert').length;
  if (numbers.length !== producing) throw new Error(`need ${producing} numbers, got ${numbers.length}`);
  let best = null, bestClashes = Infinity;
  for (let attempt = 0; attempt < 500 && bestClashes > 0; attempt++) {
    const res = shuffle(resources, rand);
    const nums = shuffle(numbers, rand);
    const tiles = hexes.map((h, i) => ({
      res: res[i],
      num: res[i] === 'desert' ? null : nums.shift(),
    }));
    const c = redClashes(hexes, tiles);
    if (c < bestClashes) { bestClashes = c; best = tiles; }
  }
  return best;
}

// Official variable set-up: random resources, numbers placed A-R along the spiral,
// skipping the desert.
function assignSpiral(hexes, tilesCount, rand = Math.random) {
  const resources = shuffle(tilePool(tilesCount, hexes.length), rand);
  const tiles = hexes.map((h, i) => ({ res: resources[i], num: null }));
  const order = spiralOrder(hexes);
  let k = 0;
  for (const h of order) {
    const i = hexes.indexOf(h);
    if (tiles[i].res === 'desert') continue;
    tiles[i].num = SPIRAL_NUMBERS[k++];
  }
  return tiles;
}

// --- Harbor placement: spread along the coast, never touching each other ---
const HARBOR_TYPES = ['3:1', '3:1', '3:1', '3:1', 'wood', 'brick', 'sheep', 'wheat', 'ore'];
const HARBOR_TYPES_LARGE = [...HARBOR_TYPES, '3:1', 'sheep']; // 5-6 player extension: 11

function placeHarbors(topo, types, rand = Math.random) {
  const coastal = topo.edges.filter(e => e.hexes.length === 1);
  if (coastal.length === 0) return [];
  // Walk the coast in angular order around each landmass centre so harbors spread out.
  const cx = topo.hexes.reduce((a, h) => a + h.x, 0) / topo.hexes.length;
  const cy = topo.hexes.reduce((a, h) => a + h.y, 0) / topo.hexes.length;
  const mid = e => {
    const a = topo.vertices[e.a], b = topo.vertices[e.b];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const sorted = coastal.slice().sort((e1, e2) => {
    const m1 = mid(e1), m2 = mid(e2);
    return Math.atan2(m1.y - cy, m1.x - cx) - Math.atan2(m2.y - cy, m2.x - cx);
  });
  const n = Math.min(types.length, Math.floor(sorted.length / 3));
  const step = sorted.length / n;
  const offset = Math.floor(rand() * step);
  const used = new Set();
  const picks = [];
  for (let i = 0; i < n; i++) {
    // Take the slot, or the nearest free coastal edge after it that doesn't share a
    // vertex with (or sit next to) another harbor.
    for (let k = 0; k < sorted.length; k++) {
      const e = sorted[(Math.floor(offset + i * step) + k) % sorted.length];
      if (used.has(e.a) || used.has(e.b)) continue;
      picks.push(e);
      for (const v of [e.a, e.b]) { used.add(v); for (const nb of topo.vAdj[v]) used.add(nb); }
      break;
    }
  }
  const t = shuffle(types, rand);
  return picks.map((e, i) => ({ edgeId: e.id, type: t[i] }));
}

// --- Map definitions ---

function makeMap(variant, rand = Math.random) {
  let hexCoords, tiles, nums, name, spiral = false, large = false;
  switch (variant) {
    case 'classic':
      hexCoords = hexagonCoords(2); // 19 hexes, official variable set-up
      tiles = CLASSIC_TILES; spiral = true;
      name = 'Classic (3-4p)';
      break;
    case 'extended':
      hexCoords = stretchedCoords(); // 30 hexes
      tiles = EXTENDED_TILES; nums = EXTENDED_NUMBERS; large = true;
      name = 'Extended (5-6p)';
      break;
    case 'random_small':
      hexCoords = hexagonCoords(2);
      tiles = CLASSIC_TILES; nums = CLASSIC_NUMBERS;
      name = 'Random Small';
      break;
    case 'random_large':
      hexCoords = stretchedCoords();
      tiles = EXTENDED_TILES; nums = EXTENDED_NUMBERS; large = true;
      name = 'Random Large';
      break;
    case 'desert_land':
      hexCoords = hexagonCoords(2);
      tiles = { wood: 3, brick: 3, sheep: 3, wheat: 3, ore: 3, desert: 4 };
      nums = [2, 3, 4, 4, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 12];
      name = 'Desert Land';
      break;
    case 'resource_rush':
      hexCoords = hexagonCoords(2);
      tiles = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 3, desert: 0 };
      nums = [...CLASSIC_NUMBERS, 5]; // 19 producing hexes need 19 numbers
      name = 'Resource Rush';
      break;
    case 'two_islands': {
      const left  = hexagonCoords(1).map(([q, r]) => [q - 3, r]);
      const right = hexagonCoords(1).map(([q, r]) => [q + 3, r]);
      hexCoords = [...left, ...right];
      tiles = { wood: 3, brick: 2, sheep: 3, wheat: 3, ore: 2, desert: 1 };
      nums = [2, 3, 4, 5, 5, 6, 6, 8, 8, 9, 10, 11, 12];
      name = 'Two Islands';
      break;
    }
    default:
      throw new Error(`unknown map variant ${variant}`);
  }
  const topo = buildTopology(hexCoords);
  const tileData = spiral
    ? assignSpiral(topo.hexes, tiles, rand)
    : assignTiles(topo.hexes, tiles, nums, rand);
  topo.hexes.forEach((h, i) => {
    h.res = tileData[i].res;
    h.num = tileData[i].num;
  });
  const harbors = placeHarbors(topo, large ? HARBOR_TYPES_LARGE : HARBOR_TYPES, rand);
  const desert = topo.hexes.find(h => h.res === 'desert');
  // No desert (Resource Rush): the robber starts off the board and enters on the first 7.
  const robberHex = desert ? desert.id : null;
  return { name, variant, topo, harbors, robberHex };
}

const MAPS = [
  { id: 'classic',       label: 'Classic',       maxPlayers: 4, hint: '19 hexes, official number spiral' },
  { id: 'extended',      label: 'Extended',      maxPlayers: 6, hint: '30 hexes, 5-6 players' },
  { id: 'random_small',  label: 'Random Small',  maxPlayers: 4, hint: '19 hexes, fully random numbers' },
  { id: 'random_large',  label: 'Random Large',  maxPlayers: 6, hint: '30 hexes shuffled' },
  { id: 'desert_land',   label: 'Desert Land',   maxPlayers: 4, hint: 'four deserts, tight play' },
  { id: 'resource_rush', label: 'Resource Rush', maxPlayers: 4, hint: 'no desert, robber enters on the first 7' },
  { id: 'two_islands',   label: 'Two Islands',   maxPlayers: 4, hint: 'two small islands' },
];
const MODES = [
  { id: 'base', label: 'Base game',        hint: '10 VP default, development cards' },
  { id: 'cnk',  label: 'Cities & Knights', hint: '13 VP default, barbarians, progress cards' },
];

module.exports = { makeMap, MAPS, MODES, hexToPixel, shuffle, hexDistance };
