import { FOLDER_OPTIONS } from '../utils/accessControl.js';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getPermission(permissions, key) {
    return permissions?.[key] === true;
}

function getFolderAccess(folderAccess) {
    return Array.isArray(folderAccess) ? folderAccess : [];
}

const FOLDER_ICONS = {
    'organizacoes': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path><path d="M9 9h.01"></path><path d="M9 13h.01"></path><path d="M9 17h.01"></path><path d="M13 13h.01"></path><path d="M13 17h.01"></path></svg>',
    'painel': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    'clientes': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    'processos': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>',
    'prazos': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="16" cy="16" r="3"></circle><path d="M16 14v2l1 1"></path></svg>',
    'financeiro': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path><circle cx="12" cy="12" r="10" stroke-opacity="0.2"></circle></svg>',
    'admin-panel': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>',
    'configuracoes': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 2 2 2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></svg>'
};

export function renderTeamSettings(container, {
    currentProfile,
    availableModules,
    profiles,
    loading,
    createLoading,
    onRefresh,
    onCreateMember,
    onUpdateMember
}) {
    // Para cards de edição de membros já existentes (respeita módulos da organização)
    const availableFolders = Array.isArray(availableModules) && availableModules.length > 0
        ? FOLDER_OPTIONS.filter((folder) => folder.id !== 'organizacoes' && availableModules.includes(folder.id))
        : FOLDER_OPTIONS.filter((folder) => folder.id !== 'organizacoes');

    // Para o formulário de Novo Membro: sempre mostra todas as pastas (admin pode conceder qualquer acesso)
    const allFolders = FOLDER_OPTIONS.filter((folder) => folder.id !== 'organizacoes');

    container.innerHTML = `
        <div class="animate-fade-in" style="max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 1.5rem;">
            <aside class="glass-card">
                <div style="margin-bottom: 1.5rem;">
                    <h2 class="font-black" style="font-size: 1.4rem;">Adicionar Novo Membro</h2>
                </div>

                <form id="team-create-form" style="display: flex; flex-direction: column; gap: 1rem;">
                    <label style="display: flex; flex-direction: column; gap: 0.45rem;">
                        <span class="label-tech">Nome Completo</span>
                        <input name="full_name" type="text" required placeholder="Nome do novo membro" />
                    </label>
                    <label style="display: flex; flex-direction: column; gap: 0.45rem;">
                        <span class="label-tech">E-mail</span>
                        <input name="email" type="email" required placeholder="email@empresa.com" />
                    </label>
                    <label style="display: flex; flex-direction: column; gap: 0.45rem;">
                        <span class="label-tech">Senha Inicial</span>
                        <input name="password" type="password" required placeholder="Crie uma senha inicial" />
                    </label>
                    <label style="display: flex; flex-direction: column; gap: 0.45rem;">
                        <span class="label-tech">TIPO DE USUÁRIO</span>
                        <select name="role" class="team-select-styled">
                            <option value="user">Colaborador(a)</option>
                        </select>
                    </label>

                    <div style="margin-top: 1rem;">
                        <p class="label-tech" style="margin-bottom: 0.85rem;">ACESSO DE PASTAS (MENU LATERAL)</p>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${allFolders.map((folder) => {
                                // admin-panel desmarcado por padrão para novos colaboradores
                                const defaultChecked = folder.id !== 'admin-panel';
                                return `
                                <label class="folder-access-cell" data-folder="${folder.id}" style="display: flex; align-items: center; gap: 16px; width: 100%; padding: 14px 16px; border-radius: 12px; border: 1px solid; cursor: pointer; transition: all 0.2s ease;">
                                    <input type="checkbox" name="folder_access" value="${folder.id}" ${defaultChecked ? 'checked' : ''} class="team-folder-access" style="width: 1.1rem; height: 1.1rem; flex-shrink: 0; accent-color: #22c55e; cursor: pointer; margin: 0;" />
                                    ${FOLDER_ICONS[folder.id] || ''}
                                    <span style="font-weight: 500; font-size: 0.92rem;">${escapeHtml(folder.label)}</span>
                                </label>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <button type="submit" class="btn-pill btn-black" ${createLoading ? 'disabled' : ''}>
                        ${createLoading ? 'Criando...' : 'Novo Membro'}
                    </button>
                </form>
            </aside>

            <section class="glass-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <p class="label-tech">CONTROLE DE ACESSO</p>
                        <h2 class="font-black" style="font-size: 1.6rem; margin-top: 0.35rem;">Equipe cadastrada</h2>
                        <p style="color: var(--slate-500); margin-top: 0.5rem; line-height: 1.6;">Seu perfil atual: <strong>${escapeHtml(currentProfile?.full_name || currentProfile?.email || 'Administrador')}</strong> (${escapeHtml(currentProfile?.role || 'admin')})</p>
                    </div>
                    <button type="button" class="btn-pill" id="refresh-team-users" style="background: var(--bg-main); border: 1px solid var(--slate-200); color: var(--slate-900);">
                        ${loading ? 'Atualizando...' : 'Atualizar lista'}
                    </button>
                </div>

                <div style="display: grid; gap: 1rem;">
                    ${profiles.length === 0 ? `
                        <div class="label-tech" style="padding: 2rem; text-align: center; color: var(--slate-400); border: 1px dashed var(--slate-200); border-radius: 18px;">NENHUM PERFIL ENCONTRADO</div>
                    ` : profiles.map((profile) => `
                        <article class="team-member-card" data-profile-id="${escapeHtml(profile.id)}" data-role="${escapeHtml(profile.role || 'user')}" style="padding: 1.2rem; border-radius: 24px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem;">
                                <div>
                                    <p class="font-black" style="font-size: 1rem;">${escapeHtml(profile.full_name || 'Sem nome')}</p>
                                    <p class="label-tech" style="margin-top: 0.35rem; text-transform: lowercase;">${escapeHtml(profile.email || '-')}</p>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <span class="label-tech" style="display: inline-flex; padding: 0.35rem 0.6rem; border-radius: 9999px; background: ${profile.role === 'admin' ? 'rgba(59,130,246,0.14)' : 'rgba(16,185,129,0.14)'}; color: ${profile.role === 'admin' ? 'var(--blue-500)' : 'var(--primary)'};">${escapeHtml(profile.role === 'admin' ? 'Administrador' : 'Colaborador')}</span>
                                    <button type="button" class="btn-icon team-member-edit-toggle" style="background: transparent; border: none; cursor: pointer; color: var(--slate-500); padding: 0.2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Editar membro">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                    </button>
                                </div>
                            </div>

                            <div class="team-member-edit-form" style="display: none; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed var(--slate-200);">
                                <div style="margin-bottom: 1.2rem;">
                                    <label style="display: flex; flex-direction: column; gap: 0.35rem;">
                                        <span class="label-tech">Nome do Colaborador</span>
                                        <input type="text" class="team-input-full-name" value="${escapeHtml(profile.full_name || '')}" />
                                    </label>
                                </div>

                                <div style="margin-top: 0.5rem;">
                                    <p class="label-tech" style="margin-bottom: 0.85rem;">Acesso de Pastas (Menu Lateral)</p>
                                    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem;">
                                        ${availableFolders.map((folder) => `
                                            <label class="team-check-folder folder-access-cell">
                                                <input
                                                    type="checkbox"
                                                    class="team-folder-access"
                                                    value="${folder.id}"
                                                    ${getFolderAccess(profile.folder_access).includes(folder.id) || profile.role === 'admin' ? 'checked' : ''}
                                                />
                                                <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0;">
                                                    <span class="team-folder-icon" style="color: var(--slate-500); display: flex; align-items: center;">
                                                        ${FOLDER_ICONS[folder.id] || ''}
                                                    </span>
                                                    <span class="team-folder-name" title="${escapeHtml(folder.label)}">${escapeHtml(folder.label)}</span>
                                                </div>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>

                                <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                                    <button type="button" class="btn-pill btn-black team-member-save">Salvar alterações</button>
                                </div>
                            </div>
                        </article>
                    `).join('')}
                </div>
            </section>
        </div>

        <style>
            .team-check {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                font-size: 0.92rem;
                color: var(--slate-800);
                cursor: pointer;
            }
            /* Select estilizado identico ao input */
            .team-select-styled {
                width: 100%;
                border: 1px solid var(--slate-200);
                border-radius: 16px;
                padding: 0.85rem 0.95rem;
                background: var(--card-bg);
                font-family: inherit;
                font-size: 0.95rem;
                color: var(--slate-700);
                outline: none;
                appearance: none;
                -webkit-appearance: none;
                cursor: pointer;
            }
            .team-select-styled:focus {
                border-color: var(--primary);
            }
            /* Células de acesso */
            .folder-access-cell {
                box-sizing: border-box;
            }
            .folder-access-cell.is-checked {
                border-color: #22c55e !important;
                background: rgba(34, 197, 94, 0.08);
                color: #4ade80;
            }
            .folder-access-cell.is-unchecked {
                border-color: rgba(239, 68, 68, 0.5) !important;
                background: rgba(239, 68, 68, 0.06);
                color: #f87171;
            }
            .folder-access-cell.is-checked svg,
            .folder-access-cell.is-checked span {
                color: #4ade80;
            }
            .folder-access-cell.is-unchecked svg,
            .folder-access-cell.is-unchecked span {
                color: #f87171;
            }
            /* Checkboxes dentro das células */
            .team-check input,
            #team-create-form input[type="checkbox"],
            .team-member-card input[type="checkbox"] {
                flex-shrink: 0;
                cursor: pointer;
                margin: 0;
            }
            #team-create-form input:not([type="checkbox"]),
            .team-member-card input:not([type="checkbox"]),
            .team-member-card select {
                width: 100%;
                border: 1px solid var(--slate-200);
                border-radius: 16px;
                padding: 0.85rem 0.95rem;
                background: var(--card-bg);
                font-family: inherit;
                color: var(--slate-700);
                outline: none;
            }
            .team-member-card {
                transition: var(--transition);
            }
            .team-member-card:hover {
                border-color: var(--primary);
                transform: translateY(-1px);
            }
        </style>
    `;

    container.querySelector('#refresh-team-users')?.addEventListener('click', () => {
        onRefresh();
    });

    container.querySelector('#team-create-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        await onCreateMember({
            full_name: String(formData.get('full_name') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            password: String(formData.get('password') || ''),
            role: String(formData.get('role') || 'user'),
            permissions: {
                view: true,
                edit: true,
                delete: true
            },
            folder_access: formData.getAll('folder_access').map((value) => String(value))
        });
    });

    /* Cores dinâmicas nas células de acesso - aplicadas ao renderizar e ao mudar */
    function applyFolderCellColor(label) {
        const cb = label.querySelector('input[type="checkbox"]');
        if (!cb) return;
        if (cb.checked) {
            label.classList.add('is-checked');
            label.classList.remove('is-unchecked');
        } else {
            label.classList.add('is-unchecked');
            label.classList.remove('is-checked');
        }
    }
    container.querySelectorAll('.folder-access-cell').forEach((label) => {
        applyFolderCellColor(label);
        label.querySelector('input[type="checkbox"]')?.addEventListener('change', () =>
            applyFolderCellColor(label)
        );
    });

    container.querySelectorAll('.team-member-save').forEach((button) => {
        button.addEventListener('click', async () => {
            const card = button.closest('.team-member-card');
            const profileId = card?.dataset.profileId;
            const profileRole = card?.dataset.role || 'user';
            if (!card || !profileId) return;

            await onUpdateMember({
                id: profileId,
                full_name: card.querySelector('.team-input-full-name')?.value || '',
                role: profileRole, 
                permissions: {
                    view: true,
                    edit: true,
                    delete: true
                },
                folder_access: [...card.querySelectorAll('.team-folder-access:checked')].map((input) => input.value)
            });
        });
    });

    // Toggle de edição
    container.querySelectorAll('.team-member-edit-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            const card = button.closest('.team-member-card');
            const form = card?.querySelector('.team-member-edit-form');
            if (form) {
                form.style.display = form.style.display === 'none' ? 'block' : 'none';
            }
        });
    });
}
