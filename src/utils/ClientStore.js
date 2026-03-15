import { supabase } from '../lib/supabaseClient.js';
import { mapClientModelToRow, mapClientRowToModel } from './supabaseMappers.js';
import { getActiveOrganizationId } from '../app/organizationContext.js';

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
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('organization_id', organizationId)
            .order('id', { ascending: true });

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Falha ao carregar titulares no Supabase.'));
        }

        this.clients = (data || []).map(mapClientRowToModel);
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
        return updated;
    }

    async deleteClient(id) {
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

        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id)
            .eq('organization_id', getCurrentOrganizationId());

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível excluir o titular.'));
        }

        this.clients = this.clients.filter((client) => String(client.id) !== String(id));
        return true;
    }
}

export const clientStore = new ClientStore();
