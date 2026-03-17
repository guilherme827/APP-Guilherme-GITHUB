import { supabase } from '../lib/supabaseClient.js';
import { getActiveOrganizationId } from '../app/organizationContext.js';
import { authService } from './AuthService.js';
import { activityLogger } from './ActivityLogger.js';

function getCurrentOrganizationId() {
    return getActiveOrganizationId();
}

function getSupabaseMessage(error, fallback) {
    return error?.message || fallback;
}

class TrashStore {
    constructor() {
        this.items = [];
        this.isLoaded = false;
    }

    async load(force = false) {
        if (this.isLoaded && !force) return;
        const orgId = getCurrentOrganizationId();
        if (!orgId) return;

        const { data, error } = await supabase
            .from('trash')
            .select('*')
            .eq('organization_id', orgId)
            .order('deleted_at', { ascending: false });

        if (error) {
            console.error('[TrashStore] Erro ao carregar lixeira:', error);
            return;
        }

        this.items = data || [];
        this.isLoaded = true;
    }

    /**
     * Envia um item para a lixeira (soft delete).
     * @param {object} options
     * @param {'processo'|'titular'|'projeto'} options.item_type
     * @param {string|number} options.item_id - ID original do item no banco
     * @param {string} options.item_label - Nome/número exibido na lixeira
     * @param {object} options.item_data - Snapshot completo do item
     * @param {string[]} [options.storage_paths] - Caminhos dos arquivos no Storage
     */
    async sendToTrash({ item_type, item_id, item_label, item_data, storage_paths = [] }) {
        const orgId = getCurrentOrganizationId();
        const session = await authService.getSession().catch(() => null);
        const userId = session?.user?.id || null;

        const payload = {
            organization_id: orgId,
            item_type,
            item_id: String(item_id),
            item_label,
            item_data,
            storage_paths,
            deleted_by: userId,
            deleted_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('trash')
            .insert(payload)
            .select()
            .single();

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível mover o item para a lixeira.'));
        }

        this.items = [data, ...this.items];
        return data;
    }

    /**
     * Deleta permanentemente um item da lixeira:
     * 1. Remove arquivos físicos do Storage
     * 2. Deleta o registro original do banco
     * 3. Deleta a entrada da Lixeira
     */
    async permanentlyDelete(trashId) {
        const trashItem = this.items.find(item => String(item.id) === String(trashId));
        if (!trashItem) throw new Error('Item não encontrado na lixeira.');

        // 1. Remove arquivos físicos do Storage
        const storagePaths = Array.isArray(trashItem.storage_paths) ? trashItem.storage_paths : [];
        const validPaths = storagePaths.filter(p => p && typeof p === 'string' && p.length > 0);
        if (validPaths.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('documentos')
                .remove(validPaths);

            if (storageError) {
                console.warn('[TrashStore] Aviso: alguns arquivos não puderam ser removidos do Storage:', storageError);
                // Continua mesmo com erro no storage para não bloquear a limpeza
            }
        }

        // 2. Deleta o registro original do banco (o item real ainda existe pois fizemos soft delete)
        const orgId = getCurrentOrganizationId();
        if (trashItem.item_type === 'processo') {
            const { error: dbError } = await supabase
                .from('processes')
                .delete()
                .eq('id', trashItem.item_id)
                .eq('organization_id', orgId);
            if (dbError) {
                console.warn('[TrashStore] Aviso ao deletar processo do banco:', dbError);
            }
        } else if (trashItem.item_type === 'titular') {
            const { error: dbError } = await supabase
                .from('clients')
                .delete()
                .eq('id', trashItem.item_id)
                .eq('organization_id', orgId);
            if (dbError) {
                console.warn('[TrashStore] Aviso ao deletar titular do banco:', dbError);
            }
        } else if (trashItem.item_type === 'projeto') {
            const { error: dbError } = await supabase
                .from('projects')
                .delete()
                .eq('id', trashItem.item_id)
                .eq('organization_id', orgId);
            if (dbError) {
                console.warn('[TrashStore] Aviso ao deletar projeto do banco:', dbError);
            }
        }

        // 3. Remove da tabela trash
        const { error } = await supabase
            .from('trash')
            .delete()
            .eq('id', trashId);

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível remover o item da lixeira.'));
        }

        this.items = this.items.filter(item => String(item.id) !== String(trashId));

        // Registro de atividade
        const typeMap = { 'processo': 'PROCESSO', 'titular': 'TITULAR', 'projeto': 'PROJETO' };
        activityLogger.logAction({
            action_type: 'PERMANENT_DELETE',
            entity_type: typeMap[trashItem.item_type] || 'DESCONHECIDO',
            entity_id: trashItem.item_id,
            entity_label: trashItem.item_label
        });

        return true;
    }

    /**
     * Restaura um item da lixeira: remove da tabela `trash`.
     * O registro original nunca foi deletado (soft delete), então volta a aparecer nas listas.
     */
    async restoreItem(trashId) {
        // Precisamos localizar o item antes para saber os dados pro Log
        const trashItem = this.items.find(item => String(item.id) === String(trashId));

        const { error } = await supabase
            .from('trash')
            .delete()
            .eq('id', trashId);

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível restaurar o item.'));
        }

        this.items = this.items.filter(item => String(item.id) !== String(trashId));

        // Registro de atividade
        if (trashItem) {
            const typeMap = { 'processo': 'PROCESSO', 'titular': 'TITULAR', 'projeto': 'PROJETO' };
            activityLogger.logAction({
                action_type: 'RESTORE',
                entity_type: typeMap[trashItem.item_type] || 'DESCONHECIDO',
                entity_id: trashItem.item_id,
                entity_label: trashItem.item_label
            });
        }

        return true;
    }

    /**
     * Esvazia toda a lixeira permanentemente.
     */
    async emptyAll() {
        const allItems = [...this.items];
        const errors = [];

        for (const item of allItems) {
            try {
                await this.permanentlyDelete(item.id);
            } catch (err) {
                console.error('[TrashStore] Erro ao esvaziar item:', item.id, err);
                errors.push(item.id);
            }
        }

        if (errors.length > 0) {
            throw new Error(`${errors.length} item(s) não puderam ser removidos permanentemente.`);
        }
        return true;
    }

    reset() {
        this.items = [];
        this.isLoaded = false;
    }
}

export const trashStore = new TrashStore();
