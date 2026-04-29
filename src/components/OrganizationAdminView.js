import { FOLDER_OPTIONS, getRoleLabel, hasAdminAccess, normalizeOrganizationModules } from '../utils/accessControl.js';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(String(value ?? '')).replace(/"/g, '&quot;');
}

function formatCpf(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function bindCpfMask(input) {
    if (!input) return;
    input.value = formatCpf(input.value);
    input.addEventListener('input', (event) => {
        event.target.value = formatCpf(event.target.value);
    });
}

function searchIcon() {
    return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`;
}

function addOrganizationIcon() {
    return `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 21h18"></path>
            <path d="M5 21V7l8-4v18"></path>
            <path d="M19 21V11l-6-4"></path>
            <path d="M12 8v6"></path>
            <path d="M9 11h6"></path>
        </svg>
    `;
}

function kebabIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="19" r="1.8"></circle></svg>`;
}

function filterOrganizations(organizations, query) {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return organizations;

    return organizations.filter((organization) => {
        const primaryAdmin = getPrimaryAdmin(organization);
        const haystack = [
            organization?.name,
            primaryAdmin?.full_name,
            primaryAdmin?.email
        ].join(' ').toLowerCase();
        return haystack.includes(normalized);
    });
}

function getPrimaryAdmin(organization) {
    const users = Array.isArray(organization?.users) ? organization.users : [];
    return users.find((user) => hasAdminAccess(user)) || users[0] || null;
}

function renderOrganizationListItem(organization, selectedId) {
    const active = String(organization.id) === String(selectedId);

    return `
        <button
            type="button"
            class="client-master-item ${active ? 'is-active' : ''}"
            data-organization-id="${escapeAttribute(organization.id)}"
        >
            <span class="client-master-item-name">${escapeHtml(organization.name)}</span>
        </button>
    `;
}

function renderOrganizationEmptyState() {
    return `
        <div class="client-detail-empty">
            <span class="client-detail-empty-icon">${addOrganizationIcon()}</span>
            <p>Selecione uma organização na lista para ver os detalhes.</p>
        </div>
    `;
}

function renderOrganizationStatus(organization) {
    const inactive = organization?.is_active === false;
    return `
        <span
            class="label-tech"
            style="display:inline-flex; padding:0.35rem 0.7rem; border-radius:9999px; background:${inactive ? 'rgba(244,63,94,0.12)' : 'rgba(16,185,129,0.14)'}; color:${inactive ? 'var(--rose-500)' : 'var(--primary)'};"
        >
            ${inactive ? 'inativa' : 'ativa'}
        </span>
    `;
}

function renderModuleIcon(moduleId) {
    if (moduleId === 'ia-chat') {
        return `<svg class="dock-icon-svg dock-icon-svg--ia-chat" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path><path d="M5 3v3"></path><path d="M3.5 4.5h3"></path><path d="M19 18v3"></path><path d="M17.5 19.5h3"></path></svg>`;
    }
    if (moduleId === 'painel') {
        return `<svg class="dock-icon-svg dock-icon-svg--painel" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect class="dock-panel-tile tile-a" x="3" y="3" width="7" height="7"></rect><rect class="dock-panel-tile tile-b" x="14" y="3" width="7" height="7"></rect><rect class="dock-panel-tile tile-c" x="14" y="14" width="7" height="7"></rect><rect class="dock-panel-tile tile-d" x="3" y="14" width="7" height="7"></rect></svg>`;
    }
    if (moduleId === 'clientes') {
        return `<svg class="dock-icon-svg dock-icon-svg--clientes" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path class="dock-users-base" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle class="dock-users-head" cx="9" cy="7" r="4"></circle><path class="dock-users-side" d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path class="dock-users-side" d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
    }
    if (moduleId === 'processos') {
        return `<svg class="dock-icon-svg dock-icon-svg--processos" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path class="dock-folder-shell" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line class="dock-folder-plus plus-v" x1="12" y1="11" x2="12" y2="17"></line><line class="dock-folder-plus plus-h" x1="9" y1="14" x2="15" y2="14"></line></svg>`;
    }
    if (moduleId === 'prazos') {
        return `<svg class="dock-icon-svg dock-icon-svg--prazos" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle class="dock-calendar-clock" cx="16" cy="16" r="3"></circle><path class="dock-calendar-hand" d="M16 14v2l1 1"></path></svg>`;
    }
    if (moduleId === 'financeiro') {
        return `<svg class="dock-icon-svg dock-icon-svg--financeiro" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path><circle cx="12" cy="12" r="10" stroke-opacity="0.2"></circle></svg>`;
    }
    return `<svg class="dock-icon-svg dock-icon-svg--configuracoes" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></svg>`;
}

function renderOrganizationDetail(organization) {
    const users = Array.isArray(organization?.users) ? organization.users : [];
    const enabledModules = normalizeOrganizationModules(organization?.enabled_modules);
    const moduleOptions = FOLDER_OPTIONS.filter((folder) => folder.id !== 'organizacoes');

    return `
        <div class="client-detail-shell">
            <div class="client-detail-card">
                <header class="client-detail-header">
                    <div>
                        <p class="label-tech">Organização selecionada</p>
                        <h2 class="client-detail-title">${escapeHtml(organization.name)}</h2>
                    </div>
                    <div class="client-detail-actions">
                        ${renderOrganizationStatus(organization)}
                    </div>
                </header>

                <div class="client-detail-sections">
                    <section class="client-section-card organization-admins-card">
                        <div class="client-section-header" style="display:flex; justify-content:space-between; align-items:center; padding-right:0.25rem; margin-bottom:1rem;">
                            <h3>USUÁRIOS</h3>
                            <button type="button" class="btn-pill btn-black" data-action="add-organization-user" data-organization-id="${escapeAttribute(organization.id)}">Adicionar usuário</button>
                        </div>
                        ${users.length
                            ? `
                                <div style="overflow:auto;">
                                    <table class="organization-admin-table">
                                        <thead>
                                            <tr>
                                                <th>Tipo</th>
                                                <th>Email</th>
                                                <th>Nome</th>
                                                <th>CPF</th>
                                                <th>Data de criação</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${users.map((user) => `
                                                <tr>
                                                    <td>${escapeHtml(getRoleLabel(user.role))}</td>
                                                    <td>${escapeHtml(user.email || 'Sem e-mail')}</td>
                                                    <td>${escapeHtml(user.full_name || 'Sem nome')}</td>
                                                    <td>${escapeHtml(user.cpf ? formatCpf(user.cpf) : '—')}</td>
                                                    <td>${escapeHtml(user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '—')}</td>
                                                    <td style="width:56px; text-align:right;">
                                                        <div class="organization-user-menu-shell">
                                                            <button type="button" class="organization-user-menu-btn" data-action="toggle-user-menu" data-user-id="${escapeAttribute(user.id)}" aria-label="Opções do usuário">${kebabIcon()}</button>
                                                            <div class="organization-user-menu" data-user-menu="${escapeAttribute(user.id)}" hidden>
                                                                <button type="button" class="organization-user-menu-item" data-action="edit-organization-user" data-user-id="${escapeAttribute(user.id)}">Editar</button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `
                            : '<p class="client-section-copy">Nenhum usuário encontrado para esta organização.</p>'}
                    </section>

                    <section class="client-section-card organization-modules-card">
                        <div class="client-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <div style="display:flex; align-items:center; gap:0.75rem;">
                                <h3>MÓDULOS LIBERADOS</h3>
                            </div>
                            <div style="display:flex; gap:0.5rem; align-items:center;">
                                <button type="button" class="btn-pill btn-black" data-action="save-organization-modules" style="display:none; padding: 0.35rem 0.85rem; font-size: 0.8rem;">Salvar</button>
                                <button type="button" class="btn-pill" data-action="cancel-organization-modules" style="display:none; padding: 0.35rem 0.85rem; font-size: 0.8rem; background:transparent;">Cancelar</button>
                                <div class="organization-user-menu-shell">
                                    <button type="button" class="organization-user-menu-btn" data-action="toggle-module-menu" aria-label="Opções de módulos">${kebabIcon()}</button>
                                    <div class="organization-user-menu" data-module-menu hidden>
                                        <button type="button" class="organization-user-menu-item" data-action="edit-organization-modules">Editar Módulos</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="organization-module-status-grid" style="justify-content: center; gap: 0.5rem;">
                            ${moduleOptions.map((folder) => {
                                const active = enabledModules.includes(folder.id);
                                return `
                                    <button type="button" class="organization-module-status ${active ? 'is-active' : 'is-inactive'}" data-module-id="${escapeAttribute(folder.id)}">
                                        ${renderModuleIcon(folder.id)}
                                        <span class="organization-module-tooltip">${escapeHtml(folder.label)}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    `;
}

function renderCreateOrganizationForm(createLoading) {
    const organizationModules = FOLDER_OPTIONS.filter((folder) => folder.id !== 'organizacoes');

    return `
        <div class="glass-card animate-fade-in client-form-shell" style="width:100%; margin:0 auto; padding:4rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3rem;">
                <div>
                    <h2 class="font-black" style="font-size:2rem;">Nova Organização</h2>
                    <p class="label-tech" style="margin-top:0.5rem;">CRIAÇÃO DE NOVA OPERAÇÃO GEOCONSULT.</p>
                </div>
            </div>

            <form id="organization-create-form">
                <div class="form-section">
                    <h4 class="label-tech" style="margin-bottom:1.5rem; color:var(--slate-900);">01. Organização</h4>
                    <div class="grid-2">
                        <div class="form-group">
                            <label class="label-tech">NOME DA ORGANIZAÇÃO</label>
                            <div class="field-shell"><input type="text" name="organization_name" required placeholder="Ex: GEOCONSULT Pará"></div>
                        </div>
                        <div class="form-group">
                            <label class="label-tech">IDENTIFICADOR INTERNO</label>
                            <div class="field-shell"><input type="text" name="organization_slug" placeholder="geoconsult-para"></div>
                        </div>
                    </div>
                </div>

                <div class="form-section" style="margin-top:3rem;">
                    <h4 class="label-tech" style="margin-bottom:1.5rem;">02. Administrador Principal</h4>
                    <div class="grid-2">
                        <div class="form-group">
                            <label class="label-tech">NOME COMPLETO</label>
                            <div class="field-shell"><input type="text" name="admin_full_name" required placeholder="Nome do responsável"></div>
                        </div>
                        <div class="form-group">
                            <label class="label-tech">E-MAIL</label>
                            <div class="field-shell"><input type="email" name="admin_email" required placeholder="admin@empresa.com"></div>
                        </div>
                        <div class="form-group">
                            <label class="label-tech">CPF</label>
                            <div class="field-shell"><input type="text" name="admin_cpf" inputmode="numeric" placeholder="000.000.000-00"></div>
                        </div>
                        <div class="form-group">
                            <label class="label-tech">SENHA INICIAL</label>
                            <div class="field-shell"><input type="password" name="admin_password" minlength="6" required placeholder="Mínimo de 6 caracteres"></div>
                        </div>
                    </div>
                </div>

                <div class="form-section" style="margin-top:3rem;">
                    <h4 class="label-tech" style="margin-bottom:1.5rem;">03. Módulos da Organização</h4>
                    <div class="organization-module-grid">
                        ${organizationModules.map((folder) => `
                            <label class="organization-module-option">
                                <input type="checkbox" name="enabled_modules" value="${escapeAttribute(folder.id)}" checked />
                                <span>${escapeHtml(folder.label)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div style="display:flex; gap:1rem; justify-content:flex-end; margin-top:4rem; padding-top:2rem; border-top:1px solid var(--slate-200);">
                    <button type="button" class="btn-pill" data-action="cancel-create-organization" style="background:transparent; color:var(--slate-400);">CANCELAR</button>
                    <button type="submit" class="btn-pill btn-black" ${createLoading ? 'disabled' : ''}>${createLoading ? 'CRIANDO...' : 'CRIAR ORGANIZAÇÃO'}</button>
                </div>
            </form>
        </div>
    `;
}

export function renderOrganizationAdminView(container, {
    organizations = [],
    loading = false,
    createLoading = false,
    onRefresh,
    onCreateOrganization,
    onCreateOrganizationUser,
    onUpdateOrganizationUser,
    onUpdateOrganization
} = {}) {
    const state = {
        query: '',
        selectedId: null,
        mode: 'detail'
    };

    const render = () => {
        const filteredOrganizations = filterOrganizations(organizations, state.query);
        if (state.mode === 'detail' && !filteredOrganizations.some((organization) => String(organization.id) === String(state.selectedId))) {
            state.selectedId = null;
        }

        const selectedOrganization = filteredOrganizations.find((organization) => String(organization.id) === String(state.selectedId))
            || organizations.find((organization) => String(organization.id) === String(state.selectedId))
            || null;

        container.innerHTML = `
            <div class="client-master-detail bounded-scroll-layout animate-fade-in">
                <aside class="client-master-panel">
                    <div class="client-master-header">
                        <label class="client-master-search">
                            <span class="client-master-search-icon" aria-hidden="true">${searchIcon()}</span>
                            <input type="search" name="organization-search" value="${escapeAttribute(state.query)}" placeholder="Buscar organizacao..." />
                        </label>
                        <button type="button" class="client-master-add" data-action="add-organization" aria-label="Adicionar organização">${addOrganizationIcon()}</button>
                    </div>

                    <div class="client-master-list custom-scrollbar">
                        ${filteredOrganizations.length === 0 ? `
                            <div class="client-master-empty">
                                <span class="client-master-empty-icon">${addOrganizationIcon()}</span>
                                <p>Nenhuma organização encontrada para esta busca.</p>
                            </div>
                        ` : filteredOrganizations.map((organization) => renderOrganizationListItem(organization, state.selectedId)).join('')}
                    </div>
                </aside>

                <section class="client-detail-panel custom-scrollbar">
                    ${state.mode === 'create'
                        ? renderCreateOrganizationForm(createLoading)
                        : (selectedOrganization ? renderOrganizationDetail(selectedOrganization) : renderOrganizationEmptyState())}
                </section>
            </div>

            <style>
                .client-form-shell .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; }
                .client-form-shell .form-section { border-left:2px solid var(--slate-200); padding-left:2rem; }
                .client-form-shell .form-group label { display:block; margin-bottom:0.75rem; }
                .client-form-shell .field-shell {
                    background: var(--input-bg);
                    border-radius: 14px;
                    padding: 0.1rem 0.95rem 0;
                    border: 1px solid var(--input-border);
                    transition: var(--transition);
                }
                .client-form-shell .field-shell:focus-within {
                    border-color: color-mix(in srgb, var(--primary) 58%, transparent);
                    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
                }
                .client-form-shell .field-shell input,
                .client-form-shell .field-shell select {
                    width: 100%;
                    padding: 0.95rem 0 0.9rem;
                    border: none;
                    outline: none;
                    background: transparent;
                    font-family: inherit;
                    color: var(--slate-900);
                }
                .organization-admin-table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
                .organization-admin-table th,
                .organization-admin-table td {
                    padding: 0.72rem 0.6rem;
                    border-bottom: 1px solid var(--slate-200);
                    text-align: center;
                    font-size: 0.88rem;
                    vertical-align: middle;
                }
                .organization-admin-table th {
                    color: var(--slate-500);
                    font-size: 0.74rem;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                }
                .organization-admin-table th:nth-child(1),
                .organization-admin-table td:nth-child(1) {
                    width: 140px;
                }
                .organization-admin-table th:nth-child(2),
                .organization-admin-table td:nth-child(2) {
                    width: 26%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .organization-admin-table th:nth-child(3),
                .organization-admin-table td:nth-child(3) {
                    width: 24%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .organization-admin-table th:nth-child(4),
                .organization-admin-table td:nth-child(4) {
                    width: 150px;
                }
                .organization-admin-table th:nth-child(5),
                .organization-admin-table td:nth-child(5) {
                    width: 135px;
                }
                .organization-admin-table th:nth-child(6),
                .organization-admin-table td:nth-child(6) {
                    width: 56px;
                }
                .organization-module-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 0.85rem;
                }
                .organization-module-option {
                    display: flex;
                    align-items: center;
                    gap: 0.7rem;
                    padding: 0.95rem 1rem;
                    border-radius: 18px;
                    background: var(--bg-main);
                    border: 1px solid var(--slate-200);
                    cursor: pointer;
                }
                .organization-module-option input {
                    accent-color: var(--primary);
                }
                .organization-module-pills {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.65rem;
                }
                .organization-admins-card {
                    width: 100%;
                }
                .client-section-card {
                    padding-top: 1rem;
                }
                .client-detail-sections {
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                }
                .client-detail-sections > .client-section-card {
                    width: 100%;
                }
                .organization-module-status-grid {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 1rem;
                    width: 100%;
                    padding: 0.5rem 0;
                }
                .client-section-header {
                    margin-bottom: 0.6rem;
                }
                .client-section-header h3 {
                    margin: 0;
                    letter-spacing: 0.08em;
                }
                .organization-module-status {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    background: var(--card-bg);
                    border: 1px solid var(--slate-200);
                    transition: var(--transition);
                    color: var(--slate-500);
                    cursor: default;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.01);
                }
                .organization-module-tooltip {
                    position: absolute;
                    bottom: calc(100% + 8px);
                    left: 50%;
                    transform: translateX(-50%) translateY(4px);
                    background: var(--slate-800);
                    color: #fff;
                    padding: 0.3rem 0.6rem;
                    border-radius: 8px;
                    font-size: 0.72rem;
                    font-weight: 600;
                    white-space: nowrap;
                    opacity: 0;
                    pointer-events: none;
                    transition: var(--transition);
                    z-index: 10;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .organization-module-status:hover .organization-module-tooltip {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                
                /* Modo de visualização (Não Edição) */
                .client-detail-panel:not(.is-editing-modules) .organization-module-status.is-active {
                    color: var(--primary);
                    background: rgba(16, 185, 129, 0.12);
                    border-color: rgba(16, 185, 129, 0.28);
                }
                .client-detail-panel:not(.is-editing-modules) .organization-module-status.is-inactive {
                    opacity: 0.4;
                }
                
                /* Modo de Edição */
                .client-detail-panel.is-editing-modules .organization-module-status {
                    cursor: pointer;
                }
                .client-detail-panel.is-editing-modules .organization-module-status:hover {
                    border-color: var(--slate-400);
                    transform: scale(1.05);
                }
                .client-detail-panel.is-editing-modules .organization-module-status.is-active {
                    background: rgba(16, 185, 129, 0.16);
                    border-color: var(--primary);
                    color: var(--primary);
                }
                .client-detail-panel.is-editing-modules .organization-module-status.is-inactive {
                    background: rgba(244, 63, 94, 0.12);
                    border-color: var(--rose-500);
                    color: var(--rose-500);
                }
                .organization-user-menu-shell {
                    position: relative;
                    display: inline-flex;
                    justify-content: flex-end;
                    width: 100%;
                }
                .organization-user-menu-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 12px;
                    border: 1px solid var(--slate-200);
                    background: var(--card-bg);
                    color: var(--slate-500);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
                .organization-user-menu {
                    position: absolute;
                    top: calc(100% + 0.35rem);
                    right: 0;
                    min-width: 140px;
                    padding: 0.45rem;
                    border-radius: 16px;
                    border: 1px solid var(--slate-200);
                    background: rgba(255,255,255,0.96);
                    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.14);
                    z-index: 4;
                }
                .organization-user-menu-item {
                    width: 100%;
                    border: none;
                    background: transparent;
                    text-align: left;
                    padding: 0.7rem 0.85rem;
                    border-radius: 12px;
                    cursor: pointer;
                    color: var(--slate-800);
                    font-weight: 700;
                }
                .organization-user-menu-item:hover {
                    background: var(--bg-main);
                }
            </style>
        `;

        bindEvents(selectedOrganization);
    };

    const bindEvents = (selectedOrganization) => {
        container.querySelector('input[name="organization-search"]')?.addEventListener('input', (event) => {
            state.query = String(event.target.value || '');
            render();
        });

        container.querySelector('[data-action="add-organization"]')?.addEventListener('click', () => {
            state.mode = 'create';
            render();
        });

        container.querySelectorAll('[data-organization-id]').forEach((button) => {
            button.addEventListener('click', () => {
                state.mode = 'detail';
                state.selectedId = button.dataset.organizationId;
                render();
            });
        });

        container.querySelector('[data-action="cancel-create-organization"]')?.addEventListener('click', () => {
            state.mode = 'detail';
            render();
        });

        container.querySelector('#organization-create-form')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (typeof onCreateOrganization !== 'function') return;
            const formData = new FormData(event.currentTarget);
            await onCreateOrganization({
                organization_name: String(formData.get('organization_name') || '').trim(),
                organization_slug: String(formData.get('organization_slug') || '').trim(),
                admin_full_name: String(formData.get('admin_full_name') || '').trim(),
                admin_email: String(formData.get('admin_email') || '').trim(),
                admin_cpf: String(formData.get('admin_cpf') || '').trim(),
                admin_password: String(formData.get('admin_password') || ''),
                enabled_modules: formData.getAll('enabled_modules').map((value) => String(value))
            });
            state.mode = 'detail';
        });

        bindCpfMask(container.querySelector('input[name="admin_cpf"]'));

        container.querySelector('[data-action="add-organization-user"]')?.addEventListener('click', async () => {
            if (!selectedOrganization || typeof onCreateOrganizationUser !== 'function') return;
            await showOrganizationUserModal({
                organization: selectedOrganization,
                mode: 'create',
                onSave: onCreateOrganizationUser
            });
        });

        container.querySelectorAll('[data-action="toggle-user-menu"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const userId = button.dataset.userId;
                container.querySelectorAll('[data-user-menu]').forEach((menu) => {
                    menu.hidden = menu.dataset.userMenu !== userId ? true : !menu.hidden;
                });
            });
        });

        // Edit Modules logic
        const toggleModuleMenuBtn = container.querySelector('[data-action="toggle-module-menu"]');
        const moduleMenu = container.querySelector('[data-module-menu]');
        
        toggleModuleMenuBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            if (moduleMenu) {
                moduleMenu.hidden = !moduleMenu.hidden;
            }
        });

        const clientDetailPanel = container.querySelector('.client-detail-panel');
        let editableModulesList = [];

        container.querySelector('[data-action="edit-organization-modules"]')?.addEventListener('click', () => {
            if (moduleMenu) moduleMenu.hidden = true;
            if (clientDetailPanel) clientDetailPanel.classList.add('is-editing-modules');
            
            const btnSave = container.querySelector('[data-action="save-organization-modules"]');
            const btnCancel = container.querySelector('[data-action="cancel-organization-modules"]');
            const kebabWrapper = container.querySelector('.organization-modules-card .organization-user-menu-shell');
            
            if (btnSave) btnSave.style.display = 'inline-flex';
            if (btnCancel) btnCancel.style.display = 'inline-flex';
            if (kebabWrapper) kebabWrapper.style.display = 'none';

            editableModulesList = [...normalizeOrganizationModules(selectedOrganization?.enabled_modules)];
        });

        container.querySelectorAll('.organization-module-status').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (!clientDetailPanel?.classList.contains('is-editing-modules')) return;
                
                const moduleId = btn.dataset.moduleId;
                if (!moduleId) return;

                const isActive = editableModulesList.includes(moduleId);
                if (isActive) {
                    editableModulesList = editableModulesList.filter(id => id !== moduleId);
                    btn.classList.remove('is-active');
                    btn.classList.add('is-inactive');
                } else {
                    editableModulesList.push(moduleId);
                    btn.classList.remove('is-inactive');
                    btn.classList.add('is-active');
                }
            });
        });

        container.querySelector('[data-action="cancel-organization-modules"]')?.addEventListener('click', () => {
            render(); // Reset visual state effectively
        });

        container.querySelector('[data-action="save-organization-modules"]')?.addEventListener('click', async () => {
            if (typeof onUpdateOrganization !== 'function' || !selectedOrganization) return;
            
            const btnSave = container.querySelector('[data-action="save-organization-modules"]');
            const originalText = btnSave.textContent;
            btnSave.textContent = 'Salvando...';
            btnSave.disabled = true;

            try {
                await onUpdateOrganization({
                    id: selectedOrganization.id,
                    enabled_modules: editableModulesList
                });
                // After successful completion, main.js usually calls navigate/ensureOrganizationsLoaded triggering a re-render
            } catch (error) {
                btnSave.textContent = originalText;
                btnSave.disabled = false;
            }
        });

        // Click outside closes menus
        document.addEventListener('click', () => {
            container.querySelectorAll('.organization-user-menu').forEach(menu => {
                menu.hidden = true;
            });
        }, { once: false }); // Wait, event listeners might stack up. Safe due to innerHTML replacement in render(), 
        // but better to just let users click outside to close (or next re-render clears it)


        container.querySelectorAll('[data-action="edit-organization-user"]').forEach((button) => {
            button.addEventListener('click', async () => {
                if (!selectedOrganization || typeof onUpdateOrganizationUser !== 'function') return;
                const userId = button.dataset.userId;
                const user = (selectedOrganization.users || []).find((item) => String(item.id) === String(userId));
                if (!user) return;
                container.querySelectorAll('[data-user-menu]').forEach((menu) => { menu.hidden = true; });
                await showOrganizationUserModal({
                    organization: selectedOrganization,
                    user,
                    mode: 'edit',
                    onSave: onUpdateOrganizationUser
                });
            });
        });

        if (!selectedOrganization && state.mode === 'detail' && typeof onRefresh === 'function' && organizations.length === 0) {
            container.querySelector('.client-detail-empty')?.insertAdjacentHTML(
                'beforeend',
                '<p style="margin-top:0.75rem; color:var(--slate-400);">Use o botão + para criar a primeira organização.</p>'
            );
        }
    };

    render();
}

async function showOrganizationUserModal({ organization, user = null, mode = 'create', onSave }) {
    const availableModules = normalizeOrganizationModules(organization?.enabled_modules);
    const currentRole = hasAdminAccess(user) ? 'admin' : 'user';
    const backdrop = document.createElement('div');
    backdrop.className = 'notice-backdrop animate-fade-in';
    backdrop.style.cssText = `
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 2rem;
    `;

    backdrop.innerHTML = `
        <div class="glass-card animate-slide-up" style="max-width:920px; width:100%; padding:2.25rem 2.25rem 2rem;">
            <div style="display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; margin-bottom:1.5rem;">
                <div>
                    <p class="label-tech" style="color:rgba(255,255,255,0.72);">${escapeHtml(organization?.name || 'Organização')}</p>
                    <h3 class="font-black" style="font-size:1.6rem; margin-top:0.35rem; color:#fff;">${mode === 'edit' ? 'Editar usuário' : 'Novo usuário'}</h3>
                </div>
                <button type="button" data-action="close-user-modal" class="btn-pill" style="background:transparent; color:rgba(255,255,255,0.72);">CANCELAR</button>
            </div>

            <form id="organization-user-form" style="display:grid; gap:1.4rem;">
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem;">
                    <label class="organization-user-field"><span class="label-tech" style="color:rgba(255,255,255,0.72);">Nome</span><input type="text" name="full_name" required value="${escapeAttribute(user?.full_name || '')}" /></label>
                    <label class="organization-user-field"><span class="label-tech" style="color:rgba(255,255,255,0.72);">Email</span><input type="email" name="email" required value="${escapeAttribute(user?.email || '')}" /></label>
                    <label class="organization-user-field"><span class="label-tech" style="color:rgba(255,255,255,0.72);">CPF</span><input type="text" name="cpf" inputmode="numeric" value="${escapeAttribute(formatCpf(user?.cpf || ''))}" /></label>
                    <label class="organization-user-field"><span class="label-tech" style="color:rgba(255,255,255,0.72);">${mode === 'edit' ? 'Nova senha' : 'Senha inicial'}</span><input type="password" name="password" ${mode === 'create' ? 'required minlength="6"' : ''} placeholder="${mode === 'edit' ? 'Preencha só se quiser trocar' : 'Mínimo de 6 caracteres'}" /></label>
                    <label class="organization-user-field"><span class="label-tech" style="color:rgba(255,255,255,0.72);">Tipo</span><select name="role"><option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Administrador</option><option value="user" ${currentRole === 'user' ? 'selected' : ''}>Colaborador</option></select></label>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:0.9rem; margin-top:0.5rem;">
                    <button type="button" data-action="close-user-modal" class="btn-pill" style="background:transparent; color:rgba(255,255,255,0.72);">Cancelar</button>
                    <button type="submit" class="btn-pill btn-black">${mode === 'edit' ? 'Salvar alterações' : 'Criar usuário'}</button>
                </div>
            </form>
        </div>

        <style>
            .organization-user-field {
                display: flex;
                flex-direction: column;
                gap: 0.45rem;
            }
            .organization-user-field input,
            .organization-user-field select {
                width: 100%;
                border: 1px solid rgba(255,255,255,0.16);
                border-radius: 16px;
                padding: 0.88rem 0.95rem;
                background: rgba(255,255,255,0.06);
                font-family: inherit;
                outline: none;
                color: #fff;
            }
            .organization-user-field input::placeholder {
                color: rgba(255,255,255,0.45);
            }
            .organization-user-field select option {
                color: #111827;
            }
            @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            .animate-slide-up { animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        </style>
    `;

    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    const form = backdrop.querySelector('#organization-user-form');
    backdrop.querySelectorAll('[data-action="close-user-modal"]').forEach((button) => button.addEventListener('click', close));
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close();
    });
    bindCpfMask(form?.querySelector('input[name="cpf"]'));

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        try {
            await onSave({
                id: user?.id || '',
                organization_id: organization.id,
                full_name: String(formData.get('full_name') || '').trim(),
                email: String(formData.get('email') || '').trim(),
                cpf: String(formData.get('cpf') || '').trim(),
                password: String(formData.get('password') || ''),
                role: String(formData.get('role') || 'user'),
                gender: user?.gender || 'neutro',
                permissions: user?.permissions || (String(formData.get('role') || 'user') === 'admin'
                    ? { view: true, edit: true, delete: true }
                    : { view: true, edit: false, delete: false }),
                folder_access: Array.isArray(user?.folder_access) && user.folder_access.length > 0
                    ? user.folder_access
                    : [...availableModules]
            });
            close();
        } catch {}
    });
}
