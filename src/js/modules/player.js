import { db } from './db.js'
import { get_equipment_bonuses } from './equipment.js'

// ── Rank thresholds ──────────────────────────────────
const RANKS = [
  { rank: 'E', min_level: 1  },
  { rank: 'D', min_level: 10 },
  { rank: 'C', min_level: 20 },
  { rank: 'B', min_level: 40 },
  { rank: 'A', min_level: 60 },
  { rank: 'S', min_level: 100 },
]

// ── Job classes ──────────────────────────────────────
const JOB_CLASSES = [
  { level: 1,   title: 'Unemployed Hunter'  },
  { level: 10,  title: 'Awakened'           },
  { level: 25,  title: 'Shadow Soldier'     },
  { level: 40,  title: 'Commander'          },
  { level: 60,  title: 'Shadow Monarch'     },
  { level: 100, title: 'Monarch'            },
]

// ── XP required to reach next level ─────────────────
// scales gradually: level 1→2 = 100xp, grows each level
export function xp_for_level(level) {
  return Math.floor(100 * Math.pow(level, 1.4))
}

// ── Get rank string from level ───────────────────────
export function rank_for_level(level) {
  let result = 'E'
  for (const r of RANKS) {
    if (level >= r.min_level) result = r.rank
  }
  return result
}

// ── Get job class from level ─────────────────────────
export function job_class_for_level(level) {
  let result = JOB_CLASSES[0].title
  for (const j of JOB_CLASSES) {
    if (level >= j.level) result = j.title
  }
  return result
}

// ── Attribute multipliers ────────────────────────────
// returns computed bonuses based on raw stat points
export function get_stat_bonuses(player) {
  return {
    // STR: +3% gold per point above 1
    gold_multiplier:   1 + (player.str - 1) * 0.03,

    // INT: +3% xp per point above 1
    xp_multiplier:     1 + (player.int - 1) * 0.03,

    // AGI: -2% hp penalty per point above 1, min 10% of base
    penalty_reduction: Math.min(0.9, (player.agi - 1) * 0.02),

    // VIT: +20 max hp per point above 1, +0.5 max keys
    hp_bonus:          (player.vit - 1) * 20,
    keys_max:          3 + Math.floor((player.vit - 1) * 0.5),

    // SEN: hidden quest chance % (shown in stats screen)
    hidden_quest_chance: Math.min(50, (player.sen - 1) * 5),
  }
}

export async function get_shadow_bonuses() {
  const army = await db.shadow_army.toArray()

  return army.reduce((bonuses, shadow) => {
    if (shadow.buff_type === 'hp_boost') {
      bonuses.hp_max_bonus += shadow.buff_value
    }
    if (shadow.buff_type === 'key_regen') {
      bonuses.key_regen_percent += shadow.buff_value
    }
    return bonuses
  }, {
    hp_max_bonus: 0,
    key_regen_percent: 0,
  })
}

export async function get_player_derived_stats(player = null) {
  const target_player = player || await get_player()
  const stat_bonuses  = get_stat_bonuses(target_player)
  const eq_bonuses    = await get_equipment_bonuses()
  const shadow_bonuses = await get_shadow_bonuses()

  const hp_max = 100
    + stat_bonuses.hp_bonus
    + eq_bonuses.hp_max_bonus
    + shadow_bonuses.hp_max_bonus

  return {
    stat_bonuses,
    equipment_bonuses: eq_bonuses,
    shadow_bonuses,
    hp_max,
    dungeon_keys_max: stat_bonuses.keys_max,
    key_regen_hours: 8 / (1 + shadow_bonuses.key_regen_percent / 100),
  }
}

function get_active_debuff_multiplier(player) {
  if (!player.debuff_until) return 1
  return new Date(player.debuff_until).getTime() > Date.now()
    ? 0.7
    : 1
}

function apply_reward_multiplier(amount, multiplier) {
  const scaled = amount * multiplier
  if (multiplier > 1 && amount > 0) return Math.max(amount + 1, Math.ceil(scaled))
  return Math.floor(scaled)
}

// ── Load player ──────────────────────────────────────
export async function get_player() {
  return await db.player.get(1)
}

export async function recompute_player_derived_stats() {
  const player  = await get_player()
  const derived = await get_player_derived_stats(player)

  await db.player.update(1, {
    hp_max: derived.hp_max,
    hp: Math.min(player.hp, derived.hp_max),
    dungeon_keys_max: derived.dungeon_keys_max,
    dungeon_keys: Math.min(player.dungeon_keys, derived.dungeon_keys_max),
  })
}

// ── Award XP ─────────────────────────────────────────
// returns { leveled_up, new_level, old_level, rank_changed, new_rank }
export async function award_xp(amount, options = {}) {
  const player     = await get_player()
  const bonuses    = get_stat_bonuses(player)
  const eq_bonuses = await get_equipment_bonuses()
  const {
    source = 'generic',
    time_bonus = false,
    streak_days = 0,
  } = options

  // check for xp_boost_next consumable flag
  let boost = 1
  if (player.xp_boost_next && player.xp_boost_next > 1) {
    boost = player.xp_boost_next
    // consume the flag immediately
    await db.player.update(1, { xp_boost_next: null })
  }

  let multiplier = bonuses.xp_multiplier
  multiplier *= 1 + (eq_bonuses.xp_percent / 100)

  if (source === 'dungeon' && time_bonus && eq_bonuses.dungeon_xp_speed_bonus > 0) {
    multiplier *= 1 + (eq_bonuses.dungeon_xp_speed_bonus / 100)
  }

  if (source === 'habit' && streak_days >= 7 && eq_bonuses.streak_xp_bonus > 0) {
    const streak_tiers = Math.floor(streak_days / 7)
    multiplier *= 1 + ((eq_bonuses.streak_xp_bonus * streak_tiers) / 100)
  }

  multiplier *= get_active_debuff_multiplier(player)

  const gained = apply_reward_multiplier(amount, multiplier * boost)

  let xp        = player.xp + gained
  let level     = player.level
  let leveled_up = false

  while (xp >= xp_for_level(level)) {
    xp    -= xp_for_level(level)
    level += 1
    leveled_up = true
  }

  const old_rank  = player.rank
  const new_rank  = rank_for_level(level)
  const job_class = job_class_for_level(level)

  const stat_points_gained = leveled_up
    ? (level - player.level)
    : 0

  await db.player.update(1, {
    xp,
    xp_next_level:  xp_for_level(level),
    level,
    rank:           new_rank,
    job_class,
    stat_points:    player.stat_points + stat_points_gained,
    last_active:    new Date().toISOString(),
  })

  return {
    gained,
    boost_applied: boost > 1,
    leveled_up,
    old_level:    player.level,
    new_level:    level,
    rank_changed: new_rank !== old_rank,
    old_rank,
    new_rank,
    stat_points_gained,
  }
}

// ── Award Gold ───────────────────────────────────────
export async function award_gold(amount, options = {}) {
  const player     = await get_player()
  const bonuses    = get_stat_bonuses(player)
  const eq_bonuses = await get_equipment_bonuses()
  const now        = new Date()
  const { source = 'generic' } = options

  let multiplier = bonuses.gold_multiplier
  multiplier *= 1 + (eq_bonuses.gold_percent / 100)

  if (source === 'quest' && now.getHours() < 12 && eq_bonuses.gold_morning_bonus > 0) {
    multiplier *= 1 + (eq_bonuses.gold_morning_bonus / 100)
  }

  const gained = apply_reward_multiplier(amount, multiplier)

  await db.player.update(1, {
    gold: player.gold + gained,
  })

  return gained
}

// ── Spend Gold ───────────────────────────────────────
// returns false if not enough gold
export async function spend_gold(amount) {
  const player = await get_player()
  if (player.gold < amount) return false

  await db.player.update(1, {
    gold: player.gold - amount,
  })
  return true
}

export async function remove_gold(amount) {
  const player = await get_player()
  const new_gold = Math.max(0, player.gold - amount)

  await db.player.update(1, { gold: new_gold })
  return player.gold - new_gold
}

// ── Take HP damage ───────────────────────────────────
// returns { new_hp, died } — died = hp reached 0
export async function take_damage(amount) {
  const player     = await get_player()
  const bonuses    = get_stat_bonuses(player)
  const eq_bonuses = await get_equipment_bonuses()
  const total_reduction = Math.min(
    0.9,
    bonuses.penalty_reduction + (eq_bonuses.penalty_reduction / 100)
  )
  const reduced = Math.floor(amount * (1 - total_reduction))
  const new_hp  = Math.max(0, player.hp - reduced)

  const updates = { hp: new_hp }
  if (new_hp === 0) {
    updates.debuff_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }

  await db.player.update(1, updates)

  return {
    damage_taken: reduced,
    new_hp,
    died: new_hp === 0,
  }
}

// ── Restore HP ───────────────────────────────────────
export async function restore_hp(amount) {
  const player = await get_player()
  const new_hp = Math.min(player.hp_max, player.hp + amount)

  await db.player.update(1, { hp: new_hp })
  return new_hp
}

// ── Spend stat point ─────────────────────────────────
// stat_name: 'str' | 'int' | 'agi' | 'vit' | 'sen'
// returns false if no points available
export async function spend_stat_point(stat_name) {
  const player = await get_player()
  if (player.stat_points < 1) return false

  const valid_stats = ['str', 'int', 'agi', 'vit', 'sen']
  if (!valid_stats.includes(stat_name)) return false

  // recalc hp_max if vit is increased
  const updates = {
    [stat_name]:  player[stat_name] + 1,
    stat_points:  player.stat_points - 1,
  }

  if (stat_name === 'vit') {
    const derived = await get_player_derived_stats({ ...player, vit: player.vit + 1 })
    updates.hp_max = derived.hp_max
    updates.hp     = Math.min(player.hp, derived.hp_max)
    updates.dungeon_keys_max = derived.dungeon_keys_max
    updates.dungeon_keys = Math.min(player.dungeon_keys, derived.dungeon_keys_max)
  }

  await db.player.update(1, updates)
  return true
}

// ── Consume immunity token ───────────────────────────
export async function use_immunity_token() {
  const player = await get_player()
  if (player.immunity_tokens < 1) return false

  await db.player.update(1, {
    immunity_tokens: player.immunity_tokens - 1,
  })
  return true
}

// ── Regen dungeon keys ───────────────────────────────
// call once on app init — gives back keys based on time passed
export async function regen_dungeon_keys() {
  const player  = await get_player()
  const derived = await get_player_derived_stats(player)
  const max     = derived.dungeon_keys_max

  if (player.dungeon_keys >= max) return

  const now       = new Date()
  const last      = new Date(player.last_key_regen)
  const hours_passed = (now - last) / (1000 * 60 * 60)

  const keys_to_add = Math.floor(hours_passed / derived.key_regen_hours)
  if (keys_to_add < 1) return

  const new_keys = Math.min(max, player.dungeon_keys + keys_to_add)
  const intervals_used = new_keys - player.dungeon_keys
  const next_last_regen = new_keys >= max
    ? now
    : new Date(last.getTime() + intervals_used * derived.key_regen_hours * 60 * 60 * 1000)

  await db.player.update(1, {
    dungeon_keys:   new_keys,
    dungeon_keys_max: max,
    last_key_regen: next_last_regen.toISOString(),
  })
}

export async function remove_xp(amount) {
  if (amount <= 0) return null

  const player = await get_player()
  let xp       = player.xp - amount
  let level    = player.level

  while (xp < 0 && level > 1) {
    level -= 1
    xp += xp_for_level(level)
  }

  xp = Math.max(0, xp)

  const new_rank  = rank_for_level(level)
  const job_class = job_class_for_level(level)
  const level_loss = Math.max(0, player.level - level)

  await db.player.update(1, {
    xp,
    xp_next_level: xp_for_level(level),
    level,
    rank: new_rank,
    job_class,
    stat_points: Math.max(0, player.stat_points - level_loss),
    last_active: new Date().toISOString(),
  })

  return {
    removed: amount,
    old_level: player.level,
    new_level: level,
    rank_changed: player.rank !== new_rank,
    old_rank: player.rank,
    new_rank,
  }
}
