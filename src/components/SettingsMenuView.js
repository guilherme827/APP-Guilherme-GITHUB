import { escapeHtml } from '../utils/sanitize.js';
import { renderSettings } from './Settings.js';
import { renderTeamSettings } from './TeamSettings.js';

export function renderSettingsMenuView(container, options = {}) {
    const {
        profile,
        email,
        alertDays,
        currentTheme,
        isAdmin,
        teamProfiles = [],
        availableModules = [],
        teamLoading = false,
        teamCreateLoading = false,
        onThemeChange,
        onProfileSave,
        onAlertSave,
        onPasswordSave,
        onSignOut,
        onRefreshTeam,
        onCreateTeamMember,
        onUpdateTeamMember
    } = options;

    const state = {
        activeTab: 'perfil' // 'perfil', 'alertas', 'seguranca', 'personalizacao', 'ambiente', 'equipe'
    };

    const tabs = [
        { id: 'perfil', label: 'Perfil e Dados', icon: profileIcon() },
        { id: 'alertas', label: 'Sistema de Alertas', icon: bellIcon() },
        { id: 'seguranca', label: 'Segurança', icon: lockIcon() },
        { id: 'personalizacao', label: 'Personalização', icon: paletteIcon() }
    ];

    const render = () => {
        container.innerHTML = `
            <div class="client-master-detail bounded-scroll-layout settings-menu-layout">
                <aside class="client-master-panel">
                    <div class="client-master-header" style="justify-content: center; padding: 1.5rem 1rem;">
                        <p class="label-tech" style="margin: 0; letter-spacing: 0.15em;">CONFIGURAÇÕES</p>
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
                        
                        <div style="margin-top: auto; padding: 1rem;">
                            <button type="button" id="settings-menu-signout" class="btn-pill settings-signout" style="width: 100%; justify-content: center; border: 1px solid var(--row-divider); background: var(--slate-100);">
                                Sair do sistema
                            </button>
                        </div>
                    </div>
                </aside>

                <section class="client-detail-panel custom-scrollbar" id="settings-content-area">
                    <!-- Conteudo sera injetado aqui -->
                </section>
            </div>
        `;

        bindEvents();
        renderActiveTab();
    };

    const renderActiveTab = () => {
        const contentArea = container.querySelector('#settings-content-area');
        if (!contentArea) return;

        contentArea.innerHTML = '';

        // Para as outras abas, usamos uma versao adaptada do Settings.js ou renderizamos blocos especificos
        const settingsWrapper = document.createElement('div');
        settingsWrapper.className = 'settings-detail-wrapper';
        contentArea.appendChild(settingsWrapper);

        if (state.activeTab === 'perfil') {
            renderProfileTab(settingsWrapper);
        } else if (state.activeTab === 'alertas') {
            renderAlertsTab(settingsWrapper);
        } else if (state.activeTab === 'seguranca') {
            renderSecurityTab(settingsWrapper);
        } else if (state.activeTab === 'personalizacao') {
            renderThemeTab(settingsWrapper);
        }
    };

    const renderProfileTab = (target) => {
        const safeName = escapeHtml(profile?.full_name || email || 'Usuario');
        const safeEmail = escapeHtml(email || profile?.email || 'usuario@sistema.com');
        
        target.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Configuracoes de conta</p>
                            <h2 class="client-detail-title">Perfil e Dados</h2>
                            <p class="client-detail-subtitle">Gerencie suas informacoes de identificacao no sistema.</p>
                        </div>
                    </header>

                    <form id="settings-profile-form" class="settings-form-block" style="margin-top: 2rem; max-width: 500px;">
                        <div style="margin-bottom: 1.5rem;">
                            <p class="label-tech">Perfil conectado</p>
                            <p class="settings-emphasis" style="font-size: 1.2rem; font-weight: 800; color: var(--slate-950);">${safeName}</p>
                            <p class="settings-copy-inline">${safeEmail}</p>
                        </div>
                        <label class="settings-field" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem;">
                            <span class="label-tech">Nome completo</span>
                            <input type="text" name="full_name" value="${safeName}" required style="width: 100%; padding: 0.8rem; border-radius: 12px; border: 1px solid var(--slate-200); background: var(--bg-main); color: var(--slate-950);" />
                        </label>
                        <button type="submit" class="btn-pill btn-black" style="padding: 0.8rem 2rem;">Salvar alteracoes</button>
                    </form>
                </div>
            </div>
        `;

        target.querySelector('#settings-profile-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            await onProfileSave({ full_name: formData.get('full_name').trim() });
        });
    };

    const renderAlertsTab = (target) => {
        target.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Preferencias de notificacao</p>
                            <h2 class="client-detail-title">Sistema de Alertas</h2>
                            <p class="client-detail-subtitle">Defina as regras de antecedencia para destaque de prazos e vencimentos.</p>
                        </div>
                    </header>

                    <div class="settings-form-block" style="margin-top: 2rem; max-width: 500px;">
                        <p class="settings-emphasis" style="font-size: 1.1rem; font-weight: 700; color: var(--slate-950);">Antecedencia padrao</p>
                        <p class="settings-copy-inline" style="margin-bottom: 1.5rem;">Escolha em quantos dias o sistema deve realcar os itens no painel.</p>
                        
                        <div class="settings-inline-row" style="display: flex; gap: 1rem; align-items: flex-end;">
                            <label class="settings-field" style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                                <span class="label-tech">Regra atual</span>
                                <select id="settings-alert-days" style="width: 100%; padding: 0.8rem; border-radius: 12px; border: 1px solid var(--slate-200); background: var(--bg-main); color: var(--slate-950);">
                                    ${[7, 15, 30, 45, 60].map((days) => `<option value="${days}" ${Number(alertDays) === days ? 'selected' : ''}>${days} dias</option>`).join('')}
                                </select>
                            </label>
                            <button type="button" id="settings-alert-save" class="btn-pill btn-black" style="padding: 0.8rem 1.5rem;">Salvar regra</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        target.querySelector('#settings-alert-save')?.addEventListener('click', async () => {
            const val = Number(target.querySelector('#settings-alert-days')?.value);
            await onAlertSave(val);
        });
    };

    const renderSecurityTab = (target) => {
        target.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Protecao de conta</p>
                            <h2 class="client-detail-title">Seguranca</h2>
                            <p class="client-detail-subtitle">Mantenha sua senha atualizada para garantir o acesso protegido ao ambiente.</p>
                        </div>
                    </header>

                    <form id="settings-password-form" class="settings-form-block" style="margin-top: 2rem; max-width: 500px;">
                        <div style="display: grid; gap: 1.5rem; margin-bottom: 1.5rem;">
                            <label class="settings-field" style="display: flex; flex-direction: column; gap: 0.5rem;">
                                <span class="label-tech">Nova senha</span>
                                <input type="password" name="password" minlength="6" required style="width: 100%; padding: 0.8rem; border-radius: 12px; border: 1px solid var(--slate-200); background: var(--bg-main); color: var(--slate-950);" />
                            </label>
                            <label class="settings-field" style="display: flex; flex-direction: column; gap: 0.5rem;">
                                <span class="label-tech">Confirmar nova senha</span>
                                <input type="password" name="confirm_password" minlength="6" required style="width: 100%; padding: 0.8rem; border-radius: 12px; border: 1px solid var(--slate-200); background: var(--bg-main); color: var(--slate-950);" />
                            </label>
                        </div>
                        <button type="submit" class="btn-pill btn-black" style="padding: 0.8rem 2rem;">Atualizar senha</button>
                    </form>
                </div>
            </div>
        `;

        target.querySelector('#settings-password-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            await onPasswordSave({
                password: formData.get('password'),
                confirmPassword: formData.get('confirm_password')
            });
            e.currentTarget.reset();
        });
    };

    const renderThemeTab = (target) => {
        target.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Aparencia do sistema</p>
                            <h2 class="client-detail-title">Personalizacao</h2>
                            <p class="client-detail-subtitle">Escolha o tema visual que melhor se adapta ao seu fluxo de trabalho.</p>
                        </div>
                    </header>

                    <div class="settings-theme-block" style="margin-top: 2rem;">
                        <div class="settings-theme-options" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem;">
                            ${renderThemeBtn('niobio', 'Niobio', currentTheme)}
                            ${renderThemeBtn('diamante', 'Diamante', currentTheme)}
                            ${renderThemeBtn('topazio', 'Topazio', currentTheme)}
                            ${renderThemeBtn('ouro', 'Ouro', currentTheme)}
                            ${renderThemeBtn('esmeralda', 'Esmeralda', currentTheme)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        target.querySelectorAll('[data-theme-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tid = btn.dataset.themeId;
                onThemeChange(tid);
                renderActiveTab(); // Re-render for active state
            });
        });
    };

    const renderEnvironmentTab = async (target) => {
        target.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Sincronizacao técnica</p>
                            <h2 class="client-detail-title">Status do Ambiente</h2>
                            <p class="client-detail-subtitle">Verifique a saúde da conexão e o consumo de recursos da GEOCONSULT.</p>
                        </div>
                    </header>

                    <div id="migration-status-anchor"></div>

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
                        <button type="button" id="btn-generate-backup" class="btn-pill btn-action-trigger" style="background: white; color: black; font-weight: 800; border: none; padding: 0.8rem 1.5rem; cursor: pointer;">
                            SOLICITAR DOWNLOAD (.ZIP)
                        </button>
                    </div>
                </div>
            </div>
        `;

        const downloadBtn = target.querySelector('#btn-generate-backup');
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                if (typeof showNoticeModal === 'function') {
                    showNoticeModal('Funcionalidade em desenvolvimento', 'A geração de backup estruturado está sendo processada nos servidores da GEOCONSULT. Você receberá um link quando o arquivo estiver pronto.');
                } else {
                    alert('A geração de backup estruturado está sendo processada. Você receberá um link em breve.');
                }
            };
        }

        try {
            const { profileService } = await import('../utils/ProfileService.js');
            const { renderStorageUsageCard } = await import('./StorageUsageCard.js');
            
            const activeOrgId = options.profile?.organization_id || window.__APP_CONTROL_ACTIVE_ORG_ID__;
            console.log('[SettingsMenuView] Carregando ambiente para Org:', activeOrgId);

            const usage = await profileService.getStorageUsage(activeOrgId).catch(e => { 
                console.error(e); 
                return {totalBytes:0, fileCount:0}; 
            });
            
            console.log('[SettingsMenuView] Resultados de consumo:', usage);

            const container = target.querySelector('#storage-usage-container');
            if (container) renderStorageUsageCard(container, usage);

        } catch (error) {
            console.error('Erro geral ao carregar dados do ambiente:', error);
        }
    };

    const bindEvents = () => {
        container.querySelectorAll('[data-tab-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeTab = btn.dataset.tabId;
                render();
            });
        });

        container.querySelector('#settings-menu-signout')?.addEventListener('click', onSignOut);
    };

    render();
}

function renderThemeBtn(id, label, current) {
    const active = id === current;
    return `
        <button
            type="button"
            class="settings-theme-option ${active ? 'is-active' : ''}"
            data-theme-id="${id}"
            style="padding: 1rem; border-radius: 14px; border: 1px solid ${active ? 'var(--primary)' : 'var(--slate-200)'}; background: ${active ? 'var(--primary-light)' : 'var(--bg-main)'}; color: ${active ? 'var(--primary)' : 'var(--slate-900)'}; font-weight: 600;"
        >
            ${label}
        </button>
    `;
}

// Icons
function profileIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`; }
function bellIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`; }
function lockIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`; }
function paletteIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.5-.58 1.5-1.5 0-.43-.17-.83-.44-1.14-.24-.28-.36-.64-.31-1 .17-.93.94-1.5 1.83-1.3l2.03.47c2.76.64 5.39-1.48 5.39-4.31C22 6.5 17.5 2 12 2z"></path></svg>`; }
function activityIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`; }
function usersIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`; }
function shieldIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`; }
function databaseIcon() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`; }
