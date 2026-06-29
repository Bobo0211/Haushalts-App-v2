import { getCurrentProfile, getProfiles, updateProfile, uploadAvatar, buildAvatarHTML, selectProfile } from './auth.js';
import { showToast } from './app.js';

export async function renderSettings() {
  const profile = getCurrentProfile();
  const profiles = getProfiles();
  const pushEnabled = await window.isPushSubscribed();

  const container = document.getElementById('settings-content');
  container.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">Profil</div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        <div id="settings-avatar-preview">
          ${buildAvatarHTML(profile, 'avatar-xl')}
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" id="btn-upload-avatar">📷 Foto ändern</button>
          <input type="file" id="avatar-file" accept="image/*" style="display:none" />
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">JPG, PNG, max. 5 MB</div>
        </div>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="settings-name" value="${escHtml(profile.name ?? '')}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Emoji</label>
          <input type="text" id="settings-emoji" value="${escHtml(profile.emoji ?? '')}" maxlength="4" />
        </div>
        <div class="form-group">
          <label>Farbe</label>
          <input type="color" id="settings-color" value="${escHtml(profile.color ?? '#6c63ff')}" style="height:42px;padding:4px" />
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="btn-save-profile">Speichern</button>
    </div>

    <div class="divider"></div>

    <div class="settings-section">
      <div class="settings-section-title">Profil wechseln</div>
      <div style="display:flex;gap:12px">
        ${profiles.map(p => `
          <button class="profile-card ${p.id === profile.id ? 'active' : ''}" data-profile-id="${p.id}" style="flex:1">
            ${buildAvatarHTML(p, 'avatar-md')}
            <span class="profile-name">${escHtml(p.name)}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="divider"></div>

    <div class="settings-section">
      <div class="settings-section-title">Push-Benachrichtigungen</div>
      <div class="toggle-row">
        <span class="toggle-label">Push aktiviert</span>
        <label class="toggle">
          <input type="checkbox" id="push-toggle" ${pushEnabled ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>
      <button class="btn btn-secondary btn-block" id="btn-test-push" style="margin-top:8px">🔔 Test-Push senden</button>
    </div>

    <div class="divider"></div>

    <div class="settings-section">
      <div class="settings-section-title">Erscheinungsbild</div>
      <div class="toggle-row">
        <span class="toggle-label">Dark Mode</span>
        <label class="toggle">
          <input type="checkbox" id="darkmode-toggle" ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>
    </div>
  `;

  // Avatar upload
  container.querySelector('#btn-upload-avatar').addEventListener('click', () => {
    container.querySelector('#avatar-file').click();
  });

  container.querySelector('#avatar-file').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Datei zu groß (max. 5 MB)'); return; }
    try {
      const url = await uploadAvatar(file);
      await updateProfile({ avatar_url: url });
      document.getElementById('settings-avatar-preview').innerHTML = buildAvatarHTML(getCurrentProfile(), 'avatar-xl');
      showToast('Profilbild aktualisiert');
    } catch (err) {
      showToast('Upload fehlgeschlagen');
    }
  });

  // Save profile
  container.querySelector('#btn-save-profile').addEventListener('click', async () => {
    const name  = container.querySelector('#settings-name').value.trim();
    const emoji = container.querySelector('#settings-emoji').value.trim();
    const color = container.querySelector('#settings-color').value;
    if (!name) { showToast('Bitte Namen eingeben'); return; }
    try {
      await updateProfile({ name, emoji, color });
      showToast('Profil gespeichert');
    } catch {
      showToast('Fehler beim Speichern');
    }
  });

  // Profile switch
  container.querySelectorAll('[data-profile-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.profileId;
      const p = getProfiles().find(p => p.id === id);
      if (p && p.id !== getCurrentProfile().id) {
        selectProfile(p);
        document.getElementById('modal-settings').classList.add('hidden');
        showToast(`Profil gewechselt zu ${p.name}`);
      }
    });
  });

  // Push toggle
  container.querySelector('#push-toggle').addEventListener('change', async e => {
    try {
      if (e.target.checked) {
        await window.subscribePush();
        showToast('Push aktiviert');
      } else {
        await window.unsubscribePush();
        showToast('Push deaktiviert');
      }
    } catch (err) {
      showToast(err.message);
      e.target.checked = !e.target.checked;
    }
  });

  // Test push
  container.querySelector('#btn-test-push').addEventListener('click', async () => {
    try {
      await window.sendTestPush();
      showToast('Test-Push gesendet');
    } catch {
      showToast('Push-Test fehlgeschlagen');
    }
  });

  // Dark mode
  container.querySelector('#darkmode-toggle').addEventListener('change', e => {
    const dark = e.target.checked;
    document.documentElement.dataset.theme = dark ? 'dark' : '';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  });
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
