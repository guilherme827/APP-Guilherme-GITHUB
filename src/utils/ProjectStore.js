import { supabase } from '../lib/supabaseClient.js';
import { mapProjectModelToRow, mapProjectRowToModel } from './supabaseMappers.js';
import { getActiveOrganizationId } from '../app/organizationContext.js';
import { trashStore } from './TrashStore.js';
import { activityLogger } from './ActivityLogger.js';

function getSupabaseMessage(error, fallback) {
    return error?.message || fallback;
}

function getCurrentOrganizationId() {
    return getActiveOrganizationId();
}

export class ProjectStore {
    constructor() {
        this.projects = [];
        this.ready = Promise.resolve();
        this.isLoaded = false;
    }

    async hydrate() {
        const organizationId = getCurrentOrganizationId();

        // Busca IDs de projetos que já estão na lixeira para excluí-los da lista normal
        const { data: trashedData } = await supabase
            .from('trash')
            .select('item_id')
            .eq('organization_id', organizationId)
            .eq('item_type', 'projeto');

        const trashedIds = new Set((trashedData || []).map(r => String(r.item_id)));

        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('organization_id', organizationId)
            .order('name', { ascending: true });

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Falha ao carregar projetos no Supabase.'));
        }

        // Filtra os que estão na lixeira
        this.projects = (data || [])
            .filter(row => !trashedIds.has(String(row.id)))
            .map(mapProjectRowToModel);
            
        this.isLoaded = true;
    }

    async load(force = false) {
        if (this.isLoaded && !force) return this.ready;
        this.ready = this.hydrate();
        return this.ready;
    }

    reset() {
        this.projects = [];
        this.isLoaded = false;
        this.ready = Promise.resolve();
    }

    getProjects() {
        return [...this.projects];
    }
    
    getProjectsByClient(clientId) {
        return this.projects.filter(p => String(p.clientId) === String(clientId));
    }

    async addProject(projectPayload) {
        const organizationId = getCurrentOrganizationId();
        const payload = mapProjectModelToRow({
            ...projectPayload,
            organizationId
        });

        const { data, error } = await supabase
            .from('projects')
            .insert(payload)
            .select()
            .single();

        if (error) throw new Error(getSupabaseMessage(error, 'Erro ao salvar projeto.'));

        const newProject = mapProjectRowToModel(data);
        this.projects.push(newProject);
        
        await activityLogger.logAction({
            action_type: 'CREATE',
            entity_type: 'PROJETO',
            entity_id: String(newProject.id),
            entity_label: newProject.name,
            details: JSON.stringify({ name: newProject.name, client_id: newProject.clientId })
        });
        
        return newProject;
    }

    async updateProject(id, updates) {
        const existing = this.projects.find(p => String(p.id) === String(id));
        if (!existing) throw new Error('Projeto não encontrado para edição.');

        const mergedModel = { ...existing, ...updates };
        const payload = mapProjectModelToRow(mergedModel);

        const { data, error } = await supabase
            .from('projects')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(getSupabaseMessage(error, 'Erro ao atualizar projeto.'));

        const updatedProject = mapProjectRowToModel(data);
        const index = this.projects.findIndex(p => String(p.id) === String(id));
        if (index !== -1) {
            this.projects[index] = updatedProject;
        }

        await activityLogger.logAction({
            action_type: 'UPDATE',
            entity_type: 'PROJETO',
            entity_id: String(updatedProject.id),
            entity_label: updatedProject.name,
            details: JSON.stringify({ name: updatedProject.name })
        });
        
        return updatedProject;
    }

    async deleteProject(id) {
        const index = this.projects.findIndex(p => String(p.id) === String(id));
        if (index === -1) throw new Error('Projeto não encontrado para exclusão.');
        
        const project = this.projects[index];
        
        // Em vez de hard delete, recicla para a lixeira (se aplicável)
        const organizationId = getCurrentOrganizationId();
        await trashStore.moveToTrash({
            organization_id: organizationId,
            item_type: 'projeto',
            item_id: String(id),
            item_name: project.name,
            original_data: project
        });

        this.projects.splice(index, 1);
        
        await activityLogger.logAction({
            action_type: 'SOFT_DELETE',
            entity_type: 'PROJETO',
            entity_id: String(id),
            entity_label: project.name,
            details: JSON.stringify({ client_id: project.clientId })
        });
        
        return true;
    }
}

export const projectStore = new ProjectStore();
