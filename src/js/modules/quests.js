import { db } from './db.js'
import { award_xp, award_gold, take_damage, use_immunity_token, remove_xp, remove_gold } from './player.js'
import { check_achievements } from './achievements.js'

// ── XP / Gold rewards per rank ───────────────────────
const QUEST_REWARDS = {
  E: { xp: 20, gold: 10 },
  D: { xp: 40, gold: 25 },
  C: { xp: 80, gold: 50 },
  B: { xp: 150, gold: 100 },
  A: { xp: 280, gold: 200 },
  S: { xp: 500, gold: 400 },
}

// ── HP penalty for missing a quest ───────────────────
const QUEST_PENALTIES = {
  E: 5,
  D: 10,
  C: 20,
  B: 35,
  A: 55,
  S: 80,
}

// ── Today's date string ──────────────────────────────
function today_str() {
  return new Date().toISOString().slice(0, 10)
}

// ════════════════════════════════════════════════════
//  DAILY QUESTS
// ════════════════════════════════════════════════════

// ── Create daily quest ───────────────────────────────
// repeat_count = how many times must be done per day
export async function create_daily_quest({
  name,
  rank = 'E',
  repeat_count = 1,
  icon = '⚔️',
  category = 'general',
}) {
  const id = await db.daily_quests.add({
    name,
    rank,
    repeat_count,
    completions_today: 0,
    icon,
    category,
    is_active: 1,
    streak: 0,
    best_streak: 0,
    reward_history: [],
    last_reset: today_str(),
    created_at: new Date().toISOString(),
  })
  return id
}

// ── Get all active daily quests (reset if new day) ───
export async function get_daily_quests() {
  const quests = await db.daily_quests
    .where('is_active').equals(1)
    .toArray()

  const today = today_str()
  const to_reset = quests.filter(q => q.last_reset !== today)

  // midnight reset for each quest
  if (to_reset.length > 0) {
    await Promise.all(to_reset.map(q =>
      db.daily_quests.update(q.id, {
        completions_today: 0,
        reward_history: [],
        last_reset: today,
      })
    ))
    // re-fetch after reset
    return await db.daily_quests
      .where('is_active').equals(1)
      .toArray()
  }

  return quests
}

// ── Complete one rep of a daily quest ────────────────
// returns { reward_xp, reward_gold, fully_complete }
export async function complete_daily_quest_rep(quest_id) {
  const quest = await db.daily_quests.get(quest_id)
  if (!quest) return null

  const new_completions = quest.completions_today + 1
  const fully_complete = new_completions >= quest.repeat_count

  const updates = { completions_today: new_completions }

  if (fully_complete) {
    updates.streak = quest.streak + 1
    updates.best_streak = Math.max(quest.best_streak, quest.streak + 1)
  }

  await db.daily_quests.update(quest_id, updates)

  const rewards = QUEST_REWARDS[quest.rank]
  // partial rep = fraction of full reward
  const fraction = 1 / quest.repeat_count

  const xp_result = await award_xp(Math.floor(rewards.xp * fraction), {
    source: 'quest',
  })
  const gold_gained = await award_gold(Math.floor(rewards.gold * fraction), {
    source: 'quest',
  })

  const reward_history = Array.isArray(quest.reward_history)
    ? [...quest.reward_history]
    : []
  reward_history.push({
    xp: xp_result.gained,
    gold: gold_gained,
    fully_complete,
    at: new Date().toISOString(),
  })

  await db.daily_quests.update(quest_id, { reward_history })

  return {
    reward_xp: xp_result.gained,
    reward_gold: gold_gained,
    fully_complete,
    xp_result,      // contains leveled_up, rank_changed etc
    achievements_unlocked: await check_achievements(),
  }
}

// ── Delete daily quest ───────────────────────────────
export async function delete_daily_quest(quest_id) {
  await db.daily_quests.update(quest_id, { is_active: 0 })
}

// ── Update daily quest ───────────────────────────────
export async function update_daily_quest(quest_id, changes) {
  await db.daily_quests.update(quest_id, changes)
}

// ── Apply midnight penalties ─────────────────────────
// call this on app init after reset
// penalizes quests that weren't fully completed yesterday
export async function apply_daily_penalties() {
  const today = today_str()
  const quests = await db.daily_quests
    .where('is_active').equals(1)
    .toArray()

  for (const quest of quests) {
    if (quest.last_reset === today) continue

    const was_incomplete = quest.completions_today < quest.repeat_count
    const updates = {
      completions_today: 0,
      reward_history: [],
      last_reset: today,
    }

    if (was_incomplete) {
      updates.streak = 0
    }

    await db.daily_quests.update(quest.id, updates)

    if (was_incomplete) {
      // skip penalty if player has immunity token
      const had_immunity = await use_immunity_token()
      if (had_immunity) continue

      const hp_loss = QUEST_PENALTIES[quest.rank]
      const result = await take_damage(hp_loss)

      await db.penalty_log.add({
        date: today,
        source_type: 'daily_quest',
        source_id: quest.id,
        hp_lost: result.damage_taken,
      })
    }
  }
}

// ════════════════════════════════════════════════════
//  SYSTEM QUESTS  (one-off tasks)
// ════════════════════════════════════════════════════

// ── Create system quest ──────────────────────────────
export async function create_system_quest({
  name,
  rank = 'E',
  tag = 'general',
  due_date = null,
  subtasks = [],
  icon = '📜',
}) {
  const id = await db.system_quests.add({
    name,
    rank,
    tag,
    due_date,
    subtasks,       // array of { text, done }
    icon,
    status: 'active',
    created_at: new Date().toISOString(),
    completed_at: null,
  })
  return id
}

// ── Get system quests by status ──────────────────────
export async function get_system_quests(status = 'active') {
  return await db.system_quests
    .where('status').equals(status)
    .reverse()
    .toArray()
}

// ── Complete system quest ────────────────────────────
export async function complete_system_quest(quest_id) {
  const quest = await db.system_quests.get(quest_id)
  if (!quest || quest.status !== 'active') return null

  await db.system_quests.update(quest_id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  })

  const rewards = QUEST_REWARDS[quest.rank]
  const xp_result = await award_xp(rewards.xp, {
    source: 'quest',
  })
  const gold_gained = await award_gold(rewards.gold, {
    source: 'quest',
  })

  return {
    reward_xp: xp_result.gained,
    reward_gold: gold_gained,
    xp_result,
    achievements_unlocked: await check_achievements(),
  }
}

// ── Abandon system quest (penalty) ───────────────────
export async function abandon_system_quest(quest_id) {
  const quest = await db.system_quests.get(quest_id)
  if (!quest || quest.status !== 'active') return null

  await db.system_quests.update(quest_id, {
    status: 'abandoned',
  })

  const had_immunity = await use_immunity_token()
  if (had_immunity) {
    return {
      damage_taken: 0,
      used_immunity: true,
      achievements_unlocked: await check_achievements(),
    }
  }

  const hp_loss = QUEST_PENALTIES[quest.rank]
  const result = await take_damage(hp_loss)

  await db.penalty_log.add({
    date: today_str(),
    source_type: 'system_quest',
    source_id: quest_id,
    hp_lost: result.damage_taken,
  })

  return {
    damage_taken: result.damage_taken,
    used_immunity: false,
    achievements_unlocked: await check_achievements(),
  }
}

// ── Toggle subtask ───────────────────────────────────
export async function toggle_subtask(quest_id, subtask_index) {
  const quest = await db.system_quests.get(quest_id)
  if (!quest) return

  const subtasks = [...quest.subtasks]
  subtasks[subtask_index].done = !subtasks[subtask_index].done

  await db.system_quests.update(quest_id, { subtasks })
}

// ── Delete system quest ──────────────────────────────
export async function delete_system_quest(quest_id) {
  await db.system_quests.delete(quest_id)
}

// ── Check overdue system quests ──────────────────────
// call on app init — penalizes overdue quests
export async function check_overdue_quests() {
  const today = today_str()
  const active = await db.system_quests
    .where('status').equals('active')
    .toArray()

  for (const quest of active) {
    if (!quest.due_date) continue
    if (quest.due_date >= today) continue

    // overdue — auto-abandon with penalty
    await abandon_system_quest(quest.id)
  }
}

// ── Undo last daily quest rep ────────────────────────
// returns false if nothing to undo
export async function undo_daily_quest_rep(quest_id) {
  const quest = await db.daily_quests.get(quest_id)
  if (!quest) return false
  if (quest.completions_today === 0) return false

  const reward_history = Array.isArray(quest.reward_history)
    ? [...quest.reward_history]
    : []
  const last_reward = reward_history.pop()
  if (!last_reward) return false

  const was_fully_complete = Boolean(last_reward.fully_complete)
  const new_completions = quest.completions_today - 1

  const updates = {
    completions_today: new_completions,
    reward_history,
  }

  // if it was fully complete, roll back streak increment
  if (was_fully_complete && quest.streak > 0) {
    updates.streak = quest.streak - 1
  }

  await db.daily_quests.update(quest_id, updates)

  await remove_xp(last_reward.xp)
  await remove_gold(last_reward.gold)

  return { xp_back: last_reward.xp, gold_back: last_reward.gold }
}

// ── Midnight reset watcher ───────────────────────────
// call once on init — fires callback at next midnight
// and reschedules itself every 24h
export function watch_midnight_reset(on_reset_callback) {
  const now        = new Date()
  const next_midnight = new Date()
  next_midnight.setHours(24, 0, 0, 0)  // next midnight exactly

  const ms_until = next_midnight.getTime() - now.getTime()

  console.log(`[quests] Midnight reset in ${Math.floor(ms_until / 1000 / 60)} minutes`)

  setTimeout(async () => {
    console.log('[quests] Midnight — resetting daily quests...')

    // apply penalties for anything incomplete
    await apply_daily_penalties()

    // get_daily_quests already handles the reset internally
    // just need to trigger it
    await get_daily_quests()

    // notify callback so active screen can re-render
    if (on_reset_callback) on_reset_callback()

    // reschedule for next midnight
    watch_midnight_reset(on_reset_callback)
  }, ms_until)
}
