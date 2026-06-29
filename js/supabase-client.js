const SUPABASE_URL = 'https://dqehjjnsdzpmsihljieq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZWhqam5zZHpwbXNpaGxqaWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDcxMDMsImV4cCI6MjA5NjIyMzEwM30.7zopkzUucxfuEoefisRJF1nm-43sjDVagzwP-7ox520';

if (!window.supabase) {
  throw new Error('Supabase CDN nicht geladen – prüfe die Script-Reihenfolge in index.html');
}

console.log('Supabase init:', SUPABASE_URL, SUPABASE_ANON_KEY ? 'Key OK' : 'KEY FEHLT');

// createClient handles apikey header automatically from the second argument.
// Do NOT pass global.headers – it overrides instead of merges and strips the apikey.
const _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Expose as window.db so every module uses the exact same instance
window.db = _client;
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

export const supabase = _client;
export { SUPABASE_URL, SUPABASE_ANON_KEY };
