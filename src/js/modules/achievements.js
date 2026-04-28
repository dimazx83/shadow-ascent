import { db } from './db.js'

const ACHIEVEMENTS = [
  {
    achievement_id: 'first_daily_complete',
    name: 'First Order',
    description: 'Complete a daily quest.',
    icon: '⚔️',
    group: 'quests',
    condition: s => s.daily_best_streak >= 1,
  },
  {
    achievement_id: 'daily_streak_7',
    name: 'Seven-Day Discipline',
    description: 'Reach a 7-day daily quest streak.',
    icon: '🔥',
    group: 'quests',
    condition: s => s.daily_best_streak >= 7,
  },
  {
    achievement_id: 'first_system_complete',
    name: 'System Obeyed',
    description: 'Complete a system quest.',
    icon: '📜',
    group: 'quests',
    condition: s => s.completed_system_quests >= 1,
  },
  {
    achievement_id: 'ten_system_complete',
    name: 'Task Hunter',
    description: 'Complete 10 system quests.',
    icon: '🎯',
    group: 'quests',
    condition: s => s.completed_system_quests >= 10,
  },
  {
    achievement_id: 'first_habit_press',
    name: 'First Habit',
    description: 'Press a positive habit.',
    icon: '🔄',
    group: 'habits',
    condition: s => s.total_positive_habits >= 1,
  },
  {
    achievement_id: 'habit_streak_7',
    name: 'Built Different',
    description: 'Reach a 7-day habit streak.',
    icon: '⚡',
    group: 'habits',
    condition: s => s.best_habit_streak >= 7,
  },
  {
    achievement_id: 'first_penalty',
    name: 'Penalty Zone',
    description: 'Take your first HP penalty.',
    icon: '⚠️',
    group: 'penalties',
    condition: s => s.penalty_count >= 1,
  },
  {
    achievement_id: 'rank_d',
    name: 'Awakened',
    description: 'Reach D-Rank.',
    icon: '🟢',
    group: 'progression',
    condition: s => rank_gte(s.player.rank, 'D'),
  },
  {
    achievement_id: 'rank_s',
    name: 'Monarch',
    description: 'Reach S-Rank.',
    icon: '👑',
    group: 'progression',
    condition: s => rank_gte(s.player.rank, 'S'),
  },
  {
    achievement_id: 'first_dungeon_clear',
    name: 'Gate Cleared',
    description: 'Clear a dungeon.',
    icon: '🏰',
    group: 'dungeons',
    condition: s => s.dungeons_cleared >= 1,
  },
  {
    achievement_id: 'ten_dungeon_clears',
    name: 'Gate Reaper',
    description: 'Clear 10 dungeons.',
    icon: '💀',
    group: 'dungeons',
    condition: s => s.dungeons_cleared >= 10,
  },
  {
    achievement_id: 'first_shadow',
    name: 'Arise',
    description: 'Extract your first shadow.',
    icon: '👥',
    group: 'dungeons',
    condition: s => s.shadow_count >= 1,
  },
  {
    achievement_id: 'first_gear',
    name: 'Armed',
    description: 'Acquire your first piece of gear.',
    icon: '🗡️',
    group: 'store',
    condition: s => s.equipment_count >= 1,
  },
  {
    achievement_id: 'full_loadout',
    name: 'Fully Equipped',
    description: 'Equip weapon, armor, and accessory.',
    icon: '🛡️',
    group: 'store',
    condition: s => s.equipped_slots >= 3,
  },
  {
    achievement_id: 'wealth_1000',
    name: 'Gold Reserve',
    description: 'Hold 1000 Gold.',
    icon: '💰',
    group: 'store',
    condition: s => s.player.gold >= 1000,
  },
]

const RANK_ORDER = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 }

function rank_gte(player_rank, required_rank) {
  return RANK_ORDER[player_rank] >= RANK_ORDER[required_rank]
}

export async function seed_achievements() {
  const existing = await db.achievements.toArray()
  const existing_ids = new Set(existing.map(a => a.achievement_id))

  const missing = ACHIEVEMENTS
    .filter(a => !existing_ids.has(a.achievement_id))
    .map(a => ({
      achievement_id: a.achievement_id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      group: a.group,
      unlocked_at: null,
      created_at: new Date().toISOString(),
    }))

  if (missing.length > 0) {
    await db.achievements.bulkAdd(missing)
  }
}

export async function get_achievements() {
  await seed_achievements()

  const rows = await db.achievements.toArray()
  const row_map = new Map(rows.map(row => [row.achievement_id, row]))

  return ACHIEVEMENTS.map(def => ({
    ...def,
    ...(row_map.get(def.achievement_id) || {}),
  }))
}

export async function check_achievements() {
  await seed_achievements()

  const [rows, snapshot] = await Promise.all([
    db.achievements.toArray(),
    build_snapshot(),
  ])

  const row_map = new Map(rows.map(row => [row.achievement_id, row]))
  const unlocked = []

  for (const def of ACHIEVEMENTS) {
    const row = row_map.get(def.achievement_id)
    if (!row || row.unlocked_at) continue
    if (!def.condition(snapshot)) continue

    const unlocked_at = new Date().toISOString()
    await db.achievements.update(row.id, { unlocked_at })
    unlocked.push({ ...def, unlocked_at })
  }

  return unlocked
}

async function build_snapshot() {
  const [
    player,
    daily_quests,
    system_completed,
    habits,
    dungeons,
    shadow_count,
    inventory,
    penalty_count,
  ] = await Promise.all([
    db.player.get(1),
    db.daily_quests.toArray(),
    db.system_quests.where('status').equals('completed').toArray(),
    db.habits.toArray(),
    db.dungeons.toArray(),
    db.shadow_army.count(),
    db.inventory.toArray(),
    db.penalty_log.count(),
  ])

  const equipped_slots = new Set(
    inventory
      .filter(item => item.is_equipped === 1 && item.slot)
      .map(item => item.slot)
  ).size

  return {
    player,
    daily_best_streak: Math.max(0, ...daily_quests.map(q => q.best_streak || 0)),
    completed_system_quests: system_completed.length,
    total_positive_habits: habits.reduce((sum, h) => sum + (h.total_positive || 0), 0),
    best_habit_streak: Math.max(0, ...habits.map(h => h.best_streak || 0)),
    dungeons_cleared: dungeons.reduce((sum, d) => sum + (d.times_cleared || 0), 0),
    shadow_count,
    equipment_count: inventory.filter(item => item.type === 'equipment').length,
    equipped_slots,
    penalty_count,
  }
}
