import { get_player_derived_stats } from './player.js'

export function notification_support_status() {
  if (!('Notification' in window)) return 'unsupported'
  if (!window.isSecureContext) return 'insecure_context'
  if (!('serviceWorker' in navigator)) return 'service_worker_unsupported'

  const is_ios = /iPad|iPhone|iPod/.test(window.navigator.userAgent)
  const is_standalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches

  if (is_ios && !is_standalone) return 'requires_install'
  return Notification.permission
}

// ── Permission request ───────────────────────────────
export async function request_notification_permission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'

  const result = await Notification.requestPermission()
  return result
}

// ── Check if notifications are supported & granted ───
export function notifications_enabled() {
  return 'Notification' in window && Notification.permission === 'granted'
}

// ── Send a notification ──────────────────────────────
function send(title, body, tag) {
  if (!notifications_enabled()) return

  new Notification(title, {
    body,
    tag,             // same tag = replaces previous, no spam
    icon:  '/icons/icon_192.png',
    badge: '/icons/icon_192.png',
    silent: false,
  })
}

// ── Schedule helpers ─────────────────────────────────
// We use setTimeout for same-session scheduling
// and localStorage to persist scheduled times across sessions

const STORAGE_KEY = 'shadow_ascent_notif_schedule'
const timeout_ids = {
  daily_reminder: null,
  key_regen: null,
  penalty_warning: null,
}

function load_schedule() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function save_schedule(schedule) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule))
}

// ── Schedule daily quest reset reminder ──────────────
// fires at 21:00 every day — "2 hours left to complete your quests"
export function schedule_daily_reminder() {
  if (!notifications_enabled()) return

  const now    = new Date()
  const target = new Date()
  target.setHours(21, 0, 0, 0)

  // if 21:00 already passed today, schedule for tomorrow
  if (target <= now) target.setDate(target.getDate() + 1)

  const ms_until = target.getTime() - now.getTime()

  const schedule  = load_schedule()
  schedule.daily_reminder = target.toISOString()
  save_schedule(schedule)

  if (timeout_ids.daily_reminder) clearTimeout(timeout_ids.daily_reminder)

  timeout_ids.daily_reminder = setTimeout(() => {
    send(
      '⚔️ Daily Quests Reminder',
      'The day ends at midnight. Complete your quests before the penalty strikes.',
      'daily_reminder'
    )
    // reschedule for tomorrow
    schedule_daily_reminder()
  }, ms_until)

  console.log(`[notif] Daily reminder scheduled for ${target.toLocaleTimeString()}`)
}

// ── Schedule dungeon key regen notification ──────────
// fires when next key is ready
export function schedule_key_regen_notif(current_keys, keys_max, last_regen_iso, key_regen_hours = 8) {
  if (!notifications_enabled()) return
  if (current_keys >= keys_max) return

  const last_regen   = new Date(last_regen_iso)
  const next_regen   = new Date(last_regen.getTime() + key_regen_hours * 60 * 60 * 1000)
  const now          = new Date()
  const ms_until     = next_regen.getTime() - now.getTime()

  if (ms_until <= 0) return

  if (timeout_ids.key_regen) clearTimeout(timeout_ids.key_regen)

  timeout_ids.key_regen = setTimeout(() => {
    send(
      '🗝️ Dungeon Key Restored',
      'A dungeon key has regenerated. The gate awaits.',
      'key_regen'
    )
  }, ms_until)

  console.log(`[notif] Key regen notification in ${Math.floor(ms_until/1000/60)} minutes`)
}

// ── Schedule midnight penalty warning ────────────────
// fires at 23:30 — last warning before penalties hit
export function schedule_penalty_warning(incomplete_quest_count) {
  if (!notifications_enabled()) return
  if (incomplete_quest_count < 1) return

  const now    = new Date()
  const target = new Date()
  target.setHours(23, 30, 0, 0)

  if (target <= now) return // too late, midnight already close

  const ms_until = target.getTime() - now.getTime()

  if (timeout_ids.penalty_warning) clearTimeout(timeout_ids.penalty_warning)

  timeout_ids.penalty_warning = setTimeout(() => {
    send(
      '⚠️ Penalty Warning',
      `${incomplete_quest_count} quest${incomplete_quest_count > 1 ? 's' : ''} incomplete. 30 minutes before the System penalizes you.`,
      'penalty_warning'
    )
  }, ms_until)

  console.log(`[notif] Penalty warning scheduled for 23:30`)
}

// ── Level up notification ────────────────────────────
export function notify_level_up(new_level, new_rank, rank_changed) {
  if (!notifications_enabled()) return

  if (rank_changed) {
    send(
      `🏆 RANK UP — ${new_rank}-RANK`,
      `You have ascended. New features unlocked. The System acknowledges your power.`,
      'rank_up'
    )
  } else {
    send(
      `⚡ Level ${new_level}`,
      `You grow stronger. Allocate your stat points.`,
      'level_up'
    )
  }
}

// ── Dungeon key empty notification ───────────────────
export function notify_no_keys() {
  if (!notifications_enabled()) return
  send(
    '🗝️ No Keys Remaining',
    'All dungeon keys spent. A dungeon key will regenerate soon.',
    'no_keys'
  )
}

export function send_test_notification() {
  send(
    '⚡ Shadow Ascent',
    'Notifications are working while the app is active.',
    'test_notification'
  )
}

export async function setup_notification_schedules(player, incomplete_quest_count) {
  if (!notifications_enabled()) {
    console.log('[notif] Permission not granted — schedules disabled.')
    return
  }

  const derived = await get_player_derived_stats(player)

  schedule_daily_reminder()
  schedule_key_regen_notif(player.dungeon_keys, derived.dungeon_keys_max, player.last_key_regen, derived.key_regen_hours)
  schedule_penalty_warning(incomplete_quest_count)

  console.log('[notif] Notification schedules initialized.')
}

// ── User-triggered enable flow ───────────────────────
export async function enable_notifications(player, incomplete_quest_count) {
  const permission = await request_notification_permission()

  if (permission !== 'granted') {
    console.log(`[notif] Permission ${permission} — notifications disabled.`)
    return permission
  }

  await setup_notification_schedules(player, incomplete_quest_count)
  send(
    '⚡ Notifications Enabled',
    'The System will warn you while Shadow Ascent is running.',
    'notifications_enabled'
  )

  return permission
}
