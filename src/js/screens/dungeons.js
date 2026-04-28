import {
  get_dungeons,
  get_dungeon,
  get_active_run,
  create_endurance_dungeon,
  create_volume_dungeon,
  create_gauntlet_dungeon,
  enter_dungeon,
  tick_endurance,
  log_volume_rep,
  complete_gauntlet_step,
  clear_dungeon,
  fail_dungeon,
} from '../modules/dungeons.js'
import { get_player } from '../modules/player.js'
import { notify_level_up } from '../modules/notifications.js'
import { db } from '../modules/db.js'
import { setup_keyboard_dismiss } from '../modules/utils.js'
import { haptic_error, haptic_level_up, haptic_success, haptic_tap, haptic_warning } from '../modules/haptics.js'

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S']
const RANK_COLORS = {
  E: 'var(--rank-e)', D: 'var(--rank-d)', C: 'var(--rank-c)',
  B: 'var(--rank-b)', A: 'var(--rank-a)', S: 'var(--rank-s)',
}

const TYPE_INFO = {
  endurance: { icon: '⏱️', label: 'Endurance', desc: 'Survive the full duration' },
  volume: { icon: '🔢', label: 'Volume', desc: 'Hit your rep target' },
  gauntlet: { icon: '⚔️', label: 'Gauntlet', desc: 'Clear every step in time' },
}

// active run timer reference
let _timer_interval = null

// ── Main render ──────────────────────────────────────
export async function render_dungeons() {
  const el = document.getElementById('screen_dungeons')
  if (!el) return

  const [dungeons, player, active_run] = await Promise.all([
    get_dungeons(),
    get_player(),
    get_active_run(),
  ])

  el.innerHTML = `
    <div class="screen_header">
      <div>
        <h1 class="screen_title">🏰 <span>Dungeons</span></h1>
        <div class="date_str text_muted">
          🗝️ ${player.dungeon_keys} keys remaining
        </div>
      </div>
      <button class="add_btn" id="dung_add_btn">＋</button>
    </div>

    <!-- active run panel -->
    <div id="active_run_panel">
      ${active_run ? await render_active_run(active_run) : ''}
    </div>

    <div class="scroll_area" id="dung_list">
      ${dungeons.length === 0
      ? `<div class="empty_state">
             <div class="empty_icon">🏰</div>
             <div>No gates created yet.<br>Build your first dungeon to begin raiding.</div>
             <button class="btn_primary" id="dung_empty_add">Create First Gate</button>
           </div>`
      : dungeons.map(d => render_dungeon_card(d, active_run, player)).join('')
    }
    </div>

    ${render_create_modal()}
  `

  attach_dungeon_events(el, active_run)

  // restart timer if there's an active run
  // only start timer for endurance dungeons
  if (active_run) {
    const active_dungeon = await get_dungeon(active_run.dungeon_id)
    if (active_dungeon?.type === 'endurance') {
      start_run_timer(el, active_run)
    } else if (active_dungeon?.type === 'gauntlet') {
      start_step_timer(el, active_run)
    }
    // volume has no timer — player taps manually
  }
}

// ── Gauntlet step timer ──────────────────────────────
function start_step_timer(el, run) {
  stop_run_timer()

  _timer_interval = setInterval(() => {
    const step_end = run.step_end_time
      ? new Date(run.step_end_time).getTime()
      : null

    if (!step_end) {
      stop_run_timer()
      return
    }

    const remaining = Math.max(0, step_end - Date.now())
    const timer_el  = el.querySelector('#run_timer')
    if (timer_el) timer_el.textContent = format_ms(remaining)

    // step timer ran out — warn but don't auto-complete
    // player must tap COMPLETE STEP manually
    if (remaining <= 0) {
      stop_run_timer()
      if (timer_el) {
        timer_el.textContent = '00:00'
        timer_el.style.color = 'var(--hp-red)'
      }
    }
  }, 1000)
}

// ── Active run panel ─────────────────────────────────
async function render_active_run(run) {
  const dungeon = await get_dungeon(run.dungeon_id)
  if (!dungeon) return ''

  const type = dungeon.type
  const hp_pct = Math.floor((run.boss_hp / run.boss_hp_max) * 100)
  const type_info = TYPE_INFO[type]

  let run_controls = ''

  if (type === 'endurance') {
    const end_ms = new Date(run.end_time).getTime()
    const remaining = Math.max(0, end_ms - Date.now())
    run_controls = `
      <div class="run_timer text_mono" id="run_timer">
        ${format_ms(remaining)}
      </div>
      <div class="run_hint text_muted">Stay focused. Don't abandon the gate.</div>
    `
  }

  if (type === 'volume') {
    run_controls = `
      <div class="run_volume_display">
        <span class="run_vol_num text_mono">${run.volume_progress}</span>
        <span class="text_muted"> / ${dungeon.volume_target} ${dungeon.volume_unit}</span>
      </div>
      <button class="btn_primary" id="vol_rep_btn" style="margin-top:10px">
        ＋ LOG REP
      </button>
    `
  }

  if (type === 'gauntlet') {
    const steps = dungeon.gauntlet_steps
    const curr_step = steps[run.current_step]
    const step_end = run.step_end_time ? new Date(run.step_end_time).getTime() : null
    const step_remaining = step_end ? Math.max(0, step_end - Date.now()) : 0

    run_controls = `
      <div class="gauntlet_step_info">
        <div class="gauntlet_step_num text_muted">
          STEP ${run.current_step + 1} / ${steps.length}
        </div>
        <div class="gauntlet_step_name">${curr_step?.label || 'Complete'}</div>
        <div class="run_timer text_mono" id="run_timer">${format_ms(step_remaining)}</div>
      </div>
      <button class="btn_primary" id="gauntlet_step_btn" style="margin-top:10px">
        ✓ COMPLETE STEP
      </button>
    `
  }

  return `
    <div class="active_run_panel system_panel" style="border-color:var(--rank-s);margin-bottom:12px">
      <div class="panel_title" style="color:var(--rank-s)">Gate Active</div>

      <div class="active_run_header">
        <div>
          <div class="active_run_name">${dungeon.name}</div>
          <div class="active_run_type text_muted">${type_info.icon} ${type_info.label}</div>
        </div>
        <div class="active_run_rank" style="color:${RANK_COLORS[dungeon.rank]}">
          ${dungeon.rank}-RANK
        </div>
      </div>

      <!-- boss hp -->
      <div class="boss_section">
        <div class="boss_name text_muted">${dungeon.boss_name}</div>
        <div class="boss_hp_label">
          <span class="text_red">HP</span>
          <span class="text_mono text_muted">${run.boss_hp} / ${run.boss_hp_max}</span>
        </div>
        <div class="bar_track" style="height:10px;margin-top:4px">
          <div class="bar_fill"
            id="boss_hp_bar"
            style="width:${hp_pct}%;background:${hp_pct > 50 ? 'var(--hp-red)' : hp_pct > 25 ? 'var(--gold)' : 'var(--purple)'}">
          </div>
        </div>
      </div>

      ${run_controls}

      <button class="dung_abandon_btn" id="run_abandon_btn" style="margin-top:12px">
        ⚠ ABANDON GATE
      </button>
    </div>
  `
}

// ── Dungeon card ─────────────────────────────────────
function render_dungeon_card(d, active_run, player) {
  const rank_color = RANK_COLORS[d.rank]
  const type_info = TYPE_INFO[d.type]
  const has_active = !!active_run
  const no_keys = player.dungeon_keys < 1
  const is_active = active_run?.dungeon_id === d.id
  const can_enter = !has_active && !no_keys

  let detail = ''
  if (d.type === 'endurance') detail = `${d.duration_minutes} min`
  if (d.type === 'volume') detail = `${d.volume_target} ${d.volume_unit}`
  if (d.type === 'gauntlet') detail = `${d.gauntlet_steps?.length || 0} steps`

  return `
    <div class="dung_card ${is_active ? 'dung_card_active' : ''}">
      <div class="quest_rank_stripe" style="background:${rank_color}"></div>

      <div class="dung_body">
        <div class="dung_top_row">
          <div class="dung_type_icon">${type_info.icon}</div>
          <div class="dung_info">
            <div class="dung_name">${d.name}</div>
            <div class="quest_meta">
              <span class="rank_tag" style="color:${rank_color}">${d.rank}-Rank</span>
              <span class="text_muted">·</span>
              <span class="text_muted">${type_info.label}</span>
              <span class="text_muted">·</span>
              <span class="text_muted">${detail}</span>
            </div>
            ${d.description
      ? `<div class="dung_desc text_muted">${d.description}</div>`
      : ''}
          </div>
          <button class="quest_delete_btn" data-id="${d.id}">✕</button>
        </div>

        <div class="dung_stats_row">
          <span class="dung_stat text_muted">
            ✓ <span class="text_blue">${d.times_cleared}</span> cleared
          </span>
          <span class="dung_stat text_muted">
            ✗ <span class="text_red">${d.times_failed}</span> failed
          </span>
          <span class="dung_stat text_muted">
            👹 ${d.boss_name}
          </span>
        </div>

        <div class="dung_bottom_row">
          <div class="quest_rewards">
            <span class="reward_tag text_blue">+XP</span>
            <span class="reward_tag text_gold">+Gold</span>
            <span class="reward_tag text_purple">+Shadow?</span>
          </div>
          <button
            class="complete_btn ${!can_enter ? 'complete_btn_done' : ''}"
            data-id="${d.id}"
            ${!can_enter ? 'disabled' : ''}
          >
            ${is_active ? 'IN PROGRESS' : no_keys ? 'NO KEYS' : has_active ? 'GATE BUSY' : 'ENTER GATE'}
          </button>
        </div>
      </div>
    </div>
  `
}

// ── Create modal ─────────────────────────────────────
function render_create_modal() {
  return `
    <div class="modal_overlay hidden" id="dung_modal">
      <div class="modal_panel">
        <div class="modal_header">
          <span class="modal_title">CREATE GATE</span>
          <button class="modal_close" id="dung_modal_close">✕</button>
        </div>

        <!-- type selector -->
        <div class="form_group">
          <label class="form_label">Gate Type</label>
          <div class="dung_type_picker">
            ${Object.entries(TYPE_INFO).map(([key, info], i) => `
              <button class="dung_type_opt ${i === 0 ? 'dung_type_opt_active' : ''}"
                data-type="${key}">
                <span class="dung_type_opt_icon">${info.icon}</span>
                <span class="dung_type_opt_label">${info.label}</span>
                <span class="dung_type_opt_desc">${info.desc}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="form_group">
          <label class="form_label">Gate Name</label>
          <input class="form_input" id="dung_name"
            placeholder="e.g. Deep Work Session" maxlength="60" />
        </div>

        <div class="form_group">
          <label class="form_label">Description (optional)</label>
          <input class="form_input" id="dung_desc"
            placeholder="e.g. No distractions, full focus" maxlength="100" />
        </div>

        <div class="form_group">
          <label class="form_label">Rank</label>
          <div class="rank_picker" id="dung_rank_picker">
            ${RANKS.map((r, i) =>
    `<button class="rank_opt ${i === 0 ? 'rank_opt_active' : ''}"
                data-rank="${r}"
                style="color:${RANK_COLORS[r]};
                border-color:${i === 0 ? RANK_COLORS[r] : 'var(--border-dim)'}"
              >${r}</button>`
  ).join('')}
          </div>
        </div>

        <!-- dynamic fields per type -->
        <div id="dung_type_fields"></div>

        <button class="btn_primary btn_full" id="dung_save_btn">
          🏰 CREATE GATE
        </button>
      </div>
    </div>
  `
}

// ── Type-specific form fields ────────────────────────
function render_type_fields(type, el) {
  const container = el.querySelector('#dung_type_fields')
  if (!container) return

  if (type === 'endurance') {
    container.innerHTML = `
      <div class="form_group">
        <label class="form_label">Duration (minutes)</label>
        <div class="counter_row">
          <button class="counter_btn" id="dur_down">−</button>
          <span class="counter_val text_mono" id="dur_val">25</span>
          <button class="counter_btn" id="dur_up">＋</button>
        </div>
      </div>
    `
    let dur = 25
    el.querySelector('#dur_down')?.addEventListener('click', () => {
      dur = Math.max(5, dur - 5)
      el.querySelector('#dur_val').textContent = dur
    })
    el.querySelector('#dur_up')?.addEventListener('click', () => {
      dur = Math.min(240, dur + 5)
      el.querySelector('#dur_val').textContent = dur
    })
  }

  if (type === 'volume') {
    container.innerHTML = `
      <div class="form_row">
        <div class="form_group" style="flex:1">
          <label class="form_label">Target Amount</label>
          <div class="counter_row">
            <button class="counter_btn" id="vol_down">−</button>
            <span class="counter_val text_mono" id="vol_val">10</span>
            <button class="counter_btn" id="vol_up">＋</button>
          </div>
        </div>
        <div class="form_group" style="flex:1">
          <label class="form_label">Unit Label</label>
          <input class="form_input" id="vol_unit" placeholder="pages / reps / cards" value="reps" />
        </div>
      </div>
    `
    let vol = 10
    el.querySelector('#vol_down')?.addEventListener('click', () => {
      vol = Math.max(1, vol - 1)
      el.querySelector('#vol_val').textContent = vol
    })
    el.querySelector('#vol_up')?.addEventListener('click', () => {
      vol = Math.min(500, vol + 1)
      el.querySelector('#vol_val').textContent = vol
    })
  }

  if (type === 'gauntlet') {
    let steps = []

    container.innerHTML = `
      <div class="form_group">
        <label class="form_label">Steps (in order)</label>
        <div id="gauntlet_steps_list"></div>
        <div class="gauntlet_add_row">
          <input class="form_input" id="step_label"
            placeholder="Step name" style="flex:1" maxlength="50" />
          <div class="counter_row" style="flex-shrink:0">
            <button class="counter_btn" id="step_dur_down">−</button>
            <span class="counter_val text_mono" id="step_dur_val">10</span>
            <button class="counter_btn" id="step_dur_up">＋</button>
            <span class="text_muted" style="font-size:11px">min</span>
          </div>
          <button class="counter_btn" id="step_add_btn">＋</button>
        </div>
      </div>
    `

    let step_dur = 10

    el.querySelector('#step_dur_down')?.addEventListener('click', () => {
      step_dur = Math.max(1, step_dur - 1)
      el.querySelector('#step_dur_val').textContent = step_dur
    })
    el.querySelector('#step_dur_up')?.addEventListener('click', () => {
      step_dur = Math.min(120, step_dur + 5)
      el.querySelector('#step_dur_val').textContent = step_dur
    })

    const render_steps = () => {
      const list = el.querySelector('#gauntlet_steps_list')
      if (!list) return
      list.innerHTML = steps.map((s, i) => `
        <div class="subtask_builder_row">
          <span class="subtask_builder_icon">▸</span>
          <span class="subtask_builder_text">${s.label} — ${s.duration_minutes}min</span>
          <button class="subtask_remove_btn" data-idx="${i}">✕</button>
        </div>
      `).join('')
      list.querySelectorAll('.subtask_remove_btn').forEach(btn => {
        btn.addEventListener('click', () => {
          steps.splice(parseInt(btn.dataset.idx), 1)
          render_steps()
        })
      })
    }

    el.querySelector('#step_add_btn')?.addEventListener('click', () => {
      const label = el.querySelector('#step_label')?.value.trim()
      if (!label) return
      steps.push({ label, duration_minutes: step_dur })
      el.querySelector('#step_label').value = ''
      render_steps()
    })

    // expose steps to save handler via closure — store on container
    container._get_steps = () => steps
  }
}

// ── Attach events ────────────────────────────────────
function attach_dungeon_events(el, active_run) {
  let current_type = 'endurance'

  // open modal
  el.querySelector('#dung_add_btn')?.addEventListener('click', () => {
    open_dung_modal(el)
    render_type_fields('endurance', el)
  })
  el.querySelector('#dung_empty_add')?.addEventListener('click', () => {
    open_dung_modal(el)
    render_type_fields('endurance', el)
  })

  // close modal
  el.querySelector('#dung_modal_close')?.addEventListener('click', () => close_dung_modal(el))
  el.querySelector('#dung_modal')?.addEventListener('click', e => {
    if (e.target.id === 'dung_modal') close_dung_modal(el)
  })

  // type picker
  el.querySelectorAll('.dung_type_opt').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.dung_type_opt').forEach(b => b.classList.remove('dung_type_opt_active'))
      btn.classList.add('dung_type_opt_active')
      current_type = btn.dataset.type
      render_type_fields(current_type, el)
    })
  })

  // rank picker
  el.querySelectorAll('.rank_opt').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.rank_opt').forEach(b => {
        b.classList.remove('rank_opt_active')
        b.style.borderColor = 'var(--border-dim)'
      })
      btn.classList.add('rank_opt_active')
      btn.style.borderColor = RANK_COLORS[btn.dataset.rank]
    })
  })

  // save dungeon
  el.querySelector('#dung_save_btn')?.addEventListener('click', async () => {
    const name = el.querySelector('#dung_name')?.value.trim()
    if (!name) {
      haptic_error()
      el.querySelector('#dung_name')?.style.setProperty('border-color', 'var(--hp-red)')
      return
    }

    const rank = el.querySelector('.rank_opt_active')?.dataset.rank || 'E'
    const desc = el.querySelector('#dung_desc')?.value.trim() || ''

    if (current_type === 'endurance') {
      const dur = parseInt(el.querySelector('#dur_val')?.textContent || '25')
      await create_endurance_dungeon({ name, rank, description: desc, duration_minutes: dur })
    }

    if (current_type === 'volume') {
      const target = parseInt(el.querySelector('#vol_val')?.textContent || '10')
      const unit = el.querySelector('#vol_unit')?.value.trim() || 'reps'
      await create_volume_dungeon({ name, rank, description: desc, volume_target: target, volume_unit: unit })
    }

    if (current_type === 'gauntlet') {
      const container = el.querySelector('#dung_type_fields')
      const steps = container?._get_steps?.() || []
      if (steps.length < 2) {
        haptic_error()
        alert('Add at least 2 steps for a gauntlet.')
        return
      }
      await create_gauntlet_dungeon({ name, rank, description: desc, gauntlet_steps: steps })
    }

    close_dung_modal(el)
    haptic_success()
    await render_dungeons()
  })

  // enter gate buttons
  el.querySelectorAll('.complete_btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id     = parseInt(btn.dataset.id)
      const result = await enter_dungeon(id)
      if (result.error) {
        haptic_error()
        alert(result.error)
        return
      }
      haptic_tap()
      await render_dungeons()
    })
  })

  // delete dungeon
  el.querySelectorAll('.quest_delete_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this gate permanently?')
      if (!confirmed) return
      await db.dungeons.delete(parseInt(btn.dataset.id))
      haptic_warning()
      await render_dungeons()
    })
  })

  // abandon run
  el.querySelector('#run_abandon_btn')?.addEventListener('click', async () => {
    const confirmed = window.confirm('Abandon the gate? You will take HP damage.')
    if (!confirmed) return
    if (active_run) {
      stop_run_timer()
      await fail_dungeon(active_run.id)
      haptic_warning()
      await render_dungeons()
    }
  })

  // volume rep button
  el.querySelector('#vol_rep_btn')?.addEventListener('click', async () => {
    if (!active_run) return
    const result = await log_volume_rep(active_run.id, 1)
    if (!result) return
    haptic_tap()

    // update boss hp bar
    const hp_pct = Math.floor((result.boss_hp / active_run.boss_hp_max) * 100)
    const bar = el.querySelector('#boss_hp_bar')
    if (bar) {
      bar.style.width = `${hp_pct}%`
      bar.style.background = hp_pct > 50
        ? 'var(--hp-red)' : hp_pct > 25 ? 'var(--gold)' : 'var(--purple)'
    }

    el.querySelector('.run_vol_num').textContent = result.volume_progress

    if (result.cleared) {
      stop_run_timer()
      const reward = await clear_dungeon(active_run.id)
      haptic_level_up()
      await show_clear_screen(reward)
      await render_dungeons()
    }
  })

  // gauntlet step button
  el.querySelector('#gauntlet_step_btn')?.addEventListener('click', async () => {
    if (!active_run) return
    const result = await complete_gauntlet_step(active_run.id)
    if (!result) return
    haptic_tap()

    if (result.cleared) {
      stop_run_timer()
      const reward = await clear_dungeon(active_run.id)
      haptic_level_up()
      await show_clear_screen(reward)
      await render_dungeons()
    } else {
      await render_dungeons()
    }
  })
}

// ── Run timer ────────────────────────────────────────
function start_run_timer(el, run) {
  stop_run_timer()

  setTimeout(async () => {
    // fetch dungeon once before interval
    const dungeon = await get_dungeon(run.dungeon_id)
    if (!dungeon) {
      console.error('[dungeon] Could not find dungeon for run', run.dungeon_id)
      return
    }

    const total_ms = dungeon.duration_minutes * 60 * 1000

    _timer_interval = setInterval(async () => {
      const fresh_run = await db.dungeon_runs.get(run.id)
      if (!fresh_run || fresh_run.outcome !== 'active') {
        stop_run_timer()
        return
      }

      const now = Date.now()
      const end_time = new Date(fresh_run.end_time).getTime()
      const time_remaining = Math.max(0, end_time - now)

      // update timer display
      const timer_el = el.querySelector('#run_timer')
      if (timer_el) timer_el.textContent = format_ms(time_remaining)

      // boss hp depletes proportionally
      const elapsed = total_ms - time_remaining
      const boss_hp = Math.max(0, Math.floor(dungeon.boss_hp_max * (1 - elapsed / total_ms)))

      // update boss hp bar
      const hp_pct = Math.floor((boss_hp / fresh_run.boss_hp_max) * 100)
      const bar = el.querySelector('#boss_hp_bar')
      if (bar) {
        bar.style.width = `${hp_pct}%`
        bar.style.background = hp_pct > 50
          ? 'var(--hp-red)' : hp_pct > 25 ? 'var(--gold)' : 'var(--purple)'
      }

      // update boss hp in DB
      await db.dungeon_runs.update(fresh_run.id, { boss_hp })

      if (time_remaining <= 0) {
        stop_run_timer()
        const reward = await clear_dungeon(fresh_run.id)
        haptic_level_up()
        await show_clear_screen(reward)
        await render_dungeons()
      }
    }, 1000)
  }, 1000)
}

function stop_run_timer() {
  if (_timer_interval) {
    clearInterval(_timer_interval)
    _timer_interval = null
  }
}

// ── Clear screen overlay ─────────────────────────────
async function show_clear_screen(reward) {
  if (!reward) return

  const overlay = document.createElement('div')
  overlay.className = 'clear_overlay'
  overlay.innerHTML = `
    <div class="clear_panel">
      <div class="clear_title">GATE CLEARED</div>
      <div class="clear_subtitle text_muted">The shadow yields to your will.</div>
      <div class="clear_rewards">
        <div class="clear_reward_row">
          <span class="text_muted">XP Gained</span>
          <span class="text_blue text_mono">+${reward.reward_xp}</span>
        </div>
        <div class="clear_reward_row">
          <span class="text_muted">Gold Gained</span>
          <span class="text_gold text_mono">+${reward.reward_gold}</span>
        </div>
        ${reward.time_bonus
      ? `<div class="clear_reward_row">
               <span class="text_muted">Speed Bonus</span>
               <span class="text_purple text_mono">×1.5</span>
             </div>` : ''}
        ${reward.shadow_extracted
      ? `<div class="clear_reward_row">
               <span class="text_muted">Shadow Extracted</span>
               <span class="text_purple">👥 +1 Soldier</span>
             </div>` : ''}
        ${reward.xp_result?.leveled_up
      ? `<div class="clear_level_up">LEVEL UP → ${reward.xp_result.new_level}</div>`
      : ''}
      </div>
      <button class="btn_primary btn_full" id="clear_dismiss_btn">
        ✓ CONTINUE
      </button>
    </div>
  `

  document.getElementById('app').appendChild(overlay)
  if (reward.xp_result?.leveled_up) {
    notify_level_up(
      reward.xp_result.new_level,
      reward.xp_result.new_rank,
      reward.xp_result.rank_changed
    )
  }
  overlay.querySelector('#clear_dismiss_btn')?.addEventListener('click', () => overlay.remove())
}

// ── Modal helpers ────────────────────────────────────
function open_dung_modal(el) {
  haptic_tap()
  const modal = el.querySelector('#dung_modal')
  modal?.classList.remove('hidden')
  setup_keyboard_dismiss(modal)
}
function close_dung_modal(el) { el.querySelector('#dung_modal')?.classList.add('hidden') }

// ── Format milliseconds ──────────────────────────────
function format_ms(ms) {
  const total_s = Math.floor(ms / 1000)
  const m = Math.floor(total_s / 60)
  const s = total_s % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
