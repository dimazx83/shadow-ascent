import { db } from './db.js'
import { award_xp, award_gold, take_damage } from './player.js'
import { check_achievements } from './achievements.js'

// ── Rewards per rank per press ───────────────────────
const HABIT_REWARDS = {
  E: { xp: 8,  gold: 4  },
  D: { xp: 15, gold: 8  },
  C: { xp: 28, gold: 15 },
  B: { xp: 50, gold: 28 },
  A: { xp: 90, gold: 50 },
  S: { xp: 150, gold: 90 },
}

// ── Penalty per negative press ───────────────────────
const HABIT_PENALTIES = {
  E: 3,
  D: 6,
  C: 12,
  B: 20,
  A: 35,
  S: 55,
}

// ── Today's date string ──────────────────────────────
function today_str() {
  return new Date().toISOString().slice(0, 10)
}

// ── Get start of current week (Monday) ──────────────
function week_start_str() {
  const now  = new Date()
  const day  = now.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  const mon  = new Date(now)
  mon.setDate(now.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

// ── Create habit ─────────────────────────────────────
// direction: 'positive' | 'negative' | 'both'
export async function create_habit({
  name,
  rank       = 'E',
  direction  = 'both',
  icon       = '🔄',
  category   = 'general',
}) {
  const id = await db.habits.add({
    name,
    rank,
    direction,
    icon,
    category,
    streak:          0,
    best_streak:     0,
    last_positive:   null,   // date of last positive press
    total_positive:  0,
    total_negative:  0,
    created_at:      new Date().toISOString(),
  })
  return id
}

// ── Get all habits ───────────────────────────────────
export async function get_habits() {
  return await db.habits.toArray()
}

// ── Get single habit ─────────────────────────────────
export async function get_habit(habit_id) {
  return await db.habits.get(habit_id)
}

// ── Press positive ───────────────────────────────────
// returns { reward_xp, reward_gold, streak }
export async function press_positive(habit_id) {
  const habit   = await db.habits.get(habit_id)
  if (!habit) return null
  if (habit.direction === 'negative') return null

  const today    = today_str()
  const rewards  = HABIT_REWARDS[habit.rank]

  // streak: if last positive was yesterday, continue streak
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterday_str = yesterday.toISOString().slice(0, 10)

  let new_streak = habit.streak
  if (habit.last_positive === yesterday_str || habit.last_positive === today) {
    // continuing or same day — don't double-increment if same day
    if (habit.last_positive !== today) new_streak += 1
  } else {
    // streak broken or first press
    new_streak = 1
  }

  const new_best = Math.max(habit.best_streak, new_streak)

  await db.habits.update(habit_id, {
    streak:         new_streak,
    best_streak:    new_best,
    last_positive:  today,
    total_positive: habit.total_positive + 1,
  })

  await db.habit_log.add({
    habit_id,
    date:  today,
    value: 1,
  })

  // streak bonus: every 7 days of streak, 2× rewards
  const streak_bonus = new_streak % 7 === 0 ? 2 : 1

  const xp_result   = await award_xp(rewards.xp * streak_bonus, {
    source: 'habit',
    streak_days: new_streak,
  })
  const gold_gained = await award_gold(rewards.gold * streak_bonus)

  return {
    reward_xp:    xp_result.gained,
    reward_gold:  gold_gained,
    streak:       new_streak,
    streak_bonus: streak_bonus > 1,
    xp_result,
    achievements_unlocked: await check_achievements(),
  }
}

// ── Press negative ───────────────────────────────────
// returns { damage_taken, new_hp }
export async function press_negative(habit_id) {
  const habit = await db.habits.get(habit_id)
  if (!habit) return null
  if (habit.direction === 'positive') return null

  const today   = today_str()
  const penalty = HABIT_PENALTIES[habit.rank]

  await db.habits.update(habit_id, {
    total_negative: habit.total_negative + 1,
  })

  await db.habit_log.add({
    habit_id,
    date:  today,
    value: -1,
  })

  const result = await take_damage(penalty)

  await db.penalty_log.add({
    date:        today,
    source_type: 'habit',
    source_id:   habit_id,
    hp_lost:     result.damage_taken,
  })

  return {
    damage_taken: result.damage_taken,
    new_hp:       result.new_hp,
    achievements_unlocked: await check_achievements(),
  }
}

// ── Get habit log for current week ───────────────────
// returns array of { date, positive_count, negative_count }
// one entry per day of the week
export async function get_week_log(habit_id) {
  const week_start = week_start_str()

  const logs = await db.habit_log
    .where('habit_id').equals(habit_id)
    .filter(log => log.date >= week_start)
    .toArray()

  // build 7-day map
  const day_map = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    const day = new Date()
    day.setDate(day.getDate() - day.getDay() + 1 + i)
    const key = day.toISOString().slice(0, 10)
    day_map[key] = { date: key, positive_count: 0, negative_count: 0 }
  }

  for (const log of logs) {
    if (!day_map[log.date]) continue
    if (log.value > 0) day_map[log.date].positive_count += 1
    else               day_map[log.date].negative_count += 1
  }

  return Object.values(day_map)
}

// ── Get today's press counts for a habit ─────────────
export async function get_today_counts(habit_id) {
  const today = today_str()

  const logs = await db.habit_log
    .where('habit_id').equals(habit_id)
    .filter(log => log.date === today)
    .toArray()

  return {
    positive: logs.filter(l => l.value > 0).length,
    negative: logs.filter(l => l.value < 0).length,
  }
}

// ── Delete habit ─────────────────────────────────────
export async function delete_habit(habit_id) {
  await db.habits.delete(habit_id)
  await db.habit_log.where('habit_id').equals(habit_id).delete()
}

// ── Update habit ─────────────────────────────────────
export async function update_habit(habit_id, changes) {
  await db.habits.update(habit_id, changes)
}
