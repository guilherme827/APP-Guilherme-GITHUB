// Main application logic
import './styles/main.css';
import './styles/themes.css';
import { renderHeader } from './components/Header.js';
import { renderDock, initDock } from './components/Dock.js';
import { processStore } from './utils/ProcessStore.js';
import { clientStore } from './utils/ClientStore.js';
import { renderClientList } from './components/ClientList.js';
import { renderClientForm } from './components/ClientForm.js';
import { renderClientDetails } from './components/ClientDetails.js';
import { renderProcessList } from './components/ProcessList.js';
import { renderProcessForm } from './components/ProcessForm.js';
import { renderProcessDetails } from './components/ProcessDetails.js';
import { renderDeadlineDashboard } from './components/DeadlineDashboard.js';
import { renderSettings } from './components/Settings.js';
import { showNoticeModal } from './components/NoticeModal.js';

const THEME_STORAGE_KEY = 'app-control-theme';
const AVAILABLE_THEMES = ['light', 'dark', 'ocean', 'sunset'];

function getStoredTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return AVAILABLE_THEMES.includes(savedTheme) ? savedTheme : 'light';
}

function applyTheme(theme) {
    const safeTheme = AVAILABLE_THEMES.includes(theme) ? theme : 'light';
    document.body.setAttribute('data-theme', safeTheme);
    localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
    return safeTheme;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([clientStore.ready, processStore.ready]);
    const app = document.getElementById('app');
    let currentTheme = applyTheme(getStoredTheme());
    
    // Initial Layout Injection
    app.innerHTML = `
        ${renderHeader()}
        <main id="main-content">
            <div id="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem;">
                <div id="view-title-group" style="display: flex; align-items: center; gap: 1rem;">
                    <div id="view-icon" style="color: var(--slate-950);"></div>
                    <h1 id="page-title" class="font-black" style="font-size: 2rem; text-transform: uppercase;">Painel Central</h1>
                </div>
                <div id="view-actions"></div>
            </div>
            <section id="content-area">
                <!-- Content injected here -->
            </section>
        </main>
        ${renderDock()}
    `;

    // Initialize Components
    const contentArea = document.getElementById('content-area');
    const pageTitle = document.getElementById('page-title');
    const viewIcon = document.getElementById('view-icon');
    const viewActions = document.getElementById('view-actions');

    // Navigation Logic
    const navigate = (id) => {
        contentArea.innerHTML = '';
        viewActions.innerHTML = '';
        
        const sectionMap = {
            painel: { title: 'Painel Central', icon: getSectionIcon('painel') },
            clientes: { title: 'Titulares', icon: getSectionIcon('clientes') },
            processos: { title: 'Processos', icon: getSectionIcon('processos') },
            prazos: { title: 'Prazos', icon: getSectionIcon('prazos') },
            financeiro: { title: 'Financeiro', icon: getSectionIcon('financeiro') },
            configuracoes: { title: 'Configurações', icon: getSectionIcon('configuracoes') }
        };

        const section = sectionMap[id] || { title: id, icon: '' };
        pageTitle.textContent = section.title;
        viewIcon.innerHTML = section.icon;
        
        if (id === 'painel') {
            renderDashboard(contentArea);
        } else if (id === 'clientes') {
            renderClientesView(contentArea, viewActions);
        } else if (id === 'processos') {
            renderProcessosView(contentArea, viewActions);
        } else if (id === 'prazos') {
            renderDeadlineDashboard(contentArea);
        } else if (id === 'configuracoes') {
            renderSettings(contentArea, currentTheme, (selectedTheme) => {
                currentTheme = applyTheme(selectedTheme);
            });
        } else {
            renderEmptyState(contentArea, id);
        }
    };

    function renderProcessosView(container, actionsContainer) {
        const renderList = (restoreClientId = null, restoreProjectId = null) => {
            renderProcessList(container, actionsContainer,
                (clientId) => showAddProcess(container, actionsContainer, renderList, clientId),
                (processId, clientId, projectId, action) => {
                    if (action === 'edit') {
                        showEditProcess(
                            container,
                            actionsContainer,
                            processId,
                            () => showProcessDetails(container, actionsContainer, processId, clientId, projectId, renderList)
                        );
                    } else {
                        showProcessDetails(container, actionsContainer, processId, clientId, projectId, renderList);
                    }
                },
                restoreClientId,
                restoreProjectId
            );
        };
        renderList();
    }

    function showProcessDetails(container, actionsContainer, processId, clientId, projectId, renderList) {
        container.innerHTML = '';
        actionsContainer.innerHTML = '';

        // Each breadcrumb level gets a precise navigation callback
        const onNavigate = {
            toProcessList: () => renderList(null, null),
            toClient: () => renderList(clientId, null),
            toProject: projectId ? () => renderList(clientId, projectId) : null,
            toEdit: (pid) => showEditProcess(container, actionsContainer, pid, () => showProcessDetails(container, actionsContainer, pid, clientId, projectId, renderList))
        };

        renderProcessDetails(container, actionsContainer, processId, onNavigate);
    }

    function showEditProcess(container, actionsContainer, processId, onComplete) {
        const process = processStore.processes.find(p => String(p.id) === String(processId));
        if (!process) return;

        container.innerHTML = '';
        actionsContainer.innerHTML = '';

        renderProcessForm(container, (updatedData) => {
            const wasUpdated = processStore.updateProcess(processId, updatedData);
            if (!wasUpdated) {
                showNoticeModal('Erro ao salvar', 'Não foi possível atualizar este processo. Verifique o armazenamento local do navegador e tente novamente.');
                return;
            }
            showNoticeModal('Processo atualizado', 'As alterações foram salvas com sucesso.');
            onComplete();
        }, onComplete, process);
    }

    function showAddProcess(container, actionsContainer, onComplete, clientId = null) {
        container.innerHTML = '';
        actionsContainer.innerHTML = '';
        renderProcessForm(container, async (data) => {
            try {
                await processStore.addProcess(data);
            } catch (error) {
                showNoticeModal('Erro ao salvar', error?.message || 'Não foi possível salvar o processo.');
                return;
            }
            onComplete();
        }, onComplete, null, clientId);
    }

    initDock(navigate);

    // Initial Route
    navigate('painel');
});

function renderDashboard(container) {
    container.innerHTML = `
        <div class="stats-grid animate-fade-in" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 1.5rem;">
            <div class="glass-card stat-card" style="padding: 1.25rem;">
                <p class="label-tech" style="font-size: 9px;">TOTAL TITULARES</p>
                <h3 class="font-black" style="font-size: 1.75rem;">${clientStore.clients.length}</h3>
            </div>
            <div class="glass-card stat-card" style="padding: 1.25rem;">
                <p class="label-tech" style="font-size: 9px;">PROCESSOS ATIVOS</p>
                <h3 class="font-black" style="font-size: 1.75rem; color: var(--primary);">42</h3>
            </div>
            <div class="glass-card stat-card" style="padding: 1.25rem;">
                <p class="label-tech" style="font-size: 9px;">PRAZOS CRÍTICOS</p>
                <h3 class="font-black" style="font-size: 1.75rem; color: var(--rose-500);">08</h3>
            </div>
            <div class="glass-card stat-card" style="padding: 1.25rem;">
                <p class="label-tech" style="font-size: 9px;">FATURAMENTO MÊS</p>
                <h3 class="font-black" style="font-size: 1.75rem;">R$ 42k</h3>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 2.5fr 1fr; gap: 1.5rem;">
            <div class="glass-card animate-fade-in">
                <h3 class="font-black" style="font-size: 1.5rem; margin-bottom: 1rem;">Visão Geral da GEOCONSULT</h3>
                <p style="color: var(--slate-500); line-height: 1.6;">
                    Seu ecossistema de gestão está operando normalmente. Esta nova visualização expandida permite que você acompanhe mais métricas simultaneamente, otimizando seu fluxo de trabalho em telas grandes.
                </p>
                <div style="margin-top: 2rem; height: 100px; border-radius: 16px; background: var(--bg-main); border: 1px dashed var(--slate-200); display: flex; align-items: center; justify-content: center;">
                    <p class="label-tech">GRÁFICO DE DESEMPENHO EM BREVE</p>
                </div>
            </div>
            <div class="glass-card animate-fade-in">
                <h3 class="font-black" style="font-size: 1.2rem; margin-bottom: 1rem;">Atividades Recentes</h3>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div style="padding-bottom: 1rem; border-bottom: 1px solid var(--slate-200);">
                        <p class="font-black" style="font-size: 0.9rem;">Novo Titular: GEOCONSULT</p>
                        <p class="label-tech" style="font-size: 8px;">HÁ 10 MINUTOS</p>
                    </div>
                    <div style="padding-bottom: 1rem; border-bottom: 1px solid var(--slate-200);">
                        <p class="font-black" style="font-size: 0.9rem;">Processo #4521 atualizado</p>
                        <p class="label-tech" style="font-size: 8px;">HÁ 1 HORA</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getSectionIcon(id) {
    const icons = {
        painel: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
        clientes: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
        processos: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>`,
        prazos: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="16" cy="16" r="3"></circle><path d="M16 14v2l1 1"></path></svg>`,
        financeiro: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path><circle cx="12" cy="12" r="10" stroke-opacity="0.2"></circle></svg>`,
        configuracoes: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
    };
    return icons[id] || '';
}

function renderEmptyState(container, id) {
    const colors = {
        financeiro: { bg: '#FFF1F2', text: '#F43F5E' },
        configuracoes: { bg: '#F1F5F9', text: '#475569' }
    };
    const style = colors[id] || { bg: '#F1F5F9', text: '#475569' };

    container.innerHTML = `
        <div class="animate-fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6rem 0;">
            <div style="width: 120px; height: 120px; background: ${style.bg}; border-radius: 32px; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem;">
                <div style="width: 40px; height: 40px; border: 4px solid ${style.text}; border-radius: 8px;"></div>
            </div>
            <h2 class="font-black" style="font-size: 2rem; color: var(--slate-950);">Nada por aqui ainda.</h2>
            <p class="label-tech" style="margin-top: 1rem;">MÓDULO ${id.toUpperCase()} EM DESENVOLVIMENTO</p>
        </div>
    `;
}

function renderClientesView(container, actionsContainer) {
    const renderList = () => {
        actionsContainer.innerHTML = '';
        renderClientList(container, actionsContainer,
            (client) => showEditClient(container, actionsContainer, client, renderList), 
            () => showAddClient(container, actionsContainer, renderList),
            (client) => showClientDetails(container, actionsContainer, client, renderList)
        );
    };
    renderList();
}

function showClientDetails(container, actionsContainer, client, onBack) {
    container.innerHTML = '';
    actionsContainer.innerHTML = '';
    renderClientDetails(container, client, onBack);
}

function showAddClient(container, actionsContainer, onComplete) {
    container.innerHTML = '';
    actionsContainer.innerHTML = '';
    renderClientForm(container, 
        (data) => {
            clientStore.addClient(data);
            onComplete();
        },
        onComplete
    );
}

function showEditClient(container, actionsContainer, client, onComplete) {
    container.innerHTML = '';
    actionsContainer.innerHTML = '';
    renderClientForm(container, 
        (data) => {
            clientStore.updateClient(client.id, data);
            onComplete();
        },
        onComplete,
        client
    );
}
