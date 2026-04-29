
import { escapeHtml } from '../utils/sanitize.js';
import { renderTeamSettings } from './TeamSettings.js';
import { renderTrashView } from './TrashView.js';
import { trashStore } from '../utils/TrashStore.js';
import { ActivityLogView } from './ActivityLogView.js';
import { authService } from '../utils/AuthService.js';
import { renderAIControlView } from './AIControlView.js';

export function renderAdminPanelView(container, options = {}) {
    const {
        profile,
        isAdmin,
        teamProfiles = [],
        availableModules = [],
        teamLoading = false,
        teamCreateLoading = false,
        onRefreshTeam,
        onCreateTeamMember,
        onUpdateTeamMember
    } = options;

    const state = {
        activeTab: 'equipe' // 'equipe', 'ambiente', 'organizacao'
    };

    const tabs = [
        { id: 'equipe', label: 'Gestão de Equipe', icon: usersIcon() },
        { id: 'ia', label: 'Controle da IA', icon: sparklesIcon() },
        { id: 'ambiente', label: 'Status do Ambiente', icon: activityIcon() },
        { id: 'organizacao', label: 'Dados da Organização', icon: buildingsIcon() },
        { id: 'lixeira', label: 'Lixeira', icon: trashIcon() },
        { id: 'registro', label: 'Registro de Atividades', icon: historyIcon() }
    ];

    const render = () => {
        container.innerHTML = `
            <div class="client-master-detail bounded-scroll-layout settings-menu-layout">
                <aside class="client-master-panel">
                    <div class="client-master-header" style="justify-content: center; padding: 1.5rem 1rem;">
                        <p class="label-tech" style="margin: 0; letter-spacing: 0.15em;">PAINEL ADMINISTRATIVO</p>
                    </div>

                    <div class="client-master-list custom-scrollbar">
                        ${tabs.map(tab => `
                            <button
                                type="button"
                                class="client-master-item ${state.activeTab === tab.id ? 'is-active' : ''}"
                                data-tab-id="${tab.id}"
                            >
                                <span class="settings-tab-icon">${tab.icon}</span>
                                <span class="client-master-item-name">${tab.label}</span>
                            </button>
                        `).join('')}
                    </div>
                </aside>

                <section class="client-detail-panel custom-scrollbar" id="admin-content-area">
                    <!-- Conteúdo será injetado aqui -->
                </section>
            </div>
        `;

        bindEvents();
        renderActiveTab();
    };

    const renderTeamTab = (target) => {
        const teamContainer = document.createElement('div');
        target.appendChild(teamContainer);
        renderTeamSettings(teamContainer, {
            currentProfile: profile,
            availableModules,
            profiles: teamProfiles,
            loading: teamLoading,
            createLoading: teamCreateLoading,
            onRefresh: onRefreshTeam,
            onCreateMember: onCreateTeamMember,
            onUpdateMember: onUpdateTeamMember
        });
    };

    const renderActiveTab = () => {
        const contentArea = container.querySelector('#admin-content-area');
        if (!contentArea) return;

        contentArea.innerHTML = ''; // Limpa

        switch (state.activeTab) {
            case 'equipe':
                renderTeamTab(contentArea);
                break;
            case 'ia':
                const aiWrapper = document.createElement('div');
                aiWrapper.className = 'settings-detail-wrapper';
                contentArea.appendChild(aiWrapper);
                renderAIControlView(aiWrapper);
                break;
            case 'ambiente':
                const envWrapper = document.createElement('div');
                envWrapper.className = 'settings-detail-wrapper';
                contentArea.appendChild(envWrapper);
                renderEnvironmentTab(envWrapper);
                break;
            case 'organizacao':
                const orgWrapper = document.createElement('div');
                orgWrapper.className = 'settings-detail-wrapper';
                contentArea.appendChild(orgWrapper);
                renderOrganizationTab(orgWrapper);
                break;
            case 'lixeira':
                const trashWrapper = document.createElement('div');
                trashWrapper.className = 'settings-detail-wrapper';
                contentArea.appendChild(trashWrapper);
                renderTrashView(trashWrapper, { trashStore });
                break;
            case 'registro':
                contentArea.appendChild(ActivityLogView());
                break;
            default:
                contentArea.innerHTML = '<p style="padding: 2rem; color: var(--slate-500);">Aba não encontrada.</p>';
        }
    };

    const renderEnvironmentTab = async (target) => {
        target.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Sincronização técnica</p>
                            <h2 class="client-detail-title">Status do Ambiente</h2>
                            <p class="client-detail-subtitle">Verifique a saúde da conexão e o consumo de recursos da organização.</p>
                        </div>
                    </header>

                    <div id="storage-usage-container" style="margin-top: 2rem; margin-bottom: 2rem;">
                        <div class="glass-card" style="padding: 2rem; border-radius: 24px; text-align: center;">
                            <p class="label-tech">CARREGANDO DADOS DE CONSUMO...</p>
                        </div>
                    </div>

                    <div class="settings-status-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div class="settings-status-card" style="display: flex; gap: 1rem; padding: 1.5rem; border-radius: 18px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                            <span class="settings-status-icon" style="color: var(--blue-500);">${shieldIcon()}</span>
                            <div>
                                <p class="settings-emphasis" style="font-weight: 700; color: var(--slate-950);">Supabase Auth</p>
                                <p class="settings-copy-inline">Sessão protegida.</p>
                            </div>
                        </div>
                        <div class="settings-status-card" style="display: flex; gap: 1rem; padding: 1.5rem; border-radius: 18px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                            <span class="settings-status-icon" style="color: var(--primary);">${databaseIcon()}</span>
                            <div>
                                <p class="settings-emphasis" style="font-weight: 700; color: var(--slate-950);">Data Lake</p>
                                <p class="settings-copy-inline">Conexão estável.</p>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 2rem; padding: 2rem; border-radius: 24px; background: var(--slate-950); color: white;">
                        <h3 class="font-black" style="font-size: 1.1rem; margin-bottom: 0.5rem;">Cópia de Segurança (Backup)</h3>
                        <p style="font-size: 0.85rem; color: var(--slate-400); margin-bottom: 1.5rem;">Gere um arquivo compactado contendo todos os documentos e metadados da sua organização.</p>
                        <button type="button" id="btn-generate-backup-admin" class="btn-pill btn-action-trigger" style="background: white; color: black; font-weight: 800; border: none; padding: 0.8rem 1.5rem; cursor: pointer;">
                            SOLICITAR DOWNLOAD (.ZIP)
                        </button>
                    </div>
                </div>
            </div>
        `;

        const downloadBtn = target.querySelector('#btn-generate-backup-admin');
        if (downloadBtn) {
            downloadBtn.onclick = async () => {
                const originalLabel = downloadBtn.textContent;
                try {
                    downloadBtn.disabled = true;
                    downloadBtn.textContent = 'GERANDO BACKUP...';

                    const accessToken = await authService.getAccessToken();
                    const response = await fetch('/api/admin-backup', {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    });

                    if (!response.ok) {
                        const payload = await response.json().catch(() => ({}));
                        throw new Error(payload?.error || 'Nao foi possivel gerar o backup.');
                    }

                    const blob = await response.blob();
                    const disposition = String(response.headers.get('Content-Disposition') || '');
                    const match = disposition.match(/filename="([^"]+)"/i);
                    const fileName = match?.[1] || `backup-geoconsult-${new Date().toISOString().slice(0, 10)}.zip`;
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                } catch (e) {
                    const { showNoticeModal } = await import('./NoticeModal.js');
                    showNoticeModal('Erro ao gerar backup', e?.message || 'Nao foi possivel gerar o arquivo ZIP de backup.');
                } finally {
                    downloadBtn.disabled = false;
                    downloadBtn.textContent = originalLabel;
                }
            };
        }

        try {
            const { profileService } = await import('../utils/ProfileService.js');
            const { renderStorageUsageCard } = await import('./StorageUsageCard.js');
            const activeOrgId = profile?.organization_id || window.__APP_CONTROL_ACTIVE_ORG_ID__;
            const usage = await profileService.getStorageUsage(activeOrgId).catch(() => ({totalBytes:0, fileCount:0}));
            const container = target.querySelector('#storage-usage-container');
            if (container) renderStorageUsageCard(container, usage);
        } catch (error) {
            console.error('Erro ao carregar dados do ambiente:', error);
        }
    };

    const renderOrganizationTab = (target) => {
        target.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Dados Institucionais</p>
                            <h2 class="client-detail-title">Organização</h2>
                            <p class="client-detail-subtitle">Informações básicas da sua empresa no sistema.</p>
                        </div>
                    </header>
                    <div style="margin-top: 2rem; padding: 1.5rem; border-radius: 18px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                        <p class="label-tech">Identificador Social</p>
                        <h3 class="font-black" style="margin-bottom: 1rem;">GEOCONSULT PARÁ</h3>
                        <p class="label-tech">Unidade de Processamento</p>
                        <p style="color: var(--slate-600); font-family: monospace;">UUID: ${profile?.organization_id || 'Não vinculada'}</p>
                    </div>
                </div>
            </div>
        `;
    };

    const bindEvents = () => {
        container.querySelectorAll('[data-tab-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeTab = btn.dataset.tabId;
                render();
            });
        });
    };

    render();
}

function usersIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`; }
function sparklesIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"></path><path d="M5 3v4"></path><path d="M3 5h4"></path><path d="M19 17v4"></path><path d="M17 19h4"></path></svg>`; }
function activityIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`; }
function buildingsIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path><path d="M9 9h.01"></path><path d="M9 13h.01"></path><path d="M9 17h.01"></path><path d="M13 13h.01"></path><path d="M13 17h.01"></path></svg>`; }
function shieldIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`; }
function databaseIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`; }
function trashIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`; }
function historyIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`; }
