import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env?.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();
const supabaseConfigError = 'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar configuradas.';

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function buildMissingConfigProxy() {
    return new Proxy({}, {
        get() {
            throw new Error(supabaseConfigError);
        }
    });
}

export { isSupabaseConfigured, supabaseConfigError };

export const supabase = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    })
    : buildMissingConfigProxy();
