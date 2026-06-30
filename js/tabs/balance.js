import { getProfiles, buildAvatarHTML } from '../auth.js';
import { showToast } from '../app.js';

let events = [];
let freshProfiles = [];
let realtimeChannel = null;

export async function initBalance() {
  await Promise.all([loadEvents(), loadFreshProfiles()]);
  renderBalance();
  subscribeBalanceRealtime();
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

export function renderBalance() {
  const pane = document.getElementById('tab-balance');
  const profiles = freshProfiles.length ? freshProfiles : getProfiles();

  const sorted = [...profiles].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));
  const maxPts = sorted[0]?.total_points ?? 0;

  pane.innerHTML = `
    <div class="section-header">
      <span class="section-title">Punktestand</span>
      <button class="btn btn-sm btn-danger" id="btn-reset-points">Reset</button>
    </div>
    <div class="points-grid" id="points-grid"></div>
    <div class="section-header" style="margin-top:8px">
      <span class="section-title">Verlauf</span>
    </div>
    <div class="card" id="events-list"></div>
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
    // Show current points as starting entries
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
}

async function resetPoints() {
  if (!confirm('Alle Punkte zurücksetzen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;

  const profiles = getProfiles();
  const resetPromises = profiles.map(p =>
    window.db.from('profiles').update({ total_points: 0 }).eq('id', p.id)
  );
  await Promise.all(resetPromises);
  await window.db.from('point_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  events = [];
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
