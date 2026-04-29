import { supabase } from '../lib/supabaseClient.js';
import { normalizeAuthError } from './networkErrors.js';

export const authService = {
    async getSession() {
        try {
            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            return data.session || null;
        } catch (error) {
            throw normalizeAuthError(error, {
                fallbackMessage: 'Nao foi possivel consultar a sessao atual.',
                operation: 'getSession',
                target: 'supabase-auth'
            });
        }
    },

    async signInWithPassword(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            return data.session || null;
        } catch (error) {
            throw normalizeAuthError(error, {
                fallbackMessage: 'Nao foi possivel entrar com email e senha.',
                operation: 'signInWithPassword',
                target: 'supabase-auth'
            });
        }
    },

    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        } catch (error) {
            throw normalizeAuthError(error, {
                fallbackMessage: 'Nao foi possivel encerrar a sessao.',
                operation: 'signOut',
                target: 'supabase-auth'
            });
        }
    },

    async updatePassword(password) {
        try {
            const { data, error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            return data?.user || null;
        } catch (error) {
            throw normalizeAuthError(error, {
                fallbackMessage: 'Nao foi possivel atualizar a senha.',
                operation: 'updatePassword',
                target: 'supabase-auth'
            });
        }
    },

    async resetPasswordForEmail(email, options = {}) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, options);
            if (error) throw error;
        } catch (error) {
            throw normalizeAuthError(error, {
                fallbackMessage: 'Nao foi possivel solicitar a recuperacao de senha.',
                operation: 'resetPasswordForEmail',
                target: 'supabase-auth'
            });
        }
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
