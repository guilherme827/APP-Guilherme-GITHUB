import { supabase } from '../lib/supabaseClient.js';
import { getActiveOrganizationId } from '../app/organizationContext.js';
import { authService } from './AuthService.js';
import { profileService } from './ProfileService.js';

async function fetchActivityLogsApi(path = '', options = {}) {
    const accessToken = await authService.getAccessToken();
    const response = await fetch(`/api/activity-logs${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {})
        }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Falha na API de atividades.');
    }
    return payload?.data;
}

class ActivityLogger {
    async logAction({ action_type, entity_type, entity_id, entity_label, details = null }) {
        const organization_id = getActiveOrganizationId();
        if (!organization_id) return;

        try {
            const session = await authService.getSession();
            const user = session?.user;
            
            let user_name = user?.email || 'Usuário Desconhecido';
            const user_id = user?.id || null;

            if (user_id) {
                try {
                    const profile = await profileService.getProfile(user_id);
                    if (profile && profile.full_name) {
                        user_name = profile.full_name;
                    } else if (user?.user_metadata?.nome) {
                        user_name = user.user_metadata.nome;
                    }
                } catch (e) {
                    console.warn('[ActivityLogger] Não foi possível carregar o nome no ProfileService, usando fallback.', e);
                }
            }

            await fetchActivityLogsApi('', {
                method: 'POST',
                body: JSON.stringify({
                    organization_id,
                    user_id,
                    user_name,
                    action_type,
                    entity_type,
                    entity_id: String(entity_id),
                    entity_label: String(entity_label || 'Item desconhecido'),
                    details
                })
            });
        } catch (err) {
            console.error('[ActivityLogger] Falha inesperada:', err);
        }
    }

    async getLogs(filterType = 'all', filterValue = '') {
        const organization_id = getActiveOrganizationId();
        if (!organization_id) return [];

        try {
            const data = await fetchActivityLogsApi('?limit=500', { method: 'GET' });
            let logs = Array.isArray(data) ? data : [];
            if (filterType !== 'all' && filterValue) {
                const buildBounds = (type, val) => {
                    let start, end;
                    if (type === 'day') {
                        const [y, m, d] = val.split('-').map(Number);
                        start = new Date(y, m - 1, d, 0, 0, 0).toISOString();
                        end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
                    } else if (type === 'month') {
                        const [y, m] = val.split('-').map(Number);
                        start = new Date(y, m - 1, 1).toISOString();
                        end = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
                    } else if (type === 'year') {
                        const y = Number(val);
                        start = new Date(y, 0, 1).toISOString();
                        end = new Date(y, 11, 31, 23, 59, 59, 999).toISOString();
                    }
                    return { start, end };
                };
                const { start, end } = buildBounds(filterType, filterValue);
                if (start && end) {
                    logs = logs.filter((log) => log.created_at >= start && log.created_at <= end);
                }
            }
            return logs;
        } catch (error) {
            console.error('[ActivityLogger] Erro ao buscar logs:', error.message);
            return [];
        }
    }
}

export const activityLogger = new ActivityLogger();
