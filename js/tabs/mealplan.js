import { getCurrentProfile } from '../auth.js';
import { showToast, openModal, parseLocalDate, toLocalDateString } from '../app.js';
import { loadShoppingItems } from './shopping.js';

let mealplan = [];
let recipes = [];
let weekOffset = 0;

export async function initMealplan() {
  const [mpRes, recRes] = await Promise.all([
    window.db.from('meal_plan').select('*, recipe:recipe_id(*)'),
    window.db.from('recipes').select('id, title, emoji').order('title'),
  ]);
  mealplan = mpRes.data ?? [];
  recipes = recRes.data ?? [];
  renderMealplan();
}

export function onRealtimeMealplan(payload) {
  const { eventType, new: n, old: o } = payload;
  if (eventType === 'DELETE') {
    mealplan = mealplan.filter(m => m.id !== o.id);
    renderMealplan();
    return;
  }
  // Reload full row with join for INSERT/UPDATE
  window.db.from('meal_plan').select('*, recipe:recipe_id(*)').eq('id', n.id).single().then(({ data }) => {
    if (!data) return;
    if (eventType === 'INSERT') mealplan = [...mealplan, data];
    else mealplan = mealplan.map(m => m.id === data.id ? data : m);
    renderMealplan();
  });
}

export function onRealtimeRecipes() {
  window.db.from('recipes').select('id, title, emoji').order('title').then(({ data }) => {
    recipes = data ?? [];
    renderMealplan();
  });
}

function getWeekDays() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function renderMealplan() {
  const pane = document.getElementById('tab-mealplan');
  const days = getWeekDays();
  const weekStart = days[0].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const weekEnd   = days[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

  pane.innerHTML = `
    <div class="week-nav">
      <button class="btn btn-icon btn-secondary" id="btn-prev-week">‹</button>
      <span class="week-label">${weekStart} – ${weekEnd}</span>
      <button class="btn btn-icon btn-secondary" id="btn-next-week">›</button>
    </div>
    <div id="mealplan-days"></div>
  `;

  pane.querySelector('#btn-prev-week').addEventListener('click', () => { weekOffset--; renderMealplan(); });
  pane.querySelector('#btn-next-week').addEventListener('click', () => { weekOffset++; renderMealplan(); });

  const daysEl = pane.querySelector('#mealplan-days');
  days.forEach(day => {
    const iso = toLocalDateString(day);
    const entry = mealplan.find(m => m.plan_date === iso);
    const recipe = entry?.recipe;

    const card = document.createElement('div');
    card.className = 'meal-day-card';
    card.innerHTML = `
      <div class="meal-day-header">
        <span class="meal-day-name">${day.toLocaleDateString('de-DE', { weekday: 'long' })}</span>
        <span class="meal-day-date">${day.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
      </div>
      ${recipe
        ? `<div style="display:flex;align-items:center;gap:12px;cursor:pointer" class="meal-recipe-row">
             <span style="font-size:28px">${escHtml(recipe.emoji ?? '🍽️')}</span>
             <span style="font-weight:700;flex:1">${escHtml(recipe.title)}</span>
             <div style="display:flex;gap:4px;flex-shrink:0">
               ${recipe.ingredients?.length ? `<button class="btn btn-sm btn-secondary btn-import-ingredients">🛒 Zutaten</button>` : ''}
               <button class="btn btn-sm btn-secondary btn-change-meal">Ändern</button>
             </div>
           </div>`
        : `<button class="btn btn-secondary btn-block btn-assign-meal">+ Rezept zuweisen</button>`
      }
    `;

    if (recipe) {
      card.querySelector('.meal-recipe-row').addEventListener('click', e => {
        if (e.target.closest('.btn-change-meal') || e.target.closest('.btn-import-ingredients')) return;
        openRecipeDetail(recipe);
      });
      card.querySelector('.btn-change-meal').addEventListener('click', () => openAssignModal(iso, entry?.id));
      card.querySelector('.btn-import-ingredients')?.addEventListener('click', () => importIngredients(recipe));
    } else {
      card.querySelector('.btn-assign-meal').addEventListener('click', () => openAssignModal(iso, null));
    }

    daysEl.appendChild(card);
  });
}

function openAssignModal(date, existingId) {
  const options = recipes.map(r =>
    `<option value="${r.id}">${escHtml(r.emoji ?? '')} ${escHtml(r.title)}</option>`
  ).join('');

  openModal('Rezept zuweisen', `
    <div class="form-group">
      <label>Rezept für ${parseLocalDate(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</label>
      <select id="meal-recipe-select">
        <option value="">– Kein Rezept –</option>
        ${options}
      </select>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-block" id="btn-save-meal">Speichern</button>
      ${existingId ? `<button class="btn btn-danger btn-block" id="btn-remove-meal">Entfernen</button>` : ''}
    </div>
  `);

  document.getElementById('btn-save-meal').addEventListener('click', async () => {
    const recipeId = document.getElementById('meal-recipe-select').value;
    if (!recipeId) return;
    const profile = getCurrentProfile();
    if (existingId) {
      await window.db.from('meal_plan').update({ recipe_id: recipeId }).eq('id', existingId);
    } else {
      await window.db.from('meal_plan').insert({
        plan_date:  date,
        recipe_id:  recipeId,
        created_by: profile?.id ?? null,
      });
    }
    document.getElementById('modal-generic').classList.add('hidden');
    showToast('Kochplan aktualisiert');
  });

  document.getElementById('btn-remove-meal')?.addEventListener('click', async () => {
    await window.db.from('meal_plan').delete().eq('id', existingId);
    document.getElementById('modal-generic').classList.add('hidden');
    showToast('Rezept entfernt');
  });
}

function openRecipeDetail(recipe) {
  const steps = parseSteps(recipe.notes);
  const ingredients = (recipe.ingredients ?? []).map(ing =>
    `<li>${ing.amount ? escHtml(String(ing.amount)) + ' ' : ''}${escHtml(ing.unit ?? '')} ${escHtml(ing.name)}</li>`
  ).join('');
  const stepsHtml = steps.map((s, i) =>
    `<li style="margin-bottom:8px"><strong>${i + 1}.</strong> ${escHtml(s)}</li>`
  ).join('');

  openModal(recipe.title, `
    <div style="text-align:center;font-size:48px;margin-bottom:16px">${escHtml(recipe.emoji ?? '🍽️')}</div>
    <div class="chip chip-category" style="margin-bottom:12px">${escHtml(recipe.category ?? '')}</div>
    ${recipe.description ? `<p style="margin-bottom:16px;color:var(--text-secondary)">${escHtml(recipe.description)}</p>` : ''}
    <div style="display:flex;gap:16px;margin-bottom:16px;font-size:13px;color:var(--text-secondary)">
      ${recipe.servings  ? `<span>🍴 ${recipe.servings} Portionen</span>` : ''}
      ${recipe.prep_time ? `<span>⏱️ ${recipe.prep_time} Min Vorbereitung</span>` : ''}
      ${recipe.cook_time ? `<span>🔥 ${recipe.cook_time} Min Kochen</span>` : ''}
    </div>
    ${ingredients ? `<h3 style="margin-bottom:8px">Zutaten</h3><ul style="padding-left:20px;margin-bottom:16px">${ingredients}</ul>` : ''}
    ${stepsHtml ? `<h3 style="margin-bottom:8px">Zubereitung</h3><ol style="padding-left:20px">${stepsHtml}</ol>` : ''}
    ${recipe.source_url ? `<a href="${escHtml(recipe.source_url)}" target="_blank" rel="noopener" style="margin-top:16px;display:block">🔗 Quelle</a>` : ''}
  `);
}

function guessCategory(ingredientName) {
  const name = ingredientName.toLowerCase();
  if (/milch|käse|joghurt|butter|sahne|quark|\bei\b|\beier\b|mozzarella|parmesan|feta/.test(name))
    return 'Milchprodukte';
  if (/apfel|banane|tomate|gurke|salat|zwiebel|knoblauch|karotte|paprika|zucchini|spinat|brokkoli|mais|erbsen|bohnen|pilz|lauch|petersilie|basilikum|zitrone|limette|orange/.test(name))
    return 'Obst & Gemüse';
  if (/hähnchen|hühnchen|rind|schwein|hack|speck|wurst|lachs|thunfisch|garnelen|fisch/.test(name))
    return 'Fleisch';
  if (/reis|nudel|spaghetti|pasta|couscous|bulgur|quinoa|linsen|kichererbsen|polenta|grieß|vollkorn/.test(name))
    return 'Getreide & Beilagen';
  if (/mehl|zucker|brot|brötchen|toast|haferflocken|backpulver/.test(name))
    return 'Backwaren';
  if (/tiefkühl|gefroren/.test(name))
    return 'Tiefkühl';
  if (/saft|wasser|cola|bier|wein/.test(name))
    return 'Getränke';
  if (/shampoo|duschgel|seife|waschmittel|spülmittel|deo|zahnpasta|klopapier/.test(name))
    return 'Drogerie & Haushalt';
  return 'Sonstiges';
}

async function importIngredients(recipe) {
  const profile = getCurrentProfile();
  const ingredients = recipe.ingredients ?? [];
  if (!ingredients.length) return;

  const inserts = ingredients.map(ing => ({
    name:          ing.name,
    amount:        ing.amount ?? null,
    unit:          ing.unit ?? null,
    shop_category: guessCategory(ing.name),
    is_checked:    false,
    recipe_id:     recipe.id,
    added_by:      profile?.id ?? null,
  }));

  const { error } = await window.db.from('shopping_items').insert(inserts);
  if (error) { showToast('Fehler beim Importieren'); return; }
  showToast(`${ingredients.length} Zutaten von „${recipe.title}" zur Einkaufsliste hinzugefügt`);
  setTimeout(() => loadShoppingItems(), 500);
}

export function parseSteps(notes) {
  try { return JSON.parse(notes)?.steps ?? []; } catch { return []; }
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
