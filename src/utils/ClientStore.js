import { supabase } from '../lib/supabaseClient.js';
import { mapClientModelToRow, mapClientRowToModel } from './supabaseMappers.js';
import { getActiveOrganizationId } from '../app/organizationContext.js';
import { trashStore } from './TrashStore.js';
import { activityLogger } from './ActivityLogger.js';

function getSupabaseMessage(error, fallback) {
    return error?.message || fallback;
}

function getCurrentOrganizationId() {
    return getActiveOrganizationId();
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

        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('organization_id', organizationId)
            .order('id', { ascending: true });

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Falha ao carregar titulares no Supabase.'));
        }

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

        const { data, error } = await supabase
            .from('clients')
            .insert(payload)
            .select()
            .single();

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível criar o titular.'));
        }

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

        const { data, error } = await supabase
            .from('clients')
            .update(payload)
            .eq('id', id)
            .eq('organization_id', getCurrentOrganizationId())
            .select()
            .single();

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível atualizar o titular.'));
        }

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
        // Verifica processos vinculados antes de qualquer ação
        const { count, error: countError } = await supabase
            .from('processes')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', id)
            .eq('organization_id', getCurrentOrganizationId());

        if (countError) {
            throw new Error(getSupabaseMessage(countError, 'Não foi possível validar vínculos do titular.'));
        }

        if ((count || 0) > 0) {
            throw new Error('Não é possível excluir: titular possui processos ou extratos vinculados.');
        }

        // Captura o objeto completo do titular para arquivar na lixeira
        const client = this.clients.find(c => String(c.id) === String(id));
        if (!client) throw new Error('Titular não encontrado.');

        // Coleta os storagePaths de documentos do titular
        const storagePaths = (client.documents || [])
            .map(doc => doc.storagePath || doc.storage_path)
            .filter(p => p && typeof p === 'string' && p.length > 0);

        const label = client.type === 'PF'
            ? (client.nome || 'Titular sem nome')
            : (client.nomeFantasia || client.nomeEmpresarial || 'Empresa sem nome');

        // Envia para a lixeira (soft delete — o registro real permanece no banco)
        await trashStore.sendToTrash({
            item_type: 'titular',
            item_id: id,
            item_label: label,
            item_data: client,
            storage_paths: storagePaths
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
