import { buildProjectId, buildProjectsFromProcesses } from './supabaseMappers.js';
import { processStore } from './ProcessStore.js';

export class ProjectStore {
    constructor() {
        this.projects = [];
        this.ready = Promise.resolve();
        this.isLoaded = false;
    }

    rebuild() {
        this.projects = buildProjectsFromProcesses(processStore.processes || []);
        this.isLoaded = true;
        return this.projects;
    }

    async hydrate() {
        this.rebuild();
    }

    async load(force = false) {
        if (this.isLoaded && !force) return this.ready;
        this.ready = Promise.resolve(this.hydrate());
        return this.ready;
    }

    reset() {
        this.projects = [];
        this.isLoaded = false;
        this.ready = Promise.resolve();
    }

    getProjects() {
        this.rebuild();
        return [...this.projects];
    }
    
    getProjectsByClient(clientId) {
        this.rebuild();
        return this.projects.filter((project) => String(project.clientId) === String(clientId));
    }

    async addProject(projectPayload) {
        const normalizedName = String(projectPayload?.name || '').trim();
        const clientId = Number(projectPayload?.clientId);
        if (!normalizedName || !clientId) {
            throw new Error('Projeto inválido.');
        }

        const existing = this.getProjectsByClient(clientId).find((project) =>
            String(project.name || '').trim().toLowerCase() === normalizedName.toLowerCase()
        );
        if (existing) return existing;

        const created = {
            id: buildProjectId(clientId, normalizedName),
            organizationId: null,
            clientId,
            name: normalizedName
        };
        this.projects.push(created);
        return created;
    }

    async updateProject(id, updates) {
        const index = this.projects.findIndex((project) => String(project.id) === String(id));
        if (index === -1) throw new Error('Projeto não encontrado para edição.');

        const current = this.projects[index];
        const nextName = String(updates?.name || current.name || '').trim();
        const nextClientId = Number(updates?.clientId || current.clientId);
        const updated = {
            ...current,
            ...updates,
            id: buildProjectId(nextClientId, nextName),
            clientId: nextClientId,
            name: nextName
        };
        this.projects[index] = updated;
        return updated;
    }

    async deleteProject(id) {
        const previousLength = this.projects.length;
        this.projects = this.projects.filter((project) => String(project.id) !== String(id));
        return this.projects.length !== previousLength;
    }
}

export const projectStore = new ProjectStore();
