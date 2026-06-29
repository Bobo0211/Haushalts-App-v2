import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client.js'; // Key kommt aus supabase-client.js
import { getCurrentProfile } from './auth.js';

const VAPID_PUBLIC_KEY = 'BPYaHd7-TwIDYKF0P6mFZSFtQgALbVj3_eujrRIJFKVo0aZEFyQJnHJ_d68Yb-_8HaFd7bBCVFGZEm1C-Tskbhc';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push nicht unterstützt');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Push verweigert');

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const profile = getCurrentProfile();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      profile_id: profile.id,
      subscription: sub.toJSON(),
    }, { onConflict: 'profile_id' });

  if (error) throw error;
  return sub;
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();

  const profile = getCurrentProfile();
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('profile_id', profile.id);
}

export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export async function sendTestPush() {
  const profile = getCurrentProfile();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      profile_id: profile.id,
      title: '🏠 Test-Push',
      body: 'Push-Benachrichtigungen funktionieren!',
    }),
  });
  if (!resp.ok) throw new Error('Push fehlgeschlagen');
}

export async function notifyTaskDone(task, assignedProfile) {
  if (!assignedProfile) return;
  const profile = getCurrentProfile();
  // Notify the other person when they complete a task
  fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      profile_id: assignedProfile.id,
      title: `✅ ${task.title}`,
      body: `${profile.name} hat die Aufgabe erledigt (+${task.points} Pkt.)`,
    }),
  }).catch(() => {});
}
