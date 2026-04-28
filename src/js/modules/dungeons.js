import { db } from './db.js'
import {
  award_xp,
  award_gold,
  take_damage,
  get_player,
  get_stat_bonuses,
  use_immunity_token,
  recompute_player_derived_stats,
} from './player.js'
import { get_equipment_bonuses } from './equipment.js'
import { check_achievements } from './achievements.js'

// ── Rewards per rank ─────────────────────────────────
const DUNGEON_REWARDS = {
  E: { xp: 80,   gold: 40   },
  D: { xp: 160,  gold: 80   },
  C: { xp: 320,  gold: 160  },
  B: { xp: 600,  gold: 300  },
  A: { xp: 1100, gold: 550  },
  S: { xp: 2000, gold: 1000 },
}

// ── Penalties per rank ───────────────────────────────
const DUNGEON_PENALTIES = {
  E: 15,
  D: 25,
  C: 40,
  B: 65,
  A: 100,
  S: 150,
}

// ── Boss names per rank ──────────────────────────────
const BOSS_NAMES = {
  E: 'Corrupted Goblin',
  D: 'Shadow Wraith',
  C: 'Dungeon Sovereign',
  B: 'Abyssal Knight',
  A: 'Monarch\'s General',
  S: 'Architect of Shadows',
}

// ── Boss HP per rank ─────────────────────────────────
// for endurance: depletes over time
// for volume: depletes per rep
// for gauntlet: depletes per step completed
const BOSS_HP = {
  E: 100,
  D: 200,
  C: 400,
  B: 700,
  A: 1000,
  S: 1500,
}

// ── Today's date string ──────────────────────────────
function today_str() {
  return new Date().toISOString().slice(0, 10)
}

// ════════════════════════════════════════════════════
//  DUNGEON CREATION
// ════════════════════════════════════════════════════

// ── Create endurance dungeon ─────────────────────────
// duration_minutes: how long you must endure
export async function create_endurance_dungeon({
  name,
  rank             = 'E',
  duration_minutes = 25,
  description      = '',
}) {
  const id = await db.dungeons.add({
    name,
    rank,
    type:             'endurance',
    description,
    duration_minutes,
    volume_target:    null,
    volume_unit:      null,
    gauntlet_steps:   null,
    boss_name:        BOSS_NAMES[rank],
    boss_hp_max:      BOSS_HP[rank],
    status:           'idle',
    times_cleared:    0,
    times_failed:     0,
    created_at:       new Date().toISOString(),
  })
  return id
}

// ── Create volume dungeon ────────────────────────────
// volume_target: how many reps (pages, flashcards, glasses...)
// volume_unit: label shown in ui (e.g. 'pages', 'reps', 'cards')
export async function create_volume_dungeon({
  name,
  rank          = 'E',
  volume_target = 10,
  volume_unit   = 'reps',
  description   = '',
}) {
  const id = await db.dungeons.add({
    name,
    rank,
    type:             'volume',
    description,
    duration_minutes: null,
    volume_target,
    volume_unit,
    gauntlet_steps:   null,
    boss_name:        BOSS_NAMES[rank],
    boss_hp_max:      BOSS_HP[rank],
    status:           'idle',
    times_cleared:    0,
    times_failed:     0,
    created_at:       new Date().toISOString(),
  })
  return id
}

// ── Create gauntlet dungeon ──────────────────────────
// gauntlet_steps: array of { label, duration_minutes }
// total time limit is sum of all step durations
export async function create_gauntlet_dungeon({
  name,
  rank            = 'E',
  gauntlet_steps  = [],
  description     = '',
}) {
  const total_minutes = gauntlet_steps.reduce((sum, s) => sum + s.duration_minutes, 0)

  const id = await db.dungeons.add({
    name,
    rank,
    type:             'gauntlet',
    description,
    duration_minutes: total_minutes,
    volume_target:    null,
    volume_unit:      null,
    gauntlet_steps,
    boss_name:        BOSS_NAMES[rank],
    boss_hp_max:      BOSS_HP[rank],
    status:           'idle',
    times_cleared:    0,
    times_failed:     0,
    created_at:       new Date().toISOString(),
  })
  return id
}

// ════════════════════════════════════════════════════
//  DUNGEON QUERIES
// ════════════════════════════════════════════════════

export async function get_dungeons() {
  return await db.dungeons.toArray()
}

export async function get_dungeon(dungeon_id) {
  return await db.dungeons.get(dungeon_id)
}

export async function get_dungeon_runs(dungeon_id) {
  return await db.dungeon_runs
    .where('dungeon_id').equals(dungeon_id)
    .reverse()
    .toArray()
}

// ── Get shadow army ──────────────────────────────────
export async function get_shadow_army() {
  return await db.shadow_army.toArray()
}

// ── Get active dungeon run today ─────────────────────
export async function get_active_run() {
  const runs = await db.dungeon_runs
    .filter(r => r.outcome === 'active')
    .toArray()
  return runs[0] || null
}

// ════════════════════════════════════════════════════
//  DUNGEON RUN LIFECYCLE
// ════════════════════════════════════════════════════

// ── Enter dungeon ────────────────────────────────────
// returns { run_id, error } — error if no keys or already in run
export async function enter_dungeon(dungeon_id) {
  const player  = await get_player()
  const bonuses = get_stat_bonuses(player)

  // check for active run
  const active = await get_active_run()
  if (active) {
    return { run_id: null, error: 'Already inside a gate. Abandon or complete it first.' }
  }

  // check dungeon keys
  if (player.dungeon_keys < 1) {
    return { run_id: null, error: 'No dungeon keys remaining. Keys regenerate over time.' }
  }

  const dungeon = await db.dungeons.get(dungeon_id)
  if (!dungeon) return { run_id: null, error: 'Dungeon not found.' }

  // consume one key
  await db.player.update(1, {
    dungeon_keys: player.dungeon_keys - 1,
  })

  console.log(`[dungeon] Gate entered. End time: ${new Date(Date.now() + dungeon.duration_minutes * 60 * 1000).toLocaleTimeString()}`)

  // create run record
  const run_id = await db.dungeon_runs.add({
    dungeon_id,
    outcome:          'active',
    date:             today_str(),
    started_at:       new Date().toISOString(),
    ended_at:         null,

    // endurance
    end_time:         dungeon.type === 'endurance'
      ? new Date(Date.now() + dungeon.duration_minutes * 60 * 1000).toISOString()
      : null,

    // volume
    volume_progress:  0,

    // gauntlet
    current_step:     0,
    step_end_time:    dungeon.type === 'gauntlet' && dungeon.gauntlet_steps.length > 0
      ? new Date(Date.now() + dungeon.gauntlet_steps[0].duration_minutes * 60 * 1000).toISOString()
      : null,

    // boss
    boss_hp:          dungeon.boss_hp_max,
    boss_hp_max:      dungeon.boss_hp_max,
  })

  await db.dungeons.update(dungeon_id, { status: 'active' })

  return { run_id, error: null }
}

// ── Tick endurance dungeon ───────────────────────────
// call every second from the screen timer
// returns { boss_hp, time_remaining_ms, cleared }
export async function tick_endurance(run_id) {
  const run = await db.dungeon_runs.get(run_id)
  if (!run || run.outcome !== 'active') return null

  const now            = Date.now()
  const end_time       = new Date(run.end_time).getTime()
  const time_remaining = Math.max(0, end_time - now)

  const dungeon   = await db.dungeons.get(run.dungeon_id)
  if (!dungeon) return null

  const total_ms  = dungeon.duration_minutes * 60 * 1000
  const elapsed   = total_ms - time_remaining
  const boss_hp   = Math.max(0, Math.floor(dungeon.boss_hp_max * (1 - elapsed / total_ms)))

  await db.dungeon_runs.update(run_id, { boss_hp })

  return {
    boss_hp,
    time_remaining_ms: time_remaining,
    cleared: time_remaining <= 0,
  }
}

// ── Log volume rep ───────────────────────────────────
// returns { boss_hp, volume_progress, cleared }
export async function log_volume_rep(run_id, reps = 1) {
  const run = await db.dungeon_runs.get(run_id)
  if (!run || run.outcome !== 'active') return null

  const dungeon = await db.dungeons.get(run.dungeon_id)
  if (!dungeon) return null

  const new_progress = run.volume_progress + reps
  const boss_hp      = Math.max(0, Math.floor(
    dungeon.boss_hp_max * (1 - new_progress / dungeon.volume_target)
  ))
  const cleared      = new_progress >= dungeon.volume_target

  await db.dungeon_runs.update(run_id, {
    volume_progress: new_progress,
    boss_hp,
  })

  return { boss_hp, volume_progress: new_progress, cleared }
}

// ── Complete gauntlet step ───────────────────────────
// returns { boss_hp, current_step, cleared, step_failed }
export async function complete_gauntlet_step(run_id) {
  const run = await db.dungeon_runs.get(run_id)
  if (!run || run.outcome !== 'active') return null

  const dungeon = await db.dungeons.get(run.dungeon_id)
  if (!dungeon) return null

  const steps       = dungeon.gauntlet_steps
  const now         = Date.now()
  const step_end    = new Date(run.step_end_time).getTime()
  const step_failed = now > step_end

  // even if step failed, we advance (with reduced boss damage)
  const next_step   = run.current_step + 1
  const cleared     = next_step >= steps.length

  const damage_fraction = step_failed ? 0.5 : 1
  const boss_hp = Math.max(0, Math.floor(
    run.boss_hp - (dungeon.boss_hp_max / steps.length) * damage_fraction
  ))

  const updates = {
    current_step: next_step,
    boss_hp,
  }

  if (!cleared && steps[next_step]) {
    updates.step_end_time = new Date(
      Date.now() + steps[next_step].duration_minutes * 60 * 1000
    ).toISOString()
  }

  await db.dungeon_runs.update(run_id, updates)

  return { boss_hp, current_step: next_step, cleared, step_failed }
}

// ════════════════════════════════════════════════════
//  DUNGEON OUTCOME
// ════════════════════════════════════════════════════

// ── Clear dungeon ────────────────────────────────────
// returns { reward_xp, reward_gold, shadow_extracted, xp_result }
export async function clear_dungeon(run_id) {
  const run = await db.dungeon_runs.get(run_id)
  if (!run || run.outcome !== 'active') return null

  const dungeon = await db.dungeons.get(run.dungeon_id)
  if (!dungeon) return null

  await db.dungeon_runs.update(run_id, {
    outcome:  'cleared',
    ended_at: new Date().toISOString(),
    boss_hp:  0,
  })

  await db.dungeons.update(dungeon.id, {
    status:        'idle',
    times_cleared: dungeon.times_cleared + 1,
  })

  const time_bonus        = _check_time_bonus(run, dungeon)
  const shadow_multiplier = await get_shadow_army_multiplier()

  const base     = DUNGEON_REWARDS[dungeon.rank]
  const xp_amt   = Math.floor(
    base.xp * (time_bonus ? 1.5 : 1) * shadow_multiplier.xp_multiplier
  )
  const gold_amt = Math.floor(
    base.gold * (time_bonus ? 1.5 : 1) * shadow_multiplier.gold_multiplier
  )

  const xp_result   = await award_xp(xp_amt, {
    source: 'dungeon',
    time_bonus,
  })
  const gold_gained = await award_gold(gold_amt)

  // SEN: chance to extract a shadow soldier
  const player  = await get_player()
  const bonuses = get_stat_bonuses(player)

  // apply monarch's cloak doubling if equipped
  const eq_bonuses    = await get_equipment_bonuses()
  const hidden_chance = eq_bonuses.hidden_quest_double
    ? bonuses.hidden_quest_chance * 2
    : bonuses.hidden_quest_chance

  const shadow_roll      = Math.random() * 100
  let   shadow_extracted = false

  if (shadow_roll < hidden_chance || dungeon.rank === 'S') {
    shadow_extracted = true
    await _extract_shadow(dungeon)
    await recompute_player_derived_stats()
  }

  return {
    reward_xp:        xp_result.gained,
    reward_gold:      gold_gained,
    time_bonus,
    shadow_extracted,
    shadow_army_bonus: shadow_multiplier.xp_multiplier > 1 || shadow_multiplier.gold_multiplier > 1,
    xp_result,
    achievements_unlocked: await check_achievements(),
  }
}

// ── Fail / abandon dungeon ───────────────────────────
export async function fail_dungeon(run_id) {
  const run = await db.dungeon_runs.get(run_id)
  if (!run || run.outcome !== 'active') return null

  const dungeon = await db.dungeons.get(run.dungeon_id)
  if (!dungeon) return null

  await db.dungeon_runs.update(run_id, {
    outcome:  'failed',
    ended_at: new Date().toISOString(),
  })

  await db.dungeons.update(dungeon.id, {
    status:       'idle',
    times_failed: dungeon.times_failed + 1,
  })

  const had_immunity = await use_immunity_token()
  if (had_immunity) {
    return {
      damage_taken: 0,
      used_immunity: true,
      achievements_unlocked: await check_achievements(),
    }
  }

  const result = await take_damage(DUNGEON_PENALTIES[dungeon.rank])

  await db.penalty_log.add({
    date:        today_str(),
    source_type: 'dungeon',
    source_id:   dungeon.id,
    hp_lost:     result.damage_taken,
  })

  return {
    damage_taken: result.damage_taken,
    new_hp:       result.new_hp,
    used_immunity: false,
    achievements_unlocked: await check_achievements(),
  }
}

// ════════════════════════════════════════════════════
//  PRIVATE HELPERS
// ════════════════════════════════════════════════════

function _check_time_bonus(run, dungeon) {
  if (!dungeon.duration_minutes) return false
  const started  = new Date(run.started_at).getTime()
  const ended    = Date.now()
  const elapsed  = (ended - started) / 1000 / 60
  // cleared in under 80% of allowed time
  return elapsed < dungeon.duration_minutes * 0.8
}

async function _extract_shadow(dungeon) {
  const buff_types = ['xp_boost', 'gold_boost', 'hp_boost', 'key_regen']
  const buff_type  = buff_types[Math.floor(Math.random() * buff_types.length)]

  await db.shadow_army.add({
    dungeon_id:  dungeon.id,
    dungeon_name: dungeon.name,
    buff_type,
    buff_value:  _buff_value_for_rank(dungeon.rank, buff_type),
    extracted_at: new Date().toISOString(),
  })
}

function _buff_value_for_rank(rank, buff_type) {
  const base = { E: 2, D: 4, C: 7, B: 12, A: 18, S: 25 }
  return base[rank]
}

// ── Apply shadow army buffs to a reward ─────────────
// call this when computing final xp/gold in clear_dungeon
export async function get_shadow_army_multiplier() {
  const army = await db.shadow_army.toArray()

  let xp_bonus   = 0
  let gold_bonus = 0

  for (const shadow of army) {
    if (shadow.buff_type === 'xp_boost')  xp_bonus   += shadow.buff_value
    if (shadow.buff_type === 'gold_boost') gold_bonus += shadow.buff_value
  }

  return {
    xp_multiplier:   1 + xp_bonus   / 100,
    gold_multiplier: 1 + gold_bonus / 100,
  }
}
