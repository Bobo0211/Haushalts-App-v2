import { loadProfiles, renderLoginScreen, selectProfile, getCurrentProfile, getProfiles } from './auth.js';
import { subscribeAll } from './realtime.js';
import { initTasks, renderTasks, onRealtimeTasks } from './tabs/tasks.js';
import { initMealplan, renderMealplan, onRealtimeMealplan, onRealtimeRecipes as onMealRecipes } from './tabs/mealplan.js';
import { initShopping, renderShopping, onRealtimeShopping } from './tabs/shopping.js';
import { initRecipes, renderRecipes, onRealtimeRecipes } from './tabs/recipes.js';
import { initBalance, renderBalance, onRealtimePointEvents, onRealtimeProfiles } from './tabs/balance.js';
import { renderSettings } from './settings.js';

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

// ─── Generic Modal ────────────────────────────────────────────────────────────
export function openModal(title, bodyHtml) {
  document.getElementById('modal-generic-title').textContent = title;
  document.getElementById('modal-generic-body').innerHTML = bodyHtml;
  document.getElementById('modal-generic').classList.remove('hidden');
}

// ─── Tab Routing ──────────────────────────────────────────────────────────────
const TABS = ['tasks', 'mealplan', 'shopping', 'recipes', 'balance'];
let activeTab = localStorage.getItem('activeTab') ?? 'tasks';

function showTab(tab) {
  if (!TABS.includes(tab)) tab = 'tasks';
  activeTab = tab;
  localStorage.setItem('activeTab', tab);

  TABS.forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

// ─── Realtime Callbacks ───────────────────────────────────────────────────────
function setupRealtime() {
  subscribeAll({
    tasks:        payload => { onRealtimeTasks(payload); },
    mealplan:     payload => { onRealtimeMealplan(payload); },
    shopping:     payload => { onRealtimeShopping(payload); },
    recipes:      payload => { onRealtimeRecipes(payload); onMealRecipes(payload); },
    point_events: payload => { onRealtimePointEvents(payload); },
    profiles:     payload => {
      // Refresh profiles array then re-render balance
      loadProfiles().then(() => onRealtimeProfiles());
    },
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  // Apply saved theme
  const theme = localStorage.getItem('theme') ?? 'light';
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : '';

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Load profiles
  try {
    await loadProfiles();
  } catch (err) {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-screen').innerHTML = `
      <div class="login-card">
        <h1>⚠️ Verbindungsfehler</h1>
        <p>Bitte Internetverbindung prüfen und neu laden.</p>
        <button class="btn btn-primary" onclick="location.reload()" style="margin-top:16px">Neu laden</button>
      </div>`;
    return;
  }

  const profiles = getProfiles();
  if (!profiles.length) {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-screen').innerHTML = `
      <div class="login-card">
        <h1>⚠️ Keine Profile</h1>
        <p>Bitte erst Profile in Supabase anlegen.</p>
      </div>`;
    return;
  }

  // Auto-login if saved profile exists
  const savedId = localStorage.getItem('profileId');
  const savedProfile = savedId ? profiles.find(p => p.id === savedId) : null;

  if (savedProfile) {
    selectProfile(savedProfile);
  } else {
    renderLoginScreen();
    document.getElementById('login-screen').classList.remove('hidden');
  }
}

// ─── After Profile Selected ───────────────────────────────────────────────────
document.addEventListener('profile:selected', async () => {
  // Init all tabs in parallel (non-blocking)
  await Promise.all([
    initTasks(),
    initMealplan(),
    initShopping(),
    initRecipes(),
    initBalance(),
  ]);

  showTab(activeTab);
  setupRealtime();
});

// ─── Nav Buttons ──────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// ─── Settings Modal ───────────────────────────────────────────────────────────
document.getElementById('btn-settings').addEventListener('click', async () => {
  document.getElementById('modal-settings').classList.remove('hidden');
  await renderSettings();
});

document.getElementById('btn-switch-profile').addEventListener('click', async () => {
  document.getElementById('modal-settings').classList.remove('hidden');
  await renderSettings();
});

// ─── Modal Close ──────────────────────────────────────────────────────────────
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.dataset.close;
    document.getElementById(modalId)?.classList.add('hidden');
  });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
boot();
