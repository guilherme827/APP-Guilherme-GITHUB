import { supabase } from '../lib/supabaseClient.js';
import { mapClientModelToRow, mapClientRowToModel } from './supabaseMappers.js';
import { getActiveOrganizationId } from '../app/organizationContext.js';
import { trashStore } from './TrashStore.js';
import { activityLogger } from './ActivityLogger.js';
import { authService } from './AuthService.js';

function getSupabaseMessage(error, fallback) {
    return error?.message || fallback;
}

function getCurrentOrganizationId() {
    return getActiveOrganizationId();
}

async function fetchClientsApi(options = {}) {
    const accessToken = await authService.getAccessToken();
    const response = await fetch('/api/clients', {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {})
        }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || getSupabaseMessage(payload, 'Falha na API de titulares.'));
    }
    return payload?.data;
}

export class ClientStore {
    constructor() {
        this.clients = [];
        this.ready = Promise.resolve();
        this.isLoaded = false;
    }

    async hydrate() {
        const organizationId = getCurrentOrganizationId();

        // Busca IDs de titulares que já estão na lixeira para excluí-los da lista normal
        const { data: trashedData } = await supabase
            .from('trash')
            .select('item_id')
            .eq('organization_id', organizationId)
            .eq('item_type', 'titular');

        const trashedIds = new Set((trashedData || []).map(r => String(r.item_id)));

        const data = await fetchClientsApi({ method: 'GET' });

        // Filtra os que estão na lixeira
        this.clients = (data || [])
            .filter(row => !trashedIds.has(String(row.id)))
            .map(mapClientRowToModel);
        this.isLoaded = true;
    }


    async load(force = false) {
        if (this.isLoaded && !force) return this.ready;
        this.ready = this.hydrate();
        return this.ready;
    }

    reset() {
        this.clients = [];
        this.isLoaded = false;
        this.ready = Promise.resolve();
    }

    normalizeDoc(doc) {
        return doc ? doc.replace(/\D/g, '') : '';
    }

    normalizeName(name) {
        return name ? name.toLowerCase().trim().replace(/[^\w\s]/g, '') : '';
    }

    getClients() {
        return [...this.clients].sort((a, b) => {
            const nameA = a.type === 'PF' ? a.nome : a.nomeFantasia;
            const nameB = b.type === 'PF' ? b.nome : b.nomeFantasia;
            return nameA.localeCompare(nameB);
        });
    }

    checkUniqueness(client, currentId = null) {
        const doc = this.normalizeDoc(client.type === 'PF' ? client.cpf : client.cnpj);
        const name = this.normalizeName(client.type === 'PF' ? client.nome : client.nomeFantasia);

        const duplicate = this.clients.find((current) => {
            if (currentId && String(current.id) === String(currentId)) return false;
            const currentDoc = this.normalizeDoc(current.type === 'PF' ? current.cpf : current.cnpj);
            const currentName = this.normalizeName(current.type === 'PF' ? current.nome : current.nomeFantasia);
            return (doc && currentDoc === doc) || (name && currentName === name);
        });

        if (duplicate) {
            const isDoc = this.normalizeDoc(duplicate.type === 'PF' ? duplicate.cpf : duplicate.cnpj) === doc;
            throw new Error(`Este ${isDoc ? 'Documento' : 'Nome'} já está cadastrado para outro titular.`);
        }
    }

    async addClient(client) {
        this.checkUniqueness(client);
        const payload = mapClientModelToRow({
            ...client,
            organizationId: getCurrentOrganizationId(),
            documents: client.documents || []
        });

        const data = await fetchClientsApi({
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const created = mapClientRowToModel(data);
        this.clients.push(created);

        // Registro de Atividade
        const label = created.type === 'PF' ? (created.nome || 'Titular') : (created.nomeFantasia || created.nomeEmpresarial || 'Empresa');
        activityLogger.logAction({
            action_type: 'CREATE',
            entity_type: 'TITULAR',
            entity_id: created.id,
            entity_label: label
        });

        return created;
    }

    async updateClient(id, updatedData) {
        this.checkUniqueness(updatedData, id);
        const payload = mapClientModelToRow({
            ...updatedData,
            organizationId: getCurrentOrganizationId()
        });

        const data = await fetchClientsApi({
            method: 'PATCH',
            body: JSON.stringify({
                id,
                ...payload
            })
        });

        const updated = mapClientRowToModel(data);
        this.clients = this.clients.map((client) => (String(client.id) === String(id) ? updated : client));

        // Registro de Atividade
        const label = updated.type === 'PF' ? (updated.nome || 'Titular') : (updated.nomeFantasia || updated.nomeEmpresarial || 'Empresa');
        activityLogger.logAction({
            action_type: 'UPDATE',
            entity_type: 'TITULAR',
            entity_id: updated.id,
            entity_label: label
        });

        return updated;
    }

    async deleteClient(id) {
        const client = this.clients.find(c => String(c.id) === String(id));
        if (!client) throw new Error('Titular não encontrado.');

        const label = client.type === 'PF'
            ? (client.nome || 'Titular sem nome')
            : (client.nomeFantasia || client.nomeEmpresarial || 'Empresa sem nome');

        await fetchClientsApi({
            method: 'DELETE',
            body: JSON.stringify({ id })
        });

        // Remove do array local imediatamente (some da tela)
        this.clients = this.clients.filter((c) => String(c.id) !== String(id));

        // Registro de Atividade
        activityLogger.logAction({
            action_type: 'SOFT_DELETE',
            entity_type: 'TITULAR',
            entity_id: id,
            entity_label: label
        });

        return true;
    }
}

export const clientStore = new ClientStore();
