import { db } from './db.js'
import {
  spend_gold,
  get_player,
  restore_hp,
  recompute_player_derived_stats,
  get_player_derived_stats,
} from './player.js'
import { get_equipped } from './equipment.js'
export { get_equipped, get_equipment_bonuses } from './equipment.js'
import { check_achievements } from './achievements.js'

// ── Rarity colors (used by UI) ───────────────────────
export const RARITY_COLORS = {
  common:    '#9ca3af',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#fbbf24',
}

// ── Master item catalog ──────────────────────────────
const ITEM_CATALOG = [

  // ── Consumables ──────────────────────────────────
  {
    catalog_id:  'potion_hp_small',
    name:        'HP Potion',
    description: 'Restore 30 HP instantly.',
    type:        'consumable',
    slot:        null,
    rarity:      'common',
    price:       50,
    icon:        '🧪',
    effect:      { type: 'restore_hp', value: 30 },
  },
  {
    catalog_id:  'potion_hp_large',
    name:        'Elixir of Vitality',
    description: 'Restore 80 HP instantly.',
    type:        'consumable',
    slot:        null,
    rarity:      'rare',
    price:       120,
    icon:        '💉',
    effect:      { type: 'restore_hp', value: 80 },
  },
  {
    catalog_id:  'xp_elixir',
    name:        'XP Elixir',
    description: 'Double XP from your next completed quest.',
    type:        'consumable',
    slot:        null,
    rarity:      'rare',
    price:       150,
    icon:        '⚗️',
    effect:      { type: 'xp_boost_next', value: 2 },
  },
  {
    catalog_id:  'penalty_shield',
    name:        'Penalty Shield',
    description: 'Grants one immunity token. Negate any single penalty.',
    type:        'consumable',
    slot:        null,
    rarity:      'epic',
    price:       200,
    icon:        '🛡️',
    effect:      { type: 'immunity_token', value: 1 },
  },
  {
    catalog_id:  'dungeon_key',
    name:        'Dungeon Key',
    description: 'Grants one extra dungeon key immediately.',
    type:        'consumable',
    slot:        null,
    rarity:      'rare',
    price:       100,
    icon:        '🗝️',
    effect:      { type: 'dungeon_key', value: 1 },
  },

  // ── Weapons ───────────────────────────────────────
  {
    catalog_id:  'iron_dagger',
    name:        'Iron Dagger',
    description: '+8% Gold from all quests.',
    type:        'equipment',
    slot:        'weapon',
    rarity:      'common',
    price:       180,
    icon:        '🗡️',
    effect:      { type: 'gold_percent', value: 8 },
    rank_required: 'E',
  },
  {
    catalog_id:  'shadow_blade',
    name:        'Shadow Blade',
    description: 'Quests completed before noon give +25% Gold.',
    type:        'equipment',
    slot:        'weapon',
    rarity:      'epic',
    price:       600,
    icon:        '⚔️',
    effect:      { type: 'gold_morning_bonus', value: 25 },
    rank_required: 'C',
  },
  {
    catalog_id:  'monarchs_edge',
    name:        "Monarch's Edge",
    description: '+20% XP and +15% Gold from all sources.',
    type:        'equipment',
    slot:        'weapon',
    rarity:      'legendary',
    price:       2000,
    icon:        '🌑',
    effect:      { type: 'xp_and_gold', xp: 20, gold: 15 },
    rank_required: 'S',
  },

  // ── Armor ─────────────────────────────────────────
  {
    catalog_id:  'hunters_vest',
    name:        "Hunter's Vest",
    description: '+25 Max HP.',
    type:        'equipment',
    slot:        'armor',
    rarity:      'common',
    price:       200,
    icon:        '🥋',
    effect:      { type: 'hp_max', value: 25 },
    rank_required: 'E',
  },
  {
    catalog_id:  'iron_will_armor',
    name:        'Iron Will Armor',
    description: '+1 Immunity Token every week.',
    type:        'equipment',
    slot:        'armor',
    rarity:      'rare',
    price:       450,
    icon:        '🛡️',
    effect:      { type: 'weekly_immunity', value: 1 },
    rank_required: 'D',
  },
  {
    catalog_id:  'shadow_shroud',
    name:        'Shadow Shroud',
    description: 'Reduce all HP penalties by 15%.',
    type:        'equipment',
    slot:        'armor',
    rarity:      'epic',
    price:       800,
    icon:        '🌑',
    effect:      { type: 'penalty_reduction', value: 15 },
    rank_required: 'B',
  },

  // ── Accessories ───────────────────────────────────
  {
    catalog_id:  'broken_compass',
    name:        'Broken Compass',
    description: '+5% XP. A stepping stone.',
    type:        'equipment',
    slot:        'accessory',
    rarity:      'common',
    price:       80,
    icon:        '🧭',
    effect:      { type: 'xp_percent', value: 5 },
    rank_required: 'E',
  },
  {
    catalog_id:  'scholars_tome',
    name:        "Scholar's Tome",
    description: '+20% XP from dungeons cleared under time limit.',
    type:        'equipment',
    slot:        'accessory',
    rarity:      'rare',
    price:       500,
    icon:        '📖',
    effect:      { type: 'dungeon_xp_speed_bonus', value: 20 },
    rank_required: 'C',
  },
  {
    catalog_id:  'berserkers_gauntlet',
    name:        "Berserker's Gauntlet",
    description: 'Streaks of 7+ days give compounding +10% XP bonus.',
    type:        'equipment',
    slot:        'accessory',
    rarity:      'epic',
    price:       700,
    icon:        '🥊',
    effect:      { type: 'streak_xp_bonus', value: 10 },
    rank_required: 'B',
  },
  {
    catalog_id:  'monarchs_cloak',
    name:        "Monarch's Cloak",
    description: 'Hidden quests appear 2× more often.',
    type:        'equipment',
    slot:        'accessory',
    rarity:      'legendary',
    price:       1500,
    icon:        '👘',
    effect:      { type: 'hidden_quest_double', value: 2 },
    rank_required: 'A',
  },
]

// ── Seed store items into db on first launch ─────────
export async function seed_store_items() {
  const count = await db.store_items.count()
  if (count > 0) return

  await db.store_items.bulkAdd(
    ITEM_CATALOG.map(item => ({ ...item }))
  )

  console.log('[store] Catalog seeded.')
}

// ── Get all store items ──────────────────────────────
export async function get_store_items(type_filter = null) {
  const player = await get_player()

  let items = await db.store_items.toArray()

  if (type_filter) {
    items = items.filter(i => i.type === type_filter)
  }

  // mark which items are affordable and rank-unlocked
  return items.map(item => ({
    ...item,
    can_afford:     player.gold >= item.price,
    rank_unlocked:  _rank_gte(player.rank, item.rank_required || 'E'),
  }))
}

// ── Get player inventory ─────────────────────────────
export async function get_inventory(type_filter = null) {
  let items = await db.inventory.toArray()
  if (type_filter) items = items.filter(i => i.type === type_filter)
  return items
}

// ── Buy item ─────────────────────────────────────────
// returns { success, error, item }
export async function buy_item(catalog_id) {
  const player = await get_player()
  const item   = ITEM_CATALOG.find(i => i.catalog_id === catalog_id)

  if (!item) return { success: false, error: 'Item not found.' }

  if (!_rank_gte(player.rank, item.rank_required || 'E')) {
    return { success: false, error: `Requires ${item.rank_required}-Rank or higher.` }
  }

  const spent = await spend_gold(item.price)
  if (!spent) {
    return { success: false, error: 'Not enough Gold.' }
  }

  // consumables: apply immediately
  if (item.type === 'consumable') {
    await _apply_consumable(item, player)
    return {
      success: true,
      item,
      applied: true,
      achievements_unlocked: await check_achievements(),
    }
  }

  // equipment: add to inventory
  const inventory_id = await db.inventory.add({
    catalog_id:  item.catalog_id,
    name:        item.name,
    description: item.description,
    type:        item.type,
    slot:        item.slot,
    rarity:      item.rarity,
    icon:        item.icon,
    effect:      item.effect,
    is_equipped: 0,
    acquired_at: new Date().toISOString(),
  })

  const equipped_in_slot = await db.inventory
    .filter(i => i.slot === item.slot && i.is_equipped === 1)
    .first()

  if (!equipped_in_slot) {
    await db.inventory.update(inventory_id, { is_equipped: 1 })
    await recompute_player_derived_stats()
    return {
      success: true,
      item,
      applied: false,
      equipped: true,
      achievements_unlocked: await check_achievements(),
    }
  }

  return {
    success: true,
    item,
    applied: false,
    equipped: false,
    achievements_unlocked: await check_achievements(),
  }
}

// ── Equip item ───────────────────────────────────────
// unequips whatever is in that slot first
export async function equip_item(inventory_id) {
  const item = await db.inventory.get(inventory_id)
  if (!item || item.type !== 'equipment') return false

  // unequip current item in same slot
  const current = await db.inventory
    .filter(i => i.slot === item.slot && i.is_equipped === 1)
    .first()

  if (current) {
    await db.inventory.update(current.id, { is_equipped: 0 })
  }

  await db.inventory.update(inventory_id, { is_equipped: 1 })
  await recompute_player_derived_stats()
  await check_achievements()
  return true
}

// ── Unequip item ─────────────────────────────────────
export async function unequip_item(inventory_id) {
  await db.inventory.update(inventory_id, { is_equipped: 0 })
  await recompute_player_derived_stats()
  await check_achievements()
}

// ════════════════════════════════════════════════════
//  PRIVATE HELPERS
// ════════════════════════════════════════════════════

async function _apply_consumable(item, player) {
  switch (item.effect.type) {
    case 'restore_hp':
      await restore_hp(item.effect.value)
      break

    case 'immunity_token':
      await db.player.update(1, {
        immunity_tokens: player.immunity_tokens + item.effect.value,
      })
      break

    case 'dungeon_key':
      {
        const derived = await get_player_derived_stats(player)
        await db.player.update(1, {
          dungeon_keys: Math.min(
            player.dungeon_keys + item.effect.value,
            derived.dungeon_keys_max + item.effect.value
          ),
          dungeon_keys_max: derived.dungeon_keys_max,
        })
      }
      break

    case 'xp_boost_next':
      // store a flag — consumed by next quest completion
      await db.player.update(1, { xp_boost_next: item.effect.value })
      break
  }
}

// rank order for comparison
const RANK_ORDER = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 }

function _rank_gte(player_rank, required_rank) {
  return RANK_ORDER[player_rank] >= RANK_ORDER[required_rank]
}
