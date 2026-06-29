
const channels = [];

export function subscribeAll(callbacks) {
  unsubscribeAll();

  const tables = ['tasks', 'recipes', 'meal_plan', 'shopping_items', 'point_events', 'profiles'];

  tables.forEach(table => {
    const ch = window.db
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
        callbacks[table]?.(payload);
      })
      .subscribe();
    channels.push(ch);
  });
}

export function unsubscribeAll() {
  channels.forEach(ch => window.db.removeChannel(ch));
  channels.length = 0;
}
