import { escapeHtml } from '../utils/sanitize.js';
import { renderSettings } from './Settings.js';
import { renderTeamSettings } from './TeamSettings.js';

export function renderSettingsMenuView(container, options = {}) {
    const {
        profile,
        email,
        alertDays,
        currentTheme: initialTheme,
        isAdmin,
        teamProfiles = [],
        availableModules = [],
        teamLoading = false,
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
        activeTab: 'profile', // 'perfil', 'personalizacao'
        selectedMemberId: null,
        currentTheme: initialTheme
    };

    const tabs = [
        { id: 'perfil', label: 'Meu Perfil', icon: profileIcon() },
        { id: 'personalizacao', label: 'Temas', icon: paletteIcon() }
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
                            <button type="button" id="settings-menu-signout" class="btn-pill" style="width: 100%; justify-content: center; border: 1px solid var(--row-divider); background: var(--slate-100); color: var(--rose-500); font-weight: 700; transition: all 0.2s;">
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
        } else if (state.activeTab === 'personalizacao') {
            renderThemeTab(settingsWrapper);
        }
    };

    const renderProfileTab = (target) => {
        const safeName = escapeHtml(profile?.full_name || email || 'Usuario');
        const safeEmail = escapeHtml(email || profile?.email || 'usuario@sistema.com');
        
        target.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card" style="margin-bottom: 2rem;">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Minha Conta</p>
                            <h2 class="client-detail-title">Meu Perfil</h2>
                            <p class="client-detail-subtitle">Gerencie suas informacoes pessoais, senha e configuracoes.</p>
                        </div>
                    </header>

                    <form id="settings-profile-form" style="margin-top: 1.5rem; max-width: 600px;">
                        <article class="client-info-card" style="margin-bottom: 1.5rem;">
                            <span class="client-info-icon client-info-icon-primary">${profileIcon()}</span>
                            <div style="flex: 1;">
                                <p class="label-tech">PERFIL CONECTADO</p>
                                <p class="client-info-value" style="font-size: 1.1rem;">${safeName}</p>
                                <p class="client-info-value" style="font-size: 0.85rem; color: var(--slate-500);">${safeEmail}</p>
                            </div>
                        </article>

                        <article class="client-info-card" style="margin-bottom: 1.5rem;">
                            <span class="client-info-icon client-info-icon-neutral">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            </span>
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                                <span class="label-tech">NOME COMPLETO</span>
                                <input type="text" name="full_name" value="${safeName}" required style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid var(--slate-200); background: var(--input-bg); color: var(--slate-950);" />
                            </div>
                        </article>

                        <button type="submit" class="btn-pill" style="padding: 0.8rem 2rem; background: var(--slate-950); color: var(--bg-main);">Salvar alteracoes</button>
                    </form>
                </div>

                <div class="client-detail-card" style="margin-bottom: 2rem;">
                    <header class="client-detail-header" style="padding-bottom: 1rem; border-bottom: 1px solid var(--row-divider);">
                        <div>
                            <p class="label-tech">Preferencias de notificacao</p>
                            <h2 class="client-detail-title" style="font-size: 1.25rem;">Sistema de Alertas</h2>
                        </div>
                    </header>

                    <div style="margin-top: 1rem; max-width: 600px;">
                        <p class="settings-copy-inline" style="margin-bottom: 1.5rem;">Escolha em quantos dias o sistema deve realcar os itens no painel.</p>
                        
                        <article class="client-info-card" style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 1rem;">
                            <span class="client-info-icon client-info-icon-warning">${bellIcon()}</span>
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                                <span class="label-tech">REGRA ATUAL (DIAS)</span>
                                <select id="settings-alert-days" style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid var(--slate-200); background: var(--input-bg); color: var(--slate-950);">
                                    ${[7, 15, 30, 45, 60].map((days) => `<option value="${days}" ${Number(alertDays) === days ? 'selected' : ''}>${days} dias</option>`).join('')}
                                </select>
                            </div>
                            <button type="button" id="settings-alert-save" class="btn-pill" style="padding: 0.6rem 1.2rem; background: var(--slate-950); color: var(--bg-main);">Salvar regra</button>
                        </article>
                    </div>
                </div>

                <div class="client-detail-card" style="margin-bottom: 2rem;">
                    <header class="client-detail-header" style="padding-bottom: 1rem; border-bottom: 1px solid var(--row-divider);">
                        <div>
                            <p class="label-tech">Protecao de conta</p>
                            <h2 class="client-detail-title" style="font-size: 1.25rem;">Seguranca</h2>
                        </div>
                    </header>

                    <form id="settings-password-form" style="margin-top: 1rem; max-width: 600px;">
                        <p class="settings-copy-inline" style="margin-bottom: 1.5rem;">Atualize sua senha para garantir um acesso protegido.</p>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <article class="client-info-card">
                                <span class="client-info-icon client-info-icon-danger">${lockIcon()}</span>
                                <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                                    <span class="label-tech">NOVA SENHA</span>
                                    <input type="password" name="password" minlength="6" required style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid var(--slate-200); background: var(--input-bg); color: var(--slate-950);" />
                                </div>
                            </article>

                            <article class="client-info-card">
                                <span class="client-info-icon client-info-icon-danger">${lockIcon()}</span>
                                <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                                    <span class="label-tech">CONFIRMAR SENHA</span>
                                    <input type="password" name="confirm_password" minlength="6" required style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid var(--slate-200); background: var(--input-bg); color: var(--slate-950);" />
                                </div>
                            </article>
                        </div>
                        <button type="submit" class="btn-pill" style="padding: 0.8rem 2rem; background: var(--slate-950); color: var(--bg-main);">Atualizar senha</button>
                    </form>
                </div>
            </div>
        `;

        target.querySelector('#settings-profile-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            await onProfileSave({ full_name: formData.get('full_name').trim() });
        });

        target.querySelector('#settings-alert-save')?.addEventListener('click', async () => {
            const val = Number(target.querySelector('#settings-alert-days')?.value);
            await onAlertSave(val);
        });

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
                        <div class="settings-theme-options" style="display: flex; flex-direction: column; gap: 1rem; max-width: 500px;">
                            ${renderThemeBtn('niobio', 'Niôbio', state.currentTheme, 'linear-gradient(135deg, #1e293b, #0f172a)', '#ffffff')}
                            ${renderThemeBtn('diamante', 'Diamante', state.currentTheme, 'linear-gradient(135deg, #f0f4f9, #ffffff)', '#0b57d0')}
                            ${renderThemeBtn('topazio', 'Topázio', state.currentTheme, 'linear-gradient(135deg, #eff6ff, #bfdbfe)', '#1e3a8a')}
                            ${renderThemeBtn('ouro', 'Ouro', state.currentTheme, 'linear-gradient(135deg, #fefce8, #fef08a)', '#854d0e')}
                            ${renderThemeBtn('esmeralda', 'Esmeralda', state.currentTheme, 'linear-gradient(135deg, #f0fdf4, #bbf7d0)', '#14532d')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        target.querySelectorAll('[data-theme-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tid = btn.dataset.themeId;
                state.currentTheme = tid;
                onThemeChange(tid);
                renderActiveTab(); // Re-render for active state
            });
        });
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

function renderThemeBtn(id, label, current, bgGradient, textColor) {
    const active = id === current;
    return `
        <button
            type="button"
            class="settings-theme-option ${active ? 'is-active' : ''}"
            data-theme-id="${id}"
            style="
                padding: 1.25rem 1.5rem; 
                border-radius: 16px; 
                border: 2px solid ${active ? 'var(--primary)' : 'transparent'}; 
                background: ${bgGradient}; 
                color: ${textColor}; 
                font-weight: 800; 
                display: flex; 
                align-items: center; 
                justify-content: space-between;
                box-shadow: ${active ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)'};
                transition: transform 0.2s, box-shadow 0.2s;
                cursor: pointer;
            "
        >
            <span style="font-size: 1.1rem;">${label}</span>
            ${active ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary)"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
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
