import { supabase } from './supabase-client.js';

const channels = [];

export function subscribeAll(callbacks) {
  unsubscribeAll();

  const tables = ['tasks', 'recipes', 'meal_plan', 'shopping_items', 'point_events', 'profiles'];

  tables.forEach(table => {
    const ch = supabase
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
        callbacks[table]?.(payload);
      })
      .subscribe();
    channels.push(ch);
  });
}

export function unsubscribeAll() {
  channels.forEach(ch => supabase.removeChannel(ch));
  channels.length = 0;
}
