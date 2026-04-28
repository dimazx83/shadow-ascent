import {
  get_store_items,
  get_inventory,
  buy_item,
  equip_item,
  unequip_item,
  RARITY_COLORS,
} from '../modules/store.js'
import { get_player } from '../modules/player.js'
import { haptic_error, haptic_success, haptic_tap } from '../modules/haptics.js'

const TABS = ['consumables', 'equipment', 'inventory']

// ── Main render ──────────────────────────────────────
export async function render_store() {
  const el = document.getElementById('screen_store')
  if (!el) return

  const player = await get_player()

  el.innerHTML = `
    <div class="screen_header">
      <div>
        <h1 class="screen_title">
          <img class="screen_title_icon" src="/art/tabs/store.svg" alt="" aria-hidden="true">
          <span>Store</span>
        </h1>
        <div class="date_str text_muted">
          💰 <span class="text_gold text_mono">${player.gold}</span> Gold available
        </div>
      </div>
    </div>

    <!-- store tabs -->
    <div class="store_tabs">
      <button class="store_tab_btn active" data-store-tab="consumables">ITEMS</button>
      <button class="store_tab_btn" data-store-tab="equipment">GEAR</button>
      <button class="store_tab_btn" data-store-tab="inventory">INVENTORY</button>
    </div>

    <!-- tab panels -->
    <div id="store_panel_consumables" class="store_panel active"></div>
    <div id="store_panel_equipment"   class="store_panel"></div>
    <div id="store_panel_inventory"   class="store_panel"></div>
  `

  await render_store_tab(el, 'consumables', player)

  attach_store_events(el, player)
}

// ── Render a store tab panel ─────────────────────────
async function render_store_tab(el, tab, player) {
  const panel = el.querySelector(`#store_panel_${tab}`)
  if (!panel) return

  if (tab === 'consumables') {
    const items = await get_store_items('consumable')
    panel.innerHTML = `
      <div class="scroll_area" style="padding-top:10px">
        ${items.map(item => render_store_item(item, player)).join('')}
      </div>
    `
    attach_buy_events(panel)
  }

  if (tab === 'equipment') {
    const items = await get_store_items('equipment')

    // group by slot
    const slots = { weapon: [], armor: [], accessory: [] }
    items.forEach(item => {
      if (slots[item.slot]) slots[item.slot].push(item)
    })

    panel.innerHTML = `
      <div class="scroll_area" style="padding-top:10px">
        ${Object.entries(slots).map(([slot, slot_items]) => `
          <div class="store_slot_header">[ ${slot.toUpperCase()} ]</div>
          ${slot_items.map(item => render_store_item(item, player)).join('')}
        `).join('')}
      </div>
    `
    attach_buy_events(panel)
  }

  if (tab === 'inventory') {
    await render_inventory_tab(panel)
  }
}

// ── Store item card ──────────────────────────────────
function render_store_item(item, player) {
  const rarity_color   = RARITY_COLORS[item.rarity]
  const locked         = !item.rank_unlocked
  const cant_afford    = !item.can_afford

  return `
    <div class="store_item_card ${locked ? 'store_item_locked' : ''}">
      <div class="store_item_rarity_stripe" style="background:${rarity_color}"></div>

      <div class="store_item_body">
        <div class="store_item_top">
          <span class="store_item_icon">${item.icon}</span>
          <div class="store_item_info">
            <div class="store_item_name" style="color:${rarity_color}">
              ${item.name}
            </div>
            <div class="store_item_desc text_muted">${item.description}</div>
            ${item.rank_required && item.rank_required !== 'E'
              ? `<div class="store_item_req ${locked ? 'text_red' : 'text_muted'}">
                   Requires ${item.rank_required}-Rank
                 </div>`
              : ''}
          </div>
        </div>

        <div class="store_item_bottom">
          <div class="store_rarity_tag" style="color:${rarity_color}">
            ${item.rarity.toUpperCase()}
          </div>
          <button
            class="store_buy_btn ${cant_afford || locked ? 'store_buy_disabled' : ''}"
            data-catalog-id="${item.catalog_id}"
            ${cant_afford || locked ? 'disabled' : ''}
          >
            💰 ${item.price} Gold
          </button>
        </div>
      </div>
    </div>
  `
}

// ── Inventory tab ────────────────────────────────────
async function render_inventory_tab(panel) {
  const inventory = await get_inventory()
  const equipped  = inventory.filter(i => i.is_equipped === 1)
  const unequipped = inventory.filter(i => i.is_equipped === 0 && i.type === 'equipment')

  if (inventory.length === 0) {
    panel.innerHTML = `
      <div class="empty_state" style="margin-top:16px">
        <div class="empty_icon">🎒</div>
        <div>Your inventory is empty.<br>Buy gear from the store.</div>
      </div>
    `
    return
  }

  panel.innerHTML = `
    <div class="scroll_area" style="padding-top:10px">

      ${equipped.length > 0 ? `
        <div class="store_slot_header">[ EQUIPPED ]</div>
        ${equipped.map(item => render_inventory_card(item, true)).join('')}
      ` : ''}

      ${unequipped.length > 0 ? `
        <div class="store_slot_header">[ IN STORAGE ]</div>
        ${unequipped.map(item => render_inventory_card(item, false)).join('')}
      ` : ''}

    </div>
  `

  // equip / unequip events
  panel.querySelectorAll('.inv_equip_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id)
      await equip_item(id)
      await render_inventory_tab(panel)
    })
  })

  panel.querySelectorAll('.inv_unequip_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id)
      await unequip_item(id)
      await render_inventory_tab(panel)
    })
  })
}

// ── Inventory item card ──────────────────────────────
function render_inventory_card(item, is_equipped) {
  const rarity_color = RARITY_COLORS[item.rarity]

  return `
    <div class="store_item_card ${is_equipped ? 'inv_card_equipped' : ''}">
      <div class="store_item_rarity_stripe" style="background:${rarity_color}"></div>

      <div class="store_item_body">
        <div class="store_item_top">
          <span class="store_item_icon">${item.icon}</span>
          <div class="store_item_info">
            <div class="store_item_name" style="color:${rarity_color}">
              ${item.name}
              ${is_equipped
                ? `<span class="inv_equipped_tag">EQUIPPED</span>`
                : ''}
            </div>
            <div class="store_item_desc text_muted">${item.description}</div>
            <div class="text_muted" style="font-size:10px;margin-top:2px;text-transform:uppercase;letter-spacing:0.08em">
              ${item.slot}
            </div>
          </div>
        </div>

        <div class="store_item_bottom">
          <div class="store_rarity_tag" style="color:${rarity_color}">
            ${item.rarity.toUpperCase()}
          </div>
          ${is_equipped
            ? `<button class="store_buy_btn inv_unequip_btn" data-id="${item.id}">
                 UNEQUIP
               </button>`
            : `<button class="store_buy_btn inv_equip_btn" data-id="${item.id}">
                 EQUIP
               </button>`
          }
        </div>
      </div>
    </div>
  `
}

// ── Attach events ────────────────────────────────────
function attach_store_events(el, player) {
  // tab switching
  el.querySelectorAll('.store_tab_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      haptic_tap()
      el.querySelectorAll('.store_tab_btn').forEach(b => b.classList.remove('active'))
      el.querySelectorAll('.store_panel').forEach(p => p.classList.remove('active'))

      btn.classList.add('active')
      const tab   = btn.dataset.storeTab
      const panel = el.querySelector(`#store_panel_${tab}`)
      panel.classList.add('active')

      // lazy render tab content
      if (!panel.hasChildNodes() || tab === 'inventory') {
        await render_store_tab(el, tab, player)
      }
    })
  })
}

// ── Buy events ───────────────────────────────────────
function attach_buy_events(panel) {
  panel.querySelectorAll('.store_buy_btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const catalog_id = btn.dataset.catalogId
      if (!catalog_id) return

      const result = await buy_item(catalog_id)

      if (!result.success) {
        haptic_error()
        show_store_toast(result.error, 'var(--hp-red)')
        return
      }

      const msg = result.applied
        ? `${result.item.name} used!`
        : result.equipped
          ? `${result.item.name} equipped.`
        : `${result.item.name} added to inventory.`

      haptic_success()
      show_store_toast(msg, 'var(--xp-green)')

      // re-render store to update gold and button states
      await render_store()
    })
  })
}

// ── Toast notification ───────────────────────────────
function show_store_toast(message, color) {
  const existing = document.querySelector('.store_toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'store_toast'
  toast.style.borderColor = color
  toast.style.color       = color
  toast.textContent       = message

  document.getElementById('app').appendChild(toast)
  setTimeout(() => toast.remove(), 2500)
}
