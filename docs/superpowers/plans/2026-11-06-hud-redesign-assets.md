# HUD Redesign & Game Asset Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate the spec's SVG asset set and WebP atlases, draw the board and HUD with them, and replace the single left sidebar with the dark perimeter-HUD layout, without changing game rules or breaking either mode.

**Architecture:** A deterministic Node generator (`scripts/assets/*.js`, CommonJS like the rest of the repo) emits every SVG from one manifest. A second script rasterizes the SVGs in the preinstalled Playwright Chromium and packs four WebP atlases plus JSON frame maps. Both outputs are committed, so `npm start` never needs Chromium. On the client, a new `public/js/assets.js` loads the atlases; `render.js` draws from them and falls back to today's procedural drawing until they are ready (or if they fail). The game screen in `index.html` is regrouped into seven HUD regions. Every existing element ID stays, so `ui.js` and the e2e tests keep working.

**Tech Stack:** Node 18+, Express/ws (unchanged), plain-JS canvas client, Playwright Chromium (already installed; rasterizing and e2e only), `assert`-based node test scripts.

**Spec:** `docs/superpowers/specs/2026-11-06-hud-redesign-asset-spec.md`

**Branch:** `feat/hud-redesign`, created from `fix/rules-settings-ck` (commit 81ebb41). Commit locally; pushing stays blocked until GitHub is linked.

## Decisions that differ from the spec (confirm before starting)

| # | Spec says | Plan does | Why |
|---|---|---|---|
| D1 | 24 progress cards with 1st-edition names and text (Bishop, Spy, Warlord, Deserter, Master Merchant…) | 25 cards using the engine's 2025 deck ids (`src/constants.js` `PROGRESS_DECKS`): file `prog_<track>_<engineId>.svg`, rules text taken from `PROGRESS_INFO` in `public/js/ui.js` | The engine implements the 2025 rulebook. The spec's names and text describe different cards (e.g. it has no Wedding), so following it would print wrong rules |
| D2 | 4 player colours (red/blue/orange/white) | Same 4 with the spec's exact fills, plus green `#2E9D47`/`#1B5E2B`/`#81C784` and brown `#7B4A2E`/`#4A2C1B`/`#BCAAA4`. That is 20 extra piece and knight files. `C.COLORS` in `src/constants.js` changes to the spec fills | The game supports 3–6 players |
| D3 | Pointy-top hexes | Individual SVGs are pointy-top, as the spec says. The atlas frames are rendered from a flat-top variant (shoreline polygons rotated 90° about (256,256); motifs stay upright) | `render.js` `hexPath` draws flat-top hexes |
| D4 | `src/styles/tokens.css`; React components (`BoardCanvas`, `MatchHeader`…) | `public/css/tokens.css`. The "components" become DOM regions in `public/index.html`, filled by the existing `ui.js` render methods | The client is plain JS served from `public/`; `src/` is server code |
| D5 | "SVG & WebP" per file for hexes, ports and cards | SVG per file; WebP only inside the 4 atlases (spec §5 step 2) | Individual WebPs would never be loaded |
| D6 | cards atlas 2800×3360 (7×6); pieces_hud 1280×1152 (10×9) | cards 7×7 = 2800×3920 (43 cards); pieces_hud 10×11 = 1280×1408 (107 sprites). The post-build count is **165 SVGs** | Follows from D1 and D2 |
| D7 | Match bar: Pause, Reset, Copy Link, Rules | **Pause** is a new host-only server feature (Task 9). **Reset** reuses the existing host `restart`, behind a confirm modal. **Trade history** moves to a "Trades" tab in the log panel. The **theme toggle** stays on the home screen only (the game HUD is always dark) | No pause exists today; history and theme are existing features to preserve |
| D8 | `hex_gold` | Generated and packed but not drawn | The engine has no gold fields |

## Global Constraints

- All colours, geometry, viewBoxes and file names come verbatim from the spec, except where D1–D8 change them.
- Every SVG is standalone: it starts `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" width="W" height="H">`, gradients and filters live in `<defs>`, and fonts are `font-family="Inter, system-ui, sans-serif"`. No external references.
- Generator output is byte-for-byte deterministic: no randomness and no timestamps.
- No new runtime npm dependencies (`dependencies` in `package.json` unchanged). Rasterizing uses `require('playwright')`, which is preinstalled.
- Atlas JSON format: `{ "frames": { "<id>": { "x", "y", "w", "h" } }, "meta": { "image": "<file>.webp", "size": { "w", "h" }, "cell": N } }`, frames in row-major order.
- Keep all existing element IDs that `ui.js`, `app.js` and `test/e2e.js` use: `#players #turnInfo #dice #ckPanel #actionButtons #log #chatLog #chatInput #board #banner #hexTip #floats #zoomIn #zoomOut #zoomFit #lobbyPanel #hud #hand #modal #modalBody #roomCode #copyLink #rulesBtn2 #historyBtn`.
- No game-rule changes. `npm test` and both e2e modes stay green after every task.
- Layout works at 375px wide with a 16px side gutter, has no horizontal page scroll, and still works at 1280×720.

## Review Focus

1. **Base mode leaking C&K UI.** In a base game the barbarian banner, commodity tray, event die and roster track badges must not render. Pinned by e2e checks in Task 10.
2. **5–6 player rooms.** Green and brown pieces and knights must draw from the atlas, and 6 roster cards must fit at 1280×720 (scrolling inside the roster, not the page) and on phone. Pinned in Tasks 6 and 10.
3. **Atlas missing, slow or failing to decode.** The board still draws procedurally with no console errors and switches to sprites once they load. Pinned in Task 6.
4. **Phone width (375×740).** No horizontal scroll, the board stays visible between the HUD regions, the dock is usable, and chat/log open as a drawer. Pinned in Task 10.
5. **Pause and the turn timer.** A paused turn must not auto-act. Resume restores the *remaining* time, not a fresh full timer. Game actions are rejected while paused; chat still works. Pinned in Task 9.

---

### Task 1: Generator scaffold, palette, manifest

**Files:**
- Create: `scripts/assets/palette.js`, `scripts/assets/svg.js`, `scripts/assets/manifest.js`, `scripts/generate-assets.js`
- Create: `test/assets.js`
- Modify: `package.json` (scripts), `src/constants.js:61` (COLORS)

**Interfaces:**
- Produces:
  - `palette.js` exports:
    - `PLAYERS`: an ordered array of `{ key, fill, shade, spec }` for red, blue, orange, white, green, brown, with the spec values plus D2.
    - `RES`: per wood/brick/sheep/wheat/ore/desert/ocean/gold, `{ top, bot, accent }` taken from the spec's hex table.
    - `COMM` and `TRACK`, plus a `CHIT` object.
  - `svg.js` exports:
    - `doc(w, h, defs, body) -> string`
    - `linear(id, top, bot) -> string` (a vertical `<linearGradient>`)
    - `shadow(id) -> string` (the drop shadow filter: `dy=3`, `stdDeviation=2.5`, `rgba(0,0,0,0.55)`)
    - `text(x, y, str, attrs) -> string`
    - `esc(str) -> string`
    - `wrap(str, maxChars) -> string[]` (greedy word wrap for card rules text)
  - `manifest.js` exports `entries(): Array<{ id, path, w, h, atlas, build: () => string }>`:
    - `path` is relative to `public/assets/`.
    - `atlas` is one of `'hexes'|'ports'|'cards'|'pieces_hud'`.
    - `build` returns the SVG string. Category modules (Tasks 2–4) each export `entries()` and `manifest.js` concatenates them; for this task they are stubs returning `[]`.
  - `generate-assets.js [--out dir]` writes every entry to `<out>/<path>` (default `public/assets`) plus `<out>/manifest.json` = `{ "<id>": "<path>" }`.

- [ ] **Step 1: Write `test/assets.js`.** Use the repo's style (`assert`, an `ok` counter, `console.log('  ok  …')`). Its checks:
  - Each per-folder count is `<=` its value in `EXPECTED = { hexes: 8, ports: 7, tokens: 12, cards: 43, pieces: 27, knights: 36, dice: 16, icons: 16, total: 165 }`. Count per folder from the first path segment; for cards, count everything under `cards/`. Exact equality is added in Task 4.
  - ids are unique;
  - every `build()` output starts with `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"`;
  - every output is tag-balanced (a regex tag stack that ignores self-closing tags);
  - every output contains no `NaN`, `undefined` or `http` other than the xmlns;
  - generating twice into two temp dirs gives identical bytes;
  - if `public/assets/manifest.json` exists, committed files equal freshly generated ones, which catches drift;
  - `require('../src/constants').COLORS` deep-equals `['#E53935','#00B0FF','#FB8C00','#ECEFF1','#2E9D47','#7B4A2E']`, the `PLAYERS` fills in order.
- [ ] **Step 2: Run `node test/assets.js`.** Expected: FAIL (`Cannot find module '../scripts/assets/manifest'`).
- [ ] **Step 3: Implement the four modules** (category modules are stubs returning `[]`) **and change `C.COLORS`** to the list above. Add scripts:
  - `"assets": "node scripts/generate-assets.js"`
  - `"assets:atlas": "node scripts/build-atlases.js"`
  - prepend `node test/assets.js && ` to `test`
- [ ] **Step 4: Run `npm test`.** Expected: all PASS, which shows the colour change breaks no rules, server or full-game tests.
- [ ] **Step 5: Commit** with message `assets: generator scaffold, palette, manifest`.

### Task 2: Hexes, ports, number tokens

**Files:**
- Create: `scripts/assets/hexes.js`, `scripts/assets/ports.js`, `scripts/assets/tokens.js`
- Modify: `scripts/assets/manifest.js`

**Interfaces:**
- Produces: ids `hex_{wood,brick,sheep,wheat,ore,desert,ocean,gold}`, `port_{3to1,wood,brick,sheep,wheat,ore,pier}`, `token_{2..6,8..12}`, `token_robber`, `token_merchant`. Also `hexes.flat(id) -> string`, the flat-top variant per D3, used only by Task 5.

- [ ] **Step 1: Extend `test/assets.js` with structural checks:**
  - `hex_wood` contains `points="256,14 466,135 466,377 256,498 46,377 46,135"` and `<circle cx="256" cy="256" r="58"`.
  - `hex_desert` and `hex_ocean` contain no `r="58"`.
  - `flat('hex_wood')` contains `points="498,256 377,466 135,466 14,256 135,46 377,46"`.
  - `token_6` and `token_8` contain fill `#E53935`, and the pip-circle count for token N equals `6 - |7 - N|`.
  - Every port except the pier contains the sail `rect x="68" y="52" width="120" height="96" rx="12"`.
  - `port_3to1` contains the text `3:1`; each resource port contains `2:1`.
- [ ] **Step 2: Run `node test/assets.js`.** Expected: these new checks FAIL.
- [ ] **Step 3: Implement the three modules from the spec's geometry rules and tables.**
  - Motifs are simple flat shapes, 3–6 elements each, kept outside the r=58 recess: pines are 3 stacked triangles plus a trunk; sheep are an ellipse body with a head circle.
  - Pip x positions: `64 + 9*(i - (n-1)/2)` at `y=88`.
  - Flat-top variant: use the same body, but transform each shoreline/terrain polygon point with `(x,y) -> (512-y, x)`.
- [ ] **Step 4: Run `node test/assets.js`.** Expected: Task 2 checks PASS; the total count still fails.
- [ ] **Step 5: Commit** with message `assets: hexes, harbors, number tokens`.

### Task 3: Cards — resources, backs, development, progress

**Files:**
- Create: `scripts/assets/cards.js`, `public/js/cardtext.js`
- Modify: `public/js/ui.js:20-51` (`DEV_INFO`/`PROGRESS_INFO` move out), `public/index.html` (load `js/cardtext.js` before `ui.js`), `scripts/assets/manifest.js`

**Interfaces:**
- Produces:
  - `public/js/cardtext.js` is UMD (`window.CardText = …`, or `module.exports` when run under node). It exports:
    - `DEV`: `{ knight, vp, road_building, year_of_plenty, monopoly } -> text`
    - `PROGRESS`: today's `PROGRESS_INFO` plus `printing` and `constitution`, both "+1 Victory Point. Played face up at once; it can't be stolen."
    - `TITLE(id) -> string`: upper-case, `_`→space
  - `ui.js` keeps `const DEV_INFO = CardText.DEV, PROGRESS_INFO = CardText.PROGRESS;` so nothing else changes.
  - Card ids:
    - `card_{wood,brick,sheep,wheat,ore,paper,cloth,coin}`
    - `card_back_{resource,development,trade,politics,science}`
    - `dev_{knight,victory_point,road_building,year_of_plenty,monopoly}`. The engine id `vp` maps to `dev_victory_point`.
    - `prog_<track>_<engineId>` for every key of `C.PROGRESS_DECKS` (25)

- [ ] **Step 1: Extend the test:**
  - The progress ids equal the set built from `require('../src/constants').PROGRESS_DECKS`, so the card art can never drift from the engine.
  - Every card has the outer shell `rect x="8" y="8" width="384" height="544" rx="22"` and the inner `rect x="22" y="22" width="356" height="516" rx="16"`.
  - Every dev and progress card contains `esc(CardText…[id])`, wrapped words joined by spaces.
  - Progress frame accents match `TRACK[track]`.
  - No `<tspan>` line in the rules box is longer than 34 chars.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement `cards.js` per the spec's Category 4–6 rules.**
  - Resource and back cards: the 110px medallion and the title banner at y=445.
  - Dev and progress cards: header pill, r=88 illustration, and a rules box at `x=36 y=340 w=328 h=168` with wrapped text at font-size 22 and line-height 28.
  - Track discipline icon top-left: scale for trade, crown for politics, gear for science.
  - Illustrations are simple geometric emblems; each card type gets one emblem built from 3–8 primitives.
- [ ] **Step 4: Run `node test/assets.js && node test/e2e.js cnk`.** Expected: card checks PASS; e2e PASS, which proves the `ui.js` text move is harmless.
- [ ] **Step 5: Commit** with message `assets: resource, back, development and 2025 progress cards`.

### Task 4: Pieces, knights, dice, HUD icons

**Files:**
- Create: `scripts/assets/pieces.js`, `scripts/assets/knights.js`, `scripts/assets/dice.js`, `scripts/assets/icons.js`
- Modify: `scripts/assets/manifest.js`

**Interfaces:**
- Produces:
  - `piece_{road,settlement,city,city_wall}_<playerKey>` for the 6 `PLAYERS` keys, plus `piece_metropolis_{trade,politics,science}`.
  - `knight_{basic,strong,mighty}_{inactive,active}_<playerKey>`.
  - `die_white_{1..6}`, `die_red_{1..6}`, `die_event_{barbarian,trade,politics,science}`.
  - The 16 `icon_*`/`hud_*` ids exactly as in the spec table.

- [ ] **Step 1: Extend the test:**
  - Switch the count checks from `<=` to exact equality: the total is 165 and every folder matches `EXPECTED`.
  - Every piece contains `stroke="#141414"` and `stroke-width="3.5"` and references the shadow filter.
  - Inactive knights contain `stroke="#546E7A"` and `opacity="0.82"`; active knights contain `stroke="#00E5FF"` and `stroke-width="6"`.
  - Knight badge text equals the tier strength (1/2/3).
  - The pip count of `die_*_N` equals N, at the spec's 3×3 grid positions.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement the four modules from the spec's Category 7–9 rules.**
  - City wall: a 12px player-colour frame with `#141414` outlines inside and out, and 4 corner crenels.
  - Pip layout: 1 → [C]; 2 → [TL, BR]; 3 → [TL, C, BR]; 4 → corners; 5 → corners + C; 6 → left and right columns.
- [ ] **Step 4: Run `npm run assets && npm test`.** Expected: all PASS; `public/assets/**` holds 165 SVGs and `manifest.json`.
- [ ] **Step 5: Commit** with message `assets: pieces, knights, dice, HUD icons (165 SVGs generated)`. This commit includes the generated `public/assets`.

### Task 5: Rasterize and pack the WebP atlases

**Files:**
- Create: `scripts/build-atlases.js`, `scripts/check-assets.js`
- Output: `public/assets/atlases/{hexes,ports,cards,pieces_hud}_atlas.{webp,json}`

**Interfaces:**
- Consumes: `manifest.entries()`, `hexes.flat(id)`.
- Produces: the 4 atlas pairs. Grids:

  | Atlas | Cols | Cell |
  |---|---|---|
  | hexes | 4 | 512 |
  | ports | 4 | 256 |
  | cards | 7 | 400×560 |
  | pieces_hud | 10 | 128 |

  Rows are `ceil(n/cols)`. Order is manifest order. `pieces_hud` holds pieces, knights, dice, icons and tokens.

  `check-assets.js` exits 1 and lists every problem when:
  - a manifest file is missing or 0 bytes;
  - an atlas pair is missing;
  - a frame id is unknown;
  - the frame count ≠ the manifest count for that atlas;
  - the webp size ≠ `meta.size`, read from the RIFF/VP8 header.

- [ ] **Step 1: Add `node scripts/check-assets.js` to the `test` script and run it.** Expected: FAIL, "atlas hexes missing" (and the other three).
- [ ] **Step 2: Implement `build-atlases.js`.**
  - Launch `chromium` with a page of fixed size W×H.
  - Draw each SVG as a data-URL `Image` onto a `<canvas>` at its frame (hexes use `flat()`), then `canvas.toDataURL('image/webp', 0.92)`.
  - Decode the base64 in node, then write the `.webp` and the `.json`.
  - Transparent background.
- [ ] **Step 3: Run `npm run assets:atlas && node scripts/check-assets.js`.** Expected: `ok: 165 svgs, 4 atlases`.
- [ ] **Step 4: Visually inspect.** Screenshot each atlas into the scratchpad at deviceScaleFactor 1 and look at it. Verify:
  - no clipped frames;
  - no blank cells;
  - knights are legible at 32px.
  - Fix the generator if not, then re-run Tasks 2–4 tests.
- [ ] **Step 5: Commit** with message `assets: WebP atlases + frame maps + post-build check`.

### Task 6: Client asset loader and board renderer integration

**Files:**
- Create: `public/js/assets.js`
- Modify: `public/js/render.js` (`draw()` ~114-260, `drawHex` 427, `drawPiece` 589, `drawHarbor` 634, the number/robber/merchant/metropolis drawing), `public/index.html` (load `js/assets.js` before `render.js`), `test/e2e.js`

**Interfaces:**
- Produces `window.Assets`:
  - `load(): Promise<void>`. Fetches the 4 JSONs and decodes the 4 WebPs; it never rejects, and on failure it logs one `console.warn` and leaves `ready=false`.
  - `ready: boolean`
  - `has(id): boolean`
  - `draw(ctx, id, cx, cy, w, h, rot = 0)`. Draws centred and rotated; returns `false` if the sprite is missing.
  - `url(id): string`. Returns `'assets/' + manifest[id]`, used by the DOM.
  - `playerKey(hex): string`. Maps a `C.COLORS` value to `red|blue|orange|white|green|brown`, with fallback `'white'`.
  - `onReady(fn)`. The renderer calls `this.draw()` again once sprites arrive.
- Renderer sprite mapping:
  - Hex: `hex_<res>` sized to cover the hex with a 2r×2r box, then the existing outline stroke.
  - Number: `token_<n>` with diameter `0.62r`.
  - Robber: `token_robber`.
  - Merchant: `token_merchant`.
  - Settlement/city: `piece_<kind>_<key>`.
  - City with walls: `piece_city_wall_<key>` under the city.
  - Metropolis: `piece_metropolis_<track>` over a player-colour disc.
  - Knight: `knight_<basic|strong|mighty>_<active?'active':'inactive'>_<key>`, with rank 1/2/3.
  - Road: `piece_road_<key>` rotated to the edge angle, length `0.8 ×` edge.
  - Harbor: `port_<type==='3:1'?'3to1':type>` at the existing outward point, plus `port_pier` stretched along each vertex→ship segment.
  - Pick highlights, hover and tooltips stay procedural.
  - Every sprite call is `Assets.ready && Assets.draw(...) || <existing procedural call>`.

- [ ] **Step 1: Add e2e checks to `test/e2e.js`, run in both modes:**
  - After the game starts, `await waitFor(() => page.evaluate(() => Assets.ready))`.
  - A second run, `node test/e2e.js base --no-atlas`, routes `**/atlases/**` to 404 through `page.route`. It asserts the canvas still has more than 1000 non-transparent pixels (sampled with `getImageData`) and that the console shows no errors (warnings allowed).
  - A 6-player sub-case: start a `maxPlayers: 6` base room with 6 pages. Assert `Assets.has('piece_settlement_brown')` and `Assets.has('knight_basic_active_green')`, and screenshot the board.
- [ ] **Step 2: Run `node test/e2e.js base`.** Expected: FAIL (`Assets` is undefined).
- [ ] **Step 3: Implement `assets.js` and the renderer changes.**
  - Remove the canvas background fill so that the CSS ocean gradient (Task 7) shows through. `clearRect` already exists.
  - Draw sprites with `ctx.imageSmoothingQuality = 'high'`.
- [ ] **Step 4: Run e2e base, cnk and `--no-atlas`.** Expected: all PASS. Look at the screenshots in `test/out` (or wherever `OUT` points) to confirm pieces sit on vertices and roads align with edges.
- [ ] **Step 5: Commit** with message `client: draw board from sprite atlases with procedural fallback`.

### Task 7: Tokens and HUD region layout

**Files:**
- Create: `public/css/tokens.css` (spec §1 verbatim, plus D2 green/brown variables), `public/css/hud.css`
- Modify: `public/index.html:117-153` (game screen markup), `public/css/style.css` (delete the `.sidebar` rules that `hud.css` replaces), `public/js/render.js:88-100` (`fit()` padding), `public/js/app.js:15` (`themeToggle2` becomes optional)

**Interfaces:**
- Produces this game-screen DOM. The board fills the screen and every region is an absolutely positioned overlay inside `#screen-game.hud-screen`:

  | Region | Element (keeps existing IDs) | Position |
  |---|---|---|
  | BoardCanvas | `main#boardWrap` with `#board #banner #hexTip #floats #lobbyPanel`; zoom pill `div#zoomCtl` with `#zoomIn #zoomOut #zoomFit` | full screen; zoom pill at top 16 / right 16 |
  | MatchHeader | `header#matchHeader.hud-pill` with `#roomCode #pauseBtn #resetBtn #copyLink #rulesBtn2` | top 16 / left 16, height 44 |
  | BarbarianHud | `div#barbarianHud` (`.ck-only`) | top 16, centred |
  | PlayerRoster | `aside#players.roster` | left 16, top 76, `max-height: calc(100vh - 76px - 236px)`, scrolls inside |
  | GameLogChat | `section#logChat` with tabs Log/Chat/Trades holding `#log`, `#chatBox(#chatLog,#chatInput)`, `#historyBtn` | bottom 16 / left 16, 320×200 |
  | PlayerHandDock | `div#hud` > `div#hand` | bottom 16, centred |
  | TurnActionCluster | `div#turnCluster` with `#turnInfo #dice #actionButtons #ckPanel` | bottom 16 / right 16 |

  - `#screen-game` gets `data-mode="base|cnk"`, set in `UI.render`. The CSS `[data-mode="base"] .ck-only{display:none}` hides C&K-only regions.
  - `#boardWrap` background is `radial-gradient(circle at center, var(--ocean-inner) 0%, var(--ocean-outer) 100%)`.
  - Breakpoint `max-width: 700px`:
    - The roster becomes a horizontal scroll strip under the header, 56px high, with compact cards.
    - `#logChat` collapses to a 💬 button that toggles `.open`, a bottom sheet of 50vh.
    - The barbarian banner moves below the roster strip and is compact.
    - `#turnCluster` becomes a single row above the dock.
  - Render: `fit()` uses `hudInsets() -> {top,right,bottom,left}`, computed from the `getBoundingClientRect` of `#matchHeader`, `#barbarianHud`, `#players` (desktop only), `#hud` and `#turnCluster`. Any region more than 40% of the viewport in its axis is ignored, so the board never collapses.

- [ ] **Step 1: Add e2e layout checks**, at 1280×720 and at `devices['iPhone 13']`, in both modes:
  - `document.documentElement.scrollWidth <= innerWidth`.
  - The 7 region elements are visible: on phone `#logChat` shows only its toggle, and in base mode `#barbarianHud` must be hidden.
  - On desktop the region rects pairwise don't overlap.
  - The canvas centre pixel is not covered: `elementFromPoint(centre) === #board`.
- [ ] **Step 2: Run e2e.** Expected: FAIL (`#matchHeader` not found).
- [ ] **Step 3: Implement the markup, CSS and `hudInsets()`.**
  - The dark HUD surfaces use only token variables.
  - `#pauseBtn` and `#resetBtn` render now but have no handlers until Task 9.
- [ ] **Step 4: Run e2e in both modes and phone, then inspect the screenshots.** Expected: PASS. Also run the existing e2e flows, which use `#actionButtons button` and `#modal`.
- [ ] **Step 5: Commit** with message `ui: dark perimeter HUD layout with design tokens`.

### Task 8: HUD region contents

**Files:**
- Create: `public/js/logfmt.js` (UMD)
- Modify: `public/js/ui.js` (`renderPlayers` 169, `renderDice` 246, `renderHand` 446, `renderCk`/turn info, plus a new `renderBarbarianHud(state)` called from `render()`), `public/css/hud.css`
- Test: `test/logfmt.js` (added to `npm test`), `test/e2e.js`

**Interfaces:**
- Consumes: `Assets.url(id)` (Task 6) and the regions from Task 7.
- Produces:
  - **Roster.** Each player card (`.pcard`, `.pcard.turn` for the active player) shows name with ellipsis and colour dot, then badges:
    - VP: `hud_victory_point`.
    - Card count: `card_back_resource`.
    - C&K only (`.ck-only`): knight strength `hud_knight_shield` and track levels `t/p/s`.
    - Trophies `hud_longest_road`, `hud_largest_army` and `hud_defender_of_catan` (that one once `defenders > 0`), shown only when held.
  - **Barbarian HUD:**
    - 8 cells (0..`barbarianMax`); the ship `hud_barbarian_ship` sits in cell `barbarianMax - barbarianDistance`.
    - `B <barbarianStrength> vs K <knightStrength>`, red when B > K.
    - Robber badge: `hud_robber_asleep` while `robberHex == null`, otherwise `hud_robber_active`.
    - 3 metropolis chips, `piece_metropolis_<track>`, dimmed at 35% opacity when unclaimed and with the owner's colour dot when claimed.
  - **Dock.**
    - Left tray: wood…ore. Right tray (`.ck-only`): paper, cloth, coin. A 16px divider separates them.
    - Limit badge `<total>/<limit>`, where `limit = settings.discardLimit + 2 * (me.ck?.cityWalls || 0)`. It goes in the right tray in C&K and at the end of the left tray in base.
    - A slot with count > 0 shows `card_<res>` with a count bubble and `translateY(-6px)` on hover. A slot at 0 shows `icon_<res>` at 40% opacity.
    - Existing click and drag handlers on hand slots are kept.
  - **Turn cluster.**
    - The existing timer countdown.
    - Dice: `die_white_<yellow>` and `die_red_<red>`, plus `die_event_<event>` in C&K. Before the first roll, show face 1 at 30% opacity.
    - The existing primary button (Roll / End turn), restyled with `--accent-electric` and moved here from `#floats`.
    - The build buttons.
    - `#ckPanel` as a collapsible "City" drawer.
  - `LogFmt.format(text, players) -> html`:
    - Escapes the text.
    - Wraps each player name in `<b style="color:…">`.
    - Replaces the words wood/brick/sheep/wheat/ore/paper/cloth/coin (singular or plural) with `<img class="li" src="assets/icons/icon_<res>.svg" width="20" height="20" alt="<res>">`.
    - Prefixes "rolled N" lines with a `die_white_1` icon.
    - Lines containing `barbarian` get class `ev-barb`; lines containing `robber` or `stole` get `ev-rob`.

- [ ] **Step 1: Write `test/logfmt.js`:**
  - `format('Ann got 2 wood', [{name:'Ann',color:'#E53935'}])` contains `color:#E53935` and `icon_wood.svg`.
  - `format('<script>', [])` contains `&lt;script&gt;` and no `<script`.
  - `format('woodland', [])` has no icon (word boundary).
  - A barbarian line has class `ev-barb`.
- [ ] **Step 2: Run `node test/logfmt.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `logfmt.js` and the four `ui.js` renderers.** Keep their existing data logic and change only the markup and classes.
- [ ] **Step 4: Run `node test/logfmt.js`, then e2e in both modes.** Add e2e assertions:
  - The cnk roster shows track text matching `/\d\/\d\/\d/`; base shows none.
  - After a roll, `#dice img` count is 3 in cnk and 2 in base.
  - The hand limit badge text matches `/^\d+\/\d+$/`.
  - Expected: PASS. Then inspect the screenshots at desktop and phone size.
- [ ] **Step 5: Commit** with message `ui: roster badges, barbarian banner, split dock, dice cluster, rich log`.

### Task 9: Pause and Reset in the match bar

**Files:**
- Modify: `server.js` (`handle()` 162, `scheduleTimer` 55, `broadcast` 43), `public/js/app.js`, `public/js/ui.js`
- Test: `test/server.js`

**Interfaces:**
- Server messages `pause` and `resume`:
  - Host only; otherwise error `only the host can pause`.
  - Only when phase ∉ {lobby, end}.
- `room.paused = { remainingMs }`. While paused:
  - `scheduleTimer` clears the timer and does not reschedule;
  - `state.paused = true`; `state.deadline = null`;
  - default-case game actions throw `game is paused`;
  - chat, leave, rejoin and `restart` still work.
- `resume` sets `room.deadline = now + remainingMs` (it does not reset to the full timer) and clears `paused`.
- `restart` clears `paused`.
- Client:
  - `#pauseBtn` shows only for the host and toggles ⏸/▶; non-hosts see a "Paused" banner.
  - `#resetBtn` (host only) opens a confirm modal, `Reset this game? Everyone goes back to the lobby.`, and on confirm sends `restart`.

- [ ] **Step 1: Add server tests**, using the existing `client()`/`step()` pattern with `CATAN_TIMER_SCALE=0.01` and turn timer 30:
  1. A non-host `pause` returns error `only the host can pause`.
  2. A host `pause` in the lobby returns an error.
  3. After start, a host `pause` gives `state.paused === true` and `deadline === null`, and a game action from the current player gives error `game is paused`.
  4. While paused, waiting 3× the scaled timer produces no state change: the turn number and phase are unchanged.
  5. After `resume`, `deadline - serverNow` is ≤ the remaining time recorded at pause time + 50ms.
  6. `restart` while paused gives a lobby with `paused` falsy.
- [ ] **Step 2: Run `node test/server.js`.** Expected: the new steps FAIL.
- [ ] **Step 3: Implement the server and client changes.**
- [ ] **Step 4: Run `npm test`, then e2e in both modes.** Expected: PASS.
- [ ] **Step 5: Commit** with message `room: host pause/resume and confirmed reset`.

### Task 10: Full verification pass

**Files:**
- Modify: `test/e2e.js` (a phone and 6-player run already exists from Tasks 6–7; add a `--phone` flag for the full game flow), `README.md` (an asset pipeline section: `npm run assets`, `npm run assets:atlas`, and the fact that atlases are committed)

- [ ] **Step 1: Run every check:**
  - `npm test`
  - `node scripts/check-assets.js`
  - `node test/e2e.js base`
  - `node test/e2e.js cnk`
  - `node test/e2e.js cnk --phone`
  - `node test/e2e.js base --no-atlas`

  Expected: all PASS with no console errors.
- [ ] **Step 2: Start `PORT=3005 node server.js` and play through manually in Playwright** at 1280×720 and iPhone 13, in both modes, with 3 and 6 players. Screenshot:
  - the lobby, a setup placement, a roll, a 7 discard, and C&K barbarian banner movement;
  - a metropolis claim (via the rules-test style state setup);
  - the end screen.

  Check each screenshot against Review Focus 1–5.
- [ ] **Step 3: Update the README and commit** with message `docs: asset pipeline; verification`.
- [ ] **Step 4: Refresh the hand-off artifacts.** Regenerate `catan-full.bundle` and the patch so the user can apply them from `D:\Colonist SEX`. Pushing stays blocked until GitHub is linked.
