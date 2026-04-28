// ── Debounce — prevent double taps ───────────────────
export function debounce(fn, ms = 500) {
  let timer = null
  return (...args) => {
    if (timer) return
    timer = setTimeout(() => { timer = null }, ms)
    return fn(...args)
  }
}

// ── Set button loading state ─────────────────────────
export function set_btn_loading(btn, loading) {
  if (!btn) return
  if (loading) {
    btn.dataset.original_text = btn.textContent
    btn.textContent  = '...'
    btn.disabled     = true
    btn.style.opacity = '0.6'
  } else {
    btn.textContent  = btn.dataset.original_text || btn.textContent
    btn.disabled     = false
    btn.style.opacity = ''
  }
}

// ── Scroll screen to top ─────────────────────────────
export function scroll_to_top() {
  document.getElementById('screen_container')?.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Format date nicely ───────────────────────────────
export function format_date(iso_str) {
  if (!iso_str) return ''
  return new Date(iso_str).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric'
  })
}

// ── Rank order for comparisons ───────────────────────
const RANK_ORDER = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 }

export function rank_gte(player_rank, required_rank) {
  return RANK_ORDER[player_rank] >= RANK_ORDER[required_rank]
}

// ── Tab unlock requirements ──────────────────────────
export const TAB_REQUIREMENTS = {
  daily_quests:  null,   // always unlocked
  system_quests: null,   // always unlocked
  habits:        'D',    // D-rank required
  stats:         null,   // always unlocked
  dungeons:      'D',    // D-rank required
  store:         'D',    // D-rank required
}

export const TAB_UNLOCK_LABELS = {
  habits:   'Habit tracking unlocks at D-Rank (Level 10)',
  dungeons: 'Dungeon gates unlock at D-Rank (Level 10)',
  store:    'The Store unlocks at D-Rank (Level 10)',
}

// ── Read tab from URL params ─────────────────────────
// handles manifest shortcuts like /?tab=daily_quests
export function get_tab_from_url() {
  const params = new URLSearchParams(window.location.search)
  const tab    = params.get('tab')

  const valid_tabs = [
    'daily_quests',
    'system_quests',
    'habits',
    'stats',
    'dungeons',
    'store',
  ]

  return valid_tabs.includes(tab) ? tab : null
}

// ── Clean URL after reading param ────────────────────
// removes ?tab=x from address bar without reloading
export function clear_url_params() {
  const clean = window.location.pathname
  window.history.replaceState({}, '', clean)
}

// ── Dismiss keyboard on iOS when tapping outside input ──
export function setup_keyboard_dismiss(modal_el) {
  if (!modal_el) return

  modal_el.addEventListener('touchstart', e => {
    const tag = e.target.tagName.toLowerCase()
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') {
      e.target.focus()           // focus the tapped element
      document.activeElement?.blur()  // then immediately blur any input
    }
  }, { passive: true })
}