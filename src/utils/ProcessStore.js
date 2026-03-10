import { MOCK_PROCESSES, MOCK_PROJECTS } from '../data/mockData.js';

// Simple State Management for Processes and Projects
export class ProcessStore {
    constructor() {
        this.processesStorageKey = 'control_processes';
        this.projectsStorageKey = 'control_projects';
        this.processes = this.parseStoredArray(this.processesStorageKey, MOCK_PROCESSES);
        this.projects = this.parseStoredArray(this.projectsStorageKey, MOCK_PROJECTS);
        this.sanitizeDeadlines();
        this.sanitizeExtractEvents();
        this.saveProcesses();
        this.saveProjects();
        this.ready = Promise.resolve();
    }

    parseStoredArray(key, fallback = []) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return Array.isArray(fallback) ? [...fallback] : [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [...fallback];
        } catch {
            return Array.isArray(fallback) ? [...fallback] : [];
        }
    }

    sanitizeDeadlines() {
        let modified = false;
        this.processes = this.processes.map(p => {
            if (p.deadlines && p.deadlines.length > 0) {
                const sanitized = p.deadlines.map((d, idx) => {
                    if (!d.id || !d.status) {
                        modified = true;
                        return {
                            ...d,
                            id: d.id || `${p.id}-${idx}-${Date.now()}`,
                            status: d.status || 'pending'
                        };
                    }
                    return d;
                });
                return { ...p, deadlines: sanitized };
            }
            return p;
        });
        if (modified) this.saveProcesses();
    }

    sanitizeExtractEvents() {
        let modified = false;
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

            if (!Array.isArray(process.events)) {
                modified = true;
            }

            const syncedEvents = this.syncInitialExtractEvent({ ...process, events });
            if (JSON.stringify(events) !== JSON.stringify(syncedEvents)) {
                modified = true;
            }
            events = syncedEvents;

            return {
                ...process,
                events
            };
        });

        if (modified) this.saveProcesses();
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

    // Projects logic
    getProjectsByClient(clientId) {
        return this.projects.filter(p => p.clientId == clientId);
    }

    addProject(project) {
        const newProject = { ...project, id: Date.now() };
        this.projects.push(newProject);
        this.saveProjects();
        return newProject;
    }

    // Memory logic for autocomplete
    getUniqueFieldValues(field) {
        const values = this.processes
            .map(p => p[field])
            .filter(v => v && v.trim() !== '');
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
            if (!currentSourceKey || !mappedValue) return;
            if (currentSourceKey !== sourceKey) return;
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

    // Processes logic
    getProcessesByClient(clientId) {
        return this.processes.filter(p => p.clientId == clientId && !p.projectId);
    }

    getProcessesByProject(projectId) {
        return this.processes.filter(p => p.projectId == projectId);
    }

    async addProcess(processData) {
        let projectId = processData.projectId;
        
        // Auto-create project if name provided but not ID
        if (processData.projectName && !projectId) {
            const existingProject = this.projects.find(p => 
                p.clientId == processData.clientId && 
                p.name.toLowerCase().trim() === processData.projectName.toLowerCase().trim()
            );
            
            if (existingProject) {
                projectId = existingProject.id;
            } else {
                const newProject = this.addProject({
                    clientId: Number(processData.clientId),
                    name: processData.projectName.trim()
                });
                projectId = newProject.id;
            }
        }

        const hasDocSource = (doc) => !!(doc?.base64 || doc?.storagePath);
        const newProcess = { 
            ...processData, 
            id: Date.now(),
            projectId: projectId ? Number(projectId) : null,
            clientId: Number(processData.clientId),
            deadlines: (processData.deadlines || []).map((d, idx) => ({
                ...d,
                id: d.id || `${Date.now()}-${idx}`,
                status: d.status || 'pending'
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
        
        // Remove helper field before saving
        delete newProcess.projectName;
        newProcess.events = this.syncInitialExtractEvent(newProcess);

        const nextProcesses = [...this.processes, newProcess];
        const saved = this.saveProcesses(nextProcesses);
        if (!saved) {
            throw new Error('Não foi possível salvar o processo. Verifique o espaço de armazenamento do navegador.');
        }
        this.processes = nextProcesses;
        return newProcess;
    }

    updateProcess(id, updatedData) {
        const targetId = String(id);
        let updated = false;
        const hasDocSource = (doc) => !!(doc?.base64 || doc?.storagePath);
        const nextProcesses = this.processes.map(p => {
            if (String(p.id) === targetId) {
                updated = true;
                const newData = { ...p, ...updatedData };
                if (newData.deadlines) {
                    newData.deadlines = newData.deadlines.map((d, idx) => ({
                        ...d,
                        id: d.id || `${Date.now()}-${idx}`,
                        status: d.status || 'pending'
                    }));
                }
                if (newData.events) {
                    newData.events = newData.events.map((event, eventIndex) => ({
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
                    }));
                }
                newData.events = this.syncInitialExtractEvent(newData);
                return newData;
            }
            return p;
        });
        if (updated) {
            const saved = this.saveProcesses(nextProcesses);
            if (!saved) return false;
            this.processes = nextProcesses;
        }
        return updated;
    }

    addProcessEvent(processId, eventData) {
        const targetId = String(processId);
        let changed = false;
        const hasDocSource = (doc) => !!(doc?.base64 || doc?.storagePath);
        const nextProcesses = this.processes.map((process) => {
            if (String(process.id) !== targetId) return process;
            changed = true;
            const currentEvents = Array.isArray(process.events) ? process.events : [];
            const currentDeadlines = Array.isArray(process.deadlines) ? process.deadlines : [];
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

            return {
                ...process,
                events: [...currentEvents, newEvent],
                deadlines: [...currentDeadlines, ...generatedDeadline]
            };
        });
        if (!changed) return false;
        const saved = this.saveProcesses(nextProcesses);
        if (!saved) return false;
        this.processes = nextProcesses;
        return true;
    }

    updateDeadlineStatus(processId, deadlineId, newStatus) {
        const targetProcessId = String(processId);
        const targetDeadlineId = String(deadlineId);
        let changed = false;
        const nextProcesses = this.processes.map(p => {
            if (String(p.id) === targetProcessId) {
                changed = true;
                return {
                    ...p,
                    deadlines: p.deadlines.map(d => 
                        String(d.id) === targetDeadlineId ? { ...d, status: newStatus } : d
                    )
                };
            }
            return p;
        });
        if (!changed) return false;
        const saved = this.saveProcesses(nextProcesses);
        if (!saved) return false;
        this.processes = nextProcesses;
        return true;
    }

    deleteProcess(id) {
        const targetId = String(id);
        const nextProcesses = this.processes.filter(p => String(p.id) !== targetId);
        const changed = nextProcesses.length !== this.processes.length;
        if (!changed) return false;
        const saved = this.saveProcesses(nextProcesses);
        if (!saved) return false;
        this.processes = nextProcesses;
        return true;
    }

    saveProcesses(processesToSave = this.processes) {
        let localSaved = false;
        let isQuotaError = false;
        try {
            localStorage.setItem(this.processesStorageKey, JSON.stringify(processesToSave));
            localSaved = true;
        } catch (error) {
            isQuotaError = typeof error?.name === 'string' && error.name.toLowerCase().includes('quota');
            console.error(
                isQuotaError
                    ? 'Falha ao salvar processos: limite de armazenamento local atingido.'
                    : 'Falha ao salvar processos no localStorage:',
                error
            );
        }
        if (localSaved) return true;
        return isQuotaError;
    }

    saveProjects() {
        try {
            localStorage.setItem(this.projectsStorageKey, JSON.stringify(this.projects));
        } catch (error) {
            console.error('Falha ao salvar projetos no localStorage:', error);
        }
    }
}

export const processStore = new ProcessStore();
