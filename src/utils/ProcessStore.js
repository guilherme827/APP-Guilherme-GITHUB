import { supabase } from '../lib/supabaseClient.js';
import {
    buildProjectId,
    buildProjectsFromProcesses,
    mapProcessModelToRow,
    mapProcessRowToModel
} from './supabaseMappers.js';
import { getActiveOrganizationId } from '../app/organizationContext.js';

function getSupabaseMessage(error, fallback) {
    return error?.message || fallback;
}

function getCurrentOrganizationId() {
    return getActiveOrganizationId();
}

export class ProcessStore {
    constructor() {
        this.processes = [];
        this.projects = [];
        this.ready = Promise.resolve();
        this.isLoaded = false;
    }

    async hydrate() {
        const organizationId = getCurrentOrganizationId();
        const { data, error } = await supabase
            .from('processes')
            .select('*')
            .eq('organization_id', organizationId)
            .order('id', { ascending: true });

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Falha ao carregar processos no Supabase.'));
        }

        this.processes = (data || []).map(mapProcessRowToModel);
        this.rebuildProjects();
        this.sanitizeDeadlines();
        this.sanitizeExtractEvents();
        this.isLoaded = true;
    }

    async load(force = false) {
        if (this.isLoaded && !force) return this.ready;
        this.ready = this.hydrate();
        return this.ready;
    }

    reset() {
        this.processes = [];
        this.projects = [];
        this.isLoaded = false;
        this.ready = Promise.resolve();
    }

    rebuildProjects() {
        this.projects = buildProjectsFromProcesses(this.processes);
    }

    sanitizeDeadlines() {
        this.processes = this.processes.map((process) => ({
            ...process,
            deadlines: Array.isArray(process.deadlines)
                ? process.deadlines.map((deadline, index) => ({
                    ...deadline,
                    id: deadline.id || `${process.id}-${index}-${Date.now()}`,
                    status: deadline.status || 'pending'
                }))
                : []
        }));
    }

    sanitizeExtractEvents() {
        const hasDocSource = (doc) => !!(doc?.base64 || doc?.storagePath);
        this.processes = this.processes.map((process) => {
            const normalizedEvents = Array.isArray(process.events) ? process.events : [];
            let events = normalizedEvents.map((event, index) => {
                const docs = Array.isArray(event.documents) ? event.documents : [];
                return {
                    id: event.id || `${process.id}-event-${index}-${Date.now()}`,
                    isInitial: event.isInitial === true || String(event.id || '').includes('event-inicial'),
                    usesProcessDocument: event.usesProcessDocument === true,
                    type: event.type || 'movimentacao',
                    description: event.description || '',
                    date: event.date || '',
                    documents: docs.map((doc, docIndex) => ({
                        id: doc.id || `${process.id}-doc-${index}-${docIndex}-${Date.now()}`,
                        name: doc.name || 'documento',
                        type: doc.type || 'application/octet-stream',
                        base64: doc.base64 || '',
                        storagePath: doc.storagePath || ''
                    })).filter((doc) => hasDocSource(doc))
                };
            });

            events = this.syncInitialExtractEvent({ ...process, events });

            return {
                ...process,
                events
            };
        });
    }

    getInitialEventType(fase) {
        const normalized = String(fase || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        return normalized.includes('titulo') ? 'titulo' : 'protocolo';
    }

    getInitialEventDescription(fase) {
        const normalized = String(fase || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        return normalized.includes('titulo') ? 'Título inicial' : 'Protocolo inicial';
    }

    getInitialEventDate(process) {
        const normalized = String(process?.fase || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        if (normalized.includes('titulo')) {
            return process?.dataOutorga || process?.dataProtocolo || '';
        }
        return process?.dataProtocolo || process?.dataOutorga || '';
    }

    getPrimaryDocumentFromProcess(process) {
        if (!process?.docBase64 && !process?.docStoragePath) return null;
        return {
            id: `${process.id}-doc-inicial`,
            name: process.docName || 'documento',
            type: process.docType || 'application/pdf',
            base64: process.docBase64 || '',
            storagePath: process.docStoragePath || ''
        };
    }

    isInitialEvent(event) {
        const type = String(event?.type || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        const desc = String(event?.description || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        const id = String(event?.id || '');
        const looksInitialByText = desc.includes('inicial') && (type === 'protocolo' || type === 'titulo');
        return event?.isInitial === true || event?.usesProcessDocument === true || id.includes('event-inicial') || looksInitialByText;
    }

    syncInitialExtractEvent(process) {
        const events = Array.isArray(process.events)
            ? process.events.map((event) => ({
                ...event,
                documents: Array.isArray(event.documents) ? event.documents : []
            }))
            : [];
        const initialType = this.getInitialEventType(process.fase);
        const initialDescription = this.getInitialEventDescription(process.fase);
        const initialDate = this.getInitialEventDate(process);
        const primaryDoc = this.getPrimaryDocumentFromProcess(process);

        const initialIndexes = events
            .map((event, index) => ({ event, index }))
            .filter(({ event }) => this.isInitialEvent(event))
            .map(({ index }) => index);

        let initialIndex = -1;
        if (initialIndexes.length > 0) {
            const preferredIndex = initialIndexes.find((idx) => String(events[idx]?.id || '').includes('event-inicial'));
            initialIndex = preferredIndex ?? initialIndexes[0];
            const dedupedEvents = events.filter((_, idx) => idx === initialIndex || !initialIndexes.includes(idx));
            events.length = 0;
            events.push(...dedupedEvents);
            initialIndex = events.findIndex((event) => this.isInitialEvent(event));
        }

        if (primaryDoc) {
            if (initialIndex >= 0) {
                const current = events[initialIndex];
                events[initialIndex] = {
                    ...current,
                    isInitial: true,
                    usesProcessDocument: true,
                    documents: []
                };
            } else {
                events.unshift({
                    id: `${process.id}-event-inicial`,
                    isInitial: true,
                    usesProcessDocument: true,
                    type: initialType,
                    description: initialDescription,
                    date: initialDate,
                    documents: []
                });
            }
        } else if (initialIndex >= 0) {
            const current = events[initialIndex];
            events[initialIndex] = {
                ...current,
                isInitial: true,
                usesProcessDocument: false,
                documents: []
            };
        }

        return events;
    }

    getProjectsByClient(clientId) {
        return this.projects.filter((project) => String(project.clientId) === String(clientId));
    }

    addProject(project) {
        const normalizedName = String(project?.name || '').trim();
        if (!normalizedName) return null;

        const existing = this.projects.find((current) =>
            String(current.clientId) === String(project.clientId)
            && current.name.toLowerCase().trim() === normalizedName.toLowerCase()
        );
        if (existing) return existing;

        const newProject = {
            id: buildProjectId(project.clientId, normalizedName),
            clientId: Number(project.clientId),
            name: normalizedName
        };
        this.projects = [...this.projects, newProject].sort((a, b) => a.name.localeCompare(b.name));
        return newProject;
    }

    getUniqueFieldValues(field) {
        const values = this.processes
            .map((process) => process[field])
            .filter((value) => value && value.trim() !== '');
        return [...new Set(values)].sort();
    }

    normalizeLearningKey(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    getMostFrequentMappedValue(sourceValue, mapper) {
        const sourceKey = this.normalizeLearningKey(sourceValue);
        if (!sourceKey) return '';
        const countByValue = new Map();

        this.processes.forEach((process) => {
            const pair = mapper(process);
            if (!pair) return;
            const currentSourceKey = this.normalizeLearningKey(pair.source);
            const mappedValue = String(pair.mapped || '').trim();
            if (!currentSourceKey || !mappedValue || currentSourceKey !== sourceKey) return;
            countByValue.set(mappedValue, (countByValue.get(mappedValue) || 0) + 1);
        });

        let bestValue = '';
        let bestCount = 0;
        countByValue.forEach((count, value) => {
            if (count > bestCount) {
                bestValue = value;
                bestCount = count;
            }
        });
        return bestValue;
    }

    getLearnedOrgaoSigla(orgaoNomeCompleto) {
        return this.getMostFrequentMappedValue(orgaoNomeCompleto, (process) => ({
            source: process.orgaoNomeCompleto,
            mapped: process.orgaoSigla
        }));
    }

    getLearnedTipoSigla(tipoCompleto) {
        return this.getMostFrequentMappedValue(tipoCompleto, (process) => ({
            source: process.tipo,
            mapped: process.tipoSigla
        }));
    }

    getProcessesByClient(clientId) {
        return this.processes.filter((process) => String(process.clientId) === String(clientId) && !process.projectId);
    }

    getProcessesByProject(projectId) {
        return this.processes.filter((process) => String(process.projectId) === String(projectId));
    }

    resolveProject(projectData) {
        if (projectData.projectId) {
            const existing = this.projects.find((project) => String(project.id) === String(projectData.projectId));
            if (existing) return existing;
        }

        const projectName = String(projectData.projectName || '').trim();
        if (!projectName) return null;
        return this.addProject({
            clientId: Number(projectData.clientId),
            name: projectName
        });
    }

    async addProcess(processData) {
        const project = this.resolveProject(processData);
        const hasDocSource = (doc) => !!(doc?.base64 || doc?.storagePath);

        const preparedProcess = {
            ...processData,
            organizationId: getCurrentOrganizationId(),
            projectId: project?.id || null,
            projectName: project?.name || '',
            clientId: Number(processData.clientId),
            deadlines: (processData.deadlines || []).map((deadline, index) => ({
                ...deadline,
                id: deadline.id || `${Date.now()}-${index}`,
                status: deadline.status || 'pending'
            })),
            events: (processData.events || []).map((event, eventIndex) => ({
                id: event.id || `${Date.now()}-event-${eventIndex}`,
                isInitial: event.isInitial === true || String(event.id || '').includes('event-inicial'),
                usesProcessDocument: event.usesProcessDocument === true,
                type: event.type || 'movimentacao',
                description: event.description || '',
                date: event.date || '',
                documents: (event.documents || []).map((doc, docIndex) => ({
                    id: doc.id || `${Date.now()}-event-${eventIndex}-doc-${docIndex}`,
                    name: doc.name || 'documento',
                    type: doc.type || 'application/octet-stream',
                    base64: doc.base64 || '',
                    storagePath: doc.storagePath || ''
                })).filter((doc) => hasDocSource(doc))
            }))
        };

        delete preparedProcess.projectName;
        preparedProcess.events = this.syncInitialExtractEvent(preparedProcess);

        const payload = mapProcessModelToRow(preparedProcess, project?.name || '');
        const { data, error } = await supabase
            .from('processes')
            .insert(payload)
            .select()
            .single();

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível salvar o processo.'));
        }

        const created = mapProcessRowToModel(data);
        this.processes = [...this.processes, created];
        this.rebuildProjects();
        return created;
    }

    async updateProcess(id, updatedData) {
        const existingProcess = this.processes.find((process) => String(process.id) === String(id));
        if (!existingProcess) return false;

        const project = this.resolveProject({
            clientId: updatedData.clientId || existingProcess.clientId,
            projectId: updatedData.projectId,
            projectName: updatedData.projectName
        });

        const hasDocSource = (doc) => !!(doc?.base64 || doc?.storagePath);
        const nextProcess = {
            ...existingProcess,
            ...updatedData,
            organizationId: existingProcess.organizationId || getCurrentOrganizationId(),
            clientId: Number(updatedData.clientId || existingProcess.clientId),
            projectId: project?.id || null,
            projectName: project?.name || '',
            deadlines: (updatedData.deadlines || existingProcess.deadlines || []).map((deadline, index) => ({
                ...deadline,
                id: deadline.id || `${Date.now()}-${index}`,
                status: deadline.status || 'pending'
            })),
            events: (updatedData.events || existingProcess.events || []).map((event, eventIndex) => ({
                id: event.id || `${Date.now()}-event-${eventIndex}`,
                isInitial: event.isInitial === true || String(event.id || '').includes('event-inicial'),
                usesProcessDocument: event.usesProcessDocument === true,
                type: event.type || 'movimentacao',
                description: event.description || '',
                date: event.date || '',
                documents: (event.documents || []).map((doc, docIndex) => ({
                    id: doc.id || `${Date.now()}-event-${eventIndex}-doc-${docIndex}`,
                    name: doc.name || 'documento',
                    type: doc.type || 'application/octet-stream',
                    base64: doc.base64 || '',
                    storagePath: doc.storagePath || ''
                })).filter((doc) => hasDocSource(doc))
            }))
        };

        nextProcess.events = this.syncInitialExtractEvent(nextProcess);
        const payload = mapProcessModelToRow(nextProcess, project?.name || '');

        const { data, error } = await supabase
            .from('processes')
            .update(payload)
            .eq('id', id)
            .eq('organization_id', getCurrentOrganizationId())
            .select()
            .single();

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível atualizar o processo.'));
        }

        const updated = mapProcessRowToModel(data);
        this.processes = this.processes.map((process) => (String(process.id) === String(id) ? updated : process));
        this.rebuildProjects();
        return true;
    }

    async addProcessEvent(processId, eventData) {
        const targetProcess = this.processes.find((process) => String(process.id) === String(processId));
        if (!targetProcess) return false;

        const hasDocSource = (doc) => !!(doc?.base64 || doc?.storagePath);
        const newEvent = {
            id: eventData.id || `${processId}-event-${Date.now()}`,
            usesProcessDocument: false,
            type: eventData.type || 'movimentacao',
            description: eventData.description || '',
            date: eventData.date || '',
            documents: (eventData.documents || []).map((doc, index) => ({
                id: doc.id || `${processId}-doc-${Date.now()}-${index}`,
                name: doc.name || 'documento',
                type: doc.type || 'application/octet-stream',
                base64: doc.base64 || '',
                storagePath: doc.storagePath || ''
            })).filter((doc) => hasDocSource(doc))
        };

        const normalizedType = String(newEvent.type || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        const shouldCreateDeadline = normalizedType === 'exigencia';
        const generatedDeadline = shouldCreateDeadline ? [{
            id: `${processId}-deadline-${Date.now()}`,
            desc: `Cumprir exigência: ${newEvent.description || 'Sem descrição'}`,
            date: '',
            status: 'pending'
        }] : [];

        return this.updateProcess(processId, {
            events: [...(targetProcess.events || []), newEvent],
            deadlines: [...(targetProcess.deadlines || []), ...generatedDeadline]
        });
    }

    async updateDeadlineStatus(processId, deadlineId, newStatus) {
        const targetProcess = this.processes.find((process) => String(process.id) === String(processId));
        if (!targetProcess) return false;

        const nextDeadlines = (targetProcess.deadlines || []).map((deadline) =>
            String(deadline.id) === String(deadlineId) ? { ...deadline, status: newStatus } : deadline
        );

        return this.updateProcess(processId, { deadlines: nextDeadlines });
    }

    async deleteProcess(id) {
        const { error } = await supabase
            .from('processes')
            .delete()
            .eq('id', id)
            .eq('organization_id', getCurrentOrganizationId());

        if (error) {
            throw new Error(getSupabaseMessage(error, 'Não foi possível excluir o processo.'));
        }

        const changed = this.processes.some((process) => String(process.id) === String(id));
        this.processes = this.processes.filter((process) => String(process.id) !== String(id));
        this.rebuildProjects();
        return changed;
    }
}

export const processStore = new ProcessStore();
