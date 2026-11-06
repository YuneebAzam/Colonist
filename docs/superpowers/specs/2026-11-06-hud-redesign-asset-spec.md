# Colonist (Catan: Cities & Knights) — UI Redesign & 144-Asset Build Specification

> **Claude Code Execution Prompt:**
> Read this specification carefully. Your goal is to:
> 1. Generate all **144 SVG/WebP game assets** listed in Section 4 into `public/assets/` (preserving the sub-folder structure).
> 2. Pack the generated assets into the **4 sprite atlases** and accompanying JSON coordinate maps defined in Section 3 (`public/assets/atlases/`).
> 3. Apply the **Dark Neo-Minimalist HUD design tokens and layout refactoring** defined in Sections 1 and 2 to the frontend UI components.

---

## 1. Global Design System & CSS Tokens

Write these tokens to `src/styles/tokens.css` (or your root stylesheet) to replace the monochrome cyan sidebar and dock with high-contrast dark surfaces.

```css
:root {
  /* HUD Surfaces */
  --bg-hud-primary: #141414;
  --bg-hud-elevated: #1E1E24;
  --bg-hud-panel: #25262E;
  --border-hud-subtle: #2E303A;

  /* Interactive & Status Accents */
  --accent-electric: #00E5FF;
  --accent-electric-dim: #0088A3;
  --status-danger: #E53935;
  --status-warning: #FFB300;
  --status-success: #4CE08A;

  /* Ocean Canvas Gradient */
  --ocean-inner: #1B4F72;
  --ocean-outer: #0F2942;

  /* Cities & Knights Discipline Tracks */
  --track-trade: #FFD166;
  --track-politics: #00E5FF;
  --track-science: #4CE08A;

  /* Resource Semantic Colors */
  --res-wood-top: #2D6A3E;
  --res-wood-bot: #184225;
  --res-wood-accent: #68B678;

  --res-brick-top: #C85232;
  --res-brick-bot: #8A2F19;
  --res-brick-accent: #E88364;

  --res-sheep-top: #7CB342;
  --res-sheep-bot: #4B7C1D;
  --res-sheep-accent: #AED581;

  --res-wheat-top: #E5A922;
  --res-wheat-bot: #AD740B;
  --res-wheat-accent: #FFD54F;

  --res-ore-top: #64707D;
  --res-ore-bot: #3B434C;
  --res-ore-accent: #98A6B5;

  --res-desert-top: #D9B36C;
  --res-desert-bot: #A37B37;
  --res-desert-accent: #F2D7A0;

  /* Commodities */
  --comm-paper: #29BB89;
  --comm-cloth: #F7B733;
  --comm-coin: #00E5FF;

  /* Number Tokens */
  --chit-surface: #FAF6EC;
  --chit-rim: #F5EFE0;
  --chit-text-standard: #141414;
  --chit-text-hot: #E53935;

  /* Player Piece Colors */
  --player-red-fill: #E53935;
  --player-red-shade: #8E1B18;
  --player-red-spec: #FF8A80;

  --player-blue-fill: #00B0FF;
  --player-blue-shade: #005B8F;
  --player-blue-spec: #80D8FF;

  --player-orange-fill: #FB8C00;
  --player-orange-shade: #9E5100;
  --player-orange-spec: #FFD180;

  --player-white-fill: #ECEFF1;
  --player-white-shade: #78909C;
  --player-white-spec: #FFFFFF;
}
```

---

## 2. UI/UX Layout Refactoring Rules

When updating the game viewport components, decouple the single left-column sidebar into perimeter HUD clusters:

1. **Ocean Viewport Canvas (`BoardCanvas`)**:
   - Background: `radial-gradient(circle at center, var(--ocean-inner) 0%, var(--ocean-outer) 100%)`.
   - Keep zoom controls (`+`, `-`, `reset`) in a floating pill at `top: 16px; right: 16px` using `--bg-hud-primary` and `--border-hud-subtle`.
2. **Top-Left Match Bar (`MatchHeader`)**:
   - Compact pill (`height: 44px`) displaying the Room Code (`6FONP`) and 4 icon buttons (Pause, Reset, Copy Link, Rules).
3. **Top-Center Tactical Banner (`BarbarianHud`)**:
   - Floating horizontal bar anchored at `top: 16px; left: 50%; transform: translateX(-50%)`.
   - Displays the 8-step Barbarian Ship track, `Barbarians vs. Knights` strength counter, `Robber Asleep / Active` badge, and the 3 Metropolis status indicators.
4. **Left Player Roster (`PlayerRoster`)**:
   - Stack player cards (`--bg-hud-elevated`) with `8px` vertical gap.
   - Active turn player card uses `border: 2px solid var(--accent-electric)` and a subtle outer glow (`0 0 12px rgba(0, 229, 255, 0.25)`).
   - Include inline mini-badges for Victory Points (`hud_victory_point`), Resource Count, Knight Strength (`hud_knight_shield`), and Trade/Politics/Science city levels (`0/1/0`).
5. **Bottom-Left Telemetry & Chat (`GameLogChat`)**:
   - Tabbed or split container (`--bg-hud-primary`) with color-coded event lines and inline `20x20` SVG resource/dice icons.
6. **Bottom-Center Split Inventory Dock (`PlayerHandDock`)**:
   - Split into two distinct visual trays separated by a `16px` divider:
     - **Left Tray (Base Resources)**: `Wood`, `Brick`, `Sheep`, `Wheat`, `Ore`.
     - **Right Tray (Commodities)**: `Paper`, `Cloth`, `Coin` + Hand Limit counter badge (`3/7`).
   - Slots with count `> 0` render elevated card miniatures that translate `translateY(-6px)` on hover.
7. **Bottom-Right Turn & Dice Cluster (`TurnActionCluster`)**:
   - Houses the Turn Timer, primary action button (`PASS` / `MAIN` styled with `--accent-electric`), and the 3 active dice (`White Die`, `Red Die`, `Event Die`).

---

## 3. Target Directory & Atlas Output Structure

Generate individual vector SVGs first, then rasterize/pack into WebP atlases if required by the canvas renderer:

```text
public/assets/
├── hexes/                  # 8 files (512x512 SVG & WebP)
├── ports/                  # 7 files (256x256 SVG & WebP)
├── tokens/                 # 12 files (128x128 SVG)
├── cards/
│   ├── resources/          # 8 files (400x560 SVG & WebP)
│   ├── backs/              # 5 files (400x560 SVG & WebP)
│   ├── development/        # 5 files (400x560 SVG & WebP)
│   └── progress/           # 24 files (400x560 SVG & WebP)
├── pieces/                 # 19 files (128x128 SVG)
├── knights/                # 24 files (128x128 SVG)
├── dice/                   # 16 files (128x128 SVG)
├── icons/                  # 16 files (128x128 SVG)
└── atlases/
    ├── hexes_atlas.webp        # 2048x1024 (4 cols x 2 rows @ 512x512)
    ├── hexes_atlas.json
    ├── ports_atlas.webp        # 1024x512  (4 cols x 2 rows @ 256x256)
    ├── ports_atlas.json
    ├── cards_atlas.webp        # 2800x3360 (7 cols x 6 rows @ 400x560)
    ├── cards_atlas.json
    ├── pieces_hud_atlas.webp   # 1280x1152 (10 cols x 9 rows @ 128x128)
    └── pieces_hud_atlas.json
```

---

## 4. Complete 144-Asset Specification Manifest

### Category 1: Terrain Hex Tiles (8 Assets — `512x512` viewBox)

**Base Geometry Rule (`public/assets/hexes/<id>.svg`)**:
- Pointy-top hexagon outer shoreline polygon: `points="256,14 466,135 466,377 256,498 46,377 46,135"` (`fill="#DFC28B"`, `stroke="#8C6D3B"`, `stroke-width="4"`).
- Inner terrain polygon: `points="256,35 447,146 447,366 256,477 65,366 65,146"` filled with linear gradient `(0,0) -> (0,1)` using `Gradient Top` to `Gradient Bottom` and `stroke` set to `Accent Color` (`stroke-width="3"`).
- Center token recess (omit on `hex_desert` and `hex_ocean`): `circle cx="256" cy="256" r="58"` with `fill="rgba(20,20,20,0.22)"` and `stroke="rgba(255,255,255,0.18)"`.

| # | Asset ID | Filename | Gradient Top | Gradient Bottom | Accent Color | Perimeter Illustration Motif |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `hex_wood` | `hexes/hex_wood.svg` | `#2D6A3E` | `#184225` | `#68B678` | Layered dark-pine tree clusters around outer ring; clear center |
| 2 | `hex_brick` | `hexes/hex_brick.svg` | `#C85232` | `#8A2F19` | `#E88364` | Terraced clay quarry step-ridges and stacked brick piles |
| 3 | `hex_sheep` | `hexes/hex_sheep.svg` | `#7CB342` | `#4B7C1D` | `#AED581` | Rolling pasture contours and 4 grazing white wool sheep |
| 4 | `hex_wheat` | `hexes/hex_wheat.svg` | `#E5A922` | `#AD740B` | `#FFD54F` | Diagonal golden crop rows and bundled wheat sheaves |
| 5 | `hex_ore` | `hexes/hex_ore.svg` | `#64707D` | `#3B434C` | `#00E5FF` | Angular slate mountain peaks with cyan/silver ore veins |
| 6 | `hex_desert` | `hexes/hex_desert.svg` | `#D9B36C` | `#A37B37` | `#F2D7A0` | Sweeping sand dune curves and 3 saguaro cacti; no center recess |
| 7 | `hex_ocean` | `hexes/hex_ocean.svg` | `#1B4F72` | `#0F2942` | `#2E86C1` | Full hex water tile (`points="256,14..."`) with wave crest arcs |
| 8 | `hex_gold` | `hexes/hex_gold.svg` | `#D4AF37` | `#856404` | `#FFE066` | River canyon cutting across rocks with bright gold nuggets |

---

### Category 2: Harbor Ships & Pier Connectors (7 Assets — `256x256` viewBox)

**Base Geometry Rule (`public/assets/ports/<id>.svg`)**:
- Wooden hull polygon: `points="56,164 200,164 176,204 80,204"` (`fill="#6D4C41"`, `stroke="#141414"`, `stroke-width="4"`).
- Billowing square sail: `rect x="68" y="52" width="120" height="96" rx="12"` (`fill="#FAF6EC"`, `stroke="<Sail Accent>"`, `stroke-width="5"`).
- Trade ratio text (`3:1` or `2:1`) rendered at `x="128" y="132"` (`font-size="28"`, `font-weight="800"`, `fill="#141414"`), with resource emblem centered at `x="128" y="88"`.

| # | Asset ID | Filename | Sail Accent | Ratio Label | Center Emblem |
| :- | :--- | :--- | :--- | :--- | :--- |
| 9 | `port_3to1` | `ports/port_3to1.svg` | `#00E5FF` | `3:1` | Question mark / universal trade compass |
| 10 | `port_wood` | `ports/port_wood.svg` | `#68B678` | `2:1` | Pine tree icon (`#2D6A3E`) |
| 11 | `port_brick` | `ports/port_brick.svg` | `#E88364` | `2:1` | 3-brick stack icon (`#C85232`) |
| 12 | `port_sheep` | `ports/port_sheep.svg` | `#AED581` | `2:1` | Wool cloud sheep icon (`#7CB342`) |
| 13 | `port_wheat` | `ports/port_wheat.svg` | `#FFD54F` | `2:1` | Wheat stalk icon (`#E5A922`) |
| 14 | `port_ore` | `ports/port_ore.svg` | `#98A6B5` | `2:1` | Faceted rock ore icon (`#64707D`) |
| 15 | `port_pier` | `ports/port_pier.svg` | `#8D6E63` | None | Twin wooden dock legs connecting coastal hex corners to ship |

---

### Category 3: Board Number Tokens & Neutral Pawns (12 Assets — `128x128` viewBox)

**Base Geometry Rule (`public/assets/tokens/<id>.svg`)**:
- Outer circular disc: `cx="64" cy="64" r="52"` (`fill="#F5EFE0"`, `stroke="#141414"`, `stroke-width="3"`).
- Inner ring: `cx="64" cy="64" r="47"` (`fill="#FAF6EC"`, `stroke="<Ring Color>"`, `stroke-width="2"`).
- Number text centered at `x="64" y="68"` (`font-family="Inter, sans-serif"`, `font-size="44"`, `font-weight="800"`).
- Probability pips (`r="3"`) centered horizontally at `y="88"` with `9px` center-to-center spacing.

| # | Asset ID | Filename | Numeral | Pip Count | Text & Pip Color | Ring Color |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 16 | `token_2` | `tokens/token_2.svg` | `2` | 1 | `#141414` | `#B0BEC5` |
| 17 | `token_3` | `tokens/token_3.svg` | `3` | 2 | `#141414` | `#B0BEC5` |
| 18 | `token_4` | `tokens/token_4.svg` | `4` | 3 | `#141414` | `#B0BEC5` |
| 19 | `token_5` | `tokens/token_5.svg` | `5` | 4 | `#141414` | `#B0BEC5` |
| 20 | `token_6` | `tokens/token_6.svg` | `6` | 5 | `#E53935` | `#E53935` |
| 21 | `token_8` | `tokens/token_8.svg` | `8` | 5 | `#E53935` | `#E53935` |
| 22 | `token_9` | `tokens/token_9.svg` | `9` | 4 | `#141414` | `#B0BEC5` |
| 23 | `token_10` | `tokens/token_10.svg` | `10` | 3 | `#141414` | `#B0BEC5` |
| 24 | `token_11` | `tokens/token_11.svg` | `11` | 2 | `#141414` | `#B0BEC5` |
| 25 | `token_12` | `tokens/token_12.svg` | `12` | 1 | `#141414` | `#B0BEC5` |
| 26 | `token_robber` | `tokens/token_robber.svg` | None | 0 | `#263238` | `#E53935` (Hooded bandit pawn silhouette on circular base) |
| 27 | `token_merchant` | `tokens/token_merchant.svg` | None | 0 | `#7B1FA2` | `#FFD166` (Royal purple/gold merchant cone pawn) |

---

### Category 4: Resource, Commodity & Card Backs (13 Assets — `400x560` viewBox)

**Base Geometry Rule (`public/assets/cards/...`)**:
- Outer card shell: `rect x="8" y="8" width="384" height="544" rx="22"` (`fill="#141414"`, `stroke="<Frame Accent>"`, `stroke-width="4"`).
- Inner card surface: `rect x="22" y="22" width="356" height="516" rx="16"` (`fill="#1E1E24"`).
- Top-left corner pip badge (`cx="58" cy="58" r="22"`) and bottom-right inverted pip badge (`cx="342" cy="502" r="22"`) containing the resource/commodity mini-icon for fanned-hand readability.
- Central artwork medallion (`cx="200" cy="250" r="110"`) + uppercase title banner at `y="445"`.

| # | Asset ID | Filename | Category | Frame Accent | Bg Tint | Center Illustration |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 28 | `card_wood` | `cards/resources/card_wood.svg` | Base Resource | `#68B678` | `#184225` | Cut timber logs bound with iron bands & pine sprigs |
| 29 | `card_brick` | `cards/resources/card_brick.svg` | Base Resource | `#E88364` | `#8A2F19` | Isometric stack of fired terracotta clay bricks |
| 30 | `card_sheep` | `cards/resources/card_sheep.svg` | Base Resource | `#AED581` | `#4B7C1D` | Fluffy white sheep emblem against pasture hills |
| 31 | `card_wheat` | `cards/resources/card_wheat.svg` | Base Resource | `#FFD54F` | `#AD740B` | Golden tied wheat sheaves with radiant sunbeams |
| 32 | `card_ore` | `cards/resources/card_ore.svg` | Base Resource | `#98A6B5` | `#3B434C` | Cracked dark iron boulder with glowing cyan crystal veins |
| 33 | `card_paper` | `cards/resources/card_paper.svg` | Commodity (Science) | `#29BB89` | `#123D30` | Unrolled parchment scroll with quill feather |
| 34 | `card_cloth` | `cards/resources/card_cloth.svg` | Commodity (Trade) | `#F7B733` | `#4A3508` | Folded bolt of royal gold-trimmed silk fabric |
| 35 | `card_coin` | `cards/resources/card_coin.svg` | Commodity (Politics) | `#00E5FF` | `#0A3647` | Stamped silver/cyan sovereign coin with castle crest |
| 36 | `card_back_resource` | `cards/backs/card_back_resource.svg` | Card Back | `#00E5FF` | `#141414` | Geometric hex-island compass rose lattice |
| 37 | `card_back_development` | `cards/backs/card_back_development.svg` | Card Back | `#FFB300` | `#141414` | Golden astrolabe and medieval shield crest |
| 38 | `card_back_trade` | `cards/backs/card_back_trade.svg` | Card Back | `#FFD166` | `#2B2108` | Gold merchant balance scales & coin rosette |
| 39 | `card_back_politics` | `cards/backs/card_back_politics.svg` | Card Back | `#00E5FF` | `#082430` | Electric-blue crossed swords & heraldic crown |
| 40 | `card_back_science` | `cards/backs/card_back_science.svg` | Card Back | `#4CE08A` | `#092B1A` | Emerald gearwheel, compass, and open tome |

---

### Category 5: Base Game Development Cards (5 Assets — `400x560` viewBox)

**Base Geometry Rule (`public/assets/cards/development/<id>.svg`)**:
- Uses the standard `400x560` dark card frame, top header pill (`y="40"`), circular illustration (`cx="200" cy="210" r="88"`), and rules text box (`x="36" y="340" width="328" height="168" rx="12"` with `fill="#141414"`).

| # | Asset ID | Filename | Frame Accent | Title | Rules Text Box Content |
| :- | :--- | :--- | :--- | :--- | :--- |
| 41 | `dev_knight` | `cards/development/dev_knight.svg` | `#E53935` | `KNIGHT` | Move the Robber to any hex and steal 1 random resource card from an adjacent player. |
| 42 | `dev_victory_point` | `cards/development/dev_victory_point.svg` | `#FFD166` | `VICTORY POINT` | +1 Victory Point! Keep concealed until you reach the winning total. |
| 43 | `dev_road_building` | `cards/development/dev_road_building.svg` | `#68B678` | `ROAD BUILDING` | Place 2 new roads on the board immediately at no resource cost. |
| 44 | `dev_year_of_plenty` | `cards/development/dev_year_of_plenty.svg` | `#FFB300` | `YEAR OF PLENTY` | Take any 2 resource cards directly from the bank and add them to your hand. |
| 45 | `dev_monopoly` | `cards/development/dev_monopoly.svg` | `#00E5FF` | `MONOPOLY` | Name 1 base resource. All other players must give you all of their cards of that type. |

---

### Category 6: Cities & Knights Progress Cards (24 Assets — `400x560` viewBox)

**Base Geometry Rule (`public/assets/cards/progress/<id>.svg`)**:
- Trade deck uses `--track-trade` (`#FFD166`), Politics deck uses `--track-politics` (`#00E5FF`), Science deck uses `--track-science` (`#4CE08A`).
- Top-left corner displays the track discipline icon (Scale for Trade, Crown/Helm for Politics, Gear/Calipers for Science).

| # | Asset ID | Filename | Track | Accent | Title | Rules Text Box Content |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 46 | `prog_trade_commercial_harbor` | `cards/progress/prog_trade_commercial_harbor.svg` | Trade | `#FFD166` | `COMMERCIAL HARBOR` | Offer each opponent 1 resource card from your hand; they must exchange it for 1 commodity card if they have any. |
| 47 | `prog_trade_master_merchant` | `cards/progress/prog_trade_master_merchant.svg` | Trade | `#FFD166` | `MASTER MERCHANT` | Choose an opponent with more Victory Points than you. Inspect their hand and take any 2 resource or commodity cards. |
| 48 | `prog_trade_merchant` | `cards/progress/prog_trade_merchant.svg` | Trade | `#FFD166` | `MERCHANT` | Place the Merchant pawn on any land hex adjacent to your settlement or city. Trade that resource at 2:1 and gain +1 VP while held. |
| 49 | `prog_trade_merchant_fleet` | `cards/progress/prog_trade_merchant_fleet.svg` | Trade | `#FFD166` | `MERCHANT FLEET` | Choose 1 resource or commodity type. For the rest of this turn, you may trade that type with the bank at a 2:1 ratio. |
| 50 | `prog_trade_resource_monopoly` | `cards/progress/prog_trade_resource_monopoly.svg` | Trade | `#FFD166` | `RESOURCE MONOPOLY` | Name 1 base resource. Each opponent must give you 2 cards of that resource if they hold them (or 1 if they only hold 1). |
| 51 | `prog_trade_trade_monopoly` | `cards/progress/prog_trade_trade_monopoly.svg` | Trade | `#FFD166` | `TRADE MONOPOLY` | Name 1 commodity (Paper, Cloth, or Coin). Each opponent must give you 1 card of that commodity if they hold it. |
| 52 | `prog_politics_bishop` | `cards/progress/prog_politics_bishop.svg` | Politics | `#00E5FF` | `BISHOP` | Move the Robber to any hex. Draw 1 random resource/commodity card from EACH player with a settlement or city adjacent to that hex. |
| 53 | `prog_politics_constitution` | `cards/progress/prog_politics_constitution.svg` | Politics | `#00E5FF` | `CONSTITUTION` | +1 Victory Point! Reveal this card immediately; it cannot be stolen by spies. |
| 54 | `prog_politics_deserter` | `cards/progress/prog_politics_deserter.svg` | Politics | `#00E5FF` | `DESERTER` | Choose an opponent. They must remove 1 of their knights from the board. You may then place 1 of your own knights of up to equal strength. |
| 55 | `prog_politics_diplomat` | `cards/progress/prog_politics_diplomat.svg` | Politics | `#00E5FF` | `DIPLOMAT` | Remove any open-ended road on the board (with nothing attached to one end). If it was your own road, immediately place it elsewhere for free. |
| 56 | `prog_politics_intrigue` | `cards/progress/prog_politics_intrigue.svg` | Politics | `#00E5FF` | `INTRIGUE` | Displace any opponent's knight that occupies a vertex connected to at least one of your roads or ships. |
| 57 | `prog_politics_saboteur` | `cards/progress/prog_politics_saboteur.svg` | Politics | `#00E5FF` | `SABOTEUR` | Every player with as many or more Victory Points than you must immediately discard half of their resource and commodity cards (rounded down). |
| 58 | `prog_politics_spy` | `cards/progress/prog_politics_spy.svg` | Politics | `#00E5FF` | `SPY` | Inspect any one opponent's hand of Progress cards and take 1 Progress card of your choice into your own hand. |
| 59 | `prog_politics_warlord` | `cards/progress/prog_politics_warlord.svg` | Politics | `#00E5FF` | `WARLORD` | Activate all of your knights currently on the board immediately at no Wheat cost. |
| 60 | `prog_science_alchemist` | `cards/progress/prog_science_alchemist.svg` | Science | `#4CE08A` | `ALCHEMIST` | Play before rolling the dice. Choose the exact numbers on both the White and Red production dice (you still roll the Event Die normally). |
| 61 | `prog_science_crane` | `cards/progress/prog_science_crane.svg` | Science | `#4CE08A` | `CRANE` | Build 1 City Improvement (Trade, Politics, or Science Abbey/Guild/Fortress) this turn for 1 fewer commodity than normal. |
| 62 | `prog_science_engineer` | `cards/progress/prog_science_engineer.svg` | Science | `#4CE08A` | `ENGINEER` | Place 1 City Wall underneath any of your cities immediately at no Brick cost (+2 hand size limit). |
| 63 | `prog_science_inventor` | `cards/progress/prog_science_inventor.svg` | Science | `#4CE08A` | `INVENTOR` | Swap any two circular number tokens on the board. Neither token may be a 2, 12, 6, or 8. |
| 64 | `prog_science_irrigation` | `cards/progress/prog_science_irrigation.svg` | Science | `#4CE08A` | `IRRIGATION` | Collect 2 Wheat cards from the bank for every Wheat hex adjacent to at least one of your settlements or cities. |
| 65 | `prog_science_medicine` | `cards/progress/prog_science_medicine.svg` | Science | `#4CE08A` | `MEDICINE` | Upgrade 1 of your settlements into a city this turn for a reduced cost of 2 Ore and 1 Wheat. |
| 66 | `prog_science_mining` | `cards/progress/prog_science_mining.svg` | Science | `#4CE08A` | `MINING` | Collect 2 Ore cards from the bank for every Ore hex adjacent to at least one of your settlements or cities. |
| 67 | `prog_science_printer` | `cards/progress/prog_science_printer.svg` | Science | `#4CE08A` | `PRINTER` | +1 Victory Point! Reveal this card immediately; it cannot be stolen by spies. |
| 68 | `prog_science_road_building` | `cards/progress/prog_science_road_building.svg` | Science | `#4CE08A` | `ROAD BUILDING` | Place 2 new roads on the board immediately at no resource cost. |
| 69 | `prog_science_smith` | `cards/progress/prog_science_smith.svg` | Science | `#4CE08A` | `SMITH` | Promote up to 2 of your knights currently on the board by 1 tier each at no Sheep or Ore cost (subject to politics level rules). |

---

### Category 7: Player Pieces & Metropolis Citadels (19 Assets — `128x128` viewBox)

**Base Geometry Rule (`public/assets/pieces/<id>.svg`)**:
- Every piece uses `stroke="#141414" stroke-width="3.5"` and a drop shadow (`dx="0" dy="3" stdDeviation="2.5" rgba(0,0,0,0.55)`) so pieces remain sharp against any hex border.
- **Road**: `rect x="16" y="46" width="96" height="30" rx="6"` (`fill="<Primary>"`), inner bevel `rect x="20" y="50" width="88" height="10" rx="3"` (`fill="<Specular>"`).
- **Settlement**: Cottage body `rect x="37" y="54" width="54" height="45"` (`fill="<Primary>"`), roof `polygon points="64,23 99,56 29,56"` (`fill="<Shade>"`), door `rect x="56" y="71" width="16" height="28" fill="#141414"`.
- **City**: Hall `rect x="21" y="59" width="78" height="41"` (`fill="<Primary>"`), left keep tower `rect x="21" y="34" width="40" height="66"`, spire `polygon points="41,14 65,36 17,36"` (`fill="<Shade>"`), gable `polygon points="80,41 104,60 59,60"` (`fill="<Shade>"`).
- **City Wall**: Battlement square frame `rect x="10" y="10" width="108" height="108" rx="14"` (`fill="none"`, `stroke="<Primary>"`, `stroke-width="12"`) with outer/inner `#141414` outlines and corner crenelations.
- **Metropolis**: Grand golden/blue/green domed citadel arch (`polygon points="64,11 105,39 105,106 23,106 23,39"`, central dome `circle cx="64" cy="52" r="26"`, inner archway `rect x="48" y="66" width="32" height="40" rx="16"`).

| # | Asset ID | Filename | Piece Type | Primary Fill | Shade Fill | Specular Highlight |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 70 | `piece_road_red` | `pieces/piece_road_red.svg` | Road | `#E53935` | `#8E1B18` | `#FF8A80` |
| 71 | `piece_road_blue` | `pieces/piece_road_blue.svg` | Road | `#00B0FF` | `#005B8F` | `#80D8FF` |
| 72 | `piece_road_orange` | `pieces/piece_road_orange.svg` | Road | `#FB8C00` | `#9E5100` | `#FFD180` |
| 73 | `piece_road_white` | `pieces/piece_road_white.svg` | Road | `#ECEFF1` | `#78909C` | `#FFFFFF` |
| 74 | `piece_settlement_red` | `pieces/piece_settlement_red.svg` | Settlement | `#E53935` | `#8E1B18` | `#FF8A80` |
| 75 | `piece_settlement_blue` | `pieces/piece_settlement_blue.svg` | Settlement | `#00B0FF` | `#005B8F` | `#80D8FF` |
| 76 | `piece_settlement_orange` | `pieces/piece_settlement_orange.svg` | Settlement | `#FB8C00` | `#9E5100` | `#FFD180` |
| 77 | `piece_settlement_white` | `pieces/piece_settlement_white.svg` | Settlement | `#ECEFF1` | `#78909C` | `#FFFFFF` |
| 78 | `piece_city_red` | `pieces/piece_city_red.svg` | City | `#E53935` | `#8E1B18` | `#FF8A80` |
| 79 | `piece_city_blue` | `pieces/piece_city_blue.svg` | City | `#00B0FF` | `#005B8F` | `#80D8FF` |
| 80 | `piece_city_orange` | `pieces/piece_city_orange.svg` | City | `#FB8C00` | `#9E5100` | `#FFD180` |
| 81 | `piece_city_white` | `pieces/piece_city_white.svg` | City | `#ECEFF1` | `#78909C` | `#FFFFFF` |
| 82 | `piece_city_wall_red` | `pieces/piece_city_wall_red.svg` | City Wall | `#E53935` | `#8E1B18` | `#FF8A80` |
| 83 | `piece_city_wall_blue` | `pieces/piece_city_wall_blue.svg` | City Wall | `#00B0FF` | `#005B8F` | `#80D8FF` |
| 84 | `piece_city_wall_orange` | `pieces/piece_city_wall_orange.svg` | City Wall | `#FB8C00` | `#9E5100` | `#FFD180` |
| 85 | `piece_city_wall_white` | `pieces/piece_city_wall_white.svg` | City Wall | `#ECEFF1` | `#78909C` | `#FFFFFF` |
| 86 | `piece_metropolis_trade` | `pieces/piece_metropolis_trade.svg` | Metropolis | `#FFD166` | `#B5830B` | `#FFF3B0` |
| 87 | `piece_metropolis_politics` | `pieces/piece_metropolis_politics.svg` | Metropolis | `#00E5FF` | `#007799` | `#B3F7FF` |
| 88 | `piece_metropolis_science` | `pieces/piece_metropolis_science.svg` | Metropolis | `#4CE08A` | `#1B8A4B` | `#B8F7D2` |

---

### Category 8: Vertex Knight Tokens (24 Assets — `128x128` viewBox)

**Base Geometry Rule (`public/assets/knights/<id>.svg`)**:
- Outer status ring: `circle cx="64" cy="64" r="54"`.
  - **Inactive state**: `fill="#141414"`, `stroke="#546E7A"`, `stroke-width="4"`, overall helmet desaturated (`opacity="0.82"`).
  - **Active state**: `fill="#141414"`, `stroke="#00E5FF"`, `stroke-width="6"`, glowing outer cyan ring + bright metallic visor.
- Inner player medallion: `circle cx="64" cy="64" r="44"` filled with player color (`Red`, `Blue`, `Orange`, `White`).
- Helmet silhouette centered at `(64,58)`:
  - **Basic (Strength 1)**: Simple nasal bar kettle helm + bottom pill badge reading `1` (or 1 chevron).
  - **Strong (Strength 2)**: Full Visored Great Helm with side wings + bottom pill badge reading `2`.
  - **Mighty (Strength 3)**: Golden-crowned Royal Plumed Helm + twin swords behind shield + bottom pill badge reading `3`.

| # | Asset ID | Filename | Tier (Strength) | State | Player Color | Ring Stroke |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 89 | `knight_basic_inactive_red` | `knights/knight_basic_inactive_red.svg` | Basic (`1`) | Inactive | `#E53935` | `#546E7A` |
| 90 | `knight_basic_inactive_blue` | `knights/knight_basic_inactive_blue.svg` | Basic (`1`) | Inactive | `#00B0FF` | `#546E7A` |
| 91 | `knight_basic_inactive_orange` | `knights/knight_basic_inactive_orange.svg` | Basic (`1`) | Inactive | `#FB8C00` | `#546E7A` |
| 92 | `knight_basic_inactive_white` | `knights/knight_basic_inactive_white.svg` | Basic (`1`) | Inactive | `#ECEFF1` | `#546E7A` |
| 93 | `knight_basic_active_red` | `knights/knight_basic_active_red.svg` | Basic (`1`) | Active | `#E53935` | `#00E5FF` |
| 94 | `knight_basic_active_blue` | `knights/knight_basic_active_blue.svg` | Basic (`1`) | Active | `#00B0FF` | `#00E5FF` |
| 95 | `knight_basic_active_orange` | `knights/knight_basic_active_orange.svg` | Basic (`1`) | Active | `#FB8C00` | `#00E5FF` |
| 96 | `knight_basic_active_white` | `knights/knight_basic_active_white.svg` | Basic (`1`) | Active | `#ECEFF1` | `#00E5FF` |
| 97 | `knight_strong_inactive_red` | `knights/knight_strong_inactive_red.svg` | Strong (`2`) | Inactive | `#E53935` | `#546E7A` |
| 98 | `knight_strong_inactive_blue` | `knights/knight_strong_inactive_blue.svg` | Strong (`2`) | Inactive | `#00B0FF` | `#546E7A` |
| 99 | `knight_strong_inactive_orange` | `knights/knight_strong_inactive_orange.svg` | Strong (`2`) | Inactive | `#FB8C00` | `#546E7A` |
| 100 | `knight_strong_inactive_white` | `knights/knight_strong_inactive_white.svg` | Strong (`2`) | Inactive | `#ECEFF1` | `#546E7A` |
| 101 | `knight_strong_active_red` | `knights/knight_strong_active_red.svg` | Strong (`2`) | Active | `#E53935` | `#00E5FF` |
| 102 | `knight_strong_active_blue` | `knights/knight_strong_active_blue.svg` | Strong (`2`) | Active | `#00B0FF` | `#00E5FF` |
| 103 | `knight_strong_active_orange` | `knights/knight_strong_active_orange.svg` | Strong (`2`) | Active | `#FB8C00` | `#00E5FF` |
| 104 | `knight_strong_active_white` | `knights/knight_strong_active_white.svg` | Strong (`2`) | Active | `#ECEFF1` | `#00E5FF` |
| 105 | `knight_mighty_inactive_red` | `knights/knight_mighty_inactive_red.svg` | Mighty (`3`) | Inactive | `#E53935` | `#546E7A` |
| 106 | `knight_mighty_inactive_blue` | `knights/knight_mighty_inactive_blue.svg` | Mighty (`3`) | Inactive | `#00B0FF` | `#546E7A` |
| 107 | `knight_mighty_inactive_orange` | `knights/knight_mighty_inactive_orange.svg` | Mighty (`3`) | Inactive | `#FB8C00` | `#546E7A` |
| 108 | `knight_mighty_inactive_white` | `knights/knight_mighty_inactive_white.svg` | Mighty (`3`) | Inactive | `#ECEFF1` | `#546E7A` |
| 109 | `knight_mighty_active_red` | `knights/knight_mighty_active_red.svg` | Mighty (`3`) | Active | `#E53935` | `#00E5FF` |
| 110 | `knight_mighty_active_blue` | `knights/knight_mighty_active_blue.svg` | Mighty (`3`) | Active | `#00B0FF` | `#00E5FF` |
| 111 | `knight_mighty_active_orange` | `knights/knight_mighty_active_orange.svg` | Mighty (`3`) | Active | `#FB8C00` | `#00E5FF` |
| 112 | `knight_mighty_active_white` | `knights/knight_mighty_active_white.svg` | Mighty (`3`) | Active | `#ECEFF1` | `#00E5FF` |

---

### Category 9: Dice Faces & HUD Status Icons (32 Assets — `128x128` viewBox)

**Dice Geometry Rule (`public/assets/dice/<id>.svg`)**:
- Rounded die body: `rect x="12" y="12" width="104" height="104" rx="20"` (`stroke="#141414" stroke-width="4"`).
- Standard 3x3 pip grid coordinates: Left `x=38`, Center `x=64`, Right `x=90`; Top `y=38`, Middle `y=64`, Bottom `y=90`; pip radius `r="9"`.

| # | Asset ID | Filename | Subtype | Body Fill | Foreground / Pip Color | Visual Description |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 113 | `die_white_1` | `dice/die_white_1.svg` | White Die | `#FAF6EC` | `#141414` | Single center pip `(64,64)` |
| 114 | `die_white_2` | `dice/die_white_2.svg` | White Die | `#FAF6EC` | `#141414` | Diagonal pips `(38,38), (90,90)` |
| 115 | `die_white_3` | `dice/die_white_3.svg` | White Die | `#FAF6EC` | `#141414` | Diagonal pips `(38,38), (64,64), (90,90)` |
| 116 | `die_white_4` | `dice/die_white_4.svg` | White Die | `#FAF6EC` | `#141414` | Four corner pips |
| 117 | `die_white_5` | `dice/die_white_5.svg` | White Die | `#FAF6EC` | `#141414` | Four corner pips + center `(64,64)` |
| 118 | `die_white_6` | `dice/die_white_6.svg` | White Die | `#FAF6EC` | `#141414` | Left and right columns of 3 pips |
| 119 | `die_red_1` | `dice/die_red_1.svg` | Red Die | `#D32F2F` | `#FFD166` | Single center gold pip `(64,64)` |
| 120 | `die_red_2` | `dice/die_red_2.svg` | Red Die | `#D32F2F` | `#FFD166` | Diagonal gold pips `(38,38), (90,90)` |
| 121 | `die_red_3` | `dice/die_red_3.svg` | Red Die | `#D32F2F` | `#FFD166` | Diagonal gold pips `(38,38), (64,64), (90,90)` |
| 122 | `die_red_4` | `dice/die_red_4.svg` | Red Die | `#D32F2F` | `#FFD166` | Four corner gold pips |
| 123 | `die_red_5` | `dice/die_red_5.svg` | Red Die | `#D32F2F` | `#FFD166` | Four corner gold pips + center `(64,64)` |
| 124 | `die_red_6` | `dice/die_red_6.svg` | Red Die | `#D32F2F` | `#FFD166` | Left and right columns of 3 gold pips |
| 125 | `die_event_barbarian` | `dice/die_event_barbarian.svg` | Event Die | `#1E1E24` | `#E53935` | Crimson Viking/Barbarian longship silhouette |
| 126 | `die_event_trade` | `dice/die_event_trade.svg` | Event Die | `#1E1E24` | `#FFD166` | Gold Trade city gate arch + `TRADE` label |
| 127 | `die_event_politics` | `dice/die_event_politics.svg` | Event Die | `#1E1E24` | `#00E5FF` | Electric-blue Politics city gate arch + `POLITICS` label |
| 128 | `die_event_science` | `dice/die_event_science.svg` | Event Die | `#1E1E24` | `#4CE08A` | Emerald Science city gate arch + `SCIENCE` label |
| 129 | `icon_wood` | `icons/icon_wood.svg` | Dock Icon | `#184225` | `#68B678` | Circular badge with stylized pine tree |
| 130 | `icon_brick` | `icons/icon_brick.svg` | Dock Icon | `#8A2F19` | `#E88364` | Circular badge with 3-brick pyramid |
| 131 | `icon_sheep` | `icons/icon_sheep.svg` | Dock Icon | `#4B7C1D` | `#FAF6EC` | Circular badge with wool sheep head |
| 132 | `icon_wheat` | `icons/icon_wheat.svg` | Dock Icon | `#AD740B` | `#FFD54F` | Circular badge with twin wheat stalks |
| 133 | `icon_ore` | `icons/icon_ore.svg` | Dock Icon | `#3B434C` | `#00E5FF` | Circular badge with faceted mountain rock |
| 134 | `icon_paper` | `icons/icon_paper.svg` | Dock Icon | `#123D30` | `#29BB89` | Circular badge with rolled parchment scroll |
| 135 | `icon_cloth` | `icons/icon_cloth.svg` | Dock Icon | `#4A3508` | `#F7B733` | Circular badge with draped fabric bolt |
| 136 | `icon_coin` | `icons/icon_coin.svg` | Dock Icon | `#0A3647` | `#00E5FF` | Circular badge with stamped sovereign coin |
| 137 | `hud_barbarian_ship` | `icons/hud_barbarian_ship.svg` | HUD Badge | `#2A1215` | `#E53935` | Red warship token for the 8-step barbarian tracker |
| 138 | `hud_knight_shield` | `icons/hud_knight_shield.svg` | HUD Badge | `#1E1E24` | `#00E5FF` | Heater shield with helm emblem for army strength |
| 139 | `hud_victory_point` | `icons/hud_victory_point.svg` | HUD Badge | `#2B2108` | `#FFD166` | Golden laurel wreath + star badge for VP counters |
| 140 | `hud_longest_road` | `icons/hud_longest_road.svg` | HUD Badge | `#1E1E24` | `#FFB300` | Winding paved road trophy badge (`2 VP`) |
| 141 | `hud_largest_army` | `icons/hud_largest_army.svg` | HUD Badge | `#1E1E24` | `#E53935` | Crossed broadswords & shield trophy badge (`2 VP`) |
| 142 | `hud_defender_of_catan` | `icons/hud_defender_of_catan.svg` | HUD Badge | `#082430` | `#00E5FF` | Winged guardian crest badge (`1 VP`) |
| 143 | `hud_robber_asleep` | `icons/hud_robber_asleep.svg` | HUD Badge | `#1E1E24` | `#78909C` | Muted bandit hood with `Zzz` sleep indicator |
| 144 | `hud_robber_active` | `icons/hud_robber_active.svg` | HUD Badge | `#2A1215` | `#E53935` | Glowing crimson bandit hood with alert exclamation |

---

## 5. Automated Build Pipeline Instructions for Claude Code

When asked to build the assets in this repository, execute the following steps:

1. **Create Generator Script (`scripts/generate_assets.py` or `scripts/generate_assets.mjs`)**:
   - Programmatically emit all **144 SVG files** using the exact filenames, viewBoxes, hex colors, and geometry rules in Section 4.
   - Ensure every SVG contains standalone `xmlns="http://www.w3.org/2000/svg"`, clean `<defs>` for gradients and drop-shadows, and embedded system-safe geometric fonts (`Inter, system-ui, sans-serif`).
2. **Generate Sprite Atlases & Manifests**:
   - Rasterize and composite the SVGs into the 4 target WebP sprite sheets (`hexes_atlas.webp`, `ports_atlas.webp`, `cards_atlas.webp`, `pieces_hud_atlas.webp`) along with their JSON frame coordinate maps (`{ "frames": { "<asset_id>": { "x": ..., "y": ..., "w": ..., "h": ... } } }`).
3. **Verify Asset Count**:
   - Run a post-build check confirming that all 144 SVG files and 4 atlas pairs exist and are non-empty before updating the React/Canvas board components.