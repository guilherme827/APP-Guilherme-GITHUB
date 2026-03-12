import { supabase } from '../lib/supabaseClient.js';
import { authService } from './AuthService.js';

function getSupabaseMessage(error, fallback) {
    return error?.message || fallback;
}

function getFallbackProfile(userId, email = '') {
    return {
        id: userId,
        email: String(email || '').trim(),
        full_name: '',
        role: 'user',
        gender: 'neutro',
        permissions: {
            view: true,
            edit: false,
            delete: false
        },
        folder_access: ['painel', 'clientes', 'processos', 'prazos', 'configuracoes']
    };
}

async function fetchTeamApi(path = '', options = {}) {
    const accessToken = await authService.getAccessToken();
    const response = await fetch(`/api/team-members${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {})
        }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Falha na API de equipe.');
    }
    return payload?.data;
}

async function fetchAccountApi(options = {}) {
    const accessToken = await authService.getAccessToken();
    const response = await fetch('/api/account', {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {})
        }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Falha na API da conta.');
    }
    return payload?.data;
}

export const profileService = {
    async getProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            const message = getSupabaseMessage(error, '');
            const shouldFallback = error?.code === 'PGRST116'
                || /relation .*profiles/i.test(message)
                || /does not exist/i.test(message);

            if (shouldFallback) {
                const session = await authService.getSession().catch(() => null);
                return getFallbackProfile(userId, session?.user?.email || '');
            }

            throw new Error(getSupabaseMessage(error, 'Não foi possível carregar o perfil do usuário.'));
        }

        return data;
    },

    async listProfiles() {
        return fetchTeamApi('', { method: 'GET' });
    },

    async createMember(payload) {
        return fetchTeamApi('', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    async updateMember(payload) {
        return fetchTeamApi('', {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    },

    async updateOwnProfile(payload) {
        return fetchAccountApi({
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    }
};
