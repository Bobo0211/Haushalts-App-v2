const SUPABASE_URL = 'https://dqehjjnsdzpmsihljieq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZWhqam5zZHpwbXNpaGxqaWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY2ODQ4MDYsImV4cCI6MjA1MjI2MDgwNn0.xRecHlbKqHMv0ioPiPuEjNVdLXeaQxON4mgRSXXK_HE';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { SUPABASE_URL, SUPABASE_ANON_KEY };
