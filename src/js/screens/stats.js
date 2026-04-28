import { reset_all_data } from '../modules/db.js'
import { get_player, spend_stat_point, get_stat_bonuses, get_player_derived_stats } from '../modules/player.js'
import { get_penalty_summary, get_debuff_status } from '../modules/penalties.js'
import { get_equipped } from '../modules/equipment.js'
import { get_shadow_army } from '../modules/dungeons.js'
import { seed_store_items } from '../modules/store.js'
import { get_achievements, seed_achievements, check_achievements } from '../modules/achievements.js'
import { get_daily_quests } from '../modules/quests.js'
import {
  enable_notifications,
  notification_support_status,
  send_test_notification,
  setup_notification_schedules,
} from '../modules/notifications.js'
import { haptic_success, haptic_warning } from '../modules/haptics.js'

// ── Rank colors ──────────────────────────────────────
const RANK_COLORS = {
  E: 'var(--rank-e)',
  D: 'var(--rank-d)',
  C: 'var(--rank-c)',
  B: 'var(--rank-b)',
  A: 'var(--rank-a)',
  S: 'var(--rank-s)',
}

const STAT_INFO = {
  str: { label: 'STR', full: 'Strength',     icon: '/art/stats/str.svg', desc: '+3% Gold per point'         },
  int: { label: 'INT', full: 'Intelligence', icon: '/art/stats/int.svg', desc: '+3% XP per point'            },
  agi: { label: 'AGI', full: 'Agility',      icon: '/art/stats/agi.svg', desc: '-2% Penalty damage per point' },
  vit: { label: 'VIT', full: 'Vitality',     icon: '/art/stats/vit.svg', desc: '+20 Max HP per point'        },
  sen: { label: 'SEN', full: 'Sense',        icon: '/art/stats/sen.svg', desc: '+5% Hidden quest chance'     },
}

// ── Main render ──────────────────────────────────────
export async function render_stats() {
  const el = document.getElementById('screen_stats')
  if (!el) return

  await check_achievements()

  const [player, penalty_summary, debuff, equipped, shadow_army, achievements] = await Promise.all([
    get_player(),
    get_penalty_summary(),
    get_debuff_status(),
    get_equipped(),
    get_shadow_army(),
    get_achievements(),
  ])

  const derived      = await get_player_derived_stats(player)
  const bonuses      = derived.stat_bonuses
  const eq_bonuses   = derived.equipment_bonuses
  const shadow_bonuses = derived.shadow_bonuses
  const rank_color   = RANK_COLORS[player.rank]
  const xp_pct       = Math.floor((player.xp / player.xp_next_level) * 100)
  const hp_pct       = Math.floor((player.hp / player.hp_max) * 100)
  const effective_xp_multiplier = bonuses.xp_multiplier
    * (1 + eq_bonuses.xp_percent / 100)
    * (debuff.debuffed ? 0.7 : 1)
  const effective_gold_multiplier = bonuses.gold_multiplier
    * (1 + eq_bonuses.gold_percent / 100)
  const effective_penalty_reduction = Math.min(
    90,
    Math.floor((bonuses.penalty_reduction + eq_bonuses.penalty_reduction / 100) * 100)
  )
  const effective_hidden_chance = bonuses.hidden_quest_chance
    * (eq_bonuses.hidden_quest_double ? 2 : 1)
  const unlocked_achievements = achievements.filter(a => a.unlocked_at)

  el.innerHTML = `
    <div class="screen_header">
      <h1 class="screen_title">
        <img class="screen_title_icon" src="/art/tabs/stats.svg" alt="" aria-hidden="true">
        <span>Hunter</span> Profile
      </h1>
      ${debuff.debuffed ? `<span class="debuff_badge">DEBUFFED</span>` : ''}
    </div>

    <div class="scroll_area">

      <!-- Identity card -->
      <div class="system_panel identity_card">
        <div class="identity_top">
          <div class="avatar_wrap">
            <img class="avatar_img" src="/art/avatar_hunter_512.webp" alt="Hunter avatar">
          </div>
          <div class="identity_info">
            <div class="hunter_name">${player.name}</div>
            <div class="job_class">${player.job_class}</div>
            <div class="rank_line">
              <img class="rank_emblem" src="/art/ranks/rank_${player.rank.toLowerCase()}.svg" alt="${player.rank}-Rank emblem">
              <div class="rank_badge" style="color:${rank_color}; border-color:${rank_color}">
                ${player.rank}-RANK
              </div>
            </div>
          </div>
         <div class="level_display">
            <div class="level_num">LV. ${player.level}</div>
            <div class="level_label">/ ${player.xp_next_level} XP</div>
          </div>
        </div>

        <!-- XP bar -->
        <div class="bar_wrap">
          <div class="bar_label">
            <span class="text_blue">XP</span>
            <span class="text_mono text_muted">${player.xp} / ${player.xp_next_level}</span>
          </div>
          <div class="bar_track">
            <div class="bar_fill bar_xp" style="width:${xp_pct}%"></div>
          </div>
        </div>

        <!-- HP bar -->
        <div class="bar_wrap">
          <div class="bar_label">
            <span class="text_red">HP</span>
            <span class="text_mono text_muted">${player.hp} / ${player.hp_max}</span>
          </div>
          <div class="bar_track">
            <div class="bar_fill bar_hp" style="width:${hp_pct}%; background: ${hp_pct < 25 ? 'var(--hp-red)' : hp_pct < 60 ? 'var(--gold)' : 'var(--xp-green)'}"></div>
          </div>
        </div>

        <!-- Resources row -->
        <div class="resources_row">
          <div class="resource_item">
            <span class="resource_icon">💰</span>
            <span class="resource_val text_gold text_mono">${player.gold}</span>
            <span class="resource_label">GOLD</span>
          </div>
          <div class="resource_item">
            <span class="resource_icon">🗝️</span>
            <span class="resource_val text_blue text_mono">${player.dungeon_keys}</span>
            <span class="resource_label">KEYS</span>
          </div>
          <div class="resource_item">
            <span class="resource_icon">🛡️</span>
            <span class="resource_val text_purple text_mono">${player.immunity_tokens}</span>
            <span class="resource_label">SHIELDS</span>
          </div>
          <div class="resource_item">
            <span class="resource_icon">⭐</span>
            <span class="resource_val text_mono" style="color:var(--rank-s)">${player.stat_points}</span>
            <span class="resource_label">POINTS</span>
          </div>
        </div>
      </div>

      <!-- Attributes -->
      <div class="system_panel">
        <div class="panel_title">Attributes
          ${player.stat_points > 0
            ? `<span class="points_available">${player.stat_points} pts available</span>`
            : ''}
        </div>
        <div class="stats_grid">
          ${Object.entries(STAT_INFO).map(([key, info]) => `
            <div class="stat_col">
              <img class="stat_icon" src="${info.icon}" alt="" aria-hidden="true">
              <span class="stat_label">${info.label}</span>
              <span class="stat_val" style="color:${_stat_color(key)}">${player[key]}</span>
              <span class="stat_desc_tooltip">${info.desc}</span>
              ${player.stat_points > 0
                ? `<button class="stat_up_btn" data-stat="${key}">+</button>`
                : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Active bonuses -->
      <div class="system_panel">
        <div class="panel_title">ACTIVE BONUSES</div>
        <div class="bonus_list">
          <div class="bonus_row">
            <span class="text_muted">XP Multiplier</span>
            <span class="text_blue text_mono">×${effective_xp_multiplier.toFixed(2)}</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">Gold Multiplier</span>
            <span class="text_gold text_mono">×${effective_gold_multiplier.toFixed(2)}</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">Penalty Reduction</span>
            <span class="text_purple text_mono">${effective_penalty_reduction}%</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">Hidden Quest Chance</span>
            <span class="text_mono" style="color:var(--rank-a)">${effective_hidden_chance}%</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">Dungeon Keys Max</span>
            <span class="text_blue text_mono">${derived.dungeon_keys_max}</span>
          </div>
          ${shadow_bonuses.key_regen_percent > 0 ? `
          <div class="bonus_row">
            <span class="text_muted">Shadow Key Regen</span>
            <span class="text_blue text_mono">+${shadow_bonuses.key_regen_percent}%</span>
          </div>` : ''}
          ${shadow_bonuses.hp_max_bonus > 0 ? `
          <div class="bonus_row">
            <span class="text_muted">Shadow HP Bonus</span>
            <span class="text_red text_mono">+${shadow_bonuses.hp_max_bonus}</span>
          </div>
          ` : ''}
          ${eq_bonuses.hp_max_bonus > 0 ? `
          <div class="bonus_row">
            <span class="text_muted">Equipment HP Bonus</span>
            <span class="text_red text_mono">+${eq_bonuses.hp_max_bonus}</span>
          </div>` : ''}
          ${eq_bonuses.gold_percent > 0 ? `
          <div class="bonus_row">
            <span class="text_muted">Equipment Gold Bonus</span>
            <span class="text_gold text_mono">+${eq_bonuses.gold_percent}%</span>
          </div>` : ''}
          ${eq_bonuses.xp_percent > 0 ? `
          <div class="bonus_row">
            <span class="text_muted">Equipment XP Bonus</span>
            <span class="text_blue text_mono">+${eq_bonuses.xp_percent}%</span>
          </div>` : ''}
          ${debuff.debuffed ? `
          <div class="bonus_row">
            <span class="text_muted">Debuff XP Penalty</span>
            <span class="text_red text_mono">-30%</span>
          </div>` : ''}
        </div>
      </div>

      <!-- Equipped gear -->
      <div class="system_panel">
        <div class="panel_title">EQUIPPED GEAR</div>
        ${equipped.length === 0
          ? `<div class="text_muted" style="font-size:13px;padding:8px 0">No gear equipped. Visit the Store.</div>`
          : `<div class="gear_list">
              ${equipped.map(item => `
                <div class="gear_row">
                  <span class="gear_icon">${item.icon}</span>
                  <div class="gear_info">
                    <span class="gear_name" style="color:${_rarity_color(item.rarity)}">${item.name}</span>
                    <span class="gear_desc text_muted">${item.description}</span>
                  </div>
                  <span class="gear_slot text_muted">${item.slot}</span>
                </div>
              `).join('')}
            </div>`
        }
      </div>

      <!-- Shadow army -->
      <div class="system_panel">
        <div class="panel_title">SHADOW ARMY
          <span class="text_muted text_mono" style="font-size:12px">${shadow_army.length} soldiers</span>
        </div>
        ${shadow_army.length === 0
          ? `<div class="text_muted" style="font-size:13px;padding:8px 0">No shadows extracted yet. Clear dungeons to build your army.</div>`
          : `<div class="shadow_list">
              ${shadow_army.map(s => `
                <div class="shadow_row">
                  <span class="shadow_icon">👥</span>
                  <div class="shadow_info">
                    <span class="shadow_source">${s.dungeon_name}</span>
                    <span class="shadow_buff text_muted">${_buff_label(s.buff_type, s.buff_value)}</span>
                  </div>
                </div>
              `).join('')}
            </div>`
        }
      </div>

      <!-- Achievements -->
      <div class="system_panel">
        <div class="panel_title">ACHIEVEMENTS
          <span class="text_muted text_mono" style="font-size:12px">
            ${unlocked_achievements.length} / ${achievements.length}
          </span>
        </div>
        <div class="achievement_list">
          ${achievements.map(a => render_achievement_row(a)).join('')}
        </div>
      </div>

      <!-- Penalty summary -->
      <div class="system_panel">
        <div class="panel_title">PENALTY LOG</div>
        <div class="bonus_list">
          <div class="bonus_row">
            <span class="text_muted">HP Lost Today</span>
            <span class="text_red text_mono">${penalty_summary.today_total}</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">HP Lost This Week</span>
            <span class="text_red text_mono">${penalty_summary.week_total}</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">From Missed Dailies</span>
            <span class="text_mono">${penalty_summary.by_source.daily_quest}</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">From Abandoned Quests</span>
            <span class="text_mono">${penalty_summary.by_source.system_quest}</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">From Bad Habits</span>
            <span class="text_mono">${penalty_summary.by_source.habit}</span>
          </div>
          <div class="bonus_row">
            <span class="text_muted">From Failed Dungeons</span>
            <span class="text_mono">${penalty_summary.by_source.dungeon}</span>
          </div>
        </div>
      </div>

      <!-- Notifications -->
      <div class="system_panel">
        <div class="panel_title">NOTIFICATIONS</div>
        ${render_notification_panel()}
      </div>

      <!-- Danger zone -->
      <div class="system_panel danger_panel">
        <div class="panel_title" style="color:var(--hp-red)">DANGER ZONE</div>
        <div class="text_muted" style="font-size:12px;margin-bottom:12px;line-height:1.5">
          Resets all progress, stats, quests, and inventory. This cannot be undone.
        </div>
        <button class="btn_danger" id="reset_btn">⚠️ RESET ALL DATA</button>
      </div>

    </div>
  `

  // stat point buttons
  el.querySelectorAll('.stat_up_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stat = btn.dataset.stat
      const ok   = await spend_stat_point(stat)
      if (ok) {
        haptic_success()
        render_stats()
      }
    })
  })

  // reset button
  el.querySelector('#reset_btn')?.addEventListener('click', async () => {
    const confirmed = window.confirm(
      'Are you sure? All progress, levels, quests, gold and inventory will be permanently deleted.'
    )
    if (!confirmed) return

    const double_confirmed = window.confirm(
      'Last warning. This cannot be undone. Reset everything?'
    )
    if (!double_confirmed) return

    await reset_all_data()
    // re-seed store after reset
    await seed_store_items()
    await seed_achievements()
    haptic_warning()
    await render_stats()
  })

  el.querySelector('#enable_notifications_btn')?.addEventListener('click', async () => {
    const btn = el.querySelector('#enable_notifications_btn')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'REQUESTING...'
    }

    const daily_quests = await get_daily_quests()
    const incomplete_count = daily_quests.filter(q => q.completions_today < q.repeat_count).length
    const permission = await enable_notifications(player, incomplete_count)

    if (permission === 'granted') {
      haptic_success()
    } else {
      haptic_warning()
    }

    render_stats()
  })

  el.querySelector('#refresh_notifications_btn')?.addEventListener('click', async () => {
    const daily_quests = await get_daily_quests()
    const incomplete_count = daily_quests.filter(q => q.completions_today < q.repeat_count).length
    await setup_notification_schedules(player, incomplete_count)
    haptic_success()
    render_stats()
  })

  el.querySelector('#test_notification_btn')?.addEventListener('click', () => {
    send_test_notification()
    haptic_success()
  })
}

function render_notification_panel() {
  const status = notification_support_status()

  if (status === 'unsupported') {
    return `
      <div class="notification_status text_muted">
        Notifications are not supported in this browser.
      </div>
    `
  }

  if (status === 'requires_install') {
    return `
      <div class="notification_status text_muted">
        Install Shadow Ascent to the Home Screen, then open it from the app icon to enable notifications.
      </div>
    `
  }

  if (status === 'insecure_context') {
    return `
      <div class="notification_status text_muted">
        Notifications require a secure HTTPS origin on iPhone. Local network URLs like http://192.168.x.x cannot show the iOS permission prompt.
      </div>
    `
  }

  if (status === 'service_worker_unsupported') {
    return `
      <div class="notification_status text_muted">
        Notifications require Service Worker support in this browser.
      </div>
    `
  }

  if (status === 'denied') {
    return `
      <div class="notification_status text_muted">
        Notifications are blocked for this installed app. Delete and re-add the Home Screen app, or check iOS Settings after permission has been requested.
      </div>
    `
  }

  if (status === 'granted') {
    return `
      <div class="notification_status text_muted">
        Notifications enabled. Reminders are scheduled while the app is running.
      </div>
      <button class="btn_secondary" id="refresh_notifications_btn">REFRESH SCHEDULES</button>
      <button class="btn_secondary" id="test_notification_btn">TEST NOTIFICATION</button>
    `
  }

  return `
    <div class="notification_status text_muted">
      Enable reminders for daily quests, penalty warnings, dungeon keys, and level-ups.
    </div>
    <button class="btn_primary" id="enable_notifications_btn">ENABLE NOTIFICATIONS</button>
  `
}

// ── Helpers ──────────────────────────────────────────
function _rarity_color(rarity) {
  const map = {
    common:    'var(--rank-e)',
    rare:      'var(--rank-c)',
    epic:      'var(--rank-b)',
    legendary: 'var(--rank-a)',
  }
  return map[rarity] || 'var(--text-primary)'
}

function _buff_label(buff_type, buff_value) {
  const map = {
    xp_boost:   `+${buff_value}% XP`,
    gold_boost: `+${buff_value}% Gold`,
    hp_boost:   `+${buff_value} HP`,
    key_regen:  `+${buff_value}% Key regen`,
  }
  return map[buff_type] || buff_type
}

function _stat_color(stat) {
  const map = {
    str: 'var(--hp-red)',
    int: 'var(--blue)',
    agi: 'var(--xp-green)',
    vit: 'var(--gold)',
    sen: 'var(--purple)',
  }
  return map[stat] || 'var(--text-primary)'
}

function render_achievement_row(achievement) {
  const unlocked = Boolean(achievement.unlocked_at)
  const date = unlocked
    ? new Date(achievement.unlocked_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    : 'LOCKED'

  return `
    <div class="achievement_row ${unlocked ? 'achievement_unlocked' : 'achievement_locked'}">
      <span class="achievement_icon">${achievement.icon}</span>
      <div class="achievement_info">
        <span class="achievement_name">${achievement.name}</span>
        <span class="achievement_desc text_muted">${achievement.description}</span>
      </div>
      <span class="achievement_status text_mono">${date}</span>
    </div>
  `
}
