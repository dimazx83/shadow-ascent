import { db } from './db.js'

// ── Get equipped items ───────────────────────────────
export async function get_equipped() {
  return await db.inventory
    .where('is_equipped').equals(1)
    .toArray()
}

// ── Get active equipment bonuses ─────────────────────
// returns flat bonus object used by player/quest logic
export async function get_equipment_bonuses() {
  const equipped = await get_equipped()

  const bonuses = {
    gold_percent:           0,
    xp_percent:             0,
    hp_max_bonus:           0,
    penalty_reduction:      0,
    gold_morning_bonus:     0,
    dungeon_xp_speed_bonus: 0,
    streak_xp_bonus:        0,
    hidden_quest_double:    false,
    weekly_immunity:        0,
  }

  for (const item of equipped) {
    const e = item.effect
    if (!e) continue

    switch (e.type) {
      case 'gold_percent':             bonuses.gold_percent           += e.value; break
      case 'xp_percent':               bonuses.xp_percent             += e.value; break
      case 'hp_max':                   bonuses.hp_max_bonus           += e.value; break
      case 'penalty_reduction':        bonuses.penalty_reduction      += e.value; break
      case 'gold_morning_bonus':       bonuses.gold_morning_bonus     += e.value; break
      case 'dungeon_xp_speed_bonus':   bonuses.dungeon_xp_speed_bonus += e.value; break
      case 'streak_xp_bonus':          bonuses.streak_xp_bonus        += e.value; break
      case 'hidden_quest_double':      bonuses.hidden_quest_double     = true;     break
      case 'weekly_immunity':          bonuses.weekly_immunity        += e.value;  break
      case 'xp_and_gold':
        bonuses.xp_percent   += e.xp
        bonuses.gold_percent += e.gold
        break
    }
  }

  return bonuses
}
