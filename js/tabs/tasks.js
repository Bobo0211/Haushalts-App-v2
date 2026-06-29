import { getCurrentProfile, getProfiles, getOtherProfile, buildAvatarHTML } from '../auth.js';
import { showToast, openModal } from '../app.js';

const CATEGORIES = [
  { key: 'kitchen',    label: 'Küche',       emoji: '🍳' },
  { key: 'bathroom',   label: 'Bad',          emoji: '🚿' },
  { key: 'living',     label: 'Wohnzimmer',   emoji: '🛋️' },
  { key: 'bedroom',    label: 'Schlafzimmer', emoji: '🛏️' },
  { key: 'shopping',   label: 'Einkauf',      emoji: '🛒' },
  { key: 'laundry',    label: 'Wäsche',       emoji: '👕' },
  { key: 'misc',       label: 'Sonstiges',    emoji: '📦' },
];

const RECURRENCE_LABELS = {
  once:     'Einmalig',
  daily:    'Täglich',
  weekly:   'Wöchentlich',
  biweekly: 'Alle 2 Wochen',
  monthly:  'Monatlich',
};

let tasks = [];
let filterCategory = 'all';
let filterMine = false;
let showDone = false;
let selectedDate = null;

export async function initTasks() {
  await loadTasks();
  renderTasks();
}

async function loadTasks() {
  const { data, error } = await window.db
    .from('tasks')
    .select('*')
    .order('scheduled_date', { ascending: true, nullsFirst: false });
  if (!error) tasks = data ?? [];
}

export function onRealtimeTasks(payload) {
  const { eventType, new: n, old: o } = payload;
  if (eventType === 'INSERT') tasks = [...tasks, n];
  else if (eventType === 'UPDATE') tasks = tasks.map(t => t.id === n.id ? n : t);
  else if (eventType === 'DELETE') tasks = tasks.filter(t => t.id !== o.id);
  renderTasks();
}

function getCategoryInfo(key) {
  return CATEGORIES.find(c => c.key === key) ?? { label: key, emoji: '📦' };
}

export function renderTasks() {
  const pane = document.getElementById('tab-tasks');
  const profile = getCurrentProfile();
  const profiles = getProfiles();

  let filtered = tasks;
  if (filterCategory !== 'all') filtered = filtered.filter(t => t.category === filterCategory);
  if (filterMine) filtered = filtered.filter(t => t.assigned_to === profile?.id);
  if (!showDone) filtered = filtered.filter(t => !t.is_done);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = -1; i <= 12; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }

  if (!selectedDate) selectedDate = today.toISOString().split('T')[0];

  pane.innerHTML = `
    <div class="date-strip" id="tasks-date-strip"></div>
    <div class="section-header">
      <span class="section-title">Aufgaben</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-sm btn-ghost" id="btn-toggle-done">
          ${showDone ? 'Erledigte ausblenden' : 'Erledigte anzeigen'}
        </button>
        <button class="btn btn-sm btn-ghost" id="btn-filter-mine">
          ${filterMine ? '👤 Alle' : '👤 Meine'}
        </button>
      </div>
    </div>
    <div class="filter-bar" id="tasks-filter-bar"></div>
    <div id="tasks-list"></div>
    <button class="fab" id="btn-add-task" aria-label="Aufgabe hinzufügen">+</button>
  `;

  // Date strip
  const strip = pane.querySelector('#tasks-date-strip');
  days.forEach(d => {
    const iso = d.toISOString().split('T')[0];
    const hasTasks = tasks.some(t => t.scheduled_date === iso);
    const pill = document.createElement('button');
    pill.className = 'date-pill' + (iso === selectedDate ? ' active' : '');
    pill.innerHTML = `
      <span class="day-name">${d.toLocaleDateString('de-DE', { weekday: 'short' })}</span>
      <span class="day-num">${d.getDate()}</span>
      ${hasTasks ? '<span class="task-dot"></span>' : '<span style="height:5px"></span>'}
    `;
    pill.addEventListener('click', () => { selectedDate = iso; renderTasks(); });
    strip.appendChild(pill);
  });

  // Category filter
  const filterBar = pane.querySelector('#tasks-filter-bar');
  const allChip = document.createElement('button');
  allChip.className = 'filter-chip' + (filterCategory === 'all' ? ' active' : '');
  allChip.textContent = '📋 Alle';
  allChip.addEventListener('click', () => { filterCategory = 'all'; renderTasks(); });
  filterBar.appendChild(allChip);

  CATEGORIES.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (filterCategory === cat.key ? ' active' : '');
    chip.textContent = `${cat.emoji} ${cat.label}`;
    chip.addEventListener('click', () => { filterCategory = cat.key; renderTasks(); });
    filterBar.appendChild(chip);
  });

  pane.querySelector('#btn-toggle-done').addEventListener('click', () => { showDone = !showDone; renderTasks(); });
  pane.querySelector('#btn-filter-mine').addEventListener('click', () => { filterMine = !filterMine; renderTasks(); });

  // Task list – tasks for selected date + undated tasks
  const listEl = pane.querySelector('#tasks-list');
  const dateTasks = filtered.filter(t => t.scheduled_date === selectedDate || !t.scheduled_date);

  if (dateTasks.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-text">Keine Aufgaben für diesen Tag</div>
      </div>`;
  } else {
    dateTasks.forEach(task => {
      const assignee = profiles.find(p => p.id === task.assigned_to);
      const cat = getCategoryInfo(task.category);
      const now = new Date().toISOString().split('T')[0];
      const overdue = task.scheduled_date && task.scheduled_date < now && !task.is_done;

      const item = document.createElement('div');
      item.className = 'task-item' + (task.is_done ? ' done' : '');
      item.innerHTML = `
        <button class="task-check ${task.is_done ? 'checked' : ''}" aria-label="Abhaken">
          ${task.is_done ? '✓' : ''}
        </button>
        <div class="task-body">
          <div class="task-title">${escHtml(task.title)}</div>
          <div class="task-meta">
            <span class="chip chip-category">${cat.emoji} ${cat.label}</span>
            ${task.points ? `<span class="chip chip-points">⭐ ${task.points}</span>` : ''}
            ${RECURRENCE_LABELS[task.recurrence] && task.recurrence !== 'once' ? `<span class="chip">${RECURRENCE_LABELS[task.recurrence]}</span>` : ''}
            ${overdue ? `<span class="chip chip-overdue">⚠️ Überfällig</span>` : ''}
            ${assignee ? buildAvatarHTML(assignee, 'avatar-sm') : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn btn-icon btn-secondary btn-edit-task" title="Bearbeiten">✏️</button>
          <button class="btn btn-icon btn-secondary btn-delete-task" title="Löschen">🗑️</button>
        </div>
      `;

      item.querySelector('.task-check').addEventListener('click', () => toggleTask(task));
      item.querySelector('.btn-edit-task').addEventListener('click', () => openTaskForm(task));
      item.querySelector('.btn-delete-task').addEventListener('click', () => deleteTask(task.id));
      listEl.appendChild(item);
    });
  }

  pane.querySelector('#btn-add-task').addEventListener('click', () => openTaskForm());
}

async function toggleTask(task) {
  const profile = getCurrentProfile();
  const profiles = getProfiles();
  const newDone = !task.is_done;

  const updates = { is_done: newDone };

  if (newDone && task.points) {
    await window.db.from('profiles')
      .update({ total_points: (profile.total_points ?? 0) + task.points })
      .eq('id', profile.id);

    await window.db.from('point_events').insert({
      profile_id: profile.id,
      task_id:    task.id,
      task_title: task.title,
      points:     task.points,
    });

    const assignee = profiles.find(p => p.id === task.assigned_to);
    if (assignee && assignee.id !== profile.id) window.notifyTaskDone(task, assignee);

    if (task.recurrence && task.recurrence !== 'once') {
      updates.is_done = false;
      updates.scheduled_date = calcNextDueDate(task.scheduled_date, task.recurrence);
      if (task.alternating) {
        const other = getOtherProfile();
        if (other) updates.assigned_to = other.id;
      }
    }
  }

  const { error } = await window.db.from('tasks').update(updates).eq('id', task.id);
  if (error) { showToast('Fehler beim Aktualisieren'); return; }
  if (newDone && task.points) showToast(`⭐ +${task.points} Punkte!`);
}

function calcNextDueDate(currentDue, recurrence) {
  const d = currentDue ? new Date(currentDue) : new Date();
  switch (recurrence) {
    case 'daily':    d.setDate(d.getDate() + 1); break;
    case 'weekly':   d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly':  d.setMonth(d.getMonth() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

async function deleteTask(id) {
  if (!confirm('Aufgabe löschen?')) return;
  await window.db.from('tasks').delete().eq('id', id);
}

function openTaskForm(task = null) {
  const profiles = getProfiles();
  const isEdit = !!task;

  const profileOptions = profiles.map(p =>
    `<option value="${p.id}" ${task?.assigned_to === p.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  const catOptions = CATEGORIES.map(c =>
    `<option value="${c.key}" ${task?.category === c.key ? 'selected' : ''}>${c.emoji} ${c.label}</option>`
  ).join('');

  const recOptions = Object.entries(RECURRENCE_LABELS).map(([k, v]) =>
    `<option value="${k}" ${(task?.recurrence ?? 'once') === k ? 'selected' : ''}>${v}</option>`
  ).join('');

  const body = `
    <form id="task-form">
      <div class="form-group">
        <label>Titel</label>
        <input type="text" name="title" value="${escHtml(task?.title ?? '')}" required placeholder="Aufgabentitel" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Kategorie</label>
          <select name="category">${catOptions}</select>
        </div>
        <div class="form-group">
          <label>Zuständig</label>
          <select name="assigned_to">${profileOptions}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Wiederholung</label>
          <select name="recurrence">${recOptions}</select>
        </div>
        <div class="form-group">
          <label>Punkte</label>
          <input type="number" name="points" value="${task?.points ?? 1}" min="0" max="100" />
        </div>
      </div>
      <div class="form-group">
        <label>Fälligkeitsdatum</label>
        <input type="date" name="scheduled_date" value="${task?.scheduled_date ?? selectedDate ?? ''}" />
      </div>
      <div class="toggle-row form-group">
        <span class="toggle-label">Zuweisung wechselt automatisch</span>
        <label class="toggle">
          <input type="checkbox" name="alternating" ${task?.alternating ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:8px">
        ${isEdit ? 'Speichern' : 'Aufgabe anlegen'}
      </button>
    </form>
  `;

  openModal(isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe', body);

  document.getElementById('task-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      title:          fd.get('title'),
      category:       fd.get('category'),
      assigned_to:    fd.get('assigned_to'),
      recurrence:     fd.get('recurrence'),
      points:         parseInt(fd.get('points') ?? '1', 10),
      scheduled_date: fd.get('scheduled_date') || null,
      alternating:    fd.get('alternating') === 'on',
    };

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = '…';

    let error;
    if (isEdit) {
      ({ error } = await window.db.from('tasks').update(payload).eq('id', task.id));
    } else {
      ({ error } = await window.db.from('tasks').insert({ ...payload, is_done: false }));
    }

    if (error) {
      showToast('Fehler beim Speichern');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Speichern' : 'Aufgabe anlegen';
      return;
    }
    document.getElementById('modal-generic').classList.add('hidden');
    showToast(isEdit ? 'Aufgabe aktualisiert' : 'Aufgabe angelegt');
  });
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
