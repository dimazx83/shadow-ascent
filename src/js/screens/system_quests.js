import {
  get_system_quests,
  create_system_quest,
  complete_system_quest,
  abandon_system_quest,
  toggle_subtask,
  delete_system_quest,
} from '../modules/quests.js'
import { notify_level_up } from '../modules/notifications.js'
import { setup_keyboard_dismiss } from '../modules/utils.js'
import { haptic_error, haptic_level_up, haptic_success, haptic_tap, haptic_warning } from '../modules/haptics.js'

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S']
const RANK_COLORS = {
  E: 'var(--rank-e)', D: 'var(--rank-d)', C: 'var(--rank-c)',
  B: 'var(--rank-b)', A: 'var(--rank-a)', S: 'var(--rank-s)',
}
const TAGS  = ['general', 'work', 'study', 'personal', 'finance', 'health']
const ICONS = ['📜','💼','📖','🎯','⚡','🔧','🧩','📝','🗂️','🔑','🏆','💡']

// ── Main render ──────────────────────────────────────
export async function render_system_quests() {
  const el = document.getElementById('screen_system_quests')
  if (!el) return

  const [active, completed] = await Promise.all([
    get_system_quests('active'),
    get_system_quests('completed'),
  ])

  el.innerHTML = `
    <div class="screen_header">
      <div>
        <h1 class="screen_title">📜 <span>System</span> Quests</h1>
        <div class="date_str text_muted">${active.length} active · ${completed.length} completed</div>
      </div>
      <button class="add_btn" id="sq_add_btn">＋</button>
    </div>

    <div class="scroll_area">

      <!-- active quests -->
      ${active.length === 0
        ? `<div class="empty_state">
             <div class="empty_icon">📜</div>
             <div>No active quests.<br>Issue a system quest to begin.</div>
             <button class="btn_primary" id="sq_empty_add">Issue First Quest</button>
           </div>`
        : active.map(q => render_sq_card(q, false)).join('')
      }

      <!-- completed section -->
      ${completed.length > 0 ? `
        <div class="sq_section_divider">
          <span class="text_muted">[ COMPLETED ]</span>
        </div>
        ${completed.slice(0, 5).map(q => render_sq_card(q, true)).join('')}
      ` : ''}

    </div>

    ${render_sq_modal()}
  `

  attach_sq_events(el)
}

// ── Quest card ───────────────────────────────────────
function render_sq_card(q, is_completed) {
  const rank_color = RANK_COLORS[q.rank]
  const has_due    = !!q.due_date
  const is_overdue = has_due && q.due_date < new Date().toISOString().slice(0, 10)
  const done_count = q.subtasks?.filter(s => s.done).length || 0
  const sub_total  = q.subtasks?.length || 0

  return `
    <div class="sq_card ${is_completed ? 'sq_card_done' : ''}" data-id="${q.id}">
      <div class="quest_rank_stripe" style="background:${rank_color}"></div>

      <div class="quest_main">
        <div class="quest_top_row">
          <span class="quest_icon">${q.icon}</span>
          <div class="quest_info">
            <div class="quest_name ${is_completed ? 'text_muted' : ''}">${q.name}</div>
            <div class="quest_meta">
              <span class="rank_tag" style="color:${rank_color}">${q.rank}-Rank</span>
              <span class="text_muted">·</span>
              <span class="sq_tag">${q.tag}</span>
              ${has_due ? `
                <span class="text_muted">·</span>
                <span class="${is_overdue ? 'text_red' : 'text_muted'}">
                  ${is_overdue ? '⚠ overdue' : `due ${q.due_date}`}
                </span>` : ''}
            </div>
          </div>
          ${!is_completed
            ? `<div class="quest_actions">
                 <button class="quest_delete_btn" data-id="${q.id}">✕</button>
               </div>`
            : ''}
        </div>

        <!-- subtasks -->
        ${sub_total > 0 ? `
          <div class="subtask_list" data-quest="${q.id}">
            ${q.subtasks.map((s, i) => `
              <div class="subtask_row ${s.done ? 'subtask_done' : ''}"
                   data-quest="${q.id}" data-idx="${i}">
                <div class="subtask_check ${s.done ? 'subtask_check_done' : ''}">
                  ${s.done ? '✓' : ''}
                </div>
                <span class="subtask_text">${s.text}</span>
              </div>
            `).join('')}
          </div>
          <div class="subtask_progress text_muted">
            ${done_count} / ${sub_total} steps
          </div>
        ` : ''}

        <!-- actions -->
        ${!is_completed ? `
          <div class="sq_actions_row">
            <div class="quest_rewards">
              <span class="reward_tag text_blue">+XP</span>
              <span class="reward_tag text_gold">+Gold</span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="sq_abandon_btn" data-id="${q.id}">ABANDON</button>
              <button class="complete_btn" data-id="${q.id}">COMPLETE</button>
            </div>
          </div>
        ` : `
          <div class="sq_completed_label text_muted">
            ✓ Completed ${q.completed_at ? q.completed_at.slice(0,10) : ''}
          </div>
        `}
      </div>
    </div>
  `
}

// ── Add modal ────────────────────────────────────────
function render_sq_modal() {
  return `
    <div class="modal_overlay hidden" id="sq_modal">
      <div class="modal_panel">
        <div class="modal_header">
          <span class="modal_title">NEW SYSTEM QUEST</span>
          <button class="modal_close" id="sq_modal_close">✕</button>
        </div>

        <div class="form_group">
          <label class="form_label">Quest Name</label>
          <input class="form_input" id="sq_name" placeholder="e.g. Finish project proposal" maxlength="80" />
        </div>

        <div class="form_group">
          <label class="form_label">Icon</label>
          <div class="icon_picker" id="sq_icon_picker">
            ${ICONS.map((ic, i) =>
              `<button class="icon_opt ${i===0?'icon_opt_active':''}" data-icon="${ic}">${ic}</button>`
            ).join('')}
          </div>
        </div>

        <div class="form_row">
          <div class="form_group" style="flex:1">
            <label class="form_label">Rank</label>
            <div class="rank_picker" id="sq_rank_picker">
              ${RANKS.map((r,i) =>
                `<button class="rank_opt ${i===0?'rank_opt_active':''}"
                  data-rank="${r}"
                  style="color:${RANK_COLORS[r]};border-color:${i===0?RANK_COLORS[r]:'var(--border-dim)'}"
                >${r}</button>`
              ).join('')}
            </div>
          </div>
        </div>

        <div class="form_row">
          <div class="form_group" style="flex:1">
            <label class="form_label">Tag</label>
            <select class="form_select" id="sq_tag">
              ${TAGS.map(t =>
                `<option value="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form_group" style="flex:1">
            <label class="form_label">Due Date (optional)</label>
            <input class="form_input" id="sq_due" type="date" />
          </div>
        </div>

        <!-- subtasks -->
        <div class="form_group">
          <label class="form_label">Subtasks (optional)</label>
          <div id="sq_subtask_list" class="subtask_builder"></div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <input class="form_input" id="sq_subtask_input"
              placeholder="Add subtask..." style="flex:1" maxlength="60" />
            <button class="counter_btn" id="sq_subtask_add">＋</button>
          </div>
        </div>

        <button class="btn_primary btn_full" id="sq_save_btn">
          📜 ISSUE QUEST
        </button>
      </div>
    </div>
  `
}

// ── Events ───────────────────────────────────────────
function attach_sq_events(el) {
  let subtasks = []

  // open modal
  el.querySelector('#sq_add_btn')?.addEventListener('click', () => open_sq_modal(el))
  el.querySelector('#sq_empty_add')?.addEventListener('click', () => open_sq_modal(el))

  // close modal
  el.querySelector('#sq_modal_close')?.addEventListener('click', () => close_sq_modal(el))
  el.querySelector('#sq_modal')?.addEventListener('click', e => {
    if (e.target.id === 'sq_modal') close_sq_modal(el)
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

  // add subtask
  const add_subtask = () => {
    const input = el.querySelector('#sq_subtask_input')
    const text  = input?.value.trim()
    if (!text) return

    subtasks.push({ text, done: false })
    input.value = ''
    render_subtask_builder(el, subtasks)
  }

  el.querySelector('#sq_subtask_add')?.addEventListener('click', add_subtask)
  el.querySelector('#sq_subtask_input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') add_subtask()
  })

  // save quest
  el.querySelector('#sq_save_btn')?.addEventListener('click', async () => {
    const name = el.querySelector('#sq_name')?.value.trim()
    if (!name) {
      haptic_error()
      el.querySelector('#sq_name')?.style.setProperty('border-color', 'var(--hp-red)')
      return
    }

    const icon     = el.querySelector('.icon_opt_active')?.dataset.icon || '📜'
    const rank     = el.querySelector('.rank_opt_active')?.dataset.rank || 'E'
    const tag      = el.querySelector('#sq_tag')?.value || 'general'
    const due_date = el.querySelector('#sq_due')?.value || null

    await create_system_quest({ name, rank, tag, due_date, subtasks, icon })
    haptic_success()
    subtasks = []
    close_sq_modal(el)
    await render_system_quests()
  })

  // complete buttons
  el.querySelectorAll('.complete_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return
      btn.disabled    = true
      btn.textContent = '...'

      const id     = parseInt(btn.dataset.id)
      const result = await complete_system_quest(id)
      if (!result) { btn.disabled = false; return }

      if (result.xp_result?.leveled_up || result.xp_result?.rank_changed) haptic_level_up()
      else haptic_success()

      await show_sq_reward(result)
      await render_system_quests()
    })
  })

  // abandon buttons
  el.querySelectorAll('.sq_abandon_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = window.confirm('Abandon this quest? You will take HP damage.')
      if (!confirmed) return

      const id = parseInt(btn.dataset.id)
      await abandon_system_quest(id)
      haptic_warning()
      await render_system_quests()
    })
  })

  // delete buttons
  el.querySelectorAll('.quest_delete_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id)
      await delete_system_quest(id)
      haptic_warning()
      await render_system_quests()
    })
  })

  // subtask toggles
  el.querySelectorAll('.subtask_row').forEach(row => {
    row.addEventListener('click', async () => {
      const quest_id = parseInt(row.dataset.quest)
      const idx      = parseInt(row.dataset.idx)
      await toggle_subtask(quest_id, idx)
      haptic_tap()
      await render_system_quests()
    })
  })
}

// ── Subtask builder inside modal ─────────────────────
function render_subtask_builder(el, subtasks) {
  const container = el.querySelector('#sq_subtask_list')
  if (!container) return

  container.innerHTML = subtasks.map((s, i) => `
    <div class="subtask_builder_row">
      <span class="subtask_builder_icon">▸</span>
      <span class="subtask_builder_text">${s.text}</span>
      <button class="subtask_remove_btn" data-idx="${i}">✕</button>
    </div>
  `).join('')

  container.querySelectorAll('.subtask_remove_btn').forEach(btn => {
    btn.addEventListener('click', () => {
      subtasks.splice(parseInt(btn.dataset.idx), 1)
      render_subtask_builder(el, subtasks)
    })
  })
}

// ── Modal helpers ────────────────────────────────────
function open_sq_modal(el) {
  haptic_tap()
  const modal = el.querySelector('#sq_modal')
  modal?.classList.remove('hidden')
  el.querySelector('#sq_name')?.focus()
  setup_keyboard_dismiss(modal)
}

function close_sq_modal(el) {
  el.querySelector('#sq_modal')?.classList.add('hidden')
}

// ── Reward flash ─────────────────────────────────────
async function show_sq_reward(result) {
  const flash = document.createElement('div')
  flash.className = 'reward_flash'
  flash.innerHTML = `
    <span class="rf_complete">QUEST COMPLETE</span>
    <span class="rf_xp">+${result.reward_xp} XP</span>
    <span class="rf_gold">+${result.reward_gold} Gold</span>
    ${result.xp_result?.leveled_up ? `<span class="rf_level">LEVEL UP → ${result.xp_result.new_level}</span>` : ''}
    ${result.xp_result?.rank_changed ? `<span class="rf_rank">RANK UP → ${result.xp_result.new_rank}-RANK</span>` : ''}
  `
  document.getElementById('app').appendChild(flash)
  if (result.xp_result?.leveled_up) {
    notify_level_up(
      result.xp_result.new_level,
      result.xp_result.new_rank,
      result.xp_result.rank_changed
    )
  }
  setTimeout(() => flash.remove(), 1800)
}
