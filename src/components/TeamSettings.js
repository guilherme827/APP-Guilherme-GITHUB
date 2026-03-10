function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderTeamSettings(container, { currentProfile, profiles, loading, onRefresh, onRoleChange }) {
    container.innerHTML = `
        <div class="glass-card animate-fade-in" style="max-width: 1100px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem;">
                <div>
                    <p class="label-tech">GESTÃO DE EQUIPE</p>
                    <h2 class="font-black" style="font-size: 1.6rem; margin-top: 0.35rem;">Configurações de Equipe</h2>
                    <p style="color: var(--slate-500); margin-top: 0.5rem; line-height: 1.6;">Gerencie os usuários autenticados e ajuste os níveis de acesso entre administrador e usuário padrão.</p>
                </div>
                <button type="button" class="btn-pill" id="refresh-team-users" style="background: var(--bg-main); border: 1px solid var(--slate-200); color: var(--slate-900);">
                    ${loading ? 'Atualizando...' : 'Atualizar lista'}
                </button>
            </div>

            <div style="margin-bottom: 1.5rem; padding: 1rem 1.25rem; border-radius: 20px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                <p class="label-tech">SEU PERFIL</p>
                <p class="font-black" style="font-size: 1rem; margin-top: 0.35rem;">${escapeHtml(currentProfile?.full_name || currentProfile?.email || 'Administrador')}</p>
                <p style="color: var(--slate-500); margin-top: 0.35rem;">Role atual: <strong>${escapeHtml(currentProfile?.role || 'admin')}</strong></p>
            </div>

            <div style="overflow: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="label-tech">USUÁRIO</th>
                            <th class="label-tech">E-MAIL</th>
                            <th class="label-tech">ROLE</th>
                            <th class="label-tech" style="text-align: right;">AÇÃO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${profiles.length === 0 ? `
                            <tr>
                                <td colspan="4" class="label-tech" style="padding: 2rem; text-align: center; color: var(--slate-400);">NENHUM PERFIL ENCONTRADO</td>
                            </tr>
                        ` : profiles.map((profile) => `
                            <tr>
                                <td>
                                    <div style="display: flex; flex-direction: column;">
                                        <span class="font-black" style="font-size: 0.95rem;">${escapeHtml(profile.full_name || 'Sem nome')}</span>
                                        <span class="label-tech" style="font-size: 8px; margin-top: 3px;">ID ${escapeHtml(profile.id)}</span>
                                    </div>
                                </td>
                                <td><span style="font-weight: 600; color: var(--slate-800);">${escapeHtml(profile.email || '-')}</span></td>
                                <td>
                                    <select data-profile-id="${escapeHtml(profile.id)}" class="team-role-select" style="padding: 0.75rem 0.9rem; border-radius: 14px; border: 1px solid var(--slate-200); background: var(--card-bg); font-family: inherit;">
                                        <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>admin</option>
                                        <option value="user" ${profile.role === 'user' ? 'selected' : ''}>user</option>
                                    </select>
                                </td>
                                <td style="text-align: right;">
                                    <button type="button" class="btn-pill btn-black team-role-save" data-profile-id="${escapeHtml(profile.id)}">
                                        Salvar role
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.querySelector('#refresh-team-users')?.addEventListener('click', () => {
        onRefresh();
    });

    container.querySelectorAll('.team-role-save').forEach((button) => {
        button.addEventListener('click', async () => {
            const profileId = button.dataset.profileId;
            const select = container.querySelector(`.team-role-select[data-profile-id="${profileId}"]`);
            const nextRole = select?.value || 'user';
            await onRoleChange(profileId, nextRole);
        });
    });
}
