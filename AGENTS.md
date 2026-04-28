# Shadow Ascent — Agent Guidelines

## What This Project Is

Shadow Ascent is a Solo Leveling–themed RPG habit and task tracker built as a PWA (Progressive Web App) for iPhone 15 Pro. It gamifies real-life productivity: daily quests, habits, system tasks, dungeons, a store, and a full RPG progression system (XP, levels, ranks, attributes, gear, shadow army).

**Reference app (design and feature inspiration):**
https://apps.apple.com/us/app/solo-hunter-level-up/id6758021041

The design language is sharp rectangles, dark backgrounds (#0a0a12), purple (#9b6dff) and blue (#4fc3f7) accents, bracketed labels `[ LIKE THIS ]`, and left-stripe colored panels — inspired by Solo Leveling webtoon UI.

---

## Project Structure

shadow-ascent/
├── index.html                  # App shell, meta tags, PWA manifest link
├── vite.config.js              # Vite + vite-plugin-pwa config
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── favicon.png
│   └── icons/
│       ├── icon_192.png
│       ├── icon_512.png
│       └── splash_1179x2556.png  # iPhone 15 Pro splash
├── src/
│   ├── css/
│   │   ├── variables.css       # CSS custom properties (colors, fonts, spacing)
│   │   ├── base.css            # Reset, app shell, tab bar, screen layout
│   │   └── components.css      # All component styles (cards, modals, buttons)
│   └── js/
│       ├── app.js              # Entry point: init, tab routing, rank gates, midnight reset
│       ├── modules/
│       │   ├── db.js           # Dexie.js schema, init_db(), reset_all_data()
│       │   ├── player.js       # XP, leveling, gold, HP, stat points, dungeon keys
│       │   ├── quests.js       # Daily quests, system quests, penalties, midnight watcher
│       │   ├── habits.js       # Habit CRUD, press_positive, press_negative, week log
│       │   ├── dungeons.js     # Dungeon CRUD, run lifecycle, shadow army
│       │   ├── store.js        # Item catalog, buy, equip, inventory, equipment bonuses
│       │   ├── equipment.js    # Equipped item lookup and equipment bonus aggregation
│       │   ├── penalties.js    # Penalty log, debuff status, weekly immunity grant
│       │   ├── achievements.js # Achievement catalog, seed, unlock checks
│       │   ├── haptics.js      # Vibration API wrappers, safely no-op unsupported browsers
│       │   ├── notifications.js# Permission, scheduling, level-up/key/daily notifications
│       │   └── utils.js        # Debounce, scroll_to_top, rank_gte, TAB_REQUIREMENTS,
│       │                       # get_tab_from_url, setup_keyboard_dismiss
│       └── screens/
│           ├── daily_quests.js # Daily quest list, create modal, complete, undo
│           ├── system_quests.js# Task list, subtasks, abandon, complete
│           ├── habits.js       # Habit cards, +/- buttons, sparkline chart
│           ├── stats.js        # Character sheet, attributes, gear, achievements, penalties
│           ├── dungeons.js     # Gate list, active run panel, timers, clear screen
│           └── store.js        # Item shop, equipment tab, inventory tab
└── dist/                       # Generated — do not edit

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla JS (ES modules) | No framework needed for tab-based UI |
| Styling | Custom CSS with variables | Full design control, no Tailwind conflict |
| Database | Dexie.js (IndexedDB) | Clean API, offline-first, no backend needed |
| Animations | CSS transitions + GSAP (available) | CSS for micro, GSAP for dramatic moments |
| PWA | vite-plugin-pwa + Workbox | Service worker, offline cache, install prompt |
| Build | Vite 8 | Fast dev server, simple config |
| Icons | sharp (dev only) | PNG generation from SVG at build time |

**No backend. No login. All data is local (IndexedDB).**

---

## Commands

```bash
# Install dependencies (use --legacy-peer-deps due to vite-plugin-pwa/vite8 conflict)
npm install --legacy-peer-deps

# Development server (hot reload)
npm run dev

# Development server exposed to local network (for iPhone testing)
npm run dev -- --host

# Production build
npm run build

# Preview production build locally
npm run preview

# Preview on local network (for iPhone testing production build)
npm run preview -- --host
```

---

## Testing on iPhone

1. Make sure iPhone and Mac are on the same WiFi network
2. Run `npm run dev -- --host`
3. Terminal will show two URLs:
Local:   http://localhost:5173/
Network: http://192.168.x.x:5173/
4. Open Safari on iPhone and go to the Network URL
5. To test as installed PWA:
   - Run `npm run build && npm run preview -- --host` instead
   - Open the Network URL in Safari
   - Tap Share → Add to Home Screen
   - Launch from home screen — runs standalone with splash screen

**iOS Safari notes:**
- Notifications only work when installed to home screen (not in browser tab)
- Always set `font-size: 16px` on inputs to prevent auto-zoom
- Use `touch-action: manipulation` on buttons to prevent double-tap zoom
- Use `viewport-fit=cover`, `--app-height`, and `--bottom-inset` for iPhone Home Screen layout
- Do not change the tab bar safe-area workaround casually; iPhone 15 Pro Home Screen mode needs the fixed tab bar plus 34px bottom inset fallback

---

## Coding Conventions

- **Language:** Vanilla JS, ES modules, no TypeScript
- **Naming:** `snake_case` everywhere — files, functions, variables, CSS classes
- **File split:** screen logic in `screens/`, domain logic in `modules/`
- **CSS:** variables in `variables.css`, layout in `base.css`, components in `components.css`
- **No inline styles** except dynamic values (e.g. rank colors, bar widths)
- **Async:** all DB calls are async/await — never mix with `.then()` chains
- **No dynamic imports** unless the module is truly lazy — causes Rollup warnings if the module is also statically imported elsewhere

---

## Database Schema (Dexie.js)

All tables defined in `src/js/modules/db.js`. Player is always id=1 (single row).

| Table | Key fields | Purpose |
|---|---|---|
| `player` | `id=1` | Level, XP, HP, Gold, attributes, rank, job class, keys, tokens |
| `daily_quests` | `++id` | Recurring daily tasks with repeat_count and streak |
| `system_quests` | `++id, status` | One-off tasks with subtasks and due dates |
| `habits` | `++id` | +/- habit tracking with streak and direction |
| `habit_log` | `++id, habit_id` | Individual press events (value: +1 or -1) |
| `dungeons` | `++id, type` | Gate definitions (endurance/volume/gauntlet) |
| `dungeon_runs` | `++id, dungeon_id` | Individual run attempts with outcome |
| `shadow_army` | `++id` | Extracted shadows with buff_type and buff_value |
| `inventory` | `++id, is_equipped` | Player-owned equipment and cosmetics |
| `store_items` | `++id` | Master item catalog (seeded on first launch) |
| `achievements` | `++id` | Seeded achievement rows with achievement_id and unlock timestamps |
| `penalty_log` | `++id, date` | HP loss events by source type |

---

## Game Systems Summary

### Progression
- XP → Level → Rank (E→D→C→B→A→S) → Job Class
- `xp_for_level(level)` = `100 * level^1.4`
- 1 stat point per level up, allocated to STR/INT/AGI/VIT/SEN
- Rank unlocks: D at level 10, C at 20, B at 40, A at 60, S at 100

### Attributes (real mechanical effects)
- **STR** → +3% Gold per point
- **INT** → +3% XP per point
- **AGI** → -2% HP penalty damage per point
- **VIT** → +20 Max HP, +0.5 max dungeon keys per point
- **SEN** → +5% hidden quest/shadow extraction chance per point

### Tab Unlock Gates
Defined in `utils.js` → `TAB_REQUIREMENTS`:
- Daily Quests: always unlocked
- System Quests: always unlocked
- Habits: D-Rank (level 10)
- Stats: always unlocked
- Dungeons: D-Rank (level 10)
- Store: D-Rank (level 10)

### Dungeon Types
- **Endurance** — survive a timed session, boss HP depletes over time, auto-clears
- **Volume** — hit a rep target by tapping LOG REP, no time pressure
- **Gauntlet** — sequence of steps each with their own timer, player taps COMPLETE STEP

### Penalties
- Missing daily quests at midnight → HP loss based on rank
- Abandoning system quests → HP loss
- Negative habit presses → HP loss
- Failing dungeons → HP loss
- Immunity tokens negate one penalty each
- Gear bonuses are real mechanical effects. Positive XP/Gold multipliers round up so small E-Rank rewards visibly increase.
- Shadow army bonuses are real mechanical effects: XP/Gold shadows affect dungeon rewards, HP shadows raise max HP, and key-regeneration shadows shorten key recovery time.

### Achievements
- `src/js/modules/achievements.js` owns the achievement catalog and unlock checks.
- Achievements are seeded on app init/reset and displayed in Stats.
- Gameplay modules call `check_achievements()` after quest, habit, dungeon, store, and DEV test-state actions.

### Haptics
- `src/js/modules/haptics.js` owns all vibration calls.
- Use haptics only through helpers such as `haptic_success()`, `haptic_warning()`, and `haptic_error()`.
- Unsupported browsers silently no-op.

---

## Known Issues / Watch Out For

- `vite-plugin-pwa` has a peer dep conflict with Vite 8 — always use `--legacy-peer-deps`
- iOS Safari auto-zooms inputs smaller than 16px — all inputs must be `font-size: 16px`
- iOS keyboard shrinks viewport and hides modal buttons — modals need `max-height: 75dvh` and `-webkit-overflow-scrolling: touch`
- Double-tap zoom on buttons — fixed with `touch-action: manipulation` on all buttons
- Dynamic imports of already-statically-imported modules cause Rollup warnings — use static imports only
- Dungeon timer only runs for endurance type — volume and gauntlet have no auto-complete timer
- Manifest display is `standalone`, not `fullscreen`, for more predictable iOS safe-area behavior

---

## DEV Cheat Button

In development mode and local-network preview builds, a red DEV button appears near the top-left. Tapping `DEV: S` sets an S-Rank test state directly: level 100, 100000 Gold, 99 stat points, and restored dungeon keys. It is enabled for local iPhone testing on `localhost`, `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, or after opening with `?debug=1`.

---

## PWA Assets

All in `public/icons/`:
- `icon_192.png` — home screen icon
- `icon_512.png` — splash and store icon
- `splash_1179x2556.png` — iPhone 15 Pro launch screen (1179×2556px)

Generated using `sharp` from SVG source. To regenerate run the icon generation script from the project root (see original setup notes).

---

## What Is Not Built Yet

- Sound effects
- Onboarding / explain the system flow
- Guild / multiplayer features
- Real avatar art (placeholder emoji currently used)
- Custom icon art (placeholder geometric SVG currently used)
