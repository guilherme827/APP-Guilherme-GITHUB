import { getActiveOrganizationId } from '../app/organizationContext.js';
import { authService } from './AuthService.js';

function getCurrentOrganizationId() {
    return getActiveOrganizationId();
}

function getSupabaseMessage(error, fallback) {
    return error?.message || fallback;
}

async function fetchTrashApi(path = '', options = {}) {
    const accessToken = await authService.getAccessToken();
    const response = await fetch(`/api/trash${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {})
        }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(getSupabaseMessage(payload, 'Falha na API da lixeira.'));
    }
    return payload?.data;
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
        this.items = await fetchTrashApi('', { method: 'GET' });
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
        const data = await fetchTrashApi('', {
            method: 'POST',
            body: JSON.stringify({
                item_type,
                item_id: String(item_id),
                item_label,
                item_data,
                storage_paths
            })
        });

        this.items = [data, ...this.items];
        return data;
    }

    async moveToTrash({ item_type, item_id, item_name, original_data, storage_paths = [] }) {
        return this.sendToTrash({
            item_type,
            item_id,
            item_label: item_name,
            item_data: original_data,
            storage_paths
        });
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
        await fetchTrashApi('', {
            method: 'DELETE',
            body: JSON.stringify({ id: trashId })
        });

        this.items = this.items.filter(item => String(item.id) !== String(trashId));

        return true;
    }

    /**
     * Restaura um item da lixeira: remove da tabela `trash`.
     * O registro original nunca foi deletado (soft delete), então volta a aparecer nas listas.
     */
    async restoreItem(trashId) {
        await fetchTrashApi('', {
            method: 'PATCH',
            body: JSON.stringify({ id: trashId })
        });

        this.items = this.items.filter(item => String(item.id) !== String(trashId));

        return true;
    }

    /**
     * Esvazia toda a lixeira permanentemente.
     */
    async emptyAll() {
        await fetchTrashApi('', {
            method: 'DELETE',
            body: JSON.stringify({ empty_all: true })
        });
        this.items = [];
        return true;
    }

    reset() {
        this.items = [];
        this.isLoaded = false;
    }
}

export const trashStore = new TrashStore();
