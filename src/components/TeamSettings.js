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
    const availableFolders = Array.isArray(availableModules) && availableModules.length > 0
        ? FOLDER_OPTIONS.filter((folder) => folder.id !== 'organizacoes' && availableModules.includes(folder.id))
        : FOLDER_OPTIONS.filter((folder) => folder.id !== 'organizacoes');

    container.innerHTML = `
        <div class="animate-fade-in" style="max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 1.5rem;">
            <aside class="glass-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <p class="label-tech">GESTÃO DE EQUIPE</p>
                        <h2 class="font-black" style="font-size: 1.4rem; margin-top: 0.35rem;">Novo Membro</h2>
                        <p style="color: var(--slate-500); margin-top: 0.5rem; line-height: 1.6;">Cadastre usuários diretamente pelo app, com perfil, senha inicial e permissões granulares.</p>
                    </div>
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
                        <span class="label-tech">Role</span>
                        <select name="role">
                            <option value="user">Colaborador(a)</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </label>

                    <div style="padding: 1rem; border-radius: 18px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                        <p class="label-tech" style="margin-bottom: 0.75rem;">Permissões</p>
                        <label class="team-check"><input type="checkbox" name="permission_view" checked /> Visualizar</label>
                        <label class="team-check"><input type="checkbox" name="permission_edit" /> Editar</label>
                        <label class="team-check"><input type="checkbox" name="permission_delete" /> Excluir</label>
                    </div>

                    <div style="padding: 1rem; border-radius: 18px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                        <p class="label-tech" style="margin-bottom: 0.75rem;">Acesso por Pastas</p>
                        <div style="display: grid; gap: 0.65rem;">
                            ${availableFolders.map((folder) => `
                                <label class="team-check">
                                    <input type="checkbox" name="folder_access" value="${folder.id}" checked />
                                    ${escapeHtml(folder.label)}
                                </label>
                            `).join('')}
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
                        <article class="team-member-card" data-profile-id="${escapeHtml(profile.id)}" style="padding: 1.2rem; border-radius: 24px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem;">
                                <div>
                                    <p class="font-black" style="font-size: 1rem;">${escapeHtml(profile.full_name || 'Sem nome')}</p>
                                    <p class="label-tech" style="margin-top: 0.35rem;">${escapeHtml(profile.email || '-')}</p>
                                </div>
                                <div style="text-align: right;">
                                    <span class="label-tech" style="display: inline-flex; padding: 0.35rem 0.6rem; border-radius: 9999px; background: ${profile.role === 'admin' ? 'rgba(59,130,246,0.14)' : 'rgba(16,185,129,0.14)'}; color: ${profile.role === 'admin' ? 'var(--blue-500)' : 'var(--primary)'};">${escapeHtml(profile.role)}</span>
                                </div>
                            </div>

                            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                                <label style="display: flex; flex-direction: column; gap: 0.35rem;">
                                    <span class="label-tech">Nome</span>
                                    <input type="text" class="team-input-full-name" value="${escapeHtml(profile.full_name || '')}" />
                                </label>
                                <label style="display: flex; flex-direction: column; gap: 0.35rem;">
                                    <span class="label-tech">Role</span>
                                    <select class="team-input-role">
                                        <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Administrador</option>
                                        <option value="user" ${profile.role === 'user' ? 'selected' : ''}>Colaborador(a)</option>
                                    </select>
                                </label>
                            </div>

                            <div style="display: grid; grid-template-columns: 200px 1fr; gap: 1rem; align-items: start;">
                                <div style="padding: 0.95rem; border-radius: 18px; background: var(--card-bg); border: 1px solid var(--slate-200);">
                                    <p class="label-tech" style="margin-bottom: 0.75rem;">Permissões</p>
                                    <label class="team-check"><input type="checkbox" class="team-permission-view" ${getPermission(profile.permissions, 'view') || profile.role === 'admin' ? 'checked' : ''} /> Visualizar</label>
                                    <label class="team-check"><input type="checkbox" class="team-permission-edit" ${getPermission(profile.permissions, 'edit') || profile.role === 'admin' ? 'checked' : ''} /> Editar</label>
                                    <label class="team-check"><input type="checkbox" class="team-permission-delete" ${getPermission(profile.permissions, 'delete') || profile.role === 'admin' ? 'checked' : ''} /> Excluir</label>
                                </div>
                                <div style="padding: 0.95rem; border-radius: 18px; background: var(--card-bg); border: 1px solid var(--slate-200);">
                                    <p class="label-tech" style="margin-bottom: 0.75rem;">Acesso por Pastas</p>
                                    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem;">
                                        ${availableFolders.map((folder) => `
                                            <label class="team-check">
                                                <input
                                                    type="checkbox"
                                                    class="team-folder-access"
                                                    value="${folder.id}"
                                                    ${getFolderAccess(profile.folder_access).includes(folder.id) || profile.role === 'admin' ? 'checked' : ''}
                                                />
                                                ${escapeHtml(folder.label)}
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>

                            <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                                <button type="button" class="btn-pill btn-black team-member-save">Salvar permissões</button>
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
                gap: 0.55rem;
                font-size: 0.92rem;
                color: var(--slate-800);
                cursor: pointer;
            }
            .team-check input {
                accent-color: var(--primary);
            }
            #team-create-form input,
            #team-create-form select,
            .team-member-card input,
            .team-member-card select {
                width: 100%;
                border: 1px solid var(--slate-200);
                border-radius: 16px;
                padding: 0.85rem 0.95rem;
                background: var(--card-bg);
                font-family: inherit;
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
                view: formData.get('permission_view') !== null,
                edit: formData.get('permission_edit') !== null,
                delete: formData.get('permission_delete') !== null
            },
            folder_access: formData.getAll('folder_access').map((value) => String(value))
        });
    });

    container.querySelectorAll('.team-member-save').forEach((button) => {
        button.addEventListener('click', async () => {
            const card = button.closest('.team-member-card');
            const profileId = card?.dataset.profileId;
            if (!card || !profileId) return;

            await onUpdateMember({
                id: profileId,
                full_name: card.querySelector('.team-input-full-name')?.value || '',
                role: card.querySelector('.team-input-role')?.value || 'user',
                permissions: {
                    view: card.querySelector('.team-permission-view')?.checked === true,
                    edit: card.querySelector('.team-permission-edit')?.checked === true,
                    delete: card.querySelector('.team-permission-delete')?.checked === true
                },
                folder_access: [...card.querySelectorAll('.team-folder-access:checked')].map((input) => input.value)
            });
        });
    });
}
