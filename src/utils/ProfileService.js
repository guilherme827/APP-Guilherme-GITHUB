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
        cpf: '',
        role: 'user',
        organization_id: null,
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
    },

    async listOrganizations() {
        return fetch('/api/organizations', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${await authService.getAccessToken()}`
            }
        }).then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || 'Falha ao carregar organizações.');
            }
            return payload?.data || [];
        });
    },

    async getCurrentOrganization() {
        return fetch('/api/organizations?scope=current', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${await authService.getAccessToken()}`
            }
        }).then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || 'Falha ao carregar a organização atual.');
            }
            return payload?.data || null;
        });
    },

    async createOrganization(payload) {
        return fetch('/api/organizations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await authService.getAccessToken()}`
            },
            body: JSON.stringify(payload)
        }).then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body?.error || 'Falha ao criar organização.');
            }
            return body?.data || null;
        });
    },

    async updateOrganization(payload) {
        return fetch('/api/organizations', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await authService.getAccessToken()}`
            },
            body: JSON.stringify(payload)
        }).then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body?.error || 'Falha ao atualizar organização.');
            }
            return body?.data || null;
        });
    },

    async createOrganizationUser(payload) {
        return fetch('/api/organizations?scope=user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await authService.getAccessToken()}`
            },
            body: JSON.stringify(payload)
        }).then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body?.error || 'Falha ao criar usuário da organização.');
            }
            return body?.data || null;
        });
    },

    async updateOrganizationUser(payload) {
        return fetchAccountApi({
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    },

    async getStorageUsage(organizationId) {
        // Se for Super Admin sem org_id fixo, tenta somar tudo (opcional) ou focar na ativa
        const targetOrgId = organizationId || window.__APP_CONTROL_ACTIVE_ORG_ID__;
        if (!targetOrgId) return { totalBytes: 0, fileCount: 0 };
        
        console.log('[ProfileService] Calculando uso para Org:', targetOrgId);
        
        try {
            const { data: procData, error: procError } = await supabase
                .from('processes')
                .select('doc_size_bytes')
                .eq('organization_id', targetOrgId);
                
            if (procError) throw procError;
            
            const { data: clientData, error: clientError } = await supabase
                .from('clients')
                .select('documents')
                .eq('organization_id', targetOrgId);
                
            if (clientError) throw clientError;
            
            let totalBytes = procData.reduce((acc, row) => acc + (Number(row.doc_size_bytes) || 0), 0);
            let fileCount = procData.filter(row => row.doc_size_bytes > 0).length;
            
            clientData.forEach(row => {
                const docs = Array.isArray(row.documents) ? row.documents : [];
                docs.forEach(doc => {
                    totalBytes += (Number(doc.size) || 0);
                    fileCount++;
                });
            });
        
            return { totalBytes, fileCount };
        } catch (err) {
            console.error('[ProfileService] Erro no getStorageUsage:', err);
            return { totalBytes: 0, fileCount: 0 };
        }
    }
};
