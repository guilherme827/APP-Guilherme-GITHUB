import { clientStore } from '../utils/ClientStore.js';
import { processStore } from '../utils/ProcessStore.js';
import { showConfirmModal } from './ConfirmModal.js';
import { showNoticeModal } from './NoticeModal.js';
import { escapeHtml } from '../utils/sanitize.js';

function escapeAttribute(value) {
    return escapeHtml(String(value ?? '')).replace(/"/g, '&quot;');
}

function addProcessIcon() {
    return `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <path d="M12 11v6"></path>
            <path d="M9 14h6"></path>
        </svg>
    `;
}

export function renderProcessList(container, actionsContainer, onAddProcess, onViewProcess, initialClientId = null, initialProjectId = null, options = {}) {
    // Current Navigation State
    let currentClientId = initialClientId;
    let currentProjectId = initialProjectId;
    const canEdit = options.canEdit !== false;
    const canDelete = options.canDelete === true;
    const state = {
        query: ''
    };

    const getClientsWithProcesses = () => clientStore.clients.filter((client) => (
        processStore.processes.some((process) => String(process.clientId) === String(client.id))
    ));

    const getClientName = (client) => (client?.type === 'PF' ? client?.nome : client?.nomeFantasia) || 'Titular';
    const getClientDocument = (client) => (client?.type === 'PF' ? client?.cpf : client?.cnpj) || 'Documento nao informado';

    const render = () => {
        container.innerHTML = '';
        actionsContainer.innerHTML = '';
        actionsContainer.style.display = 'none';

        const clientsWithProcesses = getClientsWithProcesses();
        if (currentClientId && !clientsWithProcesses.some((client) => String(client.id) === String(currentClientId))) {
            currentClientId = null;
            currentProjectId = null;
        }
        if (!currentClientId && clientsWithProcesses.length) {
            currentClientId = clientsWithProcesses[0].id;
        }

        const filteredClients = clientsWithProcesses.filter((client) => {
            const name = getClientName(client);
            const doc = getClientDocument(client);
            const text = `${name} ${doc}`.toLowerCase();
            return text.includes(String(state.query || '').toLowerCase().trim());
        });

        container.innerHTML = `
            <div class="client-master-detail bounded-scroll-layout">
                <aside class="client-master-panel">
                    <div class="client-master-header">
                        <label class="client-master-search">
                            <span class="client-master-search-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                            </span>
                            <input type="search" name="process-client-search" value="${escapeAttribute(state.query)}" placeholder="Buscar titular..." />
                        </label>
                        ${canEdit ? `<button type="button" class="client-master-add" data-action="add-process" aria-label="Adicionar processo">${addProcessIcon()}</button>` : ''}
                    </div>
                    <div class="client-master-list custom-scrollbar">
                        ${filteredClients.length === 0 ? `
                            <div class="client-master-empty">
                                <p>Nenhum titular com processo encontrado.</p>
                            </div>
                        ` : filteredClients.map((client) => `
                            <button type="button" class="client-master-item ${String(client.id) === String(currentClientId) ? 'is-active' : ''}" data-process-client-id="${client.id}">
                                <span class="client-master-item-name">${escapeHtml(getClientName(client))}</span>
                                <span class="client-master-item-doc">${escapeHtml(getClientDocument(client))}</span>
                            </button>
                        `).join('')}
                    </div>
                </aside>
                <section class="client-detail-panel custom-scrollbar" id="process-content-panel"></section>
            </div>
        `;

        container.querySelector('input[name="process-client-search"]')?.addEventListener('input', (event) => {
            state.query = String(event.target.value || '');
            render();
        });
        container.querySelector('[data-action="add-process"]')?.addEventListener('click', () => {
            if (typeof onAddProcess === 'function') {
                onAddProcess(currentClientId);
            }
        });

        container.querySelectorAll('[data-process-client-id]').forEach((button) => {
            button.addEventListener('click', () => {
                currentClientId = button.dataset.processClientId;
                currentProjectId = null;
                render();
            });
        });

        const contentPanel = container.querySelector('#process-content-panel');
        if (!contentPanel) return;

        // Hierarchical Breadcrumbs
        const breadcrumbs = document.createElement('div');
        breadcrumbs.className = 'label-tech';
        breadcrumbs.style.marginBottom = '2rem';
        breadcrumbs.style.display = 'flex';
        breadcrumbs.style.gap = '0.5rem';
        breadcrumbs.style.color = 'var(--slate-400)';

        const createCrumb = (text, onClick) => {
            const span = document.createElement('span');
            span.textContent = text.toUpperCase();
            span.style.cursor = onClick ? 'pointer' : 'default';
            if (onClick) {
                span.style.color = 'var(--primary)';
                span.onclick = onClick;
            }
            return span;
        };

        breadcrumbs.appendChild(createCrumb('PROCESSOS', () => { currentProjectId = null; render(); }));
        const selectedClient = clientStore.clients.find((client) => String(client.id) === String(currentClientId));
        if (selectedClient) {
            breadcrumbs.appendChild(document.createTextNode(' > '));
            breadcrumbs.appendChild(createCrumb(getClientName(selectedClient), () => { currentProjectId = null; render(); }));
        }
        if (currentProjectId) {
            breadcrumbs.appendChild(document.createTextNode(' > '));
            const project = processStore.projects.find((item) => String(item.id) === String(currentProjectId));
            breadcrumbs.appendChild(createCrumb(project?.name || 'PROJETO'));
        }
        contentPanel.appendChild(breadcrumbs);

        if (!clientsWithProcesses.length) {
            contentPanel.innerHTML += `
                <div class="glass-card animate-fade-in" style="padding: 4rem; text-align: center; border: 1px dashed var(--slate-200);">
                    <p class="label-tech" style="color: var(--slate-400);">NENHUM TITULAR COM PROCESSOS ATIVOS</p>
                    <p style="color: var(--slate-500); margin-top: 1rem;">Adicione um processo vinculado a um titular para ele aparecer nesta lista.</p>
                </div>
            `;
            return;
        }

        if (!currentProjectId) {
            renderClientProjectsAndProcesses(contentPanel);
        } else {
            renderProjectProcesses(contentPanel);
        }
    };

    const renderClientProjectsAndProcesses = (target) => {
        const projects = processStore.getProjectsByClient(currentClientId);
        
        // Analysis: Group processes
        const clientProcesses = processStore.processes.filter(p => p.clientId == currentClientId);
        const generalProcesses = clientProcesses.filter(p => !p.projectId);

        const section = document.createElement('div');
        section.className = 'animate-fade-in';

        // --- Projects Section ---
        if (projects.length > 0) {
            // Grid of project cards
            const projectGrid = document.createElement('div');
            projectGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 4rem;';

            projects.forEach(p => {
                const pCount = clientProcesses.filter(proc => String(proc.projectId) === String(p.id)).length;
                const card = document.createElement('div');
                card.className = 'glass-card project-card premium-hover';
                card.style.cssText = `
                    cursor: pointer; padding: 2.5rem; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    border: 1px solid var(--slate-100); position: relative; overflow: hidden;
                    background: var(--card-bg);
                `;
                
                card.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 1.5rem; position: relative; z-index: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="background: var(--primary); width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                            </div>
                            <div class="label-tech" style="background: var(--primary-light); color: var(--primary); padding: 4px 12px; border-radius: 20px; font-weight: 800; font-size: 11px;">
                                ${pCount} ${pCount === 1 ? 'PROCESSO' : 'PROCESSOS'}
                            </div>
                        </div>
                        <div>
                            <h4 class="font-black" style="font-size: 1.4rem; color: var(--slate-900); letter-spacing: -0.02em; line-height: 1.2;">${escapeHtml((p.name || '').toUpperCase())}</h4>
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                                <span class="label-tech" style="font-size: 11px; color: var(--slate-400);">FOLDER / ID #${p.id}</span>
                                <div style="width: 4px; height: 4px; background: var(--slate-200); border-radius: 50%;"></div>
                                <span class="label-tech" style="font-size: 11px; color: var(--primary); font-weight: 800;">VER PROJETO</span>
                            </div>
                        </div>
                    </div>
                    <!-- Subtle background decoration -->
                    <div style="position: absolute; right: -20px; bottom: -20px; opacity: 0.03; transform: rotate(-15deg); pointer-events: none;">
                         <svg viewBox="0 0 24 24" width="120" height="120" fill="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                `;
                
                const projectId = p.id;
                card.addEventListener('click', () => { 
                    currentProjectId = projectId; 
                    render(); 
                });
                projectGrid.appendChild(card);
            });
            section.appendChild(projectGrid);

            // Global Style for project cards
            if (!document.getElementById('project-card-styles')) {
                const style = document.createElement('style');
                style.id = 'project-card-styles';
                style.textContent = `
                    .project-card:hover {
                        transform: translateY(-8px) scale(1.02);
                        border-color: var(--primary) !important;
                        box-shadow: 0 18px 32px color-mix(in srgb, var(--primary) 18%, transparent);
                    }
                    .project-card:hover .font-black {
                        color: var(--primary) !important;
                    }
                `;
                document.head.appendChild(style);
            }
        }

        // --- General Processes Section (No project) ---
        const generalHeader = document.createElement('div');
        generalHeader.style.cssText = 'margin-top: 1rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;';
        generalHeader.innerHTML = `
            <h3 class="font-black" style="font-size: 1.25rem;">PROCESSOS GERAIS</h3>
            <span class="label-tech" style="background: var(--slate-100); padding: 2px 8px; border-radius: 6px; color: var(--slate-400);">${generalProcesses.length}</span>
        `;
        section.appendChild(generalHeader);
        
        if (generalProcesses.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'glass-card';
            empty.style.cssText = 'padding: 3rem; text-align: center; border: 1px dashed var(--slate-200); opacity: 0.6;';
            empty.innerHTML = `<p class="label-tech" style="color: var(--slate-400);">NENHUM PROCESSO INDIVIDUAL LOCALIZADO</p>`;
            section.appendChild(empty);
        } else {
            section.appendChild(renderProcessTable(generalProcesses));
        }

        target.appendChild(section);
    };

    const renderProjectProcesses = (target) => {
        const allProcesses = processStore.processes;
        const allProjects = processStore.projects;
        
        const processes = allProcesses.filter(p => String(p.projectId) === String(currentProjectId));
        const project = allProjects.find(p => String(p.id) === String(currentProjectId));
        
        const section = document.createElement('div');
        section.className = 'animate-fade-in';

        // Header with Back Button
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '1rem';
        header.style.marginBottom = '2.5rem';
        header.innerHTML = `
            <button class="btn-pill" id="btn-back-to-projects" style="padding: 0.5rem; background: var(--bg-main);">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div style="display: flex; flex-direction: column;">
                <h3 class="font-black" style="font-size: 1.5rem; color: var(--primary);">${escapeHtml((project?.name || 'PROJETOS').toUpperCase())}</h3>
                <span class="label-tech" style="color: var(--slate-400);">EXIBINDO TODOS OS PROCESSOS DESTE PROJETO</span>
            </div>
        `;
        header.querySelector('#btn-back-to-projects').onclick = () => { currentProjectId = null; render(); };
        section.appendChild(header);
        
        if (processes.length === 0) {
            section.innerHTML += `
                <div class="glass-card" style="padding: 4rem; text-align: center; border: 1px dashed var(--slate-200);">
                    <p class="label-tech" style="color: var(--slate-400);">ESTE PROJETO AINDA NÃO POSSUI PROCESSOS CADASTRADOS</p>
                </div>
            `;
        } else {
            section.appendChild(renderProcessTable(processes));
        }
        target.appendChild(section);
    };

    const renderProcessTable = (processes) => {
        const tableCard = document.createElement('div');
        tableCard.className = 'glass-card animate-fade-in';
        tableCard.style.padding = '0.5rem';

        // Helper: calculate days diff
        const daysDiff = (dateStr) => {
            if (!dateStr) return null;
            const d = new Date(dateStr + 'T00:00:00');
            const today = new Date();
            today.setHours(0,0,0,0);
            return Math.round((d - today) / (1000 * 60 * 60 * 24));
        };

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
                    ${processes.map(p => {
                        const faseStr = (p.fase || 'REQUERIMENTO').toUpperCase();
                        const isTitulo = faseStr === 'TÍTULO' || faseStr === 'TITULO';
                        const phaseClass = isTitulo ? 'phase-tag-green' : 'phase-tag-blue';
                        const phaseTxt = isTitulo ? 'TÍTULO' : 'REQUERIMENTO';

                        // Smart date calculation...
                        // (OMITTED for brevity in targetContent match, but code is the same)
                        let dateLabel = 'DATA';
                        let dateValue = '–';
                        let daysLabel = '';
                        let daysColor = 'var(--slate-400)';

                        if (isTitulo && p.dataValidade) {
                            const diff = daysDiff(p.dataValidade);
                            dateLabel = 'VALIDADE';
                            dateValue = new Date(p.dataValidade + 'T00:00:00').toLocaleDateString('pt-BR');
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
                            dateValue = new Date(p.dataProtocolo + 'T00:00:00').toLocaleDateString('pt-BR');
                            if (diff !== null) {
                                const elapsed = Math.abs(diff);
                                daysLabel = `HÁ ${elapsed} DIAS`;
                                daysColor = 'var(--slate-400)';
                            }
                        }

                        const deadlineCount = (p.deadlines || []).length;

                        return `
                        <tr class="process-row" data-id="${p.id}">
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
                                    ${p.numeroTitulo ? 
                                        `<span class="font-black" style="font-size: 1rem; color: var(--primary);">${escapeHtml(p.numeroTitulo)}</span>
                                         <span style="font-size: 9px; color: var(--slate-400); text-transform: uppercase;">${escapeHtml(p.numeroProcesso || '–')}</span>` 
                                        : 
                                        `<span class="font-black" style="font-size: 0.9rem;">${escapeHtml(p.numeroProcesso || 'SEM NÚMERO')}</span>`
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
                                    ${(canEdit || canDelete) ? `<button class="proc-menu-btn" data-id="${p.id}" style="background: none; border: none; cursor: pointer; padding: 6px; border-radius: 8px; color: var(--slate-400); display: flex; align-items: center;">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                                    </button>` : ''}
                                    ${(canEdit || canDelete) ? `<div class="proc-menu-dropdown hidden" data-id="${p.id}" style="position: absolute; right: 0; top: 100%; z-index: 1000; min-width: 140px; padding: 6px; overflow: hidden;">
                                        ${canEdit ? `<div class="proc-action" data-action="edit" data-id="${p.id}" style="padding: 8px 12px; cursor: pointer; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            EDITAR
                                        </div>` : ''}
                                        ${canEdit ? `<div class="proc-action" data-action="archive" data-id="${p.id}" style="padding: 8px 12px; cursor: pointer; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                                            ARQUIVAR
                                        </div>` : ''}
                                        ${canDelete ? `<div class="proc-action" data-action="delete" data-id="${p.id}" style="padding: 8px 12px; cursor: pointer; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--rose-500);">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                            EXCLUIR
                                        </div>` : ''}
                                    </div>` : ''}
                                </div>
                            </td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>
            <style>
                .proc-table td, .proc-table th { vertical-align: middle; padding: 1rem 0.75rem; }
                .phase-tag { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; }
                .phase-tag-green { background: #dcfce7; color: #166534; }
                .phase-tag-blue { background: #dbeafe; color: #1e40af; }
                .proc-menu-btn:hover { background: var(--slate-100) !important; color: var(--slate-700) !important; }
                .proc-menu-dropdown.hidden { display: none; }
            </style>
        `;

        // Row click (open view)
        tableCard.querySelectorAll('.process-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't fire if clicking on menu button or dropdown
                if (e.target.closest('.proc-menu-wrap')) return;
                if (onViewProcess) onViewProcess(row.dataset.id, currentClientId, currentProjectId);
            });
        });

        // 3-dot menu toggle
        tableCard.querySelectorAll('.proc-menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                // Close all others
                tableCard.querySelectorAll('.proc-menu-dropdown').forEach(d => d.classList.add('hidden'));
                const dropdown = tableCard.querySelector(`.proc-menu-dropdown[data-id="${id}"]`);
                dropdown.classList.toggle('hidden');
            });
        });

        // Menu actions
        tableCard.querySelectorAll('.proc-action').forEach(action => {
            action.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = action.dataset.id;
                const act = action.dataset.action;
                if (act === 'delete') {
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
                                render();
                            } catch (error) {
                                showNoticeModal('Erro ao excluir', error?.message || 'Não foi possível excluir o processo.');
                            }
                        }
                    );
                } else if (act === 'edit') {
                    if (onViewProcess) onViewProcess(id, currentClientId, currentProjectId, 'edit');
                } else if (act === 'archive') {
                    showNoticeModal('Arquivamento', 'Arquivamento em breve!');
                }
                tableCard.querySelectorAll('.proc-menu-dropdown').forEach(d => d.classList.add('hidden'));
            });
        });

        // Close menus on click in the process view area
        tableCard.onclick = () => {
            tableCard.querySelectorAll('.proc-menu-dropdown').forEach(d => d.classList.add('hidden'));
        };

        return tableCard;
    };

    render();
}
