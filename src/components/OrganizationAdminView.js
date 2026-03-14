function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderOrganizationAdminView(container, {
    organizations = [],
    loading = false,
    createLoading = false,
    onRefresh,
    onCreateOrganization
} = {}) {
    container.innerHTML = `
        <div class="animate-fade-in" style="max-width: 1240px; margin: 0 auto; display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 1.5rem;">
            <aside class="glass-card">
                <div style="margin-bottom: 1.5rem;">
                    <p class="label-tech">SUPER ADMIN</p>
                    <h2 class="font-black" style="font-size: 1.5rem; margin-top: 0.35rem;">Nova organização</h2>
                    <p style="color: var(--slate-500); margin-top: 0.55rem; line-height: 1.6;">
                        Crie um novo escritório GEOCONSULT e já vincule o administrador principal dessa operação.
                    </p>
                </div>

                <form id="organization-create-form" style="display: grid; gap: 1rem;">
                    <label style="display: grid; gap: 0.35rem;">
                        <span class="label-tech">Nome da organização</span>
                        <input type="text" name="organization_name" required placeholder="Ex: GEOCONSULT Pará" />
                    </label>
                    <label style="display: grid; gap: 0.35rem;">
                        <span class="label-tech">Slug</span>
                        <input type="text" name="organization_slug" placeholder="geoconsult-para" />
                    </label>
                    <label style="display: grid; gap: 0.35rem;">
                        <span class="label-tech">Nome do administrador</span>
                        <input type="text" name="admin_full_name" required placeholder="Nome do responsável" />
                    </label>
                    <label style="display: grid; gap: 0.35rem;">
                        <span class="label-tech">E-mail do administrador</span>
                        <input type="email" name="admin_email" required placeholder="admin@empresa.com" />
                    </label>
                    <label style="display: grid; gap: 0.35rem;">
                        <span class="label-tech">Senha inicial</span>
                        <input type="password" name="admin_password" minlength="6" required placeholder="Mínimo de 6 caracteres" />
                    </label>
                    <label style="display: grid; gap: 0.35rem;">
                        <span class="label-tech">Tratamento</span>
                        <select name="admin_gender">
                            <option value="neutro">Colaborador(a)</option>
                            <option value="masculino">Colaborador</option>
                            <option value="feminino">Colaboradora</option>
                        </select>
                    </label>
                    <button type="submit" class="btn-pill btn-black" ${createLoading ? 'disabled' : ''}>
                        ${createLoading ? 'Criando...' : 'Criar organização'}
                    </button>
                </form>
            </aside>

            <section class="glass-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <p class="label-tech">OPERAÇÕES</p>
                        <h2 class="font-black" style="font-size: 1.6rem; margin-top: 0.35rem;">Organizações cadastradas</h2>
                        <p style="color: var(--slate-500); margin-top: 0.55rem; line-height: 1.6;">
                            Cada organização tem sua própria base de titulares, processos, prazos e equipe.
                        </p>
                    </div>
                    <button type="button" id="refresh-organizations" class="btn-pill" style="background: var(--bg-main); border: 1px solid var(--slate-200); color: var(--slate-900);">
                        ${loading ? 'Atualizando...' : 'Atualizar'}
                    </button>
                </div>

                <div style="display: grid; gap: 1rem;">
                    ${organizations.length === 0 ? `
                        <div class="label-tech" style="padding: 2rem; text-align: center; color: var(--slate-400); border: 1px dashed var(--slate-200); border-radius: 18px;">
                            NENHUMA ORGANIZAÇÃO ENCONTRADA
                        </div>
                    ` : organizations.map((organization) => `
                        <article style="padding: 1.2rem; border-radius: 24px; background: var(--bg-main); border: 1px solid var(--slate-200); display: grid; gap: 1rem;">
                            <div style="display: flex; justify-content: space-between; gap: 1rem;">
                                <div>
                                    <p class="font-black" style="font-size: 1.05rem;">${escapeHtml(organization.name)}</p>
                                    <p class="label-tech" style="margin-top: 0.35rem;">slug: ${escapeHtml(organization.slug || '-')}</p>
                                </div>
                                <span class="label-tech" style="display: inline-flex; padding: 0.35rem 0.65rem; border-radius: 9999px; background: ${organization.is_active === false ? 'rgba(244,63,94,0.12)' : 'rgba(16,185,129,0.14)'}; color: ${organization.is_active === false ? 'var(--rose-500)' : 'var(--primary)'};">
                                    ${organization.is_active === false ? 'inativa' : 'ativa'}
                                </span>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem;">
                                <div style="padding: 0.9rem; border-radius: 16px; background: var(--card-bg); border: 1px solid var(--slate-200);">
                                    <p class="label-tech">Administradores</p>
                                    <p style="margin-top: 0.4rem; color: var(--slate-600);">${organization.admins?.length ? organization.admins.map((admin) => escapeHtml(admin.email || admin.full_name || '-')).join('<br>') : 'Nenhum administrador cadastrado.'}</p>
                                </div>
                                <div style="padding: 0.9rem; border-radius: 16px; background: var(--card-bg); border: 1px solid var(--slate-200);">
                                    <p class="label-tech">Resumo</p>
                                    <p style="margin-top: 0.4rem; color: var(--slate-600);">ID: ${escapeHtml(organization.id)}</p>
                                    <p style="margin-top: 0.2rem; color: var(--slate-600);">Criada em: ${escapeHtml(organization.created_at ? new Date(organization.created_at).toLocaleDateString('pt-BR') : '-')}</p>
                                </div>
                            </div>
                        </article>
                    `).join('')}
                </div>
            </section>
        </div>
    `;

    container.querySelector('#refresh-organizations')?.addEventListener('click', () => {
        if (typeof onRefresh === 'function') onRefresh();
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
            admin_password: String(formData.get('admin_password') || ''),
            admin_gender: String(formData.get('admin_gender') || 'neutro')
        });
        event.currentTarget.reset();
    });
}
