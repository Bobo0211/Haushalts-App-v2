const SUPABASE_URL = 'https://dqehjjnsdzpmsihljieq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZWhqam5zZHpwbXNpaGxqaWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDcxMDMsImV4cCI6MjA5NjIyMzEwM30.7zopkzUucxfuEoefisRJF1nm-43sjDVagzwP-7ox520';

if (!window.supabase) {
  throw new Error('Supabase CDN nicht geladen – prüfe die Script-Reihenfolge in index.html');
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: {
    headers: { apikey: SUPABASE_ANON_KEY },
  },
});
export { SUPABASE_URL, SUPABASE_ANON_KEY };
