import { clientStore } from '../utils/ClientStore.js';
import { processStore } from '../utils/ProcessStore.js';
import { projectStore } from '../utils/ProjectStore.js';
import { buildProjectId } from '../utils/supabaseMappers.js';
import { showConfirmModal } from './ConfirmModal.js';
import { showNoticeModal } from './NoticeModal.js';
import { downloadProcessExtract } from './ProcessDetails.js';
import { escapeHtml } from '../utils/sanitize.js';

function escapeAttribute(value) {
    return escapeHtml(String(value ?? '')).replace(/"/g, '&quot;');
}

function normalizeProjectName(value) {
    return String(value || '').trim().toLowerCase();
}

function addProcessIcon() {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14"></path>
            <path d="M5 12h14"></path>
        </svg>
    `;
}

function addProjectIcon() {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <line x1="12" y1="11" x2="12" y2="17"></line>
            <line x1="9" y1="14" x2="15" y2="14"></line>
        </svg>
    `;
}

function folderIcon() {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
    `;
}

function documentIcon() {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
    `;
}

function chevronIcon() {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" class="tree-chevron" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease;">
            <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
    `;
}

export function renderProcessList(container, actionsContainer, onAddProcess, onViewProcess, initialClientId = null, initialProjectId = null, options = {}) {
    let currentProcessId = null;
    let query = '';
    const canEdit = options.canEdit !== false;
    const canDelete = options.canDelete === true;

    const getClientName = (client) => (client?.type === 'PF' ? client?.nome : client?.nomeFantasia) || 'Titular';
    const getClientDocument = (client) => (client?.type === 'PF' ? client?.cpf : client?.cnpj) || 'Documento nao informado';

    const getClientsWithProcesses = () => clientStore.clients.filter((client) => {
        const hasProcesses = processStore.processes.some((process) => String(process.clientId) === String(client.id));
        const hasProjects = projectStore.projects.some((project) => String(project.clientId) === String(client.id));
        return hasProcesses || hasProjects;
    });

    const getProcessesForProject = (clientId, project) => {
        const derivedProjectId = buildProjectId(clientId, project?.name || '');
        const projectNameKey = normalizeProjectName(project?.name);
        return processStore.processes.filter((process) => {
            if (String(process.clientId) !== String(clientId)) return false;
            if (String(process.projectId || '') === String(project?.id || '')) return true;
            if (String(process.projectId || '') === String(derivedProjectId || '')) return true;
            return projectNameKey && normalizeProjectName(process.projectName) === projectNameKey;
        });
    };

    const getClientProcessTargets = (clientId) => {
        const directProcesses = processStore.getProcessesByClient(clientId)
            .map((process) => ({ processId: String(process.id), projectId: null }));
        const projectProcesses = projectStore.getProjectsByClient(clientId).flatMap((project) =>
            getProcessesForProject(clientId, project).map((process) => ({
                processId: String(process.id),
                projectId: String(project.id)
            }))
        );
        return [...directProcesses, ...projectProcesses];
    };

    const daysDiff = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(`${dateStr}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.round((d - today) / (1000 * 60 * 60 * 24));
    };

    const renderProcessTable = (processes, clientId, projectId = null) => {
        const tableCard = document.createElement('div');
        tableCard.className = 'glass-card animate-fade-in';
        tableCard.style.padding = '0.5rem';

        tableCard.innerHTML = `
            <table class="data-table proc-table">
                <thead>
                    <tr>
                        <th class="label-tech" style="width: 250px; text-align: center;">PROCESSO / TIPOLOGIA</th>
                        <th class="label-tech" style="text-align: center;">IDENTIFICAÇÃO</th>
                        <th class="label-tech" style="text-align: center;">ÓRGÃO</th>
                        <th class="label-tech" style="text-align: center;">PRAZOS</th>
                        <th class="label-tech" style="text-align: center;">DATA / STATUS</th>
                        <th style="width: 40px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${processes.map((p) => {
                        const faseStr = String(p.fase || 'REQUERIMENTO').toUpperCase();
                        const isTitulo = faseStr === 'TÍTULO' || faseStr === 'TITULO';
                        const phaseClass = isTitulo ? 'phase-tag-green' : 'phase-tag-blue';
                        const phaseTxt = isTitulo ? 'TÍTULO' : 'REQUERIMENTO';

                        let dateLabel = 'DATA';
                        let dateValue = '–';
                        let daysLabel = '';
                        let daysColor = 'var(--slate-400)';

                        if (isTitulo && p.dataValidade) {
                            const diff = daysDiff(p.dataValidade);
                            dateLabel = 'VALIDADE';
                            dateValue = new Date(`${p.dataValidade}T00:00:00`).toLocaleDateString('pt-BR');
                            if (diff !== null) {
                                if (diff < 0) {
                                    daysLabel = `VENCIDA HÁ ${Math.abs(diff)} DIAS`;
                                    daysColor = 'var(--rose-500)';
                                } else if (diff === 0) {
                                    daysLabel = 'VENCE HOJE';
                                    daysColor = 'var(--rose-500)';
                                } else if (diff <= 30) {
                                    daysLabel = `${diff} DIAS RESTANTES`;
                                    daysColor = '#f59e0b';
                                } else {
                                    daysLabel = `${diff} DIAS RESTANTES`;
                                    daysColor = 'var(--primary)';
                                }
                            }
                        } else if (!isTitulo && p.dataProtocolo) {
                            const diff = daysDiff(p.dataProtocolo);
                            dateLabel = 'PROTOCOLO';
                            dateValue = new Date(`${p.dataProtocolo}T00:00:00`).toLocaleDateString('pt-BR');
                            if (diff !== null) {
                                daysLabel = `HÁ ${Math.abs(diff)} DIAS`;
                                daysColor = 'var(--slate-400)';
                            }
                        }

                        const deadlineCount = Array.isArray(p.deadlines) ? p.deadlines.length : 0;

                        return `
                            <tr class="process-row" data-id="${escapeAttribute(p.id)}">
                                <td style="text-align: center;">
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <span class="phase-tag ${phaseClass}">${phaseTxt}</span>
                                        </div>
                                        <span class="font-black" style="font-size: 0.9rem; margin-top: 2px;">${escapeHtml(p.tipoSigla || p.tipo || 'N/A')}</span>
                                        <span style="font-size: 10px; color: var(--slate-400); text-transform: uppercase; letter-spacing: 0.03em;">${escapeHtml(p.tipologia || '')}</span>
                                    </div>
                                </td>
                                <td style="text-align: center;">
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                                        ${p.numeroTitulo
                                            ? `<span class="font-black" style="font-size: 1rem; color: var(--primary);">${escapeHtml(p.numeroTitulo)}</span>
                                               <span style="font-size: 9px; color: var(--slate-400); text-transform: uppercase;">${escapeHtml(p.numeroProcesso || '–')}</span>`
                                            : `<span class="font-black" style="font-size: 0.9rem;">${escapeHtml(p.numeroProcesso || 'SEM NÚMERO')}</span>`
                                        }
                                    </div>
                                </td>
                                <td style="text-align: center;">
                                    <span class="font-black" style="font-size: 0.85rem;">${escapeHtml(p.orgaoSigla || p.orgao || '–')}</span>
                                </td>
                                <td style="text-align: center;">
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                                        <span class="font-black" style="font-size: 1.1rem; ${deadlineCount > 0 ? 'color: var(--primary);' : 'color: var(--slate-300);'}">${deadlineCount}</span>
                                        <span style="font-size: 11px; color: var(--slate-400); text-transform: uppercase;">${deadlineCount === 1 ? 'PRAZO' : 'PRAZOS'}</span>
                                    </div>
                                </td>
                                <td style="text-align: center;">
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                                        <span style="font-size: 11px; color: var(--slate-400); text-transform: uppercase; letter-spacing: 0.05em;">${dateLabel}</span>
                                        <span class="font-black" style="font-size: 0.9rem;">${dateValue}</span>
                                        ${daysLabel ? `<span style="font-size: 9px; font-weight: 700; color: ${daysColor}; text-transform: uppercase;">${daysLabel}</span>` : ''}
                                    </div>
                                </td>
                                <td>
                                    <div class="proc-menu-wrap" style="position: relative;">
                                        ${(canEdit || canDelete) ? `<button class="proc-menu-btn" data-id="${escapeAttribute(p.id)}" style="background: none; border: none; cursor: pointer; padding: 6px; border-radius: 8px; color: var(--slate-400); display: flex; align-items: center;">
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                                        </button>` : ''}
                                        ${(canEdit || canDelete) ? `<div class="proc-menu-dropdown hidden" data-id="${escapeAttribute(p.id)}" style="position: absolute; right: 0; top: 100%; z-index: 1000; min-width: 140px; padding: 6px; overflow: hidden;">
                                            <div class="proc-action" data-action="extract" data-id="${escapeAttribute(p.id)}" style="padding: 8px 12px; cursor: pointer; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                                EXTRATO
                                            </div>
                                            ${canEdit ? `<div class="proc-action" data-action="edit" data-id="${escapeAttribute(p.id)}" style="padding: 8px 12px; cursor: pointer; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                EDITAR
                                            </div>` : ''}
                                            ${canDelete ? `<div class="proc-action" data-action="delete" data-id="${escapeAttribute(p.id)}" style="padding: 8px 12px; cursor: pointer; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--rose-500);">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                                EXCLUIR
                                            </div>` : ''}
                                        </div>` : ''}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        tableCard.querySelectorAll('.process-row').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.proc-menu-wrap')) return;
                currentProcessId = String(row.dataset.id);
                if (typeof onViewProcess === 'function') {
                    onViewProcess(row.dataset.id, clientId, projectId);
                }
            });
        });

        tableCard.querySelectorAll('.proc-menu-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                tableCard.querySelectorAll('.proc-menu-dropdown').forEach((dropdown) => dropdown.classList.add('hidden'));
                const dropdown = tableCard.querySelector(`.proc-menu-dropdown[data-id="${CSS.escape(String(id))}"]`);
                dropdown?.classList.toggle('hidden');
            });
        });

        tableCard.querySelectorAll('.proc-action').forEach((action) => {
            action.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = action.dataset.id;
                const act = action.dataset.action;
                if (act === 'extract') {
                    downloadProcessExtract(id).catch((error) => {
                        showNoticeModal('Erro ao gerar extrato', error?.message || 'Não foi possível baixar o extrato do processo.');
                    });
                } else if (act === 'delete') {
                    showConfirmModal(
                        'Excluir Processo',
                        'Tem certeza que deseja excluir este processo? Todos os dados vinculados a ele serão perdidos permanentemente.',
                        async () => {
                            try {
                                const removed = await processStore.deleteProcess(id);
                                if (!removed) {
                                    showNoticeModal('Erro ao excluir', 'Não foi possível excluir o processo.');
                                    return;
                                }
                                renderTree();
                                renderClientOverview(clientId);
                            } catch (error) {
                                showNoticeModal('Erro ao excluir', error?.message || 'Não foi possível excluir o processo.');
                            }
                        }
                    );
                } else if (act === 'edit') {
                    if (typeof onViewProcess === 'function') onViewProcess(id, clientId, projectId, 'edit');
                }
                tableCard.querySelectorAll('.proc-menu-dropdown').forEach((dropdown) => dropdown.classList.add('hidden'));
            });
        });

        tableCard.addEventListener('click', () => {
            tableCard.querySelectorAll('.proc-menu-dropdown').forEach((dropdown) => dropdown.classList.add('hidden'));
        });

        return tableCard;
    };

    const renderClientOverview = (clientId) => {
        const contentPanel = container.querySelector('#process-content-panel');
        const client = clientStore.clients.find((item) => String(item.id) === String(clientId));
        if (!contentPanel || !client) return;

        const projects = projectStore.getProjectsByClient(clientId);
        const looseProcesses = processStore.getProcessesByClient(clientId);
        contentPanel.innerHTML = '';

        const shell = document.createElement('div');
        shell.className = 'animate-fade-in';
        shell.style.cssText = 'padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;';

        const hero = document.createElement('div');
        hero.className = 'glass-card';
        hero.style.cssText = 'padding: 1.5rem 1.75rem;';
        hero.innerHTML = `
            <p class="label-tech">TITULAR</p>
            <h2 class="font-black" style="font-size: 1.9rem; margin-top: 0.35rem;">${escapeHtml(getClientName(client))}</h2>
            <p style="color: var(--slate-500); margin-top: 0.5rem;">${escapeHtml(getClientDocument(client))}</p>
        `;
        shell.appendChild(hero);

        if (projects.length > 0) {
            const projectsSection = document.createElement('div');
            projectsSection.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.5rem;">
                    <h3 class="font-black" style="font-size:1.25rem;">PROJETOS</h3>
                    <span class="label-tech" style="background: var(--slate-100); padding: 2px 8px; border-radius: 6px; color: var(--slate-400);">${projects.length}</span>
                </div>
            `;

            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;';

            projects.forEach((project) => {
                const projectCount = getProcessesForProject(clientId, project).length;
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'glass-card project-card premium-hover process-project-card';
                card.setAttribute('data-open-project-id', String(project.id));
                card.style.cssText = `
                    cursor: pointer; padding: 2.5rem; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    border: 1px solid var(--slate-100); position: relative; overflow: hidden;
                    background: var(--card-bg); text-align: left;
                `;
                card.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 1.5rem; position: relative; z-index: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="background: var(--primary); width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center;">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                            </div>
                            <div class="label-tech" style="background: var(--primary-light); color: var(--primary); padding: 4px 12px; border-radius: 20px; font-weight: 800; font-size: 11px;">
                                ${projectCount} ${projectCount === 1 ? 'PROCESSO' : 'PROCESSOS'}
                            </div>
                        </div>
                        <div>
                            <h4 class="font-black" style="font-size: 1.4rem; color: var(--slate-900); letter-spacing: -0.02em; line-height: 1.2;">${escapeHtml(String(project.name || '').toUpperCase())}</h4>
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                                <span class="label-tech" style="font-size: 11px; color: var(--slate-400);">PROJETO / ID #${escapeHtml(String(project.id))}</span>
                                <div style="width: 4px; height: 4px; background: var(--slate-200); border-radius: 50%;"></div>
                                <span class="label-tech" style="font-size: 11px; color: var(--primary); font-weight: 800;">VER PROJETO</span>
                            </div>
                        </div>
                    </div>
                    <div style="position: absolute; right: -20px; bottom: -20px; opacity: 0.03; transform: rotate(-15deg); pointer-events: none;">
                        <svg viewBox="0 0 24 24" width="120" height="120" fill="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                `;
                grid.appendChild(card);
            });

            projectsSection.appendChild(grid);
            shell.appendChild(projectsSection);
        }

        const processSection = document.createElement('div');
        processSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.5rem;">
                <h3 class="font-black" style="font-size:1.25rem;">PROCESSOS GERAIS</h3>
                <span class="label-tech" style="background: var(--slate-100); padding: 2px 8px; border-radius: 6px; color: var(--slate-400);">${looseProcesses.length}</span>
            </div>
        `;

        if (looseProcesses.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'glass-card';
            empty.style.cssText = 'padding: 3rem; text-align: center; border: 1px dashed var(--slate-200); opacity: 0.6;';
            empty.innerHTML = '<p class="label-tech" style="color: var(--slate-400);">NENHUM PROCESSO INDIVIDUAL LOCALIZADO</p>';
            processSection.appendChild(empty);
        } else {
            processSection.appendChild(renderProcessTable(looseProcesses, clientId, null));
        }

        shell.appendChild(processSection);
        contentPanel.appendChild(shell);

        contentPanel.querySelectorAll('[data-open-project-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const projectId = button.getAttribute('data-open-project-id');
                const treeProjectButton = container.querySelector(`#btn-proj-${CSS.escape(String(projectId))}`);
                treeProjectButton?.click();
            });
        });

        contentPanel.querySelectorAll('[data-open-process-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const processId = button.getAttribute('data-open-process-id');
                if (!processId || typeof onViewProcess !== 'function') return;
                currentProcessId = String(processId);
                onViewProcess(processId, clientId, null);
            });
        });
    };

    const isInitialProjectEvent = (event) => {
        const normalizedType = String(event?.type || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        const normalizedDesc = String(event?.description || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        const id = String(event?.id || '');
        const looksInitialByText = normalizedDesc.includes('inicial') && (normalizedType === 'protocolo' || normalizedType === 'titulo');
        return event?.isInitial === true || event?.usesProcessDocument === true || id.includes('event-inicial') || looksInitialByText;
    };

    const resolveProcessEvents = (process) => {
        const baseDocument = process.docBase64 || process.docStoragePath
            ? {
                id: `${process.id}-doc-inicial`,
                name: process.docName || 'documento',
                type: process.docType || 'application/pdf',
                base64: process.docBase64 || '',
                storagePath: process.docStoragePath || ''
            }
            : null;

        return (process.events || []).map((event) => {
            if (baseDocument && isInitialProjectEvent(event)) {
                return {
                    ...event,
                    isInitial: true,
                    documents: [{ ...baseDocument }]
                };
            }
            return {
                ...event,
                documents: Array.isArray(event.documents) ? event.documents : []
            };
        });
    };

    const buildProjectExtractRows = (processes) => processes
        .flatMap((process) => resolveProcessEvents(process).map((event, index) => ({
            process,
            event,
            orderKey: event.date ? new Date(`${event.date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER,
            index
        })))
        .sort((a, b) => {
            if (a.orderKey !== b.orderKey) return a.orderKey - b.orderKey;
            return String(a.process.numeroProcesso || a.process.numeroTitulo || a.process.id)
                .localeCompare(String(b.process.numeroProcesso || b.process.numeroTitulo || b.process.id), 'pt-BR');
        });

    const renderProjectExtract = (clientId, projectId) => {
        const contentPanel = container.querySelector('#process-content-panel');
        const client = clientStore.clients.find((item) => String(item.id) === String(clientId));
        const project = projectStore.getProjectsByClient(clientId).find((item) => String(item.id) === String(projectId));
        if (!contentPanel || !project) return;

        const processes = getProcessesForProject(clientId, project);
        const extractRows = buildProjectExtractRows(processes);
        contentPanel.innerHTML = '';

        const shell = document.createElement('div');
        shell.className = 'animate-fade-in';
        shell.style.cssText = 'padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;';

        const header = document.createElement('div');
        header.className = 'glass-card';
        header.style.cssText = 'padding: 1.5rem 1.75rem;';
        header.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
                <div>
                    <p class="label-tech">EXTRATO DO PROJETO</p>
                    <h2 class="font-black" style="font-size: 1.8rem; margin-top: 0.35rem;">${escapeHtml(String(project.name || '').toUpperCase())}</h2>
                    <p style="color: var(--slate-500); margin-top: 0.5rem;">${escapeHtml(getClientName(client))}</p>
                </div>
                <button type="button" class="btn-pill" id="btn-back-project-processes" style="background: var(--bg-main);">PROCESSOS DO PROJETO</button>
            </div>
        `;
        shell.appendChild(header);

        const section = document.createElement('div');
        section.className = 'glass-card';
        section.style.cssText = 'padding: 1.25rem 1.5rem;';
        section.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem;">
                <h3 class="font-black" style="font-size:1.25rem;">EXTRATO CONSOLIDADO</h3>
                <span class="label-tech" style="background: var(--slate-100); padding: 2px 8px; border-radius: 6px; color: var(--slate-400);">${extractRows.length}</span>
            </div>
            <div style="overflow:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="label-tech" style="width:120px;">DATA</th>
                            <th class="label-tech" style="width:180px;">PROCESSO</th>
                            <th class="label-tech" style="width:120px;">TIPO</th>
                            <th class="label-tech">EVENTO</th>
                            <th class="label-tech" style="width:120px;">ARQUIVOS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${extractRows.length === 0 ? `
                            <tr><td colspan="5" class="label-tech" style="padding:2rem; text-align:center; color:var(--slate-400);">SEM ITENS NO EXTRATO DESTE PROJETO</td></tr>
                        ` : extractRows.map(({ process, event }, index) => `
                            <tr>
                                <td><span class="font-black" style="font-size:0.85rem;">${escapeHtml(event.date ? new Date(`${event.date}T00:00:00`).toLocaleDateString('pt-BR') : '—')}</span></td>
                                <td>
                                    <div style="display:flex; flex-direction:column; gap:2px;">
                                        <span class="font-black" style="font-size:0.9rem;">${escapeHtml(process.numeroProcesso || process.numeroTitulo || `Processo ${index + 1}`)}</span>
                                        <span class="label-tech" style="font-size:8px;">${escapeHtml(process.tipoSigla || process.tipo || 'PROCESSO')}</span>
                                    </div>
                                </td>
                                <td><span class="label-tech" style="color:var(--primary);">${escapeHtml((event.type || 'movimentacao').toUpperCase())}</span></td>
                                <td><span style="font-weight:600; font-size:0.92rem;">${escapeHtml(event.description || `Evento ${index + 1}`)}</span></td>
                                <td><span class="font-black" style="font-size:0.9rem; ${event.documents?.length ? 'color: var(--primary);' : 'color: var(--slate-300);'}">${event.documents?.length || 0}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        shell.appendChild(section);
        contentPanel.appendChild(shell);

        contentPanel.querySelector('#btn-back-project-processes')?.addEventListener('click', () => {
            renderProjectProcesses(clientId, projectId);
        });
    };

    const renderProjectProcesses = (clientId, projectId) => {
        const contentPanel = container.querySelector('#process-content-panel');
        const client = clientStore.clients.find((item) => String(item.id) === String(clientId));
        const project = projectStore.getProjectsByClient(clientId).find((item) => String(item.id) === String(projectId));
        if (!contentPanel || !project) return;

        const processes = getProcessesForProject(clientId, project);
        contentPanel.innerHTML = '';

        const shell = document.createElement('div');
        shell.className = 'animate-fade-in';
        shell.style.cssText = 'padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;';

        const header = document.createElement('div');
        header.className = 'glass-card';
        header.style.cssText = 'padding: 1.5rem 1.75rem;';
        header.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
                <div>
                    <p class="label-tech">PROJETO</p>
                    <h2 class="font-black" style="font-size: 1.8rem; margin-top: 0.35rem;">${escapeHtml(String(project.name || '').toUpperCase())}</h2>
                    <p style="color: var(--slate-500); margin-top: 0.5rem;">${escapeHtml(getClientName(client))}</p>
                </div>
                <button type="button" class="btn-pill" id="btn-open-project-extract" style="background: var(--bg-main);">EXTRATO</button>
            </div>
        `;
        shell.appendChild(header);

        const processSection = document.createElement('div');
        processSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.5rem;">
                <h3 class="font-black" style="font-size:1.25rem;">PROCESSOS DO PROJETO</h3>
                <span class="label-tech" style="background: var(--slate-100); padding: 2px 8px; border-radius: 6px; color: var(--slate-400);">${processes.length}</span>
            </div>
        `;

        if (processes.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'glass-card';
            empty.style.cssText = 'padding: 3rem; text-align: center; border: 1px dashed var(--slate-200); opacity: 0.6;';
            empty.innerHTML = '<p class="label-tech" style="color: var(--slate-400);">ESTE PROJETO AINDA NÃO POSSUI PROCESSOS CADASTRADOS</p>';
            processSection.appendChild(empty);
        } else {
            processSection.appendChild(renderProcessTable(processes, clientId, projectId));
        }

        shell.appendChild(processSection);
        contentPanel.appendChild(shell);

        contentPanel.querySelector('#btn-open-project-extract')?.addEventListener('click', () => {
            renderProjectExtract(clientId, projectId);
        });
    };

    const initDOM = () => {
        container.innerHTML = `
            <div class="client-master-detail bounded-scroll-layout">
                <aside class="client-master-panel" style="width: 380px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--bg-main); border-right: 1px solid var(--slate-100);">
                    <div class="client-master-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--slate-100); display: flex; gap: 0.5rem; align-items: center;">
                        <label class="client-master-search" style="flex: 1;">
                            <span class="client-master-search-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                            </span>
                            <input type="search" id="tree-search-input" value="${escapeAttribute(query)}" placeholder="Buscar processo, titular ou projeto..." />
                        </label>
                        ${canEdit ? `<button type="button" class="client-master-add" id="btn-global-add-process" aria-label="Adicionar processo" title="Registrar Novo Processo">${addProcessIcon()}</button>` : ''}
                    </div>
                    <div class="custom-scrollbar" id="tree-container" style="flex: 1; overflow-y: auto; padding: 1rem 0;"></div>
                </aside>
                <section class="client-detail-panel custom-scrollbar" id="process-content-panel" style="flex: 1; min-width: 0; background: var(--card-bg);"></section>
            </div>
        `;

        const searchInput = container.querySelector('#tree-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                query = String(event.target.value || '').toLowerCase().trim();
                renderTree();
            });
        }
        
        const btnGlobalAddProcess = container.querySelector('#btn-global-add-process');
        if (btnGlobalAddProcess) {
            btnGlobalAddProcess.addEventListener('click', () => {
                if (typeof onAddProcess === 'function') onAddProcess(null, null);
            });
        }
        
        // Custom CSS for the Tree View
        if (!document.getElementById('tree-view-styles')) {
            const style = document.createElement('style');
            style.id = 'tree-view-styles';
            style.textContent = `
                .tree-node-btn {
                    width: 100%; display: flex; align-items: center; justify-content: space-between;
                    padding: 8px 16px; border: none; background: transparent; cursor: pointer;
                    color: var(--slate-700); font-size: 0.9rem; text-align: left;
                    transition: background 0.1s, color 0.1s;
                }
                .tree-node-btn:hover { background: var(--slate-50); color: var(--primary); }
                .tree-node-btn.is-active { background: var(--primary-light); color: var(--primary); font-weight: 700; }
                .tree-chevron.expanded { transform: rotate(90deg); }
                .tree-actions { opacity: 0; transition: opacity 0.2s; display: flex; gap: 4px; }
                .tree-node-btn:hover .tree-actions { opacity: 1; }
                .tree-action-btn { background: none; border: none; color: var(--slate-400); cursor: pointer; padding: 4px; border-radius: 4px; }
                .tree-action-btn:hover { background: var(--slate-200); color: var(--slate-800); }
                .tree-child-container {
                    padding-left: 12px; margin-left: 20px;
                    border-left: 1px solid var(--slate-200);
                }
                .project-card:hover {
                    transform: translateY(-8px) scale(1.02);
                    border-color: var(--primary) !important;
                    box-shadow: 0 18px 32px color-mix(in srgb, var(--primary) 18%, transparent);
                }
                .project-card:hover .font-black {
                    color: var(--primary) !important;
                }
                .proc-table td, .proc-table th { vertical-align: middle; padding: 1rem 0.75rem; }
                .phase-tag { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; }
                .phase-tag-green { background: #dcfce7; color: #166534; }
                .phase-tag-blue { background: #dbeafe; color: #1e40af; }
                .proc-menu-btn:hover { background: var(--slate-100) !important; color: var(--slate-700) !important; }
                .proc-menu-dropdown.hidden { display: none; }
            `;
            document.head.appendChild(style);
        }
    };

    const renderEmptyState = (contentPanel, title, subtitle) => {
        contentPanel.innerHTML = `
            <div style="height: 100%; display: flex; align-items: center; justify-content: center; padding: 4rem;">
                <div class="glass-card animate-fade-in" style="padding: 4rem; text-align: center; border: 1px dashed var(--slate-200); max-width: 500px;">
                    <p class="label-tech" style="color: var(--slate-400);">${escapeHtml(title)}</p>
                    <p style="color: var(--slate-500); margin-top: 1rem;">${escapeHtml(subtitle)}</p>
                </div>
            </div>
        `;
    };

    const handleNodeClick = (e, buttonElement, childContainerId, processId = null, clientId = null, projectId = null) => {
        e.stopPropagation();

        // Se clicou em uma ação (ex: Adicionar Processo), não expande/contrai
        if (e.target.closest('.tree-action-btn')) return;

        // Se for um nó folha (Processo), visualiza
        if (processId) {
            // Remove a classe "is-active" de todos os nós
            container.querySelectorAll('.tree-node-btn').forEach(btn => btn.classList.remove('is-active'));
            buttonElement.classList.add('is-active');
            
            currentProcessId = String(processId);
            if (typeof onViewProcess === 'function') {
                onViewProcess(processId, clientId, projectId);
            }
            return;
        }

        // Se for um nó pai (Titular/Projeto), altera a visibilidade dos filhos
        const childContainer = document.getElementById(childContainerId);
        if (childContainer) {
            const isHidden = childContainer.classList.contains('hidden');
            const chevron = buttonElement.querySelector('.tree-chevron');
            
            if (isHidden) {
                childContainer.classList.remove('hidden');
                if (chevron) chevron.classList.add('expanded');
            } else {
                childContainer.classList.add('hidden');
                if (chevron) chevron.classList.remove('expanded');
            }
        }

        if (clientId && !projectId) {
            const clientTargets = getClientProcessTargets(String(clientId));
            if (clientTargets.length === 1 && typeof onViewProcess === 'function') {
                const target = clientTargets[0];
                currentProcessId = target.processId;
                onViewProcess(target.processId, clientId, target.projectId);
                return;
            }
            renderClientOverview(String(clientId));
            return;
        }

        if (clientId && projectId) {
            renderProjectProcesses(String(clientId), String(projectId));
            return;
        }

        // Renderiza um placeholder na direita se clicar em pai
        const contentPanel = container.querySelector('#process-content-panel');
        if (contentPanel && !currentProcessId) {
            renderEmptyState(contentPanel, 'SELECIONE UM PROCESSO', 'Acesse os detalhes selecionando um processo específico na árvore à esquerda.');
        }
    };

    const renderTree = () => {
        const treeContainer = container.querySelector('#tree-container');
        if (!treeContainer) return;

        treeContainer.innerHTML = '';
        const clients = getClientsWithProcesses();

        const filteredClients = clients.filter(client => {
            if (!query) return true;
            const searchStr = `${getClientName(client)} ${getClientDocument(client)}`.toLowerCase();
            return searchStr.includes(query);
            // Poderíamos melhorar a busca para checar projetos e processos filhos, 
            // mas por simplicidade e performance mantemos filtro pelo pai inicialmente, 
            // ou pode ser expandido.
        });

        if (filteredClients.length === 0) {
            treeContainer.innerHTML = `
                <div style="padding: 2rem; text-align: center;">
                    <p class="label-tech" style="color: var(--slate-400);">Nenhum resultado</p>
                </div>
            `;
            return;
        }

        filteredClients.forEach(client => {
            const clientId = String(client.id);
            const clientProjects = projectStore.getProjectsByClient(clientId);
            const clientProcesses = processStore.getProcessesByClient(clientId);
            
            // Nós de Nível 1: TITULAR
            const clientDiv = document.createElement('div');
            const clientChildContainerId = `child-client-${clientId}`;
            
            // Filtrar visibilidade pela search ajuda a deixar tudo expandido se buscou
            const forceExpand = query.length > 0;

            clientDiv.innerHTML = `
                <button type="button" class="tree-node-btn group" id="btn-client-${clientId}">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${chevronIcon()}
                        <div style="display: flex; flex-direction: column;">
                            <span class="font-black" style="font-size: 0.95rem;">${escapeHtml(getClientName(client))}</span>
                        </div>
                    </div>
                    ${canEdit ? `
                        <div class="tree-actions">
                            <!-- Ação de adicionar projeto ou processo direto no titular dependendo da regra de negócio (aqui injetamos Add Process) -->
                            <span class="tree-action-btn" title="Adicionar Processo Solto" data-action="add-process-client" data-client="${clientId}">
                                ${addProcessIcon()}
                            </span>
                        </div>
                    ` : ''}
                </button>
                <ul class="tree-child-container ${forceExpand ? '' : 'hidden'}" id="${clientChildContainerId}"></ul>
            `;
            
            const btnClient = clientDiv.querySelector(`#btn-client-${clientId}`);
            btnClient.addEventListener('click', (e) => handleNodeClick(e, btnClient, clientChildContainerId, null, clientId, null));
            
            const btnAddProcessClient = clientDiv.querySelector('[data-action="add-process-client"]');
            if (btnAddProcessClient) {
                btnAddProcessClient.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof onAddProcess === 'function') onAddProcess(clientId, null);
                });
            }

            if (forceExpand) {
                const chevron = btnClient.querySelector('.tree-chevron');
                if (chevron) chevron.classList.add('expanded');
            }

            const clientChildContainer = clientDiv.querySelector(`#${clientChildContainerId}`);

            // Nós de Nível 2: PROJETOS
            clientProjects.forEach(project => {
                const projectId = String(project.id);
                const projectProcesses = getProcessesForProject(clientId, project);
                const projectChildContainerId = `child-proj-${projectId}`;
                const projectLi = document.createElement('li');
                
                projectLi.innerHTML = `
                    <button type="button" class="tree-node-btn group" id="btn-proj-${projectId}">
                        <div style="display: flex; align-items: center; gap: 8px; color: var(--slate-600);">
                            ${chevronIcon()}
                            <span style="color: var(--primary);">${folderIcon()}</span>
                            <span class="font-black" style="font-size: 0.85rem;">${escapeHtml(`PROJETO ${project.name || ''}`.trim().toUpperCase())}</span>
                        </div>
                        ${canEdit ? `
                            <div class="tree-actions">
                                <span class="tree-action-btn" title="Adicionar Processo no Projeto" data-action="add-process-proj" data-client="${clientId}" data-proj="${projectId}">
                                    ${addProcessIcon()}
                                </span>
                            </div>
                        ` : ''}
                    </button>
                    <ul class="tree-child-container ${forceExpand ? '' : 'hidden'}" id="${projectChildContainerId}"></ul>
                `;

                const btnProj = projectLi.querySelector(`#btn-proj-${projectId}`);
                btnProj.addEventListener('click', (e) => handleNodeClick(e, btnProj, projectChildContainerId, null, clientId, projectId));

                const btnAddProcessProj = projectLi.querySelector('[data-action="add-process-proj"]');
                if (btnAddProcessProj) {
                    btnAddProcessProj.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof onAddProcess === 'function') onAddProcess(clientId, projectId);
                    });
                }

                if (forceExpand) {
                    const chevron = btnProj.querySelector('.tree-chevron');
                    if (chevron) chevron.classList.add('expanded');
                }

                const projectChildContainer = projectLi.querySelector(`#${projectChildContainerId}`);

                // Nós de Nível 3: PROCESSOS DO PROJETO
                projectProcesses.forEach(process => {
                    const processId = String(process.id);
                    const processLi = document.createElement('li');
                    const isActive = currentProcessId === processId;
                    
                    processLi.innerHTML = `
                        <button type="button" class="tree-node-btn ${isActive ? 'is-active' : ''}" style="padding-left: 28px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="color: var(--slate-400);">${documentIcon()}</span>
                                <div style="display: flex; flex-direction: column;">
                                    <span style="font-weight: 600; font-size: 0.8rem;">${escapeHtml(process.numeroProcesso || 'Sem número')}</span>
                                    <span style="font-size: 0.7rem; color: var(--slate-400);">${escapeHtml(process.tipoSigla || process.tipo || 'Processo')}</span>
                                </div>
                            </div>
                        </button>
                    `;
                    const btnProc = processLi.querySelector('button');
                    btnProc.addEventListener('click', (e) => handleNodeClick(e, btnProc, null, processId, clientId, projectId));
                    projectChildContainer.appendChild(processLi);
                });

                clientChildContainer.appendChild(projectLi);
            });

            // Nós de Nível 2: PROCESSOS SOLTOS (Sem Projeto)
            clientProcesses.forEach(process => {
                const processId = String(process.id);
                const isActive = currentProcessId === processId;
                const processLi = document.createElement('li');
                processLi.innerHTML = `
                    <button type="button" class="tree-node-btn ${isActive ? 'is-active' : ''}" style="padding-left: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: var(--slate-400);">${documentIcon()}</span>
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; font-size: 0.8rem;">${escapeHtml(process.numeroProcesso || 'Sem número')}</span>
                                <span style="font-size: 0.7rem; color: var(--slate-400);">${escapeHtml(process.tipoSigla || process.tipo || 'Processo')}</span>
                            </div>
                        </div>
                    </button>
                `;
                const btnProc = processLi.querySelector('button');
                btnProc.addEventListener('click', (e) => handleNodeClick(e, btnProc, null, processId, clientId, null));
                clientChildContainer.appendChild(processLi);
            });

            treeContainer.appendChild(clientDiv);
        });
    };

    initDOM();
    renderTree();

    const contentPanel = container.querySelector('#process-content-panel');
    if (contentPanel) {
        renderEmptyState(contentPanel, 'VISUALIZADOR DE PROCESSOS', 'Navegue na árvore lateral e selecione um processo para exibir os detalhes aqui.');
    }
}
