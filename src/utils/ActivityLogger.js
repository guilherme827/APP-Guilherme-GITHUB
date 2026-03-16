import { supabase } from '../lib/supabaseClient.js';
import { getActiveOrganizationId } from '../app/organizationContext.js';
import { authService } from './AuthService.js';
import { profileService } from './ProfileService.js';

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

            const payload = {
                organization_id,
                user_id,
                user_name,
                action_type,
                entity_type,
                entity_id: String(entity_id),
                entity_label: String(entity_label || 'Item desconhecido'),
                details: details ? JSON.stringify(details) : null
            };

            const { error } = await supabase
                .from('activity_logs')
                .insert(payload);

            if (error) {
                console.error('[ActivityLogger] Erro ao gravar log:', error.message);
            }
        } catch (err) {
            console.error('[ActivityLogger] Falha inesperada:', err);
        }
    }

    async getLogs(filterType = 'all', filterValue = '') {
        const organization_id = getActiveOrganizationId();
        if (!organization_id) return [];

        let query = supabase
            .from('activity_logs')
            .select('*')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

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
            
            try {
                const { start, end } = buildBounds(filterType, filterValue);
                if (start && end) {
                    query = query.gte('created_at', start).lte('created_at', end);
                }
            } catch(e) {
                console.warn('[ActivityLogger] Filtro inválido.', e);
            }
        } else {
            query = query.limit(200);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[ActivityLogger] Erro ao buscar logs:', error.message);
            return [];
        }

        return data || [];
    }
}

export const activityLogger = new ActivityLogger();
