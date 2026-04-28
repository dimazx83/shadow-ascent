import { db } from './db.js'
import { get_player } from './player.js'
import { get_equipment_bonuses } from './equipment.js'

// ── Get full penalty log ─────────────────────────────
export async function get_penalty_log(limit = 20) {
  return await db.penalty_log
    .orderBy('id')
    .reverse()
    .limit(limit)
    .toArray()
}

// ── Get today's total HP lost ────────────────────────
export async function get_today_damage() {
  const today = new Date().toISOString().slice(0, 10)

  const logs = await db.penalty_log
    .filter(p => p.date === today)
    .toArray()

  return logs.reduce((sum, p) => sum + p.hp_lost, 0)
}

// ── Weekly immunity token grant ──────────────────────
// call on app init — checks if weekly immunity gear reward is due
export async function apply_weekly_immunity_grant() {
  const player  = await get_player()
  const bonuses = await get_equipment_bonuses()

  if (bonuses.weekly_immunity < 1) return

  const now       = new Date()
  const last_str  = player.last_weekly_immunity_grant || null

  if (last_str) {
    const last = new Date(last_str)
    const days = (now - last) / (1000 * 60 * 60 * 24)
    if (days < 7) return
  }

  await db.player.update(1, {
    immunity_tokens:              player.immunity_tokens + bonuses.weekly_immunity,
    last_weekly_immunity_grant:   now.toISOString(),
  })

  console.log(`[penalties] Weekly immunity grant: +${bonuses.weekly_immunity} token(s).`)
}

// ── Check if player is debuffed (hp = 0) ────────────
export async function get_debuff_status() {
  const player = await get_player()
  const debuff_until = player.debuff_until
    ? new Date(player.debuff_until).getTime()
    : 0

  if (!debuff_until || debuff_until <= Date.now()) {
    return { debuffed: false }
  }

  return {
    debuffed:    true,
    xp_penalty:  0.30,
    until:       player.debuff_until,
    description: 'You have fallen. XP gain reduced by 30% for 24 hours.',
  }
}

// ── Summary for stats screen ─────────────────────────
export async function get_penalty_summary() {
  const log   = await get_penalty_log(100)
  const today = new Date().toISOString().slice(0, 10)

  const by_source = { daily_quest: 0, system_quest: 0, habit: 0, dungeon: 0 }

  let today_total = 0
  let week_total  = 0

  const week_ago = new Date()
  week_ago.setDate(week_ago.getDate() - 7)
  const week_ago_str = week_ago.toISOString().slice(0, 10)

  for (const p of log) {
    if (by_source[p.source_type] !== undefined) {
      by_source[p.source_type] += p.hp_lost
    }
    if (p.date === today)          today_total += p.hp_lost
    if (p.date >= week_ago_str)    week_total  += p.hp_lost
  }

  return {
    today_total,
    week_total,
    by_source,
    log,
  }
}
