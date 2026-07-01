import { getCurrentProfile } from '../auth.js';
import { showToast, openModal } from '../app.js';

const CATEGORIES = [
  { value: 'Obst & Gemüse',       emoji: '🥦' },
  { value: 'Milchprodukte',       emoji: '🧀' },
  { value: 'Fleisch',             emoji: '🥩' },
  { value: 'Backwaren',           emoji: '🥖' },
  { value: 'Getreide & Beilagen', emoji: '🌾' },
  { value: 'Tiefkühl',            emoji: '🧊' },
  { value: 'Getränke',            emoji: '🥤' },
  { value: 'Hygiene',             emoji: '🧴' },
  { value: 'Drogerie & Haushalt', emoji: '🧹' },
  { value: 'Sonstiges',           emoji: '📦' },
];

let items = [];
let filterCategory = 'all';

export async function initShopping() {
  await loadShoppingItems();
}

export async function loadShoppingItems() {
  const { data, error } = await window.db
    .from('shopping_items')
    .select('*, recipes(title)')
    .order('shop_category', { ascending: true })
    .order('name', { ascending: true });
  if (!error) items = data ?? [];
  renderShopping();
}

export function onRealtimeShopping(payload) {
  const { eventType, new: n, old: o } = payload;
  if (eventType === 'DELETE') {
    items = items.filter(i => i.id !== o.id);
    renderShopping();
    return;
  }
  if (n.recipe_id) {
    // Realtime payload has no JOIN data — re-fetch with recipes(title)
    window.db.from('shopping_items').select('*, recipes(title)').eq('id', n.id).single().then(({ data }) => {
      if (!data) return;
      if (eventType === 'INSERT') items = [data, ...items];
      else items = items.map(i => i.id === data.id ? data : i);
      renderShopping();
    });
  } else {
    if (eventType === 'INSERT') items = [n, ...items];
    else items = items.map(i => i.id === n.id ? n : i);
    renderShopping();
  }
}

export function renderShopping() {
  const pane = document.getElementById('tab-shopping');

  const catOptions = CATEGORIES.map(c =>
    `<option value="${c.value}">${c.emoji} ${c.value}</option>`
  ).join('');

  pane.innerHTML = `
    <div class="section-header">
      <span class="section-title">Einkaufsliste</span>
      <button class="btn btn-sm btn-danger" id="btn-clear-done">Erledigte löschen</button>
    </div>
    <div class="filter-bar" id="shopping-filter"></div>
    <div class="card" style="margin-bottom:16px">
      <form id="shopping-add-form" style="display:flex;gap:8px;align-items:flex-end">
        <div class="form-group" style="flex:1;margin:0">
          <input type="text" id="shopping-input" placeholder="Artikel hinzufügen…" required />
        </div>
        <div class="form-group" style="width:140px;margin:0">
          <select id="shopping-cat">${catOptions}</select>
        </div>
        <button type="submit" class="btn btn-primary" style="flex-shrink:0">+</button>
      </form>
    </div>
    <div id="shopping-list"></div>
  `;

  // Filter bar
  const filterBar = pane.querySelector('#shopping-filter');
  const allChip = document.createElement('button');
  allChip.className = 'filter-chip' + (filterCategory === 'all' ? ' active' : '');
  allChip.textContent = '📋 Alle';
  allChip.addEventListener('click', () => { filterCategory = 'all'; renderShopping(); });
  filterBar.appendChild(allChip);

  CATEGORIES.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (filterCategory === cat.value ? ' active' : '');
    chip.textContent = `${cat.emoji} ${cat.value}`;
    chip.addEventListener('click', () => { filterCategory = cat.value; renderShopping(); });
    filterBar.appendChild(chip);
  });

  // Add form
  pane.querySelector('#shopping-add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('shopping-input').value.trim();
    const shop_category = document.getElementById('shopping-cat').value;
    if (!name) return;
    const profile = getCurrentProfile();
    const { error } = await window.db.from('shopping_items').insert({
      name,
      shop_category,
      is_checked: false,
      added_by: profile?.id ?? null,
    });
    if (error) { showToast('Fehler beim Hinzufügen'); return; }
    document.getElementById('shopping-input').value = '';
  });

  // Clear done
  pane.querySelector('#btn-clear-done').addEventListener('click', async () => {
    const doneIds = items.filter(i => i.is_checked).map(i => i.id);
    if (!doneIds.length) { showToast('Keine erledigten Artikel'); return; }
    await window.db.from('shopping_items').delete().in('id', doneIds);
    showToast('Erledigte Artikel gelöscht');
  });

  // List
  const listEl = pane.querySelector('#shopping-list');
  let filtered = items;
  if (filterCategory !== 'all') filtered = filtered.filter(i => i.shop_category === filterCategory);

  // Group by category
  const grouped = {};
  filtered.forEach(item => {
    const key = item.shop_category ?? 'Sonstiges';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <div class="empty-state-text">Einkaufsliste ist leer</div>
      </div>`;
    return;
  }

  Object.entries(grouped).forEach(([catKey, catItems]) => {
    const cat = CATEGORIES.find(c => c.value === catKey) ?? { value: catKey, emoji: '📦' };
    const section = document.createElement('div');
    section.style.marginBottom = '16px';
    section.innerHTML = `<div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">${cat.emoji} ${cat.value}</div>`;

    catItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'shopping-item' + (item.is_checked ? ' done' : '');
      el.innerHTML = `
        <button class="task-check ${item.is_checked ? 'checked' : ''}" aria-label="Abhaken">
          ${item.is_checked ? '✓' : ''}
        </button>
        <div class="shopping-item-text">
          <span class="item-name">${escHtml(item.name)}</span>
          ${item.recipes?.title ? `<span class="item-recipe">${escHtml(item.recipes.title)}</span>` : ''}
        </div>
        ${item.amount || item.unit ? `<span style="font-size:13px;color:var(--text-secondary)">${escHtml(String(item.amount ?? ''))} ${escHtml(item.unit ?? '')}</span>` : ''}
        <button class="btn btn-icon btn-secondary btn-edit-item" title="Bearbeiten">✏️</button>
        <button class="btn btn-icon btn-secondary btn-del-item" title="Löschen">🗑️</button>
      `;
      el.querySelector('.task-check').addEventListener('click', () => toggleItem(item));
      el.querySelector('.btn-edit-item').addEventListener('click', () => openEditModal(item));
      el.querySelector('.btn-del-item').addEventListener('click', () => deleteItem(item.id));
      section.appendChild(el);
    });

    listEl.appendChild(section);
  });
}

function openEditModal(item) {
  const catOptions = CATEGORIES.map(c =>
    `<option value="${c.value}" ${item.shop_category === c.value ? 'selected' : ''}>${c.emoji} ${c.value}</option>`
  ).join('');

  openModal('Artikel bearbeiten', `
    <form id="edit-item-form">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" value="${escHtml(item.name ?? '')}" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Menge</label>
          <input type="number" name="amount" value="${escHtml(String(item.amount ?? ''))}" min="0" step="any" />
        </div>
        <div class="form-group">
          <label>Einheit</label>
          <input type="text" name="unit" value="${escHtml(item.unit ?? '')}" placeholder="g, ml, Stk…" />
        </div>
      </div>
      <div class="form-group">
        <label>Kategorie</label>
        <select name="shop_category">${catOptions}</select>
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:8px">Speichern</button>
    </form>
  `);

  document.getElementById('edit-item-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name          = fd.get('name').trim();
    const amount        = fd.get('amount') ? parseFloat(fd.get('amount')) : null;
    const unit          = fd.get('unit').trim() || null;
    const shop_category = fd.get('shop_category');
    if (!name) return;

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = '…';

    const { error } = await window.db.from('shopping_items')
      .update({ name, amount, unit, shop_category })
      .eq('id', item.id);

    if (error) {
      showToast('Fehler beim Speichern');
      btn.disabled = false;
      btn.textContent = 'Speichern';
      return;
    }
    document.getElementById('modal-generic').classList.add('hidden');
    showToast('Artikel aktualisiert');
  });
}

async function toggleItem(item) {
  await window.db.from('shopping_items').update({ is_checked: !item.is_checked }).eq('id', item.id);
}

async function deleteItem(id) {
  await window.db.from('shopping_items').delete().eq('id', id);
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
