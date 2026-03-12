import { escapeHtml } from '../utils/sanitize.js';

export function renderSettings(container, options = {}) {
    const {
        profile = null,
        email = '',
        alertDays = 15,
        currentTheme = 'niobio',
        isAdmin = false,
        onThemeChange,
        onProfileSave,
        onAlertSave,
        onPasswordSave,
        onSignOut,
        onOpenTeam
    } = options;

    const safeName = escapeHtml(profile?.full_name || email || 'Usuario');
    const safeEmail = escapeHtml(email || profile?.email || 'usuario@sistema.com');

    container.innerHTML = `
        <div class="settings-shell animate-fade-in">
            <section class="glass-card">
                <p class="label-tech">Conta</p>
                <h2 class="font-black settings-title">Perfil e seguranca</h2>
                <p class="settings-copy">Gerencie seus dados, regras de alerta e acessos do ambiente GEOCONSULT.</p>

                <div class="settings-theme-block">
                    <p class="label-tech">Tema do sistema</p>
                    <div class="settings-theme-options">
                        ${renderThemeOption('niobio', 'Niobio', currentTheme)}
                        ${renderThemeOption('diamante', 'Diamante', currentTheme)}
                        ${renderThemeOption('topazio', 'Topazio', currentTheme)}
                        ${renderThemeOption('ouro', 'Ouro', currentTheme)}
                        ${renderThemeOption('prata', 'Prata', currentTheme)}
                        ${renderThemeOption('esmeralda', 'Esmeralda', currentTheme)}
                    </div>
                </div>

                <div class="settings-grid">
                    <form id="settings-profile-form" class="settings-form-block">
                        <div>
                            <p class="label-tech">Perfil conectado</p>
                            <p class="settings-emphasis">${safeName}</p>
                            <p class="settings-copy-inline">${safeEmail}</p>
                        </div>
                        <label class="settings-field">
                            <span class="label-tech">Nome completo</span>
                            <input type="text" name="full_name" value="${safeName}" required />
                        </label>
                        <label class="settings-field">
                            <span class="label-tech">Tratamento</span>
                            <select name="gender">
                                <option value="neutro" ${profile?.gender === 'neutro' ? 'selected' : ''}>Colaborador(a)</option>
                                <option value="masculino" ${profile?.gender === 'masculino' ? 'selected' : ''}>Colaborador</option>
                                <option value="feminino" ${profile?.gender === 'feminino' ? 'selected' : ''}>Colaboradora</option>
                            </select>
                        </label>
                        <button type="submit" class="btn-pill btn-black">Salvar perfil</button>
                    </form>

                    <div class="settings-stack">
                        <div class="settings-form-block">
                            <p class="label-tech">Alertas</p>
                            <p class="settings-emphasis">Antecedencia padrao</p>
                            <p class="settings-copy-inline">Defina em quantos dias o sistema deve realcar vencimentos.</p>
                            <div class="settings-inline-row">
                                <label class="settings-field">
                                    <span class="label-tech">Regra atual</span>
                                    <select id="settings-alert-days">
                                        ${[7, 15, 30, 45, 60].map((days) => `<option value="${days}" ${Number(alertDays) === days ? 'selected' : ''}>${days} dias</option>`).join('')}
                                    </select>
                                </label>
                                <button type="button" id="settings-alert-save" class="btn-pill btn-black">Salvar regra</button>
                            </div>
                        </div>

                        <form id="settings-password-form" class="settings-form-block">
                            <p class="label-tech">Seguranca</p>
                            <p class="settings-emphasis">Alterar senha</p>
                            <div class="settings-inline-row settings-inline-row-stack">
                                <label class="settings-field">
                                    <span class="label-tech">Nova senha</span>
                                    <input type="password" name="password" minlength="6" required />
                                </label>
                                <label class="settings-field">
                                    <span class="label-tech">Confirmar senha</span>
                                    <input type="password" name="confirm_password" minlength="6" required />
                                </label>
                            </div>
                            <button type="submit" class="btn-pill btn-black">Atualizar senha</button>
                        </form>
                    </div>
                </div>
            </section>

            <section class="glass-card">
                <p class="label-tech">Ambiente</p>
                <h3 class="font-black settings-title settings-title-sm">Infraestrutura protegida</h3>
                <div class="settings-status-grid">
                    <div class="settings-status-card">
                        <span class="settings-status-icon settings-status-icon-cyan">${shieldIcon()}</span>
                        <div>
                            <p class="settings-emphasis">Supabase Auth ativo</p>
                            <p class="settings-copy-inline">Sessao autenticada e armazenamento remoto sincronizado.</p>
                        </div>
                    </div>
                    <div class="settings-status-card">
                        <span class="settings-status-icon settings-status-icon-emerald">${databaseIcon()}</span>
                        <div>
                            <p class="settings-emphasis">Banco conectado</p>
                            <p class="settings-copy-inline">Titulares, processos e prazos usam o banco configurado neste ambiente.</p>
                        </div>
                    </div>
                </div>

                <div class="settings-actions-row">
                    ${isAdmin ? '<button type="button" id="settings-open-team" class="btn-pill">Gerenciar equipe</button>' : ''}
                    <button type="button" id="settings-signout" class="btn-pill settings-signout">Sair do sistema</button>
                </div>
            </section>
        </div>
    `;

    container.querySelector('#settings-profile-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (typeof onProfileSave !== 'function') return;
        const formData = new FormData(event.currentTarget);
        await onProfileSave({
            full_name: String(formData.get('full_name') || '').trim(),
            gender: String(formData.get('gender') || 'neutro')
        });
    });

    container.querySelectorAll('[data-theme-id]').forEach((button) => {
        button.addEventListener('click', () => {
            const selectedTheme = String(button.dataset.themeId || '');
            if (!selectedTheme || selectedTheme === currentTheme || typeof onThemeChange !== 'function') return;
            onThemeChange(selectedTheme);
            renderSettings(container, {
                ...options,
                currentTheme: selectedTheme
            });
        });
    });

    container.querySelector('#settings-alert-save')?.addEventListener('click', async () => {
        if (typeof onAlertSave !== 'function') return;
        const value = Number(container.querySelector('#settings-alert-days')?.value || alertDays);
        await onAlertSave(value);
    });

    container.querySelector('#settings-password-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (typeof onPasswordSave !== 'function') return;
        const formData = new FormData(event.currentTarget);
        await onPasswordSave({
            password: String(formData.get('password') || ''),
            confirmPassword: String(formData.get('confirm_password') || '')
        });
        event.currentTarget.reset();
    });

    container.querySelector('#settings-signout')?.addEventListener('click', async () => {
        if (typeof onSignOut === 'function') {
            await onSignOut();
        }
    });

    container.querySelector('#settings-open-team')?.addEventListener('click', () => {
        if (typeof onOpenTeam === 'function') {
            onOpenTeam();
        }
    });
}

function shieldIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-4 8 4z"></path><path d="m9 12 2 2 4-4"></path></svg>`;
}

function databaseIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"></path><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"></path></svg>`;
}

function renderThemeOption(id, label, currentTheme) {
    return `
        <button
            type="button"
            class="settings-theme-option ${id === currentTheme ? 'is-active' : ''}"
            data-theme-id="${id}"
        >
            ${label}
        </button>
    `;
}
