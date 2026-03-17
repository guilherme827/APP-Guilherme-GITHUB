import { clientStore } from '../utils/ClientStore.js';
import { processStore } from '../utils/ProcessStore.js';
import { projectStore } from '../utils/ProjectStore.js';
import { showConfirmModal } from './ConfirmModal.js';
import { showNoticeModal } from './NoticeModal.js';
import { escapeHtml } from '../utils/sanitize.js';

function escapeAttribute(value) {
    return escapeHtml(String(value ?? '')).replace(/"/g, '&quot;');
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

    const getClientName = (client) => (client?.type === 'PF' ? client?.nome : client?.nomeFantasia) || 'Titular';
    const getClientDocument = (client) => (client?.type === 'PF' ? client?.cpf : client?.cnpj) || 'Documento nao informado';

    const getClientsWithProcesses = () => clientStore.clients.filter((client) => {
        const hasProcesses = processStore.processes.some((process) => String(process.clientId) === String(client.id));
        const hasProjects = projectStore.projects.some((project) => String(project.clientId) === String(client.id));
        return hasProcesses || hasProjects;
    });

    const initDOM = () => {
        container.innerHTML = `
            <div class="client-master-detail bounded-scroll-layout">
                <aside class="client-master-panel" style="width: 380px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--bg-main); border-right: 1px solid var(--slate-100);">
                    <div class="client-master-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--slate-100);">
                        <label class="client-master-search">
                            <span class="client-master-search-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                            </span>
                            <input type="search" id="tree-search-input" value="${escapeAttribute(query)}" placeholder="Buscar processo, titular ou projeto..." />
                        </label>
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
            btnClient.addEventListener('click', (e) => handleNodeClick(e, btnClient, clientChildContainerId));
            
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
                const projectProcesses = processStore.getProcessesByProject(projectId);
                const projectChildContainerId = `child-proj-${projectId}`;
                const projectLi = document.createElement('li');
                
                projectLi.innerHTML = `
                    <button type="button" class="tree-node-btn group" id="btn-proj-${projectId}">
                        <div style="display: flex; align-items: center; gap: 8px; color: var(--slate-600);">
                            ${chevronIcon()}
                            <span style="color: var(--primary);">${folderIcon()}</span>
                            <span class="font-black" style="font-size: 0.85rem;">${escapeHtml((project.name || '').toUpperCase())}</span>
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
                btnProj.addEventListener('click', (e) => handleNodeClick(e, btnProj, projectChildContainerId));

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
