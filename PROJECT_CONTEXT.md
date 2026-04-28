# Shadow Ascent — Project Context

## What This App Is

Shadow Ascent is a Solo Leveling–themed RPG habit and task tracker PWA for iPhone 15 Pro.
It turns real-life productivity into a game: complete daily quests, track habits, run dungeons,
level up your character, and build a shadow army.

Inspired by Habitica (gamified task management) and Solo Hunter: Level Up
(https://apps.apple.com/us/app/solo-hunter-level-up/id6758021041).

This is a personal-use app — no backend, no auth, no sync.
All data lives in IndexedDB via Dexie.js. Works fully offline once installed.

---

## Current State (as of last session)

### Done ✅
- All 6 screens built and working: Daily Quests, System Quests, Habits, Stats, Dungeons, Store
- Full RPG progression: XP, levels, ranks (E→S), job classes, 5 attributes with real effects
- Daily quest reset at midnight with penalty system
- Habit tracking with +/− buttons, streaks, weekly sparkline
- Dungeon system: endurance (auto-timer), volume (rep counter), gauntlet (per-step timer)
- Store: consumables, equipment, inventory, equip/unequip
- Shadow army from dungeon clears
- Rank unlock gates (Habits/Dungeons/Store locked until D-Rank / Level 10)
- PWA: manifest, service worker, icons, iPhone 15 Pro splash screen
- Push notifications: daily reminder, key regen, penalty warning, level-up
- Undo quest completion (returns XP and Gold)
- Full data reset with double-confirm
- URL param handling for manifest shortcuts
- DEV cheat button (dev mode only, top-left, gives XP/Gold/keys)
- iOS fixes: 16px inputs, touch-action manipulation, keyboard dismiss, modal scroll
- XP Elixir (xp_boost_next) correctly consumed and applied as ×2 multiplier on next award_xp call
- Shadow army buffs are mechanical: xp_boost/gold_boost affect dungeon rewards, hp_boost raises max HP, and key_regen speeds key regeneration
- Monarch's Cloak hidden_quest_double correctly doubles SEN extraction chance
- Gear bonuses are wired into XP, Gold, HP max, penalty reduction, dungeon speed bonus, and habit streak rewards
- Iron Dagger and other positive reward multipliers round up so small E-Rank rewards visibly increase
- Installed iPhone PWA uses `standalone`, custom `--app-height`, fixed tab bar, and 34px `--bottom-inset` fallback
- Local preview/Home Screen builds show `DEV: S`, which sets level 100 / S-Rank test state directly
- Achievements are seeded, checked after gameplay actions, and shown in Stats
- Haptics are wired through the Vibration API wrapper for core actions and no-op when unsupported

### Not Built Yet ❌
- Sound effects
- Onboarding / first-launch explanation
- Real avatar art (emoji placeholder)
- Real icon art (geometric SVG placeholder)
- Name editing UI (change directly in db.js for now)
- Guild / social features

---

## Current Priorities

1. **Onboarding** — first-launch modal explaining ranks, quests, penalties
2. **Sound effects** — short audio on complete, level-up fanfare, penalty hit
3. **Real art** — replace emoji icons and placeholder PNG with actual Solo Leveling
   style artwork for avatar, icons, and splash
4. **Notification reliability** — notifications now use a visible Stats-screen
   opt-in instead of an automatic permission request. Next improvement would be
   clearer onboarding around iOS Home Screen requirements and same-session limits.

---

## Known Problems

- Gauntlet step timer counts down but does NOT auto-advance — player must tap
  COMPLETE STEP manually (intentional, but verify UX feels right)
- Notifications only work when app is installed to home screen on iOS Safari,
  not in browser tab — this is an iOS limitation, not a bug
- Notification permission is requested from a user-triggered Stats screen button.
  iOS requires the app to be installed to the Home Screen from a secure HTTPS
  origin before permission can be granted. Local network HTTP URLs such as
  `http://192.168.x.x` will not show the iOS permission prompt. Current reminders
  are same-session timers; reliable closed-app background push would require a
  backend push service.
- vite-plugin-pwa has peer dep conflict with Vite 8 — always use --legacy-peer-deps
  when installing any new package
- No test suite — all testing done manually on iPhone via local network
- iPhone Home Screen CSS is sensitive. Preserve the current `--app-height` / `--bottom-inset` workaround unless retesting on device.

---

## Architecture Decisions Made

| Decision | Reason |
|---|---|
| Vanilla JS, no framework | Tab-based UI doesn't need React overhead |
| Custom CSS, no Tailwind | Full design control for custom Solo Leveling aesthetic |
| IndexedDB via Dexie.js | Clean API, offline-first, no 5MB localStorage limit |
| No backend | Personal use only, simpler, fully private |
| Vite as build tool only | Not a runtime dependency |
| snake_case everywhere | Consistent with Node.js preference established at project start |
| Screens re-render fully on tab switch | Simpler than fine-grained reactivity for this scale |
| Rank gates in app.js | Central routing point, single source of truth for lock logic |
| PWA display is standalone | More predictable iOS safe-area behavior than fullscreen |

---

## Design Language

- **Colors:** near-black bg (#0a0a12), purple (#9b6dff), blue (#4fc3f7), gold (#fbbf24), red (#ef4444)
- **Typography:** Rajdhani / Barlow Condensed (UI), Share Tech Mono (numbers/stats)
- **Panels:** sharp rectangles (no border-radius), 2px purple left stripe accent
- **Labels:** bracketed caps `[ LIKE THIS ]`
- **Cards:** rank-colored left stripe, dark bg, muted meta text
- **Modals:** slide up from bottom, top purple accent line
- **Feedback:** reward flash overlay on quest complete, floating number on habit press,
  gate cleared full-screen overlay on dungeon complete

Reference app for design:
https://apps.apple.com/us/app/solo-hunter-level-up/id6758021041

---

## File Map (quick reference)
src/js/app.js                    — init, tab routing, rank gates, midnight reset, DEV button
src/js/modules/db.js             — Dexie schema, init_db, reset_all_data
src/js/modules/player.js         — XP, leveling, gold, HP, stat points, key regen
src/js/modules/quests.js         — daily quests, system quests, penalties, midnight watcher
src/js/modules/habits.js         — habit CRUD, press_positive, press_negative, week log
src/js/modules/dungeons.js       — dungeon CRUD, run lifecycle, clear/fail, shadow army
src/js/modules/store.js          — item catalog, buy, equip, inventory, equipment bonuses
src/js/modules/equipment.js      — equipped item lookup and equipment bonus aggregation
src/js/modules/penalties.js      — penalty log queries, debuff status, weekly immunity
src/js/modules/notifications.js  — permission, schedules, notify_level_up
src/js/modules/achievements.js   — achievement catalog, seeding, unlock checks
src/js/modules/haptics.js        — safe vibration helpers for tap/success/warning/error
src/js/modules/utils.js          — helpers: debounce, scroll_to_top, rank_gte,
TAB_REQUIREMENTS, get_tab_from_url,
setup_keyboard_dismiss
src/js/screens/daily_quests.js   — daily list, create modal, complete, undo, reward flash
src/js/screens/system_quests.js  — task list, subtasks, abandon, complete
src/js/screens/habits.js         — habit cards, +/- press, sparkline, create modal
src/js/screens/stats.js          — character sheet, attributes, gear, shadow army,
achievements, penalty log, danger zone reset
src/js/screens/dungeons.js       — gate list, active run panel, endurance timer,
gauntlet step timer, volume rep counter,
gate cleared overlay
src/js/screens/store.js          — consumables shop, equipment shop, inventory,
equip/unequip, toast notifications
src/css/variables.css            — all CSS custom properties
src/css/base.css                 — reset, app shell, tab bar, screen layout, iOS fixes
src/css/components.css           — every component style in one file
public/manifest.json             — PWA manifest
public/icons/icon_192.png        — home screen icon
public/icons/icon_512.png        — large icon
public/icons/splash_1179x2556.png — iPhone 15 Pro splash screen

---

## DEV Testing

In dev or local-network preview, `DEV: S` appears near the top-left. One tap sets:
- Level 100 / S-Rank / Monarch
- 100000 Gold
- 99 stat points
- Full dungeon keys

This is intentionally available for iPhone Home Screen testing from local IPs.

---

## How to Run

```bash
# Install
npm install --legacy-peer-deps

# Dev (browser)
npm run dev

# Dev (on iPhone — same WiFi network)
npm run dev -- --host
# then open the Network URL in Safari on iPhone

# Production build
npm run build

# Test production build on iPhone
npm run build && npm run preview -- --host
```

---

## Deploying Updates Without Losing PWA Data

The production app is deployed by Vercel from GitHub. The iPhone PWA stores all
game data locally in IndexedDB, so normal source-code deploys do not clear stats,
quests, habits, inventory, achievements, or dungeon progress.

### Normal Update Flow

```bash
# from /Users/dimazx83/Desktop/shadow-ascent

# 1. Verify locally
npm run build

# 2. Commit source changes
git status
git add .
git commit -m "Describe the update"

# 3. Push to GitHub
git push
```

Vercel automatically builds and deploys after the push. Check the Vercel
dashboard for a successful deployment, then open the installed PWA on iPhone.
The service worker uses auto-update behavior, so the installed app should pick up
new assets/code without requiring a data reset.

If the iPhone still shows an old version:
- Fully close and reopen the installed PWA.
- Open the HTTPS Vercel URL in Safari once, then reopen the Home Screen app.
- Wait a minute for the service worker update to finish.
- Avoid clearing Safari website data unless you intentionally want a full wipe.

### What Preserves Existing Stats

Safe changes:
- UI/CSS changes
- New art assets
- Gameplay logic fixes
- New screens or panels
- Store catalog additions, if existing item identifiers remain stable
- Achievement catalog additions, if existing `achievement_id` values remain stable

Risky changes that need a migration plan:
- Changing `new Dexie('shadow_ascent')` in `src/js/modules/db.js`
- Renaming tables or primary keys
- Clearing tables on app init
- Changing existing catalog identifiers used by inventory
- Changing existing `achievement_id` values
- Moving production to a different domain/origin

Data-wiping actions:
- Stats → Danger Zone → Reset All Data
- Deleting the Home Screen app
- Clearing Safari website data for the Vercel domain
- Changing the IndexedDB database name
- Installing/opening the app from a different origin, such as a new domain

### If Schema Changes Are Needed

Use a Dexie version migration instead of wiping data. Add a new `db.version(n)`
schema and migration path in `src/js/modules/db.js`, then test on an existing
installed PWA before relying on the change.

---

## DB Reset

To wipe all data and start fresh:
- Open the app → Stats tab → scroll to bottom → DANGER ZONE → RESET ALL DATA
- Requires double confirmation
- Re-seeds the store item catalog automatically after reset
