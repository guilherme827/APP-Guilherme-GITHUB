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
        const targetOrgId = organizationId || window.__APP_CONTROL_ACTIVE_ORG_ID__;
        if (!targetOrgId) return { totalBytes: 0, fileCount: 0, breakdown: [] };

        console.log('[ProfileService] Calculando uso para Org:', targetOrgId);

        // Para adicionar novas categorias no futuro, basta incluir um novo objeto neste array.
        const sources = [
            {
                label: 'Titulares',
                color: '#6366f1',
                async fetch(sb) {
                    // Exclui titulares que estão na lixeira
                    const { data: trashed } = await sb
                        .from('trash').select('item_id')
                        .eq('organization_id', targetOrgId).eq('item_type', 'titular');
                    const trashedIds = new Set((trashed || []).map(r => String(r.item_id)));

                    const { data, error } = await sb
                        .from('clients')
                        .select('id, documents')
                        .eq('organization_id', targetOrgId);
                    if (error) throw error;
                    let bytes = 0, count = 0;
                    (data || []).filter(row => !trashedIds.has(String(row.id))).forEach(row => {
                        (Array.isArray(row.documents) ? row.documents : []).forEach(doc => {
                            bytes += (Number(doc.size) || 0);
                            if (doc.storagePath || doc.storage_path) count++;
                        });
                    });
                    return { bytes, count };
                }
            },
            {
                label: 'Processos',
                color: '#0ea5e9',
                async fetch(sb) {
                    // Exclui processos que estão na lixeira
                    const { data: trashed } = await sb
                        .from('trash').select('item_id')
                        .eq('organization_id', targetOrgId).eq('item_type', 'processo');
                    const trashedIds = new Set((trashed || []).map(r => String(r.item_id)));

                    const { data, error } = await sb
                        .from('processes')
                        .select('id, doc_storage_path, doc_size, events')
                        .eq('organization_id', targetOrgId);
                    if (error) throw error;
                    
                    let count = 0;
                    let bytes = 0;
                    
                    (data || []).filter(row => !trashedIds.has(String(row.id))).forEach(row => {
                        if (row.doc_storage_path) {
                            count++;
                            bytes += (Number(row.doc_size) || 0);
                        }
                        (Array.isArray(row.events) ? row.events : []).forEach(ev => {
                            (Array.isArray(ev.documents) ? ev.documents : []).forEach(doc => {
                                if (doc.storagePath || doc.storage_path) count++;
                                bytes += (Number(doc.size) || 0);
                            });
                        });
                    });
                    return { bytes, count };
                }
            },

            {
                label: 'Lixeira',
                color: '#f43f5e',
                async fetch(sb) {
                    const { data, error } = await sb
                        .from('trash')
                        .select('storage_paths, item_type, item_data')
                        .eq('organization_id', targetOrgId);
                    if (error) {
                        console.warn('[ProfileService] Tabela trash não disponível:', error.message);
                        return { bytes: 0, count: 0 };
                    }
                    let bytes = 0, count = 0;
                    (data || []).forEach(row => {
                        // Conta arquivos físicos
                        const paths = Array.isArray(row.storage_paths) ? row.storage_paths : [];
                        count += paths.filter(p => p && p.length > 0).length;

                        // Soma bytes do snapshot do item salvo no momento da exclusão
                        const itemData = row.item_data || {};
                        if (row.item_type === 'titular') {
                            // Titular: documentos diretos
                            (Array.isArray(itemData.documents) ? itemData.documents : []).forEach(doc => {
                                bytes += (Number(doc.size) || 0);
                            });
                        } else if (row.item_type === 'processo') {
                            // Processo: tamanho do PDF principal (docSize) + documentos de eventos
                            bytes += (Number(itemData.docSize) || 0);
                            (Array.isArray(itemData.events) ? itemData.events : []).forEach(ev => {
                                (Array.isArray(ev.documents) ? ev.documents : []).forEach(doc => {
                                    bytes += (Number(doc.size) || 0);
                                });
                            });
                        }
                    });

                    return { bytes, count };
                }
            }

        ];

        const breakdown = [];
        let totalBytes = 0;
        let fileCount = 0;

        await Promise.all(sources.map(async (source, index) => {
            try {
                const result = await source.fetch(supabase);
                breakdown[index] = { label: source.label, color: source.color, bytes: result.bytes, count: result.count };
                totalBytes += result.bytes;
                fileCount += result.count;
            } catch (err) {
                console.warn(`[ProfileService] Erro em "${source.label}":`, err.message);
                breakdown[index] = { label: source.label, color: source.color, bytes: 0, count: 0 };
            }
        }));


        return { totalBytes, fileCount, breakdown };
    }
};
