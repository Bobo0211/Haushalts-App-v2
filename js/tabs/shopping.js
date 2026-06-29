import { supabase } from '../supabase-client.js';
import { showToast } from '../app.js';

const CATEGORIES = [
  { key: 'produce',   label: 'Obst & Gemüse', emoji: '🥦' },
  { key: 'dairy',     label: 'Milchprodukte',  emoji: '🧀' },
  { key: 'meat',      label: 'Fleisch',         emoji: '🥩' },
  { key: 'bakery',    label: 'Backwaren',       emoji: '🥖' },
  { key: 'frozen',    label: 'Tiefkühl',        emoji: '🧊' },
  { key: 'drinks',    label: 'Getränke',        emoji: '🥤' },
  { key: 'hygiene',   label: 'Hygiene',         emoji: '🧴' },
  { key: 'misc',      label: 'Sonstiges',       emoji: '📦' },
];

let items = [];
let filterCategory = 'all';

export async function initShopping() {
  const { data, error } = await supabase
    .from('shopping')
    .select('*')
    .order('category')
    .order('name');
  if (!error) items = data ?? [];
  renderShopping();
}

export function onRealtimeShopping(payload) {
  const { eventType, new: n, old: o } = payload;
  if (eventType === 'INSERT') items = [...items, n];
  else if (eventType === 'UPDATE') items = items.map(i => i.id === n.id ? n : i);
  else if (eventType === 'DELETE') items = items.filter(i => i.id !== o.id);
  renderShopping();
}

export function renderShopping() {
  const pane = document.getElementById('tab-shopping');

  const catOptions = CATEGORIES.map(c =>
    `<option value="${c.key}">${c.emoji} ${c.label}</option>`
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
    chip.className = 'filter-chip' + (filterCategory === cat.key ? ' active' : '');
    chip.textContent = `${cat.emoji} ${cat.label}`;
    chip.addEventListener('click', () => { filterCategory = cat.key; renderShopping(); });
    filterBar.appendChild(chip);
  });

  // Add form
  pane.querySelector('#shopping-add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('shopping-input').value.trim();
    const category = document.getElementById('shopping-cat').value;
    if (!name) return;
    const { error } = await supabase.from('shopping').insert({ name, category, done: false });
    if (error) { showToast('Fehler beim Hinzufügen'); return; }
    document.getElementById('shopping-input').value = '';
  });

  // Clear done
  pane.querySelector('#btn-clear-done').addEventListener('click', async () => {
    const doneIds = items.filter(i => i.done).map(i => i.id);
    if (!doneIds.length) { showToast('Keine erledigten Artikel'); return; }
    await supabase.from('shopping').delete().in('id', doneIds);
    showToast('Erledigte Artikel gelöscht');
  });

  // List
  const listEl = pane.querySelector('#shopping-list');
  let filtered = items;
  if (filterCategory !== 'all') filtered = filtered.filter(i => i.category === filterCategory);

  // Group by category
  const grouped = {};
  filtered.forEach(item => {
    const key = item.category ?? 'misc';
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
    const cat = CATEGORIES.find(c => c.key === catKey) ?? { label: catKey, emoji: '📦' };
    const section = document.createElement('div');
    section.style.marginBottom = '16px';
    section.innerHTML = `<div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">${cat.emoji} ${cat.label}</div>`;

    catItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'shopping-item' + (item.done ? ' done' : '');
      el.innerHTML = `
        <button class="task-check ${item.done ? 'checked' : ''}" aria-label="Abhaken">
          ${item.done ? '✓' : ''}
        </button>
        <span class="shopping-name">${escHtml(item.name)}</span>
        <button class="btn btn-icon btn-secondary btn-del-item" title="Löschen">🗑️</button>
      `;
      el.querySelector('.task-check').addEventListener('click', () => toggleItem(item));
      el.querySelector('.btn-del-item').addEventListener('click', () => deleteItem(item.id));
      section.appendChild(el);
    });

    listEl.appendChild(section);
  });
}

async function toggleItem(item) {
  await supabase.from('shopping').update({ done: !item.done }).eq('id', item.id);
}

async function deleteItem(id) {
  await supabase.from('shopping').delete().eq('id', id);
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
