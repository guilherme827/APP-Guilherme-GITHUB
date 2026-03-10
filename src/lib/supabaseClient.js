import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env?.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar configuradas.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});
