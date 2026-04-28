import {
  get_daily_quests,
  create_daily_quest,
  complete_daily_quest_rep,
  undo_daily_quest_rep,
  delete_daily_quest,
} from '../modules/quests.js'
import { get_player } from '../modules/player.js'
import { notify_level_up } from '../modules/notifications.js'
import { setup_keyboard_dismiss } from '../modules/utils.js'
import { haptic_error, haptic_level_up, haptic_success, haptic_tap, haptic_warning } from '../modules/haptics.js'

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S']
const RANK_COLORS = {
  E: 'var(--rank-e)', D: 'var(--rank-d)', C: 'var(--rank-c)',
  B: 'var(--rank-b)', A: 'var(--rank-a)', S: 'var(--rank-s)',
}
const CATEGORIES = ['general', 'study', 'work', 'health', 'personal', 'fitness']
const ICONS = ['⚔️', '📖', '💼', '🏃', '🧘', '💧', '🌅', '✍️', '🎯', '🔥', '⚡', '🛡️']

// ── Main render ──────────────────────────────────────
export async function render_daily_quests() {
  const el = document.getElementById('screen_daily_quests')
  if (!el) return

  const [quests, player] = await Promise.all([
    get_daily_quests(),
    get_player(),
  ])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const completed = quests.filter(q => q.completions_today >= q.repeat_count).length
  const total = quests.length

  el.innerHTML = `
    <div class="screen_header">
      <div>
        <h1 class="screen_title">
          <img class="screen_title_icon" src="/art/tabs/daily.svg" alt="" aria-hidden="true">
          <span>Daily</span> Quests
        </h1>
        <div class="date_str text_muted">${today}</div>
      </div>
      <button class="add_btn" id="dq_add_btn">＋</button>
    </div>

    <!-- progress summary -->
    <div class="dq_summary system_panel">
      <div class="dq_summary_top">
        <span class="text_muted">Today's Progress</span>
        <span class="text_mono text_blue">${completed} / ${total}</span>
      </div>
      <div class="bar_track" style="margin-top:8px">
        <div class="bar_fill bar_xp" style="width:${total ? Math.floor(completed / total * 100) : 0}%"></div>
      </div>
    </div>

    <!-- quest list -->
    <div class="scroll_area" id="dq_list">
      ${quests.length === 0
      ? `<div class="empty_state">
             <div class="empty_icon">⚔️</div>
             <div>No daily quests yet.<br>The System awaits your first command.</div>
             <button class="btn_primary" id="dq_empty_add">Create First Quest</button>
           </div>`
      : quests.map(q => render_quest_card(q)).join('')
    }
    </div>

    <!-- add quest modal (hidden) -->
    ${render_add_modal()}
  `

  attach_events(el, quests)
}

// ── Quest card HTML ──────────────────────────────────
function render_quest_card(q) {
  const done = q.completions_today >= q.repeat_count
  const rank_color = RANK_COLORS[q.rank]
  const progress = Math.min(q.completions_today, q.repeat_count)
  const pct = Math.floor((progress / q.repeat_count) * 100)

  return `
    <div class="quest_card ${done ? 'quest_done' : ''}" data-id="${q.id}">
      <div class="quest_rank_stripe" style="background:${rank_color}"></div>

      <div class="quest_main">
        <div class="quest_top_row">
          <span class="quest_icon">${q.icon}</span>
          <div class="quest_info">
            <div class="quest_name ${done ? 'text_muted' : ''}">${q.name}</div>
            <div class="quest_meta">
              <span class="rank_tag" style="color:${rank_color}">${q.rank}-Rank</span>
              <span class="text_muted">·</span>
              <span class="text_muted">${q.category}</span>
              ${q.streak > 0 ? `<span class="streak_tag">🔥 ${q.streak}</span>` : ''}
            </div>
          </div>
          <div class="quest_actions">
            ${q.completions_today > 0
      ? `<button class="undo_btn" data-id="${q.id}" title="Undo last completion">↩</button>`
      : ''}
            <button class="quest_delete_btn" data-id="${q.id}">✕</button>
          </div>
        </div>

        ${q.repeat_count > 1 ? `
          <div class="rep_progress">
            <div class="bar_track" style="height:4px;margin-bottom:4px">
              <div class="bar_fill bar_xp" style="width:${pct}%"></div>
            </div>
            <div class="rep_dots">
              ${Array.from({ length: q.repeat_count }, (_, i) =>
        `<div class="rep_dot ${i < progress ? 'rep_dot_done' : ''}"></div>`
      ).join('')}
            </div>
          </div>
        ` : ''}

        <div class="quest_bottom_row">
          <div class="quest_rewards">
            <span class="reward_tag text_blue">+XP</span>
            <span class="reward_tag text_gold">+Gold</span>
          </div>
          <button
            class="complete_btn ${done ? 'complete_btn_done' : ''}"
            data-id="${q.id}"
            ${done ? 'disabled' : ''}
          >
            ${done
      ? '✓ DONE'
      : `COMPLETE ${q.repeat_count > 1 ? `(${progress}/${q.repeat_count})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  `
}

// ── Add quest modal HTML ─────────────────────────────
function render_add_modal() {
  return `
    <div class="modal_overlay hidden" id="dq_modal">
      <div class="modal_panel">
        <div class="modal_header">
          <span class="modal_title">NEW DAILY QUEST</span>
          <button class="modal_close" id="dq_modal_close">✕</button>
        </div>

        <div class="form_group">
          <label class="form_label">Quest Name</label>
          <input class="form_input" id="dq_name" placeholder="e.g. Read for 30 minutes" maxlength="60" />
        </div>

        <div class="form_group">
          <label class="form_label">Icon</label>
          <div class="icon_picker" id="dq_icon_picker">
            ${ICONS.map((ic, i) =>
    `<button class="icon_opt ${i === 0 ? 'icon_opt_active' : ''}" data-icon="${ic}">${ic}</button>`
  ).join('')}
          </div>
        </div>

        <div class="form_row">
          <div class="form_group" style="flex:1">
            <label class="form_label">Rank</label>
            <div class="rank_picker" id="dq_rank_picker">
              ${RANKS.map((r, i) =>
    `<button class="rank_opt ${i === 0 ? 'rank_opt_active' : ''}"
                  data-rank="${r}"
                  style="color:${RANK_COLORS[r]};border-color:${i === 0 ? RANK_COLORS[r] : 'var(--border-dim)'}"
                >${r}</button>`
  ).join('')}
            </div>
          </div>
        </div>

        <div class="form_row">
          <div class="form_group" style="flex:1">
            <label class="form_label">Times per day</label>
            <div class="counter_row">
              <button class="counter_btn" id="dq_count_down">−</button>
              <span class="counter_val text_mono" id="dq_count_val">1</span>
              <button class="counter_btn" id="dq_count_up">＋</button>
            </div>
          </div>
          <div class="form_group" style="flex:1">
            <label class="form_label">Category</label>
            <select class="form_select" id="dq_category">
              ${CATEGORIES.map(c =>
    `<option value="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</option>`
  ).join('')}
            </select>
          </div>
        </div>

        <button class="btn_primary btn_full" id="dq_save_btn">
          ⚔️ ISSUE QUEST
        </button>
      </div>
    </div>
  `
}

// ── Attach all events ────────────────────────────────
function attach_events(el, quests) {
  // open modal
  el.querySelector('#dq_add_btn')?.addEventListener('click', () => open_modal(el))
  el.querySelector('#dq_empty_add')?.addEventListener('click', () => open_modal(el))

  // close modal
  el.querySelector('#dq_modal_close')?.addEventListener('click', () => close_modal(el))
  el.querySelector('#dq_modal')?.addEventListener('click', e => {
    if (e.target.id === 'dq_modal') close_modal(el)
  })

  // icon picker
  el.querySelectorAll('.icon_opt').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.icon_opt').forEach(b => b.classList.remove('icon_opt_active'))
      btn.classList.add('icon_opt_active')
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

  // repeat counter
  let repeat_count = 1
  el.querySelector('#dq_count_down')?.addEventListener('click', () => {
    repeat_count = Math.max(1, repeat_count - 1)
    el.querySelector('#dq_count_val').textContent = repeat_count
  })
  el.querySelector('#dq_count_up')?.addEventListener('click', () => {
    repeat_count = Math.min(20, repeat_count + 1)
    el.querySelector('#dq_count_val').textContent = repeat_count
  })

  // save quest
  el.querySelector('#dq_save_btn')?.addEventListener('click', async () => {
    const name = el.querySelector('#dq_name')?.value.trim()
    if (!name) {
      haptic_error()
      shake(el.querySelector('#dq_name'))
      return
    }

    const icon = el.querySelector('.icon_opt_active')?.dataset.icon || '⚔️'
    const rank = el.querySelector('.rank_opt_active')?.dataset.rank || 'E'
    const category = el.querySelector('#dq_category')?.value || 'general'

    await create_daily_quest({ name, rank, repeat_count, icon, category })
    haptic_success()
    close_modal(el)
    await render_daily_quests()
  })

  // complete buttons
  el.querySelectorAll('.complete_btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return
      btn.disabled   = true
      btn.textContent = '...'

      const id     = parseInt(btn.dataset.id)
      const result = await complete_daily_quest_rep(id)
      if (!result) { btn.disabled = false; return }

      if (result.xp_result?.leveled_up || result.xp_result?.rank_changed) haptic_level_up()
      else haptic_success()

      await show_reward_flash(el, result)
      await render_daily_quests()
    })
  })

  // undo buttons
  el.querySelectorAll('.undo_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id)
      const result = await undo_daily_quest_rep(id)
      if (result) {
        haptic_warning()
        await render_daily_quests()
      }
    })
  })

  // delete buttons
  el.querySelectorAll('.quest_delete_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id)
      await delete_daily_quest(id)
      haptic_warning()
      await render_daily_quests()
    })
  })
}

// ── Modal helpers ────────────────────────────────────
function open_modal(el) {
  haptic_tap()
  const modal = el.querySelector('#dq_modal')
  modal?.classList.remove('hidden')
  el.querySelector('#dq_name')?.focus()
  setup_keyboard_dismiss(modal)
}

function close_modal(el) {
  el.querySelector('#dq_modal')?.classList.add('hidden')
}

// ── Reward flash overlay ─────────────────────────────
async function show_reward_flash(el, result) {
  const flash = document.createElement('div')
  flash.className = 'reward_flash'

  const lines = [
    `<span class="rf_xp">+${result.reward_xp} XP${result.xp_result?.boost_applied ? ' ×2 ELIXIR' : ''}</span>`,
    `<span class="rf_gold">+${result.reward_gold} Gold</span>`,
  ]

  if (result.xp_result?.leveled_up) {
    lines.push(`<span class="rf_level">LEVEL UP → ${result.xp_result.new_level}</span>`)
  }
  if (result.xp_result?.rank_changed) {
    lines.push(`<span class="rf_rank">RANK UP → ${result.xp_result.new_rank}-RANK</span>`)
  }
  if (result.fully_complete) {
    lines.unshift(`<span class="rf_complete">QUEST COMPLETE</span>`)
  }

  flash.innerHTML = lines.join('')
  document.getElementById('app').appendChild(flash)

  if (result.xp_result?.leveled_up) {
    notify_level_up(
      result.xp_result.new_level,
      result.xp_result.new_rank,
      result.xp_result.rank_changed
    )
  }

  await new Promise(r => setTimeout(r, 1800))
  flash.remove()
}

// ── Input shake on validation fail ───────────────────
function shake(el) {
  if (!el) return
  el.style.animation = 'none'
  el.offsetHeight
  el.style.animation = 'shake 0.4s ease'
}
