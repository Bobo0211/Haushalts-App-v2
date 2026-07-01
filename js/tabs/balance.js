import { getProfiles, buildAvatarHTML } from '../auth.js';
import { showToast, openModal } from '../app.js';

let events = [];
let freshProfiles = [];
let realtimeChannel = null;
let chartInstance = null;

export async function initBalance() {
  await Promise.all([loadEvents(), loadFreshProfiles()]);
  renderBalance();
  subscribeBalanceRealtime();
  checkMonthlyReset();
}

function subscribeBalanceRealtime() {
  if (realtimeChannel) window.db.removeChannel(realtimeChannel);
  realtimeChannel = window.db
    .channel('balance-updates')
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'point_events' }, loadBalance)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' },    loadBalance)
    .subscribe();
}

async function loadBalance() {
  await Promise.all([loadEvents(), loadFreshProfiles()]);
  renderBalance();
}

async function loadFreshProfiles() {
  const { data } = await window.db.from('profiles').select('*').order('name');
  if (data) freshProfiles = data;
}

async function loadEvents() {
  const { data, error } = await window.db
    .from('point_events')
    .select('*')
    .order('created_at', { ascending: false });
  if (!error) events = data ?? [];
}

export function onRealtimePointEvents(payload) {
  const { eventType, new: n, old: o } = payload;
  if (eventType === 'INSERT') events = [n, ...events];
  else if (eventType === 'DELETE') events = events.filter(e => e.id !== o.id);
  renderBalance();
}

export function onRealtimeProfiles() {
  loadFreshProfiles().then(() => renderBalance());
}

// ─── Monthly reset ────────────────────────────────────────────────────────────

async function checkMonthlyReset() {
  const today = new Date();
  if (today.getDate() !== 1) return;

  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthDate = lastMonth.toISOString().slice(0, 10);

  const { data: existing } = await window.db
    .from('monthly_summaries')
    .select('id')
    .eq('month', lastMonthDate)
    .maybeSingle();

  if (existing) return;

  const summary = await saveMonthlySummary(lastMonth);
  if (!summary) return;

  await doResetPoints();
  showMonthlySummaryModal(summary);
}

async function saveMonthlySummary(month) {
  const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const endOfMonth   = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

  const [eventsRes, profilesRes, tasksRes] = await Promise.all([
    window.db.from('point_events').select('*')
      .gte('created_at', startOfMonth.toISOString())
      .lte('created_at', endOfMonth.toISOString()),
    window.db.from('profiles').select('*'),
    window.db.from('tasks').select('title, category'),
  ]);

  const monthEvents  = eventsRes.data  ?? [];
  const profiles     = profilesRes.data ?? [];
  const tasks        = tasksRes.data   ?? [];

  const taskCategoryMap = {};
  tasks.forEach(t => { taskCategoryMap[t.title] = t.category; });

  const taskCount     = {};
  const categoryCount = {};
  const pointsByProfile = {};

  monthEvents.forEach(e => {
    taskCount[e.task_title] = (taskCount[e.task_title] || 0) + 1;
    pointsByProfile[e.profile_id] = (pointsByProfile[e.profile_id] || 0) + e.points;
    const cat = taskCategoryMap[e.task_title] || 'Sonstiges';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  const mostDoneTask = Object.entries(taskCount).sort((a, b) => b[1] - a[1])[0];
  const topCategory  = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

  const p1 = profiles[0];
  const p2 = profiles[1];
  if (!p1 || !p2) return null;

  const p1pts = pointsByProfile[p1.id] || 0;
  const p2pts = pointsByProfile[p2.id] || 0;
  const winner = p1pts >= p2pts ? p1 : p2;

  const row = {
    month:               month.toISOString().slice(0, 10),
    winner_id:           winner.id,
    winner_name:         winner.name,
    profile1_id:         p1.id,
    profile1_name:       p1.name,
    profile1_points:     p1pts,
    profile2_id:         p2.id,
    profile2_name:       p2.name,
    profile2_points:     p2pts,
    most_done_task:      mostDoneTask?.[0] ?? null,
    most_done_task_count:mostDoneTask?.[1] ?? null,
    top_category:        topCategory?.[0]  ?? null,
    top_category_count:  topCategory?.[1]  ?? null,
    task_stats:          taskCount,
    category_stats:      categoryCount,
  };

  const { data, error } = await window.db.from('monthly_summaries').insert(row).select().single();
  if (error) {
    console.error('monthly_summaries INSERT fehlgeschlagen — kein Reset!', error);
    throw error;
  }
  return data;
}

// Manual close: reads points from profiles.total_points + all events without date filter
async function saveMonthlySummaryManual(month) {
  const [eventsRes, profilesRes, tasksRes] = await Promise.all([
    window.db.from('point_events').select('*'),
    window.db.from('profiles').select('*'),
    window.db.from('tasks').select('title, category'),
  ]);

  const monthEvents = eventsRes.data  ?? [];
  const profiles    = profilesRes.data ?? [];
  const tasks       = tasksRes.data   ?? [];

  const p1 = profiles[0];
  const p2 = profiles[1];
  if (!p1 || !p2) return null;

  const taskCategoryMap = {};
  tasks.forEach(t => { taskCategoryMap[t.title] = t.category; });

  const taskCount     = {};
  const categoryCount = {};

  monthEvents.forEach(e => {
    taskCount[e.task_title] = (taskCount[e.task_title] || 0) + 1;
    const cat = taskCategoryMap[e.task_title] || 'Sonstiges';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  const mostDoneTask = Object.entries(taskCount).sort((a, b) => b[1] - a[1])[0];
  const topCategory  = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

  // Use profiles.total_points directly — authoritative source before reset
  const p1pts = p1.total_points ?? 0;
  const p2pts = p2.total_points ?? 0;
  const winner = p1pts >= p2pts ? p1 : p2;

  const row = {
    month:                month.toISOString().slice(0, 10),
    winner_id:            winner.id,
    winner_name:          winner.name,
    profile1_id:          p1.id,
    profile1_name:        p1.name,
    profile1_points:      p1pts,
    profile2_id:          p2.id,
    profile2_name:        p2.name,
    profile2_points:      p2pts,
    most_done_task:       mostDoneTask?.[0] ?? null,
    most_done_task_count: mostDoneTask?.[1] ?? null,
    top_category:         topCategory?.[0]  ?? null,
    top_category_count:   topCategory?.[1]  ?? null,
    task_stats:           taskCount,
    category_stats:       categoryCount,
  };

  const { data, error } = await window.db.from('monthly_summaries').insert(row).select().single();
  if (error) { console.error('monthly_summaries INSERT:', error); return null; }
  return data;
}

async function doResetPoints() {
  const profiles = freshProfiles.length ? freshProfiles : getProfiles();
  await Promise.all(profiles.map(p =>
    window.db.from('profiles').update({ total_points: 0 }).eq('id', p.id)
  ));
  await window.db.from('point_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  events = [];
}

// ─── Monthly summary modal ────────────────────────────────────────────────────

async function showMonthlySummaryModal(summary) {
  const month = new Date(summary.month + 'T12:00:00');
  const monthLabel = month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const catStats   = summary.category_stats ?? {};
  const taskStats  = summary.task_stats ?? {};
  const top3Tasks  = Object.entries(taskStats).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const p1Wins     = summary.profile1_points >= summary.profile2_points;

  if (!window.Chart) {
    await new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  openModal(`🏆 Monatsrückblick ${monthLabel}`, `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:36px">👑</div>
      <div style="font-size:20px;font-weight:700">${escHtml(summary.winner_name)}</div>
      <div style="color:var(--text-secondary);font-size:14px">Gewinner des Monats</div>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:16px">
      <div class="points-card${p1Wins ? ' winner' : ''}" style="flex:1;text-align:center">
        <div style="font-weight:700">${escHtml(summary.profile1_name)}</div>
        <div style="font-size:28px;font-weight:800;color:var(--color-primary)">${summary.profile1_points}</div>
        <div style="font-size:12px;color:var(--text-secondary)">Punkte</div>
        ${p1Wins ? '<div>👑</div>' : ''}
      </div>
      <div class="points-card${!p1Wins ? ' winner' : ''}" style="flex:1;text-align:center">
        <div style="font-weight:700">${escHtml(summary.profile2_name)}</div>
        <div style="font-size:28px;font-weight:800;color:var(--color-primary)">${summary.profile2_points}</div>
        <div style="font-size:12px;color:var(--text-secondary)">Punkte</div>
        ${!p1Wins ? '<div>👑</div>' : ''}
      </div>
    </div>

    <div class="charts-container">
      ${Object.keys(catStats).length ? `
        <div class="chart-wrap">
          <h4>Aufgaben nach Kategorie</h4>
          <canvas id="category-chart" width="200" height="200"></canvas>
        </div>
      ` : ''}
      ${top3Tasks.length ? `
        <div class="chart-wrap">
          <h4>Top Aufgaben</h4>
          <canvas id="task-chart" width="200" height="200"></canvas>
        </div>
      ` : ''}
    </div>

    ${top3Tasks.length ? `
      <div style="margin-top:12px;margin-bottom:4px">
        <div style="font-weight:700;margin-bottom:8px">🏅 Top Aufgaben</div>
        ${top3Tasks.map(([title, count], i) =>
          `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px">
            <span>${['🥇','🥈','🥉'][i]} ${escHtml(title)}</span>
            <span style="color:var(--text-secondary)">${count}×</span>
          </div>`
        ).join('')}
      </div>
    ` : ''}
  `);

  const COLORS = ['#6c63ff','#ff6384','#36a2eb','#ffce56','#4bc0c0','#ff9f40','#9966ff'];

  requestAnimationFrame(() => {
    const catCanvas = document.getElementById('category-chart');
    if (catCanvas && Object.keys(catStats).length) {
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      chartInstance = new window.Chart(catCanvas, {
        type: 'pie',
        data: {
          labels: Object.keys(catStats),
          datasets: [{ data: Object.values(catStats), backgroundColor: COLORS }],
        },
        options: {
          responsive: false,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
        },
      });
    }

    const taskCanvas = document.getElementById('task-chart');
    if (taskCanvas && top3Tasks.length) {
      const sortedTasks = Object.entries(taskStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
      new window.Chart(taskCanvas, {
        type: 'doughnut',
        data: {
          labels: sortedTasks.map(([t]) => t),
          datasets: [{ data: sortedTasks.map(([, v]) => v), backgroundColor: COLORS }],
        },
        options: {
          responsive: false,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
        },
      });
    }
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderBalance() {
  const pane = document.getElementById('tab-balance');
  const profiles = freshProfiles.length ? freshProfiles : getProfiles();

  const sorted = [...profiles].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));
  const maxPts = sorted[0]?.total_points ?? 0;

  pane.innerHTML = `
    <div class="section-header">
      <span class="section-title">Punktestand</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-primary" id="btn-monthly-close">📊 Monatsabschluss</button>
        <button class="btn btn-sm btn-danger" id="btn-reset-points">Reset</button>
      </div>
    </div>
    <div class="points-grid" id="points-grid"></div>
    <div class="section-header" style="margin-top:8px">
      <span class="section-title">Verlauf</span>
    </div>
    <div class="card" id="events-list"></div>
    <div class="section-header" style="margin-top:16px">
      <span class="section-title">Monatsarchiv</span>
    </div>
    <div id="monthly-archive"></div>
  `;

  // Points cards
  const grid = pane.querySelector('#points-grid');
  sorted.forEach(profile => {
    const card = document.createElement('div');
    card.className = 'points-card' + (profile.total_points >= maxPts && maxPts > 0 ? ' winner' : '');
    card.innerHTML = `
      ${buildAvatarHTML(profile, 'avatar-md')}
      <div class="points-value">${profile.total_points ?? 0}</div>
      <div class="points-label">${escHtml(profile.name)}</div>
      ${profile.total_points >= maxPts && maxPts > 0 ? '<div style="font-size:18px;margin-top:4px">👑</div>' : ''}
    `;
    grid.appendChild(card);
  });

  // Events list
  const eventsEl = pane.querySelector('#events-list');
  if (events.length === 0) {
    if (profiles.some(p => (p.total_points ?? 0) > 0)) {
      profiles.forEach(p => {
        if (!p.total_points) return;
        const item = document.createElement('div');
        item.className = 'event-item';
        item.innerHTML = `
          ${buildAvatarHTML(p, 'avatar-sm')}
          <div class="event-info">
            <div class="event-title">Startguthaben</div>
            <div class="event-time">${escHtml(p.name)}</div>
          </div>
          <div class="event-points">+${p.total_points}</div>
        `;
        eventsEl.appendChild(item);
      });
    } else {
      eventsEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚖️</div>
          <div class="empty-state-text">Noch keine Punkte vergeben</div>
        </div>`;
    }
  } else {
    events.forEach(evt => {
      const profile = profiles.find(p => p.id === evt.profile_id);
      const item = document.createElement('div');
      item.className = 'event-item';
      item.innerHTML = `
        ${profile ? buildAvatarHTML(profile, 'avatar-sm') : '<div class="avatar avatar-sm" style="background:#ccc">?</div>'}
        <div class="event-info">
          <div class="event-title">${escHtml(evt.task_title ?? 'Aufgabe')}</div>
          <div class="event-time">${escHtml(profile?.name ?? '')} · ${formatDate(evt.created_at)}</div>
        </div>
        <div class="event-points">+${evt.points ?? 0}</div>
      `;
      eventsEl.appendChild(item);
    });
  }

  pane.querySelector('#btn-reset-points').addEventListener('click', resetPoints);
  pane.querySelector('#btn-monthly-close').addEventListener('click', manualMonthlyClose);

  // Load monthly archive
  loadMonthlyArchive(pane.querySelector('#monthly-archive'));
}

async function loadMonthlyArchive(container) {
  const { data: summaries } = await window.db
    .from('monthly_summaries')
    .select('*')
    .order('month', { ascending: false });

  if (!summaries?.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:16px">
        <div class="empty-state-text">Noch kein Monatsabschluss vorhanden</div>
      </div>`;
    return;
  }

  summaries.forEach(s => {
    const month = new Date(s.month + 'T12:00:00');
    const label = month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:12px;padding:12px';
    card.innerHTML = `
      <div style="flex:1">
        <div style="font-weight:700">${escHtml(label)}</div>
        <div style="font-size:13px;color:var(--text-secondary)">
          👑 ${escHtml(s.winner_name)} · ${escHtml(s.profile1_name)} ${s.profile1_points} – ${s.profile2_points} ${escHtml(s.profile2_name)}
        </div>
      </div>
      <span style="font-size:20px">›</span>
    `;
    card.addEventListener('click', () => showMonthlySummaryModal(s));
    container.appendChild(card);
  });
}

async function manualMonthlyClose() {
  const now = new Date();
  const monthLabel = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  if (!confirm(`Monatsabschluss für ${monthLabel} durchführen?\nDie Punkte werden gespeichert und zurückgesetzt.`)) return;

  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthDate = currentMonth.toISOString().slice(0, 10);

  const { data: existing } = await window.db
    .from('monthly_summaries')
    .select('id')
    .eq('month', monthDate)
    .maybeSingle();

  if (existing) {
    if (!confirm(`Für ${monthLabel} existiert bereits ein Eintrag. Überschreiben?`)) return;
    await window.db.from('monthly_summaries').delete().eq('month', monthDate);
  }

  const summary = await saveMonthlySummaryManual(currentMonth);
  if (!summary) { showToast('Fehler beim Speichern des Monatsabschlusses'); return; }

  await doResetPoints();
  renderBalance();
  showMonthlySummaryModal(summary);
  showToast(`Monatsabschluss ${monthLabel} gespeichert`);
}

async function resetPoints() {
  if (!confirm('Alle Punkte zurücksetzen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
  await doResetPoints();
  showToast('Punkte zurückgesetzt');
  renderBalance();
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
