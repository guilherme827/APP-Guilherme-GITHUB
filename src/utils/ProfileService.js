import { supabase } from '../lib/supabaseClient.js';

function getSupabaseMessage(error, fallback) {
    return error?.message || fallback;
}

export const profileService = {
    async getProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível carregar o perfil do usuário.'));
        }

        return data;
    },

    async listProfiles() {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('email', { ascending: true });

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível listar os usuários da equipe.'));
        }

        return data || [];
    },

    async updateRole(userId, role) {
        const { data, error } = await supabase
            .from('profiles')
            .update({ role })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível atualizar a permissão do usuário.'));
        }

        return data;
    }
};
