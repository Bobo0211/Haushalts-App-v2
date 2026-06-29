import { supabase } from './supabase-client.js';
import { showToast } from './app.js';

let profiles = [];
let currentProfile = null;

export function getCurrentProfile() {
  return currentProfile;
}

export function getProfiles() {
  return profiles;
}

export function getOtherProfile() {
  return profiles.find(p => p.id !== currentProfile?.id) ?? null;
}

export async function loadProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('name');
  if (error) throw error;
  profiles = data ?? [];
  return profiles;
}

export async function refreshCurrentProfile() {
  if (!currentProfile) return;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentProfile.id)
    .single();
  if (data) {
    currentProfile = data;
    profiles = profiles.map(p => p.id === data.id ? data : p);
  }
}

export function renderLoginScreen() {
  const container = document.getElementById('profile-list');
  container.innerHTML = '';

  profiles.forEach(profile => {
    const card = document.createElement('button');
    card.className = 'profile-card';
    card.innerHTML = `
      ${buildAvatarHTML(profile, 'avatar-lg')}
      <span class="profile-name">${escHtml(profile.name)}</span>
    `;
    card.addEventListener('click', () => selectProfile(profile));
    container.appendChild(card);
  });
}

export function selectProfile(profile) {
  currentProfile = profile;
  localStorage.setItem('profileId', profile.id);
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  updateHeaderAvatar();
  document.dispatchEvent(new CustomEvent('profile:selected', { detail: profile }));
}

export function updateHeaderAvatar() {
  const p = currentProfile;
  if (!p) return;
  const el = document.getElementById('current-avatar');
  el.outerHTML = buildAvatarHTML(p, 'avatar-sm', 'current-avatar');
}

export function buildAvatarHTML(profile, sizeClass = 'avatar-md', id = '') {
  const idAttr = id ? `id="${id}"` : '';
  const bg = profile.color ?? '#6c63ff';
  const initials = (profile.emoji ?? profile.name?.charAt(0) ?? '?');

  if (profile.avatar_url) {
    return `
      <div ${idAttr} class="avatar ${sizeClass}" style="background:${bg};color:white">
        <img src="${escHtml(profile.avatar_url)}"
             alt="${escHtml(profile.name)}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <span style="display:none;position:absolute;inset:0;align-items:center;justify-content:center">${escHtml(initials)}</span>
      </div>`;
  }

  return `
    <div ${idAttr} class="avatar ${sizeClass}" style="background:${bg};color:white">
      ${escHtml(initials)}
    </div>`;
}

export async function updateProfile(updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', currentProfile.id)
    .select()
    .single();
  if (error) throw error;
  currentProfile = data;
  profiles = profiles.map(p => p.id === data.id ? data : p);
  updateHeaderAvatar();
  return data;
}

export async function uploadAvatar(file) {
  const ext = file.name.split('.').pop();
  const path = `${currentProfile.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
