import { db, init_db } from './modules/db.js'
import {
  regen_dungeon_keys,
  get_player,
  recompute_player_derived_stats,
  get_player_derived_stats,
  xp_for_level,
} from './modules/player.js'
import {
  apply_daily_penalties,
  check_overdue_quests,
  get_daily_quests,
  watch_midnight_reset,
} from './modules/quests.js'
import { seed_store_items } from './modules/store.js'
import { seed_achievements, check_achievements } from './modules/achievements.js'
import { apply_weekly_immunity_grant } from './modules/penalties.js'
import { setup_notification_schedules } from './modules/notifications.js'
import { haptic_level_up } from './modules/haptics.js'
import {
  scroll_to_top,
  rank_gte,
  TAB_REQUIREMENTS,
  TAB_UNLOCK_LABELS,
  get_tab_from_url,
  clear_url_params,
} from './modules/utils.js'
import { render_stats } from './screens/stats.js'
import { render_daily_quests } from './screens/daily_quests.js'
import { render_system_quests } from './screens/system_quests.js'
import { render_habits } from './screens/habits.js'
import { render_dungeons } from './screens/dungeons.js'
import { render_store } from './screens/store.js'

const tab_btns = document.querySelectorAll('.tab_btn')
const screens  = document.querySelectorAll('.screen')

const screen_renderers = {
  daily_quests:  render_daily_quests,
  system_quests: render_system_quests,
  habits:        render_habits,
  stats:         render_stats,
  dungeons:      render_dungeons,
  store:         render_store,
}

let current_player = null
let is_switching   = false

function setup_viewport_height() {
  const set_height = () => {
    const is_standalone =
      window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches
    const is_iphone = /iPhone/.test(window.navigator.userAgent)

    const candidates = [
      window.innerHeight,
      document.documentElement.clientHeight,
      window.visualViewport?.height || 0,
    ].filter(Boolean)

    const height = Math.max(...candidates)
    document.documentElement.style.setProperty('--app-height', `${Math.ceil(height)}px`)

    if (is_standalone && is_iphone) {
      document.documentElement.style.setProperty('--bottom-inset', '34px')
    }
  }

  set_height()
  window.addEventListener('resize', set_height)
  window.addEventListener('orientationchange', () => setTimeout(set_height, 250))
  window.visualViewport?.addEventListener('resize', set_height)
}

function debug_enabled() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('debug') === '1') {
    localStorage.setItem('shadow_ascent_debug', '1')
    return true
  }

  const host = window.location.hostname
  const is_local_network =
    host === 'localhost' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)

  return (
    import.meta.env.DEV ||
    is_local_network ||
    localStorage.getItem('shadow_ascent_debug') === '1'
  )
}

// ── Tab switch ───────────────────────────────────────
export async function switch_tab(tab_name) {
  if (is_switching) return
  is_switching = true

  const required = TAB_REQUIREMENTS[tab_name]
  if (required && current_player && !rank_gte(current_player.rank, required)) {
    show_locked_screen(tab_name)
    is_switching = false
    return
  }

  tab_btns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab_name)
  })
  screens.forEach(screen => {
    screen.classList.toggle('active', screen.id === `screen_${tab_name}`)
  })

  scroll_to_top()

  if (screen_renderers[tab_name]) {
    await screen_renderers[tab_name]()
    current_player = await get_player()
  }

  is_switching = false
}

// ── Locked screen ────────────────────────────────────
function show_locked_screen(tab_name) {
  screens.forEach(s => s.classList.remove('active'))
  tab_btns.forEach(b => b.classList.remove('active'))

  tab_btns.forEach(b => {
    if (b.dataset.tab === tab_name) b.classList.add('active')
  })

  const target_screen = document.getElementById(`screen_${tab_name}`)
  if (!target_screen) return

  target_screen.classList.add('active')
  target_screen.innerHTML = `
    <div class="locked_screen">
      <div class="locked_icon">🔒</div>
      <div class="locked_title">LOCKED</div>
      <div class="locked_desc">${TAB_UNLOCK_LABELS[tab_name] || 'Keep leveling up.'}</div>
      <div class="locked_rank_display">
        <div class="locked_rank_current">
          Current Rank:
          <span style="color:var(--rank-${current_player?.rank?.toLowerCase() || 'e'})">
            ${current_player?.rank || 'E'}-RANK
          </span>
        </div>
        <div class="locked_rank_needed text_muted">
          Required: <span class="text_purple">${TAB_REQUIREMENTS[tab_name]}-RANK</span>
        </div>
      </div>
      <div class="locked_progress">
        <div class="bar_label">
          <span class="text_muted">Progress to D-Rank</span>
          <span class="text_mono text_muted">Lv. ${current_player?.level || 1} / 10</span>
        </div>
        <div class="bar_track">
          <div class="bar_fill bar_xp"
            style="width:${Math.min(100, ((current_player?.level || 1) / 10) * 100)}%">
          </div>
        </div>
      </div>
      <button class="btn_primary" id="locked_go_daily">
        ⚔️ COMPLETE QUESTS TO LEVEL UP
      </button>
    </div>
  `

  target_screen.querySelector('#locked_go_daily')?.addEventListener('click', () => {
    switch_tab('daily_quests')
  })
}

// ── Update tab lock states ───────────────────────────
function update_tab_lock_states(player) {
  tab_btns.forEach(btn => {
    const tab      = btn.dataset.tab
    const required = TAB_REQUIREMENTS[tab]
    const locked   = required && !rank_gte(player.rank, required)

    const icon_el = btn.querySelector('.tab_icon')

    if (locked) {
      btn.classList.add('tab_locked')
      if (icon_el) icon_el.style.filter = 'grayscale(1) opacity(0.2)'
    } else {
      btn.classList.remove('tab_locked')
      if (icon_el) icon_el.style.filter = ''
    }
  })
}

// ── Midnight reset callback ──────────────────────────
async function on_midnight_reset() {
  console.log('[app] Midnight reset triggered — refreshing UI...')

  // refresh player state
  current_player = await get_player()
  update_tab_lock_states(current_player)

  // re-render whichever screen is currently active
  const active_screen = document.querySelector('.screen.active')
  if (!active_screen) return

  const active_tab = active_screen.id.replace('screen_', '')
  if (screen_renderers[active_tab]) {
    await screen_renderers[active_tab]()
  }

  // show midnight notification banner
  show_midnight_banner()
}

// ── Midnight banner ──────────────────────────────────
function show_midnight_banner() {
  const existing = document.querySelector('.midnight_banner')
  if (existing) existing.remove()

  const banner = document.createElement('div')
  banner.className = 'midnight_banner'
  banner.innerHTML = `
    <span class="text_purple">⚔️ NEW DAY</span>
    <span class="text_muted">Daily quests have reset. The System watches.</span>
    <button class="midnight_banner_close">✕</button>
  `

  document.getElementById('app').appendChild(banner)

  banner.querySelector('.midnight_banner_close')?.addEventListener('click', () => {
    banner.remove()
  })

  // auto dismiss after 5 seconds
  setTimeout(() => banner?.remove(), 5000)
}

// ── Init ─────────────────────────────────────────────
async function init() {
  await init_db()
  await seed_store_items()
  await seed_achievements()
  await recompute_player_derived_stats()
  await regen_dungeon_keys()
  await apply_daily_penalties()
  await check_overdue_quests()
  await apply_weekly_immunity_grant()
  await check_achievements()

  current_player = await get_player()

  const daily_quests     = await get_daily_quests()
  const incomplete_count = daily_quests.filter(
    q => q.completions_today < q.repeat_count
  ).length

  update_tab_lock_states(current_player)

  // start midnight watcher
  watch_midnight_reset(on_midnight_reset)

  // schedule notifications only if permission was already granted
  await setup_notification_schedules(current_player, incomplete_count)

  // check URL params for shortcut launch
  const url_tab = get_tab_from_url()
  if (url_tab) {
    clear_url_params()
    await switch_tab(url_tab)
  } else {
    await switch_tab('daily_quests')
  }

  console.log('[app] Shadow Ascent initialized.')
}

tab_btns.forEach(btn => {
  btn.addEventListener('click', () => switch_tab(btn.dataset.tab))
})

// ── Global keyboard dismiss on iOS ───────────────────
document.addEventListener('touchstart', e => {
  const tag = e.target.tagName.toLowerCase()
  const is_input = tag === 'input' || tag === 'select' || tag === 'textarea'
  if (!is_input && document.activeElement) {
    const active_tag = document.activeElement.tagName.toLowerCase()
    if (active_tag === 'input' || active_tag === 'select' || active_tag === 'textarea') {
      document.activeElement.blur()
    }
  }
}, { passive: true })

// ── DEV CHEAT — hidden unless dev build or ?debug=1 ──
if (debug_enabled()) {
  const cheat_btn = document.createElement('button')
  cheat_btn.textContent = 'DEV: S'
  cheat_btn.style.cssText = `
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 8px);
    left: 8px;
    z-index: 999;
    background: #ff000044;
    border: 1px solid red;
    color: red;
    font-size: 10px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: monospace;
  `
  cheat_btn.addEventListener('click', async () => {
    await db.player.update(1, {
      level: 100,
      xp: 0,
      xp_next_level: xp_for_level(100),
      rank: 'S',
      job_class: 'Monarch',
      gold: 100000,
      stat_points: 99,
      hp: 100,
      hp_max: 100,
      dungeon_keys: 3,
      dungeon_keys_max: 3,
      last_active: new Date().toISOString(),
    })

    const player = await get_player()
    const derived = await get_player_derived_stats(player)
    await db.player.update(1, {
      dungeon_keys: derived.dungeon_keys_max,
      dungeon_keys_max: derived.dungeon_keys_max,
      hp: Math.min(player.hp, derived.hp_max),
      hp_max: derived.hp_max,
    })
    await check_achievements()
    haptic_level_up()

    // re-render active screen
    const active = document.querySelector('.screen.active')
    if (!active) return
    const tab = active.id.replace('screen_', '')
    if (screen_renderers[tab]) await screen_renderers[tab]()

    current_player = await get_player()
    update_tab_lock_states(current_player)

    console.log('[dev] S-rank test state applied')
  })
  document.getElementById('app').appendChild(cheat_btn)
}

setup_viewport_height()
init()
