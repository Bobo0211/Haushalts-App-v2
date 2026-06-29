import { getCurrentProfile } from '../auth.js';
import { showToast, openModal } from '../app.js';

const CATEGORIES = [
  { key: 'pasta', label: 'Pasta',    emoji: '🍝' },
  { key: 'meat',  label: 'Fleisch',  emoji: '🥩' },
  { key: 'vegi',  label: 'Vegi',     emoji: '🥗' },
  { key: 'fish',  label: 'Fisch',    emoji: '🐟' },
  { key: 'misc',  label: 'Sonstiges',emoji: '🍲' },
];

let recipes = [];
let searchQuery = '';

export async function initRecipes() {
  const { data, error } = await window.db
    .from('recipes')
    .select('*')
    .order('title');
  if (!error) recipes = data ?? [];
  renderRecipes();
}

export function onRealtimeRecipes(payload) {
  const { eventType, new: n, old: o } = payload;
  if (eventType === 'INSERT') recipes = [...recipes, n];
  else if (eventType === 'UPDATE') recipes = recipes.map(r => r.id === n.id ? n : r);
  else if (eventType === 'DELETE') recipes = recipes.filter(r => r.id !== o.id);
  renderRecipes();
}

export function renderRecipes() {
  const pane = document.getElementById('tab-recipes');

  pane.innerHTML = `
    <div class="section-header">
      <span class="section-title">Rezepte</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-secondary" id="btn-pdf-import">📄 PDF</button>
        <button class="btn btn-sm btn-primary" id="btn-add-recipe">+ Neu</button>
      </div>
    </div>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="search" id="recipe-search" placeholder="Rezepte suchen…" value="${escHtml(searchQuery)}" />
    </div>
    <div id="recipes-list"></div>
  `;

  pane.querySelector('#recipe-search').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderRecipeList();
  });
  pane.querySelector('#btn-add-recipe').addEventListener('click', () => openRecipeForm());
  pane.querySelector('#btn-pdf-import').addEventListener('click', () => openPdfImport());

  renderRecipeList();
}

function renderRecipeList() {
  const listEl = document.getElementById('recipes-list');
  if (!listEl) return;

  const q = searchQuery.toLowerCase();
  const filtered = q ? recipes.filter(r => r.title?.toLowerCase().includes(q)) : recipes;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📖</div>
        <div class="empty-state-text">${q ? 'Keine Treffer' : 'Noch keine Rezepte'}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach(recipe => {
    const cat = CATEGORIES.find(c => c.key === recipe.category) ?? { label: recipe.category ?? '', emoji: '🍲' };
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <span class="recipe-emoji">${escHtml(recipe.emoji ?? '🍲')}</span>
      <div class="recipe-body">
        <div class="recipe-title">${escHtml(recipe.title)}</div>
        <div class="recipe-meta">
          <span>${cat.emoji} ${cat.label}</span>
          ${recipe.servings  ? ` · 🍴 ${recipe.servings} Port.` : ''}
          ${recipe.prep_time ? ` · ⏱️ ${recipe.prep_time} Min`  : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn btn-icon btn-secondary btn-edit-recipe" title="Bearbeiten">✏️</button>
        <button class="btn btn-icon btn-secondary btn-del-recipe" title="Löschen">🗑️</button>
      </div>
    `;
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-edit-recipe') || e.target.closest('.btn-del-recipe')) return;
      openRecipeDetail(recipe);
    });
    card.querySelector('.btn-edit-recipe').addEventListener('click', () => openRecipeForm(recipe));
    card.querySelector('.btn-del-recipe').addEventListener('click', () => deleteRecipe(recipe.id));
    listEl.appendChild(card);
  });
}

// ─── Steps are stored as JSON in the notes column ────────────────────────────
function parseSteps(notes) {
  try { return JSON.parse(notes)?.steps ?? []; } catch { return []; }
}

function stepsToNotes(steps) {
  return steps.length ? JSON.stringify({ steps }) : null;
}

// ─── Form ─────────────────────────────────────────────────────────────────────
function buildRecipeFormBody(recipe = null) {
  const catOptions = CATEGORIES.map(c =>
    `<option value="${c.key}" ${recipe?.category === c.key ? 'selected' : ''}>${c.emoji} ${c.label}</option>`
  ).join('');

  const ingredients = recipe?.ingredients ?? [{ amount: '', unit: '', name: '' }];
  const steps = parseSteps(recipe?.notes);
  if (steps.length === 0) steps.push('');

  const ingRows = ingredients.map((ing, i) => `
    <div class="ingredient-row" data-ing="${i}">
      <input type="text" placeholder="Menge"   class="ing-amount" value="${escHtml(String(ing.amount ?? ''))}" />
      <input type="text" placeholder="Einheit" class="ing-unit"   value="${escHtml(ing.unit ?? '')}" />
      <input type="text" placeholder="Zutat"   class="ing-name"   value="${escHtml(ing.name ?? '')}" />
      <button type="button" class="btn-remove-item">✕</button>
    </div>
  `).join('');

  const stepRows = steps.map((s, i) => `
    <div class="list-editable-item" data-step="${i}">
      <span style="font-weight:700;color:var(--text-secondary);min-width:20px">${i + 1}.</span>
      <input type="text" placeholder="Schritt beschreiben…" class="step-input" value="${escHtml(s)}" />
      <button type="button" class="btn-remove-item">✕</button>
    </div>
  `).join('');

  return `
    <form id="recipe-form">
      <div class="form-row">
        <div class="form-group">
          <label>Emoji</label>
          <input type="text" name="emoji" value="${escHtml(recipe?.emoji ?? '🍲')}" maxlength="4" />
        </div>
        <div class="form-group">
          <label>Kategorie</label>
          <select name="category">${catOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <label>Titel</label>
        <input type="text" name="title" value="${escHtml(recipe?.title ?? '')}" required placeholder="Rezeptname" />
      </div>
      <div class="form-group">
        <label>Kurzbeschreibung</label>
        <textarea name="description" rows="2" placeholder="Kurze Beschreibung…">${escHtml(recipe?.description ?? '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Portionen</label>
          <input type="number" name="servings" value="${recipe?.servings ?? 2}" min="1" />
        </div>
        <div class="form-group">
          <label>Vorbereitung (Min)</label>
          <input type="number" name="prep_time" value="${recipe?.prep_time ?? ''}" min="0" />
        </div>
        <div class="form-group">
          <label>Kochen (Min)</label>
          <input type="number" name="cook_time" value="${recipe?.cook_time ?? ''}" min="0" />
        </div>
      </div>
      <div class="form-group">
        <label>Quelle (URL)</label>
        <input type="url" name="source_url" value="${escHtml(recipe?.source_url ?? '')}" placeholder="https://…" />
      </div>

      <div class="divider"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <label style="margin:0">Zutaten</label>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-add-ing">+ Zutat</button>
      </div>
      <div id="ingredients-list" class="list-editable">${ingRows}</div>

      <div class="divider"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <label style="margin:0">Schritte</label>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-add-step">+ Schritt</button>
      </div>
      <div id="steps-list" class="list-editable">${stepRows}</div>

      <div style="margin-top:16px">
        <button type="submit" class="btn btn-primary btn-block">${recipe ? 'Speichern' : 'Rezept anlegen'}</button>
      </div>
    </form>
  `;
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
    <div style="text-align:center;font-size:48px;margin-bottom:16px">${escHtml(recipe.emoji ?? '🍲')}</div>
    ${recipe.description ? `<p style="margin-bottom:16px;color:var(--text-secondary)">${escHtml(recipe.description)}</p>` : ''}
    <div style="display:flex;gap:16px;margin-bottom:16px;font-size:13px;color:var(--text-secondary)">
      ${recipe.servings  ? `<span>🍴 ${recipe.servings} Portionen</span>`    : ''}
      ${recipe.prep_time ? `<span>⏱️ ${recipe.prep_time} Min</span>` : ''}
      ${recipe.cook_time ? `<span>🔥 ${recipe.cook_time} Min</span>` : ''}
    </div>
    ${ingredients ? `<h3 style="margin-bottom:8px">Zutaten</h3><ul style="padding-left:20px;margin-bottom:16px">${ingredients}</ul>` : ''}
    ${stepsHtml   ? `<h3 style="margin-bottom:8px">Zubereitung</h3><ol style="padding-left:20px">${stepsHtml}</ol>` : ''}
    ${recipe.source_url ? `<a href="${escHtml(recipe.source_url)}" target="_blank" rel="noopener" style="margin-top:16px;display:block">🔗 Quelle</a>` : ''}
  `);
}

function openRecipeForm(recipe = null) {
  openModal(recipe ? 'Rezept bearbeiten' : 'Neues Rezept', buildRecipeFormBody(recipe));
  bindRecipeForm(recipe);
}

function bindRecipeForm(existingRecipe) {
  const modal = document.getElementById('modal-generic-body');

  modal.querySelector('#btn-add-ing').addEventListener('click', () => {
    const list = modal.querySelector('#ingredients-list');
    const i = list.children.length;
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.dataset.ing = i;
    row.innerHTML = `
      <input type="text" placeholder="Menge"   class="ing-amount" />
      <input type="text" placeholder="Einheit" class="ing-unit" />
      <input type="text" placeholder="Zutat"   class="ing-name" />
      <button type="button" class="btn-remove-item">✕</button>
    `;
    list.appendChild(row);
    bindRemoveButtons(list, '.ingredient-row');
  });

  modal.querySelector('#btn-add-step').addEventListener('click', () => {
    const list = modal.querySelector('#steps-list');
    const i = list.children.length;
    const row = document.createElement('div');
    row.className = 'list-editable-item';
    row.dataset.step = i;
    row.innerHTML = `
      <span style="font-weight:700;color:var(--text-secondary);min-width:20px">${i + 1}.</span>
      <input type="text" placeholder="Schritt beschreiben…" class="step-input" />
      <button type="button" class="btn-remove-item">✕</button>
    `;
    list.appendChild(row);
    bindRemoveButtons(list, '.list-editable-item');
  });

  bindRemoveButtons(modal.querySelector('#ingredients-list'), '.ingredient-row');
  bindRemoveButtons(modal.querySelector('#steps-list'), '.list-editable-item');

  modal.querySelector('#recipe-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);

    const ingredients = [...modal.querySelectorAll('.ingredient-row')].map(row => ({
      amount: row.querySelector('.ing-amount').value.trim(),
      unit:   row.querySelector('.ing-unit').value.trim(),
      name:   row.querySelector('.ing-name').value.trim(),
    })).filter(ing => ing.name);

    const steps = [...modal.querySelectorAll('.step-input')]
      .map(i => i.value.trim()).filter(Boolean);

    const profile = getCurrentProfile();
    const payload = {
      title:       fd.get('title'),
      emoji:       fd.get('emoji'),
      category:    fd.get('category'),
      servings:    parseInt(fd.get('servings') ?? '2', 10),
      prep_time:   fd.get('prep_time') ? parseInt(fd.get('prep_time'), 10) : null,
      cook_time:   fd.get('cook_time') ? parseInt(fd.get('cook_time'), 10) : null,
      description: fd.get('description') || null,
      source_url:  fd.get('source_url') || null,
      ingredients,
      notes:       stepsToNotes(steps),
    };

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = '…';

    let error;
    if (existingRecipe) {
      ({ error } = await window.db.from('recipes').update(payload).eq('id', existingRecipe.id));
    } else {
      ({ error } = await window.db.from('recipes').insert({ ...payload, created_by: profile?.id ?? null }));
    }

    if (error) {
      showToast('Fehler beim Speichern');
      btn.disabled = false;
      btn.textContent = existingRecipe ? 'Speichern' : 'Rezept anlegen';
      return;
    }
    document.getElementById('modal-generic').classList.add('hidden');
    showToast(existingRecipe ? 'Rezept aktualisiert' : 'Rezept angelegt');
  });
}

function bindRemoveButtons(container, itemSelector) {
  container.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.onclick = () => {
      btn.closest(itemSelector).remove();
      container.querySelectorAll('.list-editable-item').forEach((row, i) => {
        const numEl = row.querySelector('span');
        if (numEl) numEl.textContent = `${i + 1}.`;
      });
    };
  });
}

async function deleteRecipe(id) {
  if (!confirm('Rezept löschen?')) return;
  await window.db.from('recipes').delete().eq('id', id);
}

// ─── PDF Import ───────────────────────────────────────────────────────────────
function openPdfImport() {
  openModal('PDF-Import', `
    <div class="form-group">
      <label>PDF-Datei auswählen</label>
      <input type="file" id="pdf-file-input" accept=".pdf" />
    </div>
    <div id="pdf-status"></div>
  `);
  document.getElementById('pdf-file-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPdf(file);
  });
}

async function processPdf(file) {
  const statusEl = document.getElementById('pdf-status');
  statusEl.innerHTML = `<div style="text-align:center;padding:16px"><span class="spinner"></span> PDF wird gelesen…</div>`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }

    statusEl.innerHTML = `
      <div style="margin-bottom:12px;font-weight:600">Extrahierter Text:</div>
      <div class="pdf-preview-box">${escHtml(fullText.substring(0, 800))}${fullText.length > 800 ? '…' : ''}</div>
      <div style="text-align:center;padding:8px"><span class="spinner"></span> KI analysiert Rezept…</div>
    `;

    const recipe = await analyzeRecipeWithAI(fullText);

    statusEl.innerHTML = `<div style="font-weight:600;margin-bottom:8px;color:var(--color-success)">✅ Rezept erkannt – bitte prüfen und speichern:</div>`;
    const formContainer = document.createElement('div');
    formContainer.innerHTML = buildRecipeFormBody(recipe);
    statusEl.appendChild(formContainer);
    bindRecipeForm(null);

  } catch (err) {
    statusEl.innerHTML = `<div style="color:var(--color-danger)">Fehler: ${escHtml(err.message)}</div>`;
  }
}

async function analyzeRecipeWithAI(text) {
  const resp = await fetch('https://dqehjjnsdzpmsihljieq.supabase.co/functions/v1/analyze-recipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZWhqam5zZHpwbXNpaGxqaWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDcxMDMsImV4cCI6MjA5NjIyMzEwM30.7zopkzUucxfuEoefisRJF1nm-43sjDVagzwP-7ox520`,
    },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`KI-Analyse fehlgeschlagen: ${await resp.text()}`);
  const data = await resp.json();
  // Edge Function returns portions/steps → map to servings/notes
  if (data.recipe?.portions !== undefined && data.recipe.servings === undefined) {
    data.recipe.servings = data.recipe.portions;
    delete data.recipe.portions;
  }
  if (Array.isArray(data.recipe?.steps)) {
    data.recipe.notes = stepsToNotes(data.recipe.steps);
    delete data.recipe.steps;
  }
  return data.recipe ?? data;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
