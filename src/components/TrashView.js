import { escapeHtml } from '../utils/sanitize.js';

export function renderTrashView(container, options = {}) {
    const { trashStore, onRefresh } = options;

    const state = {
        loading: false,
        items: []
    };

    const render = async () => {
        container.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Gerenciamento de Dados</p>
                            <h2 class="client-detail-title">Lixeira</h2>
                            <p class="client-detail-subtitle">Itens excluídos ficam aqui até o administrador esvaziar a lixeira. Só então os arquivos são removidos permanentemente.</p>
                        </div>
                        <div>
                            <button type="button" id="btn-empty-trash" class="btn-pill" style="background: var(--red-500, #ef4444); color: white; border: none; padding: 0.7rem 1.4rem; font-weight: 700; cursor: pointer; border-radius: 100px; font-size: 0.85rem; opacity: 0.9;">
                                ${trashIcon()} Esvaziar Lixeira
                            </button>
                        </div>
                    </header>

                    <div id="trash-list-container" style="margin-top: 2rem;">
                        <div class="glass-card" style="padding: 2rem; border-radius: 24px; text-align: center;">
                            <p class="label-tech">CARREGANDO LIXEIRA...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        bindHeaderEvents();
        await loadAndRenderItems();
    };

    const loadAndRenderItems = async () => {
        const listContainer = container.querySelector('#trash-list-container');
        if (!listContainer) return;

        try {
            await trashStore.load(true);
            state.items = trashStore.items || [];
        } catch (err) {
            listContainer.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--red-500, #ef4444);">
                    <p>Erro ao carregar a lixeira: ${escapeHtml(err.message)}</p>
                </div>
            `;
            return;
        }

        if (state.items.length === 0) {
            listContainer.innerHTML = `
                <div style="padding: 4rem 2rem; text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;">${trashIcon()}</div>
                    <p class="label-tech" style="opacity: 0.5;">LIXEIRA VAZIA</p>
                    <p class="client-detail-subtitle" style="margin-top: 0.5rem;">Nenhum item foi enviado para a lixeira ainda.</p>
                </div>
            `;
            return;
        }

        // Agrupa por tipo
        const processos = state.items.filter(i => i.item_type === 'processo');
        const titulares = state.items.filter(i => i.item_type === 'titular');

        listContainer.innerHTML = `
            ${processos.length > 0 ? `
                <div style="margin-bottom: 2rem;">
                    <p class="label-tech" style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                        ${folderIcon()} PROCESSOS (${processos.length})
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${processos.map(item => renderTrashItem(item)).join('')}
                    </div>
                </div>
            ` : ''}
            ${titulares.length > 0 ? `
                <div>
                    <p class="label-tech" style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                        ${userIcon()} TITULARES (${titulares.length})
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${titulares.map(item => renderTrashItem(item)).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        bindItemEvents();
    };

    const renderTrashItem = (item) => {
        const deletedAt = item.deleted_at
            ? new Date(item.deleted_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '—';

        const filesCount = Array.isArray(item.storage_paths) ? item.storage_paths.filter(p => p).length : 0;

        return `
            <div class="client-detail-field-block" style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.25rem 1.5rem; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 0;">
                    <p style="font-weight: 700; font-size: 0.95rem; color: var(--slate-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 0 0.25rem 0;">
                        ${escapeHtml(item.item_label || 'Item sem nome')}
                    </p>
                    <p class="label-tech" style="font-size: 0.7rem; opacity: 0.55; margin: 0;">
                        Excluído em ${deletedAt}${filesCount > 0 ? ` · ${filesCount} arquivo(s) físico(s)` : ' · Sem arquivos físicos'}
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                    <button
                        type="button"
                        class="btn-pill btn-trash-restore-item"
                        data-trash-id="${escapeHtml(String(item.id))}"
                        style="background: transparent; border: 1.5px solid var(--primary, #10b981); color: var(--primary, #10b981); padding: 0.5rem 1rem; font-weight: 700; cursor: pointer; border-radius: 100px; font-size: 0.8rem; white-space: nowrap;"
                    >
                        ↩ Restaurar
                    </button>
                    <button
                        type="button"
                        class="btn-pill btn-trash-delete-item"
                        data-trash-id="${escapeHtml(String(item.id))}"
                        style="background: transparent; border: 1.5px solid var(--red-500, #ef4444); color: var(--red-500, #ef4444); padding: 0.5rem 1rem; font-weight: 700; cursor: pointer; border-radius: 100px; font-size: 0.8rem; white-space: nowrap;"
                    >
                        Excluir Permanentemente
                    </button>
                </div>
            </div>
        `;

    };

    const bindHeaderEvents = () => {
        const emptyBtn = container.querySelector('#btn-empty-trash');
        if (emptyBtn) {
            emptyBtn.addEventListener('click', async () => {
                if (state.items.length === 0) {
                    alert('A lixeira já está vazia.');
                    return;
                }
                const confirmed = confirm(`Tem certeza que deseja esvaziar a lixeira? Isso irá excluir permanentemente ${state.items.length} item(s) e todos os arquivos associados. Essa ação não pode ser desfeita.`);
                if (!confirmed) return;

                emptyBtn.disabled = true;
                emptyBtn.textContent = 'Esvaziando...';

                try {
                    await trashStore.emptyAll();
                    await loadAndRenderItems();
                } catch (err) {
                    alert('Erro ao esvaziar a lixeira: ' + err.message);
                } finally {
                    emptyBtn.disabled = false;
                    emptyBtn.innerHTML = `${trashIcon()} Esvaziar Lixeira`;
                }
            });
        }
    };

    const bindItemEvents = () => {
        // Botão Restaurar
        container.querySelectorAll('.btn-trash-restore-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const trashId = btn.dataset.trashId;
                const item = state.items.find(i => String(i.id) === String(trashId));
                const label = item?.item_label || 'este item';
                const type = item?.item_type === 'processo' ? 'Processo' : 'Titular';

                const confirmed = confirm(`Restaurar "${label}"? O ${type} voltará a aparecer na lista original.`);
                if (!confirmed) return;

                btn.disabled = true;
                btn.textContent = 'Restaurando...';

                try {
                    await trashStore.restoreItem(trashId);
                    state.items = trashStore.items;
                    await loadAndRenderItems();
                } catch (err) {
                    alert('Erro ao restaurar: ' + err.message);
                    btn.disabled = false;
                    btn.innerHTML = '↩ Restaurar';
                }
            });
        });

        // Botão Excluir Permanentemente
        container.querySelectorAll('.btn-trash-delete-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const trashId = btn.dataset.trashId;
                const item = state.items.find(i => String(i.id) === String(trashId));
                const label = item?.item_label || 'este item';

                const confirmed = confirm(`Excluir permanentemente "${label}"? Isso irá remover todos os arquivos físicos associados e não pode ser desfeito.`);
                if (!confirmed) return;

                btn.disabled = true;
                btn.textContent = 'Excluindo...';

                try {
                    await trashStore.permanentlyDelete(trashId);
                    state.items = trashStore.items;
                    await loadAndRenderItems();
                } catch (err) {
                    alert('Erro ao excluir: ' + err.message);
                    btn.disabled = false;
                    btn.textContent = 'Excluir Permanentemente';
                }
            });
        });
    };


    render();
}

function trashIcon() {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
}

function folderIcon() {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
}

function userIcon() {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
}
