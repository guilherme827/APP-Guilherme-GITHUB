import { supabase } from '../lib/supabaseClient.js';

export const authService = {
    async getSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session || null;
    },

    async signInWithPassword(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.session || null;
    },

    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    async updatePassword(password) {
        const { data, error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        return data?.user || null;
    },

    async resetPasswordForEmail(email, options = {}) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, options);
        if (error) throw error;
    },

    async getAccessToken() {
        const session = await this.getSession();
        return session?.access_token || '';
    },

    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session || null);
        });
    }
};
