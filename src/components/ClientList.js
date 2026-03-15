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
        rg: client.type === 'PF' ? 'Não informado' : 'Não informado',
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
            <div class="client-master-detail bounded-scroll-layout">
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
                showNoticeModal('Acesso restrito', 'Seu perfil nao possui permissao para desativar titulares.');
                return;
            }

            showConfirmModal(
                'Desativar titular',
                `Deseja realmente remover o titular "${getClientName(selectedClient)}"?`,
                async () => {
                    try {
                        await clientStore.deleteClient(Number(selectedClient.id));
                        state.selectedId = null;
                        render();
                    } catch (error) {
                        showNoticeModal('Nao foi possivel desativar', error?.message || 'Falha ao remover o titular.');
                    }
                }
            );
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
        { label: client.type === 'PF' ? 'CPF' : 'CNPJ', value: getClientDocument(client), tone: 'cyan' },
        { label: 'RG / INSCRICAO', value: client.rg || 'Nao informado', tone: 'blue' },
        { label: 'E-MAIL', value: client.email || 'Nao informado', tone: 'emerald' },
        { label: 'TELEFONE', value: client.telefone || 'Nao informado', tone: 'cyan' },
        { label: 'ENDERECO', value: formatAddress(client), tone: 'blue' },
        { label: 'STATUS', value: client.status || 'Ativo', tone: 'emerald' }
    ];

    return `
        <div class="client-detail-shell">
            <div class="client-detail-card">
                <header class="client-detail-header">
                    <div>
                        <p class="label-tech">Titular selecionado</p>
                        <h2 class="client-detail-title">${escapeHtml(getClientName(client))}</h2>
                        <p class="client-detail-subtitle">${escapeHtml(client.type === 'PJ' ? (client.nomeEmpresarial || 'Pessoa Juridica') : 'Pessoa Fisica')}</p>
                    </div>
                    <div class="client-detail-actions">
                        ${options.canEdit !== false ? `<button type="button" class="btn-pill" data-detail-action="edit">Editar</button>` : ''}
                        <button type="button" class="btn-pill ${options.canDelete ? 'client-detail-danger' : ''}" data-detail-action="deactivate">
                            Desativar
                        </button>
                    </div>
                </header>

                <div class="client-detail-grid">
                    ${infoCards.map((card) => `
                        <article class="client-info-card">
                            <span class="client-info-icon client-info-icon-${card.tone}">${detailIcon(card.tone)}</span>
                            <div>
                                <p class="label-tech">${escapeHtml(card.label)}</p>
                                <p class="client-info-value">${escapeHtml(card.value || 'Nao informado')}</p>
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
                            ? `<div class="client-tag-list">${client.documents.map((doc) => `<span class="client-tag">${escapeHtml(doc)}</span>`).join('')}</div>`
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
