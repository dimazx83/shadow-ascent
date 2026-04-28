import Dexie from 'dexie'

export const db = new Dexie('shadow_ascent')

db.version(1).stores({

  // ── Player ─────────────────────────────────────────
  // Single row, id always = 1
  player: 'id, rank, level, job_class',

  // ── Daily Quests ────────────────────────────────────
  // repeat_count = how many times per day must be done
  // completions_today = how many times done today
  // last_reset = date string YYYY-MM-DD
  daily_quests: '++id, rank, is_active, last_reset',

  // ── System Quests (tasks) ───────────────────────────
  // status: 'active' | 'completed' | 'abandoned'
  system_quests: '++id, status, rank, tag, due_date',

  // ── Habits ──────────────────────────────────────────
  // direction: 'positive' | 'negative' | 'both'
  habits: '++id, direction, rank',

  // ── Habit Log ───────────────────────────────────────
  // one row per press, positive or negative
  // value: +1 or -1
  habit_log: '++id, habit_id, date, value',

  // ── Dungeons ────────────────────────────────────────
  // type: 'endurance' | 'volume' | 'gauntlet'
  // status: 'idle' | 'active' | 'cleared' | 'failed'
  dungeons: '++id, type, rank, status',

  // ── Dungeon Runs ────────────────────────────────────
  // one row per attempt
  // outcome: 'cleared' | 'failed' | 'abandoned'
  dungeon_runs: '++id, dungeon_id, outcome, date',

  // ── Shadow Army ─────────────────────────────────────
  // extracted shadows from cleared dungeons
  // buff_type: 'xp_boost' | 'gold_boost' | 'hp_boost' | 'key_regen'
  shadow_army: '++id, dungeon_id, buff_type',

  // ── Inventory ───────────────────────────────────────
  // type: 'consumable' | 'equipment' | 'cosmetic'
  // slot: 'weapon' | 'armor' | 'accessory' | null
  // is_equipped: 0 | 1
  inventory: '++id, type, slot, is_equipped',

  // ── Store Items ─────────────────────────────────────
  // master list of all buyable items
  // rarity: 'common' | 'rare' | 'epic' | 'legendary'
  store_items: '++id, type, slot, rarity',

  // ── Achievements ────────────────────────────────────
  // unlocked_at: timestamp or null
  achievements: '++id, unlocked_at',

  // ── Penalty Log ─────────────────────────────────────
  penalty_log: '++id, date, source_type, source_id, hp_lost',

})

// ── Seed default player if first launch ─────────────
export async function init_db() {
  const existing = await db.player.get(1)
  if (existing) return

  await db.player.add({
    id: 1,

    // identity
    name:          'Hunter',
    avatar_id:     'default',

    // progression
    level:         1,
    xp:            0,
    xp_next_level: 100,
    rank:          'E',
    job_class:     'Unemployed Hunter',

    // resources
    hp:            100,
    hp_max:        100,
    gold:          0,

    // attributes (raw points)
    str:           1,
    int:           1,
    agi:           1,
    vit:           1,
    sen:           1,
    stat_points:   0,  // unspent points to allocate

    // dungeon keys
    dungeon_keys:     3,
    dungeon_keys_max: 3,
    last_key_regen:   new Date().toISOString(),

    // penalty immunity
    immunity_tokens: 0,

    // meta
    created_at:    new Date().toISOString(),
    last_active:   new Date().toISOString(),
  })

  console.log('[db] Player created — Welcome, Hunter.')
}

// ── Full reset — wipes everything, re-seeds player ──
export async function reset_all_data() {
  await db.player.clear()
  await db.daily_quests.clear()
  await db.system_quests.clear()
  await db.habits.clear()
  await db.habit_log.clear()
  await db.dungeons.clear()
  await db.dungeon_runs.clear()
  await db.shadow_army.clear()
  await db.inventory.clear()
  await db.store_items.clear()
  await db.achievements.clear()
  await db.penalty_log.clear()

  await init_db()
  console.log('[db] Full reset complete.')
}