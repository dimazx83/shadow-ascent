import {
  get_habits,
  create_habit,
  press_positive,
  press_negative,
  delete_habit,
  get_today_counts,
  get_week_log,
} from '../modules/habits.js'
import { setup_keyboard_dismiss } from '../modules/utils.js'
import { haptic_error, haptic_success, haptic_tap, haptic_warning } from '../modules/haptics.js'

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S']
const RANK_COLORS = {
  E: 'var(--rank-e)', D: 'var(--rank-d)', C: 'var(--rank-c)',
  B: 'var(--rank-b)', A: 'var(--rank-a)', S: 'var(--rank-s)',
}
const DIRECTIONS = ['both', 'positive', 'negative']
const CATEGORIES = ['general', 'health', 'study', 'work', 'mindset', 'fitness']
const ICONS      = ['🔄','💧','📖','🧘','🏃','🍎','😤','🚬','🍺','📱','🎮','😴']

// ── Main render ──────────────────────────────────────
export async function render_habits() {
  const el = document.getElementById('screen_habits')
  if (!el) return

  const habits = await get_habits()

  // load today counts for all habits
  const counts = {}
  await Promise.all(habits.map(async h => {
    counts[h.id] = await get_today_counts(h.id)
  }))

  el.innerHTML = `
    <div class="screen_header">
      <div>
        <h1 class="screen_title">
          <img class="screen_title_icon" src="/art/tabs/habits.svg" alt="" aria-hidden="true">
          <span>Habits</span>
        </h1>
        <div class="date_str text_muted">${habits.length} habits tracked</div>
      </div>
      <button class="add_btn" id="h_add_btn">＋</button>
    </div>

    <div class="scroll_area">
      ${habits.length === 0
        ? `<div class="empty_state">
             <div class="empty_icon">🔄</div>
             <div>No habits tracked yet.<br>Build your discipline one press at a time.</div>
             <button class="btn_primary" id="h_empty_add">Add First Habit</button>
           </div>`
        : habits.map(h => render_habit_card(h, counts[h.id])).join('')
      }
    </div>

    ${render_habit_modal()}
  `

  attach_habit_events(el)
}

// ── Habit card ───────────────────────────────────────
function render_habit_card(h, today_counts) {
  const rank_color = RANK_COLORS[h.rank]
  const can_pos    = h.direction !== 'negative'
  const can_neg    = h.direction !== 'positive'

  return `
    <div class="habit_card" data-id="${h.id}">
      <div class="quest_rank_stripe" style="background:${rank_color}"></div>

      <div class="habit_body">
        <div class="habit_top_row">
          <span class="habit_icon">${h.icon}</span>
          <div class="habit_info">
            <div class="habit_name">${h.name}</div>
            <div class="quest_meta">
              <span class="rank_tag" style="color:${rank_color}">${h.rank}-Rank</span>
              <span class="text_muted">·</span>
              <span class="text_muted">${h.category}</span>
              ${h.streak > 0
                ? `<span class="streak_tag">🔥 ${h.streak} day streak</span>`
                : ''}
            </div>
          </div>
          <button class="quest_delete_btn" data-id="${h.id}">✕</button>
        </div>

        <!-- week sparkline -->
        <div class="habit_week" data-habit-id="${h.id}">
          <div class="week_loading text_muted">loading...</div>
        </div>

        <!-- today counters -->
        <div class="habit_counter_row">
          <div class="habit_today_counts">
            ${can_pos
              ? `<span class="today_count text_blue">+${today_counts.positive}</span>`
              : ''}
            ${can_neg
              ? `<span class="today_count text_red">−${today_counts.negative}</span>`
              : ''}
          </div>

          <div class="habit_btns">
            ${can_neg
              ? `<button class="habit_neg_btn" data-id="${h.id}">
                   <span>−</span>
                   <span class="habit_btn_label">Bad</span>
                 </button>`
              : ''}
            ${can_pos
              ? `<button class="habit_pos_btn" data-id="${h.id}">
                   <span>＋</span>
                   <span class="habit_btn_label">Good</span>
                 </button>`
              : ''}
          </div>
        </div>
      </div>
    </div>
  `
}

// ── Add modal ────────────────────────────────────────
function render_habit_modal() {
  return `
    <div class="modal_overlay hidden" id="h_modal">
      <div class="modal_panel">
        <div class="modal_header">
          <span class="modal_title">NEW HABIT</span>
          <button class="modal_close" id="h_modal_close">✕</button>
        </div>

        <div class="form_group">
          <label class="form_label">Habit Name</label>
          <input class="form_input" id="h_name"
            placeholder="e.g. Drink water" maxlength="60" />
        </div>

        <div class="form_group">
          <label class="form_label">Icon</label>
          <div class="icon_picker">
            ${ICONS.map((ic, i) =>
              `<button class="icon_opt ${i===0?'icon_opt_active':''}"
                data-icon="${ic}">${ic}</button>`
            ).join('')}
          </div>
        </div>

        <div class="form_row">
          <div class="form_group" style="flex:1">
            <label class="form_label">Rank</label>
            <div class="rank_picker" id="h_rank_picker">
              ${RANKS.map((r,i) =>
                `<button class="rank_opt ${i===0?'rank_opt_active':''}"
                  data-rank="${r}"
                  style="color:${RANK_COLORS[r]};
                  border-color:${i===0?RANK_COLORS[r]:'var(--border-dim)'}"
                >${r}</button>`
              ).join('')}
            </div>
          </div>
        </div>

        <div class="form_group">
          <label class="form_label">Direction</label>
          <div class="direction_picker">
            ${DIRECTIONS.map((d, i) => `
              <button class="direction_opt ${i===0?'direction_opt_active':''}"
                data-dir="${d}">
                <span class="direction_icon">${_dir_icon(d)}</span>
                <span>${_dir_label(d)}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="form_row">
          <div class="form_group" style="flex:1">
            <label class="form_label">Category</label>
            <select class="form_select" id="h_category">
              ${CATEGORIES.map(c =>
                `<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <button class="btn_primary btn_full" id="h_save_btn">
          🔄 ADD HABIT
        </button>
      </div>
    </div>
  `
}

// ── Attach events ────────────────────────────────────
function attach_habit_events(el) {
  // open modal
  el.querySelector('#h_add_btn')?.addEventListener('click', () => open_h_modal(el))
  el.querySelector('#h_empty_add')?.addEventListener('click', () => open_h_modal(el))

  // close modal
  el.querySelector('#h_modal_close')?.addEventListener('click', () => close_h_modal(el))
  el.querySelector('#h_modal')?.addEventListener('click', e => {
    if (e.target.id === 'h_modal') close_h_modal(el)
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

  // direction picker
  el.querySelectorAll('.direction_opt').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.direction_opt').forEach(b => b.classList.remove('direction_opt_active'))
      btn.classList.add('direction_opt_active')
    })
  })

  // save habit
  el.querySelector('#h_save_btn')?.addEventListener('click', async () => {
    const name = el.querySelector('#h_name')?.value.trim()
    if (!name) {
      haptic_error()
      el.querySelector('#h_name')?.style.setProperty('border-color','var(--hp-red)')
      return
    }

    const icon      = el.querySelector('.icon_opt_active')?.dataset.icon || '🔄'
    const rank      = el.querySelector('.rank_opt_active')?.dataset.rank || 'E'
    const direction = el.querySelector('.direction_opt_active')?.dataset.dir || 'both'
    const category  = el.querySelector('#h_category')?.value || 'general'

    await create_habit({ name, rank, direction, icon, category })
    haptic_success()
    close_h_modal(el)
    await render_habits()
  })

  // positive press
  el.querySelectorAll('.habit_pos_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id     = parseInt(btn.dataset.id)
      const result = await press_positive(id)
      if (!result) return

      haptic_success()
      show_habit_flash(btn, `+${result.reward_xp} XP`, 'var(--blue)', result.streak_bonus)
      await render_habits()
    })
  })

  // negative press
  el.querySelectorAll('.habit_neg_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id     = parseInt(btn.dataset.id)
      const result = await press_negative(id)
      if (!result) return

      haptic_warning()
      show_habit_flash(btn, `−${result.damage_taken} HP`, 'var(--hp-red)', false)
      await render_habits()
    })
  })

  // delete
  el.querySelectorAll('.quest_delete_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this habit and all its history?')
      if (!confirmed) return
      await delete_habit(parseInt(btn.dataset.id))
      haptic_warning()
      await render_habits()
    })
  })

  // load week sparklines async
  load_sparklines(el)
}

// ── Load sparklines after render ─────────────────────
async function load_sparklines(el) {
  const week_els = el.querySelectorAll('.habit_week[data-habit-id]')

  await Promise.all(Array.from(week_els).map(async week_el => {
    const habit_id = parseInt(week_el.dataset.habitId)
    const log      = await get_week_log(habit_id)

    const days     = ['M','T','W','T','F','S','S']
    const today_idx = (new Date().getDay() + 6) % 7

    week_el.innerHTML = `
      <div class="sparkline">
        ${log.map((day, i) => {
          const is_today  = i === today_idx
          const has_pos   = day.positive_count > 0
          const has_neg   = day.negative_count > 0
          const intensity = Math.min(day.positive_count, 4)

          return `
            <div class="spark_col">
              <div class="spark_bar_wrap">
                ${has_neg
                  ? `<div class="spark_neg" style="height:${Math.min(day.negative_count*8,32)}px"></div>`
                  : ''}
                ${has_pos
                  ? `<div class="spark_pos" style="height:${Math.min(intensity*8+8,40)}px"></div>`
                  : `<div class="spark_empty"></div>`}
              </div>
              <div class="spark_label ${is_today?'spark_today':''}">${days[i]}</div>
            </div>
          `
        }).join('')}
      </div>
    `
  }))
}

// ── Inline reward flash near button ──────────────────
function show_habit_flash(btn, text, color, streak_bonus) {
  const flash = document.createElement('div')
  flash.className = 'habit_flash'
  flash.style.color = color
  flash.textContent = streak_bonus ? `${text} ×2 STREAK!` : text

  const rect = btn.getBoundingClientRect()
  flash.style.left = `${rect.left}px`
  flash.style.top  = `${rect.top - 32}px`

  document.body.appendChild(flash)
  setTimeout(() => flash.remove(), 900)
}

// ── Helpers ──────────────────────────────────────────
function open_h_modal(el) {
  haptic_tap()
  const modal = el.querySelector('#h_modal')
  modal?.classList.remove('hidden')
  setup_keyboard_dismiss(modal)
}
function close_h_modal(el) { el.querySelector('#h_modal')?.classList.add('hidden') }

function _dir_icon(d) {
  return { both: '⇅', positive: '↑', negative: '↓' }[d]
}
function _dir_label(d) {
  return { both: 'Both', positive: 'Good only', negative: 'Bad only' }[d]
}
