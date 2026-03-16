import { clientStore } from '../utils/ClientStore.js';
import { processStore } from '../utils/ProcessStore.js';
import { showConfirmModal } from './ConfirmModal.js';
import { showNoticeModal } from './NoticeModal.js';
import { escapeHtml } from '../utils/sanitize.js';

export function renderClientList(container, actionsContainer, onEdit, onAdd, options = {}) {
    const clients = clientStore.getClients();
    const canEdit = options.canEdit !== false;
    const canDelete = options.canDelete === true;
    const displayClients = clients.map((client) => ({
        ...client,
        status: 'Ativo',
        isMock: false
    }));

    const state = {
        query: '',
        selectedId: null
    };
    const uiState = {
        masterScrollTop: 0,
        detailScrollTop: 0,
        searchSelectionStart: null,
        searchSelectionEnd: null,
        shouldRestoreSearchFocus: false
    };

    actionsContainer.innerHTML = '';
    actionsContainer.style.display = 'none';

    const render = () => {
        const previousMasterList = container.querySelector('.client-master-list');
        const previousDetailPanel = container.querySelector('.client-detail-panel');
        const previousSearch = container.querySelector('input[name="client-search"]');
        if (previousMasterList) {
            uiState.masterScrollTop = previousMasterList.scrollTop;
        }
        if (previousDetailPanel) {
            uiState.detailScrollTop = previousDetailPanel.scrollTop;
        }
        if (previousSearch && document.activeElement === previousSearch) {
            uiState.shouldRestoreSearchFocus = true;
            uiState.searchSelectionStart = previousSearch.selectionStart;
            uiState.searchSelectionEnd = previousSearch.selectionEnd;
        } else {
            uiState.shouldRestoreSearchFocus = false;
        }

        const filteredClients = filterClients(displayClients, state.query);
        if (!filteredClients.some((client) => String(client.id) === String(state.selectedId))) {
            state.selectedId = null;
        }

        const selectedClient = filteredClients.find((client) => String(client.id) === String(state.selectedId))
            || displayClients.find((client) => String(client.id) === String(state.selectedId))
            || null;

        container.innerHTML = `
            <div class="client-master-detail bounded-scroll-layout" style="width: 100%;">
                <aside class="client-master-panel">
                    <div class="client-master-header">
                        <label class="client-master-search">
                            <span class="client-master-search-icon" aria-hidden="true">${searchIcon()}</span>
                            <input type="search" name="client-search" value="${escapeAttribute(state.query)}" placeholder="Buscar titular..." />
                        </label>
                        ${canEdit ? `<button type="button" class="client-master-add" data-action="add-client" aria-label="Adicionar titular">${addTitularIcon()}</button>` : ''}
                    </div>

                    <div class="client-master-list custom-scrollbar">
                        ${filteredClients.length === 0 ? `
                            <div class="client-master-empty">
                                <span class="client-master-empty-icon">${usersIcon()}</span>
                                <p>Nenhum titular encontrado para esta busca.</p>
                            </div>
                        ` : filteredClients.map((client) => renderClientListItem(client, state.selectedId)).join('')}
                    </div>
                </aside>

                <section class="client-detail-panel custom-scrollbar">
                    ${selectedClient ? renderClientDetail(selectedClient, { canEdit, canDelete }) : renderClientEmptyState()}
                </section>
            </div>
        `;

        bindEvents(filteredClients, selectedClient);

        const nextMasterList = container.querySelector('.client-master-list');
        const nextDetailPanel = container.querySelector('.client-detail-panel');
        if (nextMasterList) {
            nextMasterList.scrollTop = uiState.masterScrollTop;
        }
        if (nextDetailPanel) {
            nextDetailPanel.scrollTop = uiState.detailScrollTop;
        }
        if (uiState.shouldRestoreSearchFocus) {
            const nextSearch = container.querySelector('input[name="client-search"]');
            if (nextSearch) {
                nextSearch.focus();
                const start = typeof uiState.searchSelectionStart === 'number' ? uiState.searchSelectionStart : nextSearch.value.length;
                const end = typeof uiState.searchSelectionEnd === 'number' ? uiState.searchSelectionEnd : start;
                nextSearch.setSelectionRange(start, end);
            }
        }
    };

    const bindEvents = (filteredClients, selectedClient) => {
        container.querySelector('input[name="client-search"]')?.addEventListener('input', (event) => {
            state.query = String(event.target.value || '');
            render();
        });

        container.querySelector('[data-action="add-client"]')?.addEventListener('click', () => {
            if (typeof onAdd === 'function') {
                onAdd();
            }
        });

        container.querySelectorAll('[data-client-id]').forEach((button) => {
            button.addEventListener('click', () => {
                state.selectedId = button.dataset.clientId;
                render();
            });
        });

        container.querySelector('[data-detail-action="edit"]')?.addEventListener('click', () => {
            if (!selectedClient) return;
            if (selectedClient.isMock) {
                showNoticeModal('Modo demonstracao', 'Este titular faz parte apenas da visualizacao de exemplo e nao pode ser editado.');
                return;
            }
            if (typeof onEdit === 'function') {
                onEdit(selectedClient);
            }
        });

        container.querySelector('[data-detail-action="deactivate"]')?.addEventListener('click', () => {
            if (!selectedClient) return;
            if (selectedClient.isMock) {
                showNoticeModal('Modo demonstracao', 'Este titular de exemplo nao pode ser desativado.');
                return;
            }
            if (!canDelete) {
                showNoticeModal('Acesso restrito', 'Seu perfil nao possui permissao para excluir titulares.');
                return;
            }

            showConfirmModal(
                'Excluir titular',
                `Deseja realmente excluir o titular "${getClientName(selectedClient)}"?`,
                async () => {
                    try {
                        await clientStore.deleteClient(Number(selectedClient.id));
                        state.selectedId = null;
                        render();
                    } catch (error) {
                        showNoticeModal('Nao foi possivel excluir', error?.message || 'Falha ao remover o titular.');
                    }
                }
            );
        });

        container.querySelectorAll('.btn-copy-inline').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.copyVal;
                if (!val) return;
                navigator.clipboard.writeText(val);
                
                const originalHTML = btn.innerHTML;
                btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary)"><polyline points="20 6 9 17 4 12"/></svg>`;
                btn.classList.add('copied');
                
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('copied');
                }, 1500);
            });
        });

        // Add hover effect for download button manually due to inline styling limitations
        container.querySelectorAll('.btn-download-inline').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--slate-200)';
                btn.style.color = 'var(--primary)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = 'transparent';
                btn.style.color = 'var(--slate-400)';
            });
            btn.addEventListener('click', () => {
                const docName = btn.dataset.downloadVal;
                // Since this is a UI prototype, we just trigger the notice modal.
                import('./NoticeModal.js').then(({ showNoticeModal }) => {
                    showNoticeModal('Download Iniciado', `Simulando o download do arquivo: ${docName}`);
                });
            });
        });
    };

    render();
}

function renderClientListItem(client, selectedId) {
    const active = String(client.id) === String(selectedId);
    return `
        <button
            type="button"
            class="client-master-item ${active ? 'is-active' : ''}"
            data-client-id="${escapeAttribute(client.id)}"
        >
            <span class="client-master-item-name">${escapeHtml(getClientName(client))}</span>
            <span class="client-master-item-doc">${escapeHtml(getClientDocument(client) || 'Documento nao informado')}</span>
        </button>
    `;
}

function renderClientDetail(client, options = {}) {
    const linkedProcesses = processStore.processes.filter((process) => String(process.clientId) === String(client.id));
    const infoCards = [
        { label: client.type === 'PF' ? 'CPF' : 'CNPJ', value: getClientDocument(client), tone: 'cyan', canCopy: true },
        { label: 'E-MAIL', value: client.email || 'Nao informado', tone: 'emerald', canCopy: !!client.email },
        { label: 'TELEFONE', value: client.telefone || 'Nao informado', tone: 'cyan', canCopy: !!client.telefone },
        { label: 'ENDERECO', value: formatAddress(client), tone: 'blue', canCopy: formatAddress(client) !== 'Nao informado' }
    ];

    return `
        <div class="client-detail-shell">
            <div class="client-detail-card">
                <header class="client-detail-header">
                    <div>
                        <p class="label-tech">Titular selecionado</p>
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <h2 class="client-detail-title">${escapeHtml(getClientName(client))}</h2>
                            <button 
                                type="button" 
                                class="btn-copy-inline" 
                                data-copy-val="${escapeAttribute(getClientName(client))}"
                                title="Copiar Nome"
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="client-detail-actions">
                        ${options.canEdit !== false ? `<button type="button" class="btn-pill" data-detail-action="edit">Editar</button>` : ''}
                        <button type="button" class="btn-pill ${options.canDelete ? 'client-detail-danger' : ''}" data-detail-action="deactivate">
                            Excluir
                        </button>
                    </div>
                </header>

                <div class="client-detail-grid">
                    ${infoCards.map((card) => `
                        <article class="client-info-card" ${card.label === 'ENDERECO' ? 'style="grid-column: 1 / -1;"' : ''}>
                            <span class="client-info-icon client-info-icon-${card.tone}">${detailIcon(card.tone)}</span>
                            <div style="flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; overflow: hidden;">
                                <div style="flex: 1; overflow: hidden;">
                                    <p class="label-tech">${escapeHtml(card.label)}</p>
                                    <p class="client-info-value" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(card.value || 'Nao informado')}</p>
                                </div>
                                ${card.canCopy ? `
                                    <button 
                                        type="button" 
                                        class="btn-copy-inline" 
                                        data-copy-val="${escapeAttribute(card.value)}"
                                        title="Copiar"
                                    >
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                                        </svg>
                                    </button>
                                ` : ''}
                            </div>
                        </article>
                    `).join('')}
                </div>

                <div class="client-detail-sections">
                    <section class="client-section-card">
                        <div class="client-section-header">
                            <h3>Documentos anexos</h3>
                            <span>${client.documents?.length || 0}</span>
                        </div>
                        ${client.documents?.length
                            ? `
                                <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
                                    ${client.documents.map((doc) => `
                                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: var(--slate-50); padding: 0.75rem 1rem; border-radius: 12px; border: 1px solid var(--slate-200);">
                                            <div style="display: flex; align-items: center; gap: 0.75rem; overflow: hidden;">
                                                <div style="color: var(--slate-400);">
                                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                                                    </svg>
                                                </div>
                                                <p class="font-bold" style="font-size: 0.85rem; color: var(--slate-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                    ${escapeHtml(typeof doc === 'string' ? doc : doc.name || doc.fileName || 'Documento Sem Nome')}
                                                </p>
                                            </div>
                                            <button 
                                                type="button" 
                                                class="btn-download-inline" 
                                                data-download-val="${escapeAttribute(typeof doc === 'string' ? doc : doc.name || doc.fileName || 'documento_anexo')}"
                                                title="Baixar Arquivo"
                                                style="background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--slate-400); border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;"
                                            >
                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                                                </svg>
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            `
                            : '<p class="client-section-copy">Nenhum documento anexado a este titular.</p>'}
                    </section>

                    <section class="client-section-card">
                        <div class="client-section-header">
                            <h3>Processos vinculados</h3>
                            <span>${linkedProcesses.length}</span>
                        </div>
                        ${linkedProcesses.length
                            ? `
                                <div class="client-linked-list">
                                    ${linkedProcesses.map((process) => `
                                        <article class="client-linked-item">
                                            <p class="client-linked-name">${escapeHtml(process.projectName || process.tipoSigla || 'Processo sem titulo')}</p>
                                            <p class="client-linked-meta">${escapeHtml(process.numeroProcesso || 'Numero nao informado')} · ${escapeHtml(process.orgaoSigla || 'Orgao nao informado')}</p>
                                        </article>
                                    `).join('')}
                                </div>
                            `
                            : '<p class="client-section-copy">Ainda nao ha processos vinculados a este titular.</p>'}
                    </section>
                </div>
            </div>
        </div>
    `;
}

function renderClientEmptyState() {
    return `
        <div class="client-detail-empty">
            <span class="client-detail-empty-icon">${usersIcon()}</span>
            <p>Selecione um titular na lista ao lado para ver os detalhes.</p>
        </div>
    `;
}

function filterClients(clients, query) {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter((client) => {
        const haystack = [
            getClientName(client),
            getClientDocument(client),
            client.email,
            client.cidade
        ].join(' ').toLowerCase();
        return haystack.includes(normalized);
    });
}

function getClientName(client) {
    return client.type === 'PF' ? client.nome : client.nomeFantasia;
}

function getClientDocument(client) {
    return client.type === 'PF' ? client.cpf : client.cnpj;
}

function formatAddress(client) {
    const parts = [
        [client.logradouro, client.numero].filter(Boolean).join(', '),
        client.bairro,
        [client.cidade, client.uf].filter(Boolean).join(' / '),
        client.cep
    ].filter(Boolean);
    return parts.join(' · ') || 'Nao informado';
}

function searchIcon() {
    return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`;
}

function addTitularIcon() {
    return `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M19 8v6"></path>
            <path d="M16 11h6"></path>
        </svg>
    `;
}

function usersIcon() {
    return `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
}

function detailIcon(tone) {
    if (tone === 'emerald') {
        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`;
    }
    if (tone === 'blue') {
        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="M2 12h20"></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l3 3"></path></svg>`;
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
