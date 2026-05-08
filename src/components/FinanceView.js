import {
    loadUserScopedJsonStorage,
    saveUserScopedJsonStorage
} from '../dashboard/userScopedStorage.js';
import JSZip from 'jszip';
import systemGlobeTexture from '../assets/earth-blue-marble.jpg';
import { escapeHtml } from '../utils/sanitize.js';
import { showNoticeModal } from './NoticeModal.js';
import { showConfirmModal } from './ConfirmModal.js';

const FINANCE_TABS = [
    { id: 'caixa', label: 'Caixa', title: 'Operacoes de caixa', copy: 'Registre manualmente entradas, saidas e consultas do caixa selecionado.' },
    { id: 'fichas', label: 'Fichas', title: 'Fichas financeiras', copy: 'Organize as fichas financeiras e acompanhe os registros de cada titular.' },
    { id: 'agendamentos', label: 'Agendamentos', title: 'Agendamentos financeiros', copy: 'Visualize compromissos, cobrancas e operacoes programadas.' }
];



export function renderFinanceiroView(container, storageKey) {
    const options = (storageKey && typeof storageKey === 'object') ? storageKey : { storageKey };
    const resolvedStorageKey = options.storageKey || '';
    const initialStateInput = Object.prototype.hasOwnProperty.call(options, 'initialState') ? options.initialState : null;
    const persistPreference = typeof options.onPersist === 'function' ? options.onPersist : null;
    const reloadPreference = typeof options.onReload === 'function' ? options.onReload : null;
    const notifySyncStateChange = typeof options.onSyncStateChange === 'function' ? options.onSyncStateChange : null;
    const defaultFinanceState = {
        version: 1,
        userScoped: true,
        activeTab: 'caixa',
        itemsByTab: {
            caixa: [],
            fichas: [],
            agendamentos: []
        },
        descriptionMemory: [],
        categories: [],
        entries: [],
        snapshots: [],
        updatedAt: null
    };
    const initialSyncMeta = normalizeFinanceSyncResult(initialStateInput);
    const existingState = initialSyncMeta?.state ?? loadUserScopedJsonStorage(resolvedStorageKey, null);
    const financeState = existingState && typeof existingState === 'object'
        ? {
            ...defaultFinanceState,
            ...existingState,
            userScoped: true
        }
        : defaultFinanceState;

    const state = {
        ...financeState,
        activeTab: FINANCE_TABS.some((tab) => tab.id === financeState.activeTab) ? financeState.activeTab : 'caixa',
        cashboxViewMode: financeState.cashboxViewMode === 'lista' ? 'lista' : 'cards',
        fichaViewMode: financeState.fichaViewMode === 'lista' ? 'lista' : 'cards',
        cashboxFilterMode: 'tudo',
        cashboxFilterMonth: getCurrentMonthValue(),
        cashboxFilterYear: getCurrentYearValue(),
        fichaFilterMode: 'tudo',
        fichaFilterMonth: getCurrentMonthValue(),
        fichaFilterYear: getCurrentYearValue(),
        draftName: '',
        isAdding: false,
        editingItemId: null,
        openMenuId: null,
        detailMenuKey: null,
        selectedCashboxId: null,
        selectedFichaId: null,
        actionModal: null,
        fichaModal: null,
        exportModal: null,
        expandedContractsByFicha: {},
        syncStatus: mapSyncStatusToUi(initialSyncMeta?.syncStatus || 'remote'),
        syncUpdatedAt: initialSyncMeta?.updatedAt || existingState?.updatedAt || null,
        conflictUpdatedAt: null,
        isRefreshingRemote: false
    };

    state.itemsByTab = normalizeItemsByTab(state.itemsByTab);
    const originalFichasSnapshot = JSON.stringify(state.itemsByTab.fichas || []);
    state.itemsByTab.fichas = normalizeFichas(state.itemsByTab.fichas);
    const originalCashboxesSnapshot = JSON.stringify(state.itemsByTab.caixa || []);
    state.itemsByTab.caixa = syncCashboxPaymentsWithFichas(
        normalizeCashboxes(state.itemsByTab.caixa),
        state.itemsByTab.fichas || []
    );
    state.descriptionMemory = Array.isArray(state.descriptionMemory) ? state.descriptionMemory : [];
    if (
        JSON.stringify(state.itemsByTab.caixa || []) !== originalCashboxesSnapshot ||
        JSON.stringify(state.itemsByTab.fichas || []) !== originalFichasSnapshot
    ) {
        if (persistPreference) {
            void persistPreference(state);
        } else {
            saveUserScopedJsonStorage(resolvedStorageKey, state);
        }
    }

    let persistVersion = 0;
    let hasRenderedOnce = false;
    let lastNotifiedSyncStatus = null;
    let lastNotifiedSyncUpdatedAt = null;
    let feedbackTimeoutId = null;

    const canApplyExternalSync = () => !state.isAdding && !state.actionModal && !state.fichaModal && !state.exportModal;

    const applyRemoteStateInPlace = (result, { isManualRefresh = false } = {}) => {
        const normalized = normalizeFinanceSyncResult(result, buildPersistedFinanceState(state));
        const nextUpdatedAt = normalized.updatedAt || normalized.state?.updatedAt || null;
        if (!isManualRefresh && nextUpdatedAt && nextUpdatedAt === (state.updatedAt || null)) {
            return false;
        }
        applyPersistedState(state, normalized.state);
        state.syncStatus = mapSyncStatusToUi(normalized.syncStatus);
        state.syncUpdatedAt = normalized.updatedAt || state.updatedAt || null;
        state.conflictUpdatedAt = null;
        if (resolvedStorageKey) {
            saveUserScopedJsonStorage(resolvedStorageKey, buildPersistedFinanceState(state));
        }
        emitSyncState();
        render();
        return true;
    };

    const showInlineFeedback = (message, tone = 'success') => {
        state.feedbackMessage = String(message || '').trim();
        state.feedbackTone = tone;
        if (feedbackTimeoutId) {
            window.clearTimeout(feedbackTimeoutId);
            feedbackTimeoutId = null;
        }
        if (!state.feedbackMessage) {
            render();
            return;
        }
        feedbackTimeoutId = window.setTimeout(() => {
            feedbackTimeoutId = null;
            state.feedbackMessage = '';
            state.feedbackTone = 'success';
            if (container.isConnected) render();
        }, 2600);
        render();
    };

    const emitSyncState = () => {
        if (!notifySyncStateChange) return;
        if (lastNotifiedSyncStatus === state.syncStatus && lastNotifiedSyncUpdatedAt === state.syncUpdatedAt) return;
        lastNotifiedSyncStatus = state.syncStatus;
        lastNotifiedSyncUpdatedAt = state.syncUpdatedAt;
        notifySyncStateChange({
            status: state.syncStatus,
            updatedAt: state.syncUpdatedAt,
            shouldBlockUnload: ['saving', 'syncing', 'refreshing', 'conflict'].includes(state.syncStatus)
        });
    };

    const persistState = ({ remote = true } = {}) => {
        if (!remote) {
            if (resolvedStorageKey) {
                saveUserScopedJsonStorage(resolvedStorageKey, buildPersistedFinanceState(state));
            }
            return;
        }
        const baseUpdatedAt = state.syncUpdatedAt || state.updatedAt || null;
        state.updatedAt = new Date().toISOString();
        const snapshot = {
            ...buildPersistedFinanceState(state),
            baseUpdatedAt
        };
        if (persistPreference) {
            state.syncStatus = 'saving';
            const currentVersion = ++persistVersion;
            emitSyncState();
            render();
            void Promise.resolve(persistPreference(snapshot))
                .then((result) => {
                    if (currentVersion !== persistVersion) return;
                    const normalized = normalizeFinanceSyncResult(result, snapshot);
                    if (normalized.syncStatus === 'conflict') {
                        state.syncStatus = 'conflict';
                        state.conflictUpdatedAt = normalized.updatedAt || null;
                        emitSyncState();
                        render();
                        showNoticeModal(
                            'Financeiro desatualizado',
                            normalized.errorMessage || 'Outra aba ou dispositivo salvou uma versão mais recente. Atualize os dados antes de salvar novamente.'
                        );
                        return;
                    }
                    applyPersistedState(state, normalized.state);
                    state.syncStatus = mapSyncStatusToUi(normalized.syncStatus);
                    state.conflictUpdatedAt = null;
                    if (state.syncStatus === 'synced') {
                        state.syncUpdatedAt = normalized.updatedAt || state.updatedAt || new Date().toISOString();
                    }
                    emitSyncState();
                    render();
                })
                .catch(() => {
                    if (currentVersion !== persistVersion) return;
                    state.syncStatus = 'offline';
                    emitSyncState();
                    render();
                });
            return;
        }
        saveUserScopedJsonStorage(resolvedStorageKey, snapshot);
        state.syncStatus = 'synced';
        state.syncUpdatedAt = state.updatedAt;
        state.conflictUpdatedAt = null;
        emitSyncState();
    };

    const handleDetailMenuTrigger = (button) => {
        const key = String(button.dataset.financeDetailMenuTrigger || '');
        state.detailMenuKey = state.detailMenuKey === key ? null : key;
        render();
    };

    const handleDetailMenuAction = (button) => {
        const activeTab = FINANCE_TABS.find((tab) => tab.id === state.activeTab) || FINANCE_TABS[0];
        const selectedCashbox = activeTab.id === 'caixa'
            ? findItemById(state.itemsByTab.caixa, state.selectedCashboxId)
            : null;
        const selectedFicha = activeTab.id === 'fichas'
            ? findItemById(state.itemsByTab.fichas, state.selectedFichaId)
            : null;
        const action = String(button.dataset.financeDetailAction || '');

        if ((action === 'edit-cashbox-row' || action === 'repeat-cashbox-row') && selectedCashbox) {
            const row = findItemById(selectedCashbox.transactions || [], button.dataset.rowId);
            if (!row) return;
            if (String(row.id).startsWith('ficha-payment-')) {
                const paymentRef = findFichaPaymentReference(state.itemsByTab.fichas || [], String(row.id).replace('ficha-payment-', ''));
                if (!paymentRef) return;
                state.activeTab = 'fichas';
                state.selectedFichaId = paymentRef.fichaId;
                state.selectedCashboxId = null;
                state.fichaModal = {
                    type: 'pagamento',
                    editingContractId: action === 'edit-cashbox-row' ? paymentRef.contractId : undefined,
                    editingEntryId: action === 'edit-cashbox-row' ? paymentRef.entry.id : undefined,
                    linkedContractId: paymentRef.contractId,
                    date: formatDateForInput(paymentRef.entry.date),
                    description: paymentRef.entry.description,
                    value: formatCurrency(Math.abs(parseCurrencyValue(paymentRef.entry.value || '')))
                };
                state.detailMenuKey = null;
                render();
                container.querySelector('[name="ficha_linked_contract"]')?.focus();
                return;
            }
            state.actionModal = {
                type: row.transferId ? 'retirada' : (row.type || (row.credit ? 'entrada' : 'debito')),
                date: formatDateForInput(row.isoDate || parseInputDateToIso(row.date)),
                description: row.description || '',
                value: formatCurrency(Math.abs(parseCurrencyValue(row.credit || row.debit || ''))),
                editingTransactionId: action === 'edit-cashbox-row' ? row.id : undefined,
                editingTransferId: action === 'edit-cashbox-row' ? row.transferId || '' : '',
                transferDirection: action === 'edit-cashbox-row' ? row.transferDirection || '' : '',
                destinationCashboxId: row.transferDirection === 'outgoing' ? (row.counterpartCashboxId || '') : ''
            };
            state.detailMenuKey = null;
            render();
            container.querySelector('[name="cashbox_action_date"]')?.focus();
            return;
        }

        if (action === 'delete-cashbox-row' && selectedCashbox) {
            const row = findItemById(selectedCashbox.transactions || [], button.dataset.rowId);
            if (!row) return;
            if (String(row.id).startsWith('ficha-payment-')) {
                const paymentRef = findFichaPaymentReference(state.itemsByTab.fichas || [], String(row.id).replace('ficha-payment-', ''));
                if (!paymentRef) return;
                showConfirmModal('Excluir lançamento', `Deseja excluir o lançamento "${paymentRef.entry.description}"?`, async () => {
                    state.itemsByTab.fichas = (state.itemsByTab.fichas || []).map((ficha) => (
                        String(ficha.id) === String(paymentRef.fichaId)
                            ? {
                                ...ficha,
                                contracts: (ficha.contracts || []).map((contract) => (
                                    String(contract.id) === String(paymentRef.contractId)
                                        ? {
                                            ...contract,
                                            payments: (contract.payments || []).filter((payment) => String(payment.id) !== String(paymentRef.entry.id))
                                        }
                                        : contract
                                ))
                            }
                            : ficha
                    )).map((ficha) => ({ ...ficha, ...buildFichaCardMetrics(ficha.contracts || []) }));
                    state.itemsByTab.caixa = syncCashboxPaymentsWithFichas(state.itemsByTab.caixa || [], state.itemsByTab.fichas || []);
                    state.detailMenuKey = null;
                    persistState();
                    render();
                });
                return;
            }
            showConfirmModal('Excluir lançamento', `Deseja excluir o lançamento "${row.description}"?`, async () => {
                state.itemsByTab.caixa = row.transferId
                    ? deleteCashboxTransfer(state.itemsByTab.caixa || [], row.transferId)
                    : (state.itemsByTab.caixa || []).map((cashbox) => {
                        if (String(cashbox.id) !== String(selectedCashbox.id)) return cashbox;
                        const nextTransactions = (cashbox.transactions || []).filter((item) => String(item.id) !== String(row.id));
                        return {
                            ...cashbox,
                            transactions: recomputeCashboxBalances(nextTransactions),
                            ...buildCashboxCardMetrics(recomputeCashboxBalances(nextTransactions))
                        };
                    });
                state.detailMenuKey = null;
                persistState();
                render();
            });
            return;
        }

        if (action === 'edit-contract' && selectedFicha) {
            const contract = findContractById(selectedFicha.contracts, button.dataset.contractId);
            if (!contract) return;
            state.fichaModal = {
                type: 'contrato',
                editingContractId: contract.id,
                date: formatDateForInput(contract.createdAt),
                description: contract.description,
                value: formatCurrency(contract.amount),
                cashboxId: contract.cashboxId
            };
            state.detailMenuKey = null;
            render();
            container.querySelector('[name="ficha_contract_description"]')?.focus();
            return;
        }

        if (action === 'delete-contract' && selectedFicha) {
            const contract = findContractById(selectedFicha.contracts, button.dataset.contractId);
            if (!contract) return;
            showConfirmModal('Excluir contrato', `Deseja excluir o contrato "${contract.description}"?`, async () => {
                state.itemsByTab.fichas = (state.itemsByTab.fichas || []).map((ficha) => {
                    if (String(ficha.id) !== String(selectedFicha.id)) return ficha;
                    const nextContracts = (ficha.contracts || []).filter((item) => String(item.id) !== String(contract.id));
                    return { ...ficha, contracts: nextContracts, ...buildFichaCardMetrics(nextContracts) };
                });
                state.itemsByTab.caixa = syncCashboxPaymentsWithFichas(state.itemsByTab.caixa || [], state.itemsByTab.fichas || []);
                state.detailMenuKey = null;
                persistState();
                render();
            });
            return;
        }

        if (action === 'edit-entry' || action === 'delete-entry' || action === 'repeat-entry') {
            const actionFicha = button.dataset.fichaId
                ? findItemById(state.itemsByTab.fichas, button.dataset.fichaId)
                : selectedFicha;
            const contract = findContractById(actionFicha?.contracts, button.dataset.contractId);
            const entryType = String(button.dataset.entryType || '');
            const collectionKey = getFichaEntryCollectionKey(entryType);
            const entry = findItemById(contract?.[collectionKey] || [], button.dataset.entryId);
            if (!actionFicha || !contract || !entry) return;

            if (action === 'edit-entry' || action === 'repeat-entry') {
                state.activeTab = 'fichas';
                state.selectedFichaId = actionFicha.id;
                state.selectedCashboxId = null;
                state.expandedContractsByFicha[actionFicha.id] = [contract.id];
                state.fichaModal = {
                    type: entryType === 'payment' ? 'pagamento' : entryType === 'debit' ? 'debito' : 'agendamento',
                    editingContractId: action === 'edit-entry' ? contract.id : undefined,
                    editingEntryId: action === 'edit-entry' ? entry.id : undefined,
                    linkedContractId: contract.id,
                    date: formatDateForInput(entry.date),
                    description: entry.description,
                    value: formatCurrency(Math.abs(parseCurrencyValue(entry.value || '')))
                };
                state.detailMenuKey = null;
                render();
                container.querySelector('[name="ficha_linked_contract"]')?.focus();
                return;
            }

            showConfirmModal('Excluir lançamento', `Deseja excluir o lançamento "${entry.description}"?`, async () => {
                state.itemsByTab.fichas = (state.itemsByTab.fichas || []).map((ficha) => {
                    if (String(ficha.id) !== String(actionFicha.id)) return ficha;
                    const nextContracts = (ficha.contracts || []).map((item) => (
                        String(item.id) === String(contract.id)
                            ? {
                                ...item,
                                [collectionKey]: (item[collectionKey] || []).filter((current) => String(current.id) !== String(entry.id))
                            }
                            : item
                    ));
                    return { ...ficha, contracts: nextContracts, ...buildFichaCardMetrics(nextContracts) };
                });
                state.itemsByTab.caixa = syncCashboxPaymentsWithFichas(state.itemsByTab.caixa || [], state.itemsByTab.fichas || []);
                state.detailMenuKey = null;
                persistState();
                render();
            });
        }
    };

    if (!container.dataset.financeDetailDelegated) {
        container.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const detailActionButton = target.closest('[data-finance-detail-action]');
            if (detailActionButton && container.contains(detailActionButton)) {
                event.preventDefault();
                event.stopPropagation();
                handleDetailMenuAction(detailActionButton);
                return;
            }

            const detailTriggerButton = target.closest('[data-finance-detail-menu-trigger]');
            if (detailTriggerButton && container.contains(detailTriggerButton)) {
                event.preventDefault();
                event.stopPropagation();
                handleDetailMenuTrigger(detailTriggerButton);
            }
        });

        container.dataset.financeDetailDelegated = 'true';
    }

    const render = () => {
        const activeTab = FINANCE_TABS.find((tab) => tab.id === state.activeTab) || FINANCE_TABS[0];
        const activeItems = getSortedFinanceItems(state.itemsByTab[activeTab.id] || [], activeTab.id)
            .map((item) => normalizeFinanceItemForRender(item, activeTab.id, state.itemsByTab.fichas || []));
        const scheduleDashboard = activeTab.id === 'agendamentos'
            ? buildFinanceScheduleDashboard(state.itemsByTab.fichas || [])
            : null;
        const selectedCashbox = activeTab.id === 'caixa'
            ? findItemById(state.itemsByTab.caixa, state.selectedCashboxId)
            : null;
        const selectedFicha = activeTab.id === 'fichas'
            ? findItemById(state.itemsByTab.fichas, state.selectedFichaId)
            : null;
        const shouldShowSyncBar = state.syncStatus !== 'synced' || state.isRefreshingRemote;
        container.classList.add('finance-content-area');
        container.classList.toggle('finance-content-area--detail', !!(selectedCashbox || selectedFicha));
        container.classList.toggle('finance-content-area--cashbox-detail', !!selectedCashbox);

        container.innerHTML = `
            <section class="finance-home ${(selectedCashbox || selectedFicha) ? 'finance-home--detail' : ''} ${hasRenderedOnce ? '' : 'animate-fade-in'}">
                <div class="finance-home__shell">
                    <div class="finance-home__toolbar client-master-header">
                        <div class="finance-home__tabs" role="tablist" aria-label="Visualizacao do financeiro">
                            ${FINANCE_TABS.map((tab) => `
                                <button
                                    type="button"
                                    class="finance-home__tab ${tab.id === activeTab.id ? 'is-active' : ''}"
                                    data-finance-tab="${tab.id}"
                                    role="tab"
                                    aria-selected="${tab.id === activeTab.id ? 'true' : 'false'}"
                                >
                                    ${tab.label}
                                </button>
                            `).join('')}
                        </div>
                        ${shouldShowSyncBar ? `
                            <div class="finance-home__syncbar">
                                <div class="finance-sync-pill finance-sync-pill--${escapeAttribute(state.syncStatus)}">
                                    <span class="finance-sync-pill__dot" aria-hidden="true"></span>
                                    <div>
                                        <strong>${getFinanceSyncLabel(state.syncStatus)}</strong>
                                        <span>${getFinanceSyncHint(state.syncStatus, state.syncUpdatedAt, state.conflictUpdatedAt)}</span>
                                    </div>
                                </div>
                                ${state.syncStatus === 'offline' || state.syncStatus === 'conflict' || state.isRefreshingRemote ? `
                                    <button
                                        type="button"
                                        class="btn-pill finance-home__refresh-button"
                                        data-finance-refresh
                                        ${state.isRefreshingRemote ? 'disabled' : ''}
                                    >
                                        ${state.isRefreshingRemote ? 'Atualizando...' : 'Atualizar agora'}
                                    </button>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                    ${state.feedbackMessage ? `
                        <div class="finance-feedback finance-feedback--${escapeAttribute(state.feedbackTone || 'success')}" role="status" aria-live="polite">
                            ${escapeHtml(state.feedbackMessage)}
                        </div>
                    ` : ''}

                    ${selectedCashbox ? renderCashboxDetailView(selectedCashbox, state.itemsByTab.fichas || [], state.detailMenuKey, state.cashboxFilterMode, state.cashboxFilterMonth, state.cashboxFilterYear) : selectedFicha ? renderFichaDetailView(selectedFicha, state.itemsByTab.caixa || [], state.detailMenuKey, state.fichaFilterMode, state.fichaFilterMonth, state.fichaFilterYear, state.expandedContractsByFicha[selectedFicha.id] || []) : `
                        <div class="finance-home__body">
                            <div class="finance-home__actions">
                                ${activeTab.id === 'agendamentos' ? `
                                    <button
                                        type="button"
                                        class="btn-pill finance-schedule__open-fichas"
                                        data-finance-open-fichas
                                    >
                                        Abrir fichas
                                    </button>
                                ` : `
                                    <button
                                        type="button"
                                        class="client-master-add"
                                        data-finance-add="${activeTab.id}"
                                        aria-label="Adicionar ${activeTab.label}"
                                        title="Adicionar ${activeTab.label}"
                                    >
                                        ${renderAddIcon()}
                                    </button>
                                `}
                                ${activeTab.id === 'caixa' || activeTab.id === 'fichas' ? `
                                    <div class="finance-view-switch" role="tablist" aria-label="Modo de visualizacao de ${activeTab.id === 'caixa' ? 'caixas' : 'fichas'}">
                                        <button
                                            type="button"
                                            class="finance-view-switch__button ${(activeTab.id === 'caixa' ? state.cashboxViewMode : state.fichaViewMode) === 'cards' ? 'is-active' : ''}"
                                            ${activeTab.id === 'caixa' ? 'data-cashbox-view-mode="cards"' : 'data-ficha-view-mode="cards"'}
                                        >
                                            Cards
                                        </button>
                                        <button
                                            type="button"
                                            class="finance-view-switch__button ${(activeTab.id === 'caixa' ? state.cashboxViewMode : state.fichaViewMode) === 'lista' ? 'is-active' : ''}"
                                            ${activeTab.id === 'caixa' ? 'data-cashbox-view-mode="lista"' : 'data-ficha-view-mode="lista"'}
                                        >
                                            Lista
                                        </button>
                                    </div>
                                ` : ''}
                                <div>
                                    <p class="label-tech">Visualizacao ativa</p>
                                    <p class="finance-home__section-copy">${activeTab.copy}</p>
                                </div>
                            </div>

                            ${activeTab.id === 'agendamentos' ? renderFinanceScheduleDashboard(scheduleDashboard, activeItems, state.openMenuId, state.detailMenuKey) : `
                            <div class="${((activeTab.id === 'fichas' && state.fichaViewMode === 'lista') || (activeTab.id === 'caixa' && state.cashboxViewMode === 'lista')) ? 'finance-list' : 'finance-home__cards-grid'}">
                                ${activeItems.length === 0 ? `
                                    <article class="finance-card finance-card--empty">
                                        <div class="finance-card__empty-copy">
                                            <p class="label-tech">${activeTab.label}</p>
                                            <strong>Nenhum item criado</strong>
                                            <span>Use o botao adicionar para iniciar esta secao.</span>
                                        </div>
                                    </article>
                                ` : activeItems.map((item) => (
                                    ((activeTab.id === 'fichas' && state.fichaViewMode === 'lista') || (activeTab.id === 'caixa' && state.cashboxViewMode === 'lista'))
                                        ? renderFinanceListRow(item, state.openMenuId)
                                        : renderFinanceCard(item, state.openMenuId)
                                )).join('')}
                            </div>
                            `}
                        </div>
                    `}
                </div>

                ${(activeTab.id === 'caixa' || activeTab.id === 'fichas') && state.isAdding ? `
                    <div class="finance-modal-backdrop" data-finance-cancel-add>
                        <div class="finance-modal-card" role="dialog" aria-modal="true" aria-label="Adicionar ${activeTab.label}">
                            <form class="finance-home__create-form" data-finance-create-form="${activeTab.id}">
                                <div class="finance-modal-head">
                                    <p class="label-tech">Novo registro</p>
                                    <h3 class="font-black">
                                        ${state.editingItemId
                                            ? (activeTab.id === 'caixa' ? 'Editar Caixa' : 'Editar Ficha')
                                            : (activeTab.id === 'caixa' ? 'Adicionar Caixa' : 'Adicionar Ficha')}
                                    </h3>
                                </div>
                                <label class="finance-home__create-field">
                                    <span class="label-tech">${activeTab.id === 'caixa' ? 'Nome do caixa' : 'Nome da ficha'}</span>
                                    <input
                                        type="text"
                                        name="item_name"
                                        value="${escapeAttribute(state.draftName || '')}"
                                        placeholder="${activeTab.id === 'caixa' ? 'Ex.: Geoconsult' : 'Ex.: Ficha Guilherme'}"
                                        required
                                    />
                                </label>
                                <div class="finance-home__create-actions">
                                    <button type="button" class="btn-pill" data-finance-cancel-add>Cancelar</button>
                                    <button type="submit" class="btn-pill btn-black">Salvar</button>
                                </div>
                            </form>
                        </div>
                    </div>
                ` : ''}

                ${selectedCashbox && state.actionModal ? renderCashboxActionModal(state.actionModal, state.descriptionMemory, state.itemsByTab.caixa || [], selectedCashbox.id) : ''}
                ${selectedFicha && state.fichaModal ? renderFichaActionModal(state.fichaModal, selectedFicha, state.itemsByTab.caixa || []) : ''}
                ${state.exportModal ? renderFinanceExportModal(state.exportModal, buildFinanceExportPreview({
                    context: state.exportModal.context,
                    cashbox: selectedCashbox,
                    ficha: selectedFicha,
                    cashboxFilterMode: state.cashboxFilterMode,
                    cashboxFilterMonth: state.cashboxFilterMonth,
                    cashboxFilterYear: state.cashboxFilterYear,
                    fichaFilterMode: state.fichaFilterMode,
                    fichaFilterMonth: state.fichaFilterMonth,
                    fichaFilterYear: state.fichaFilterYear
                })) : ''}
            </section>
        `;

        container.querySelectorAll('[data-finance-tab]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextTab = String(button.dataset.financeTab || '');
                if (!FINANCE_TABS.some((tab) => tab.id === nextTab) || nextTab === state.activeTab) return;
                state.activeTab = nextTab;
                state.openMenuId = null;
                state.detailMenuKey = null;
                state.isAdding = false;
                state.editingItemId = null;
                state.draftName = '';
                state.selectedCashboxId = null;
                state.selectedFichaId = null;
                state.actionModal = null;
                state.fichaModal = null;
                state.exportModal = null;
                persistState({ remote: false });
                render();
            });
        });

        const refreshRemoteState = async () => {
            if (!reloadPreference || state.isRefreshingRemote) return;
            state.isRefreshingRemote = true;
            state.syncStatus = 'refreshing';
            emitSyncState();
            render();
            try {
                const result = await reloadPreference();
                applyRemoteStateInPlace(result, { isManualRefresh: true });
            } catch {
                state.syncStatus = 'offline';
                emitSyncState();
            } finally {
                state.isRefreshingRemote = false;
                render();
            }
        };

        container.querySelector('[data-finance-refresh]')?.addEventListener('click', () => {
            if (state.syncStatus === 'conflict') {
                showConfirmModal(
                    'Atualizar financeiro',
                    'Existe uma versão mais recente no servidor. Atualizar agora recarrega os dados remotos e interrompe o salvamento desta tela.',
                    refreshRemoteState,
                    { confirmText: 'ATUALIZAR', confirmingText: 'ATUALIZANDO...', icon: 'refresh' }
                );
                return;
            }
            void refreshRemoteState();
        });

        container.querySelector('[data-finance-export-open]')?.addEventListener('click', () => {
            const context = selectedCashbox ? 'caixa' : selectedFicha ? 'ficha' : '';
            if (!context) return;
            state.exportModal = createFinanceExportModalState(context);
            state.detailMenuKey = null;
            render();
        });

        container.querySelectorAll('[data-finance-export-cancel]').forEach((node) => {
            node.addEventListener('click', (event) => {
                if (event.target !== node && node.classList.contains('finance-modal-backdrop')) return;
                if (state.exportModal?.isDownloading) return;
                state.exportModal = null;
                render();
            });
        });

        container.querySelectorAll('[data-finance-export-option]').forEach((input) => {
            input.addEventListener('change', () => {
                if (!state.exportModal) return;
                const optionId = String(input.dataset.financeExportOption || '');
                state.exportModal.selected = {
                    ...(state.exportModal.selected || {}),
                    [optionId]: Boolean(input.checked)
                };
            });
        });

        container.querySelectorAll('[data-finance-export-format]').forEach((button) => {
            button.addEventListener('click', async () => {
                if (!state.exportModal || state.exportModal.isDownloading) return;
                const format = String(button.dataset.financeExportFormat || '');
                const exportData = buildFinanceExportData({
                    context: state.exportModal.context,
                    selected: state.exportModal.selected,
                    cashbox: selectedCashbox,
                    ficha: selectedFicha,
                    cashboxes: state.itemsByTab.caixa || [],
                    fichas: state.itemsByTab.fichas || [],
                    cashboxFilterMode: state.cashboxFilterMode,
                    cashboxFilterMonth: state.cashboxFilterMonth,
                    cashboxFilterYear: state.cashboxFilterYear,
                    fichaFilterMode: state.fichaFilterMode,
                    fichaFilterMonth: state.fichaFilterMonth,
                    fichaFilterYear: state.fichaFilterYear
                });

                if (!exportData.sections.length) {
                    showNoticeModal('Download financeiro', 'Selecione pelo menos um item para baixar.');
                    return;
                }

                state.exportModal = {
                    ...state.exportModal,
                    isDownloading: true,
                    activeFormat: format
                };
                render();

                try {
                    if (format === 'pdf') {
                        await downloadFinancePdf(exportData);
                    } else if (format === 'excel') {
                        await downloadFinanceExcel(exportData);
                    }
                    state.exportModal = null;
                    render();
                    showInlineFeedback(format === 'pdf' ? 'PDF financeiro gerado com sucesso.' : 'Excel financeiro gerado com sucesso.');
                } catch (error) {
                    state.exportModal = {
                        ...state.exportModal,
                        isDownloading: false,
                        activeFormat: null
                    };
                    render();
                    showNoticeModal('Download financeiro', error?.message || 'Nao foi possivel gerar o arquivo.');
                }
            });
        });

        container.querySelectorAll('[data-cashbox-view-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextMode = String(button.dataset.cashboxViewMode || '');
                if (!['cards', 'lista'].includes(nextMode) || nextMode === state.cashboxViewMode) return;
                state.cashboxViewMode = nextMode;
                persistState({ remote: false });
                render();
            });
        });

        container.querySelectorAll('[data-ficha-view-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextMode = String(button.dataset.fichaViewMode || '');
                if (!['cards', 'lista'].includes(nextMode) || nextMode === state.fichaViewMode) return;
                state.fichaViewMode = nextMode;
                persistState({ remote: false });
                render();
            });
        });

        container.querySelector('[data-finance-back]')?.addEventListener('click', () => {
            state.selectedCashboxId = null;
            state.selectedFichaId = null;
            state.cashboxFilterMode = 'tudo';
            state.cashboxFilterMonth = getCurrentMonthValue();
            state.cashboxFilterYear = getCurrentYearValue();
            state.fichaFilterMode = 'tudo';
            state.fichaFilterMonth = getCurrentMonthValue();
            state.fichaFilterYear = getCurrentYearValue();
            state.exportModal = null;
            render();
        });

        container.querySelector('[data-finance-open-fichas]')?.addEventListener('click', () => {
            state.activeTab = 'fichas';
            state.selectedCashboxId = null;
            state.selectedFichaId = null;
            state.openMenuId = null;
            state.detailMenuKey = null;
            state.exportModal = null;
            persistState({ remote: false });
            render();
        });

        container.querySelectorAll('[data-finance-schedule-open]').forEach((node) => {
            const openSchedule = () => {
                const fichaId = String(node.dataset.fichaId || '');
                const contractId = String(node.dataset.contractId || '');
                const ficha = findItemById(state.itemsByTab.fichas, fichaId);
                if (!ficha) return;
                state.activeTab = 'fichas';
                state.selectedFichaId = ficha.id;
                state.selectedCashboxId = null;
                state.openMenuId = null;
                state.detailMenuKey = null;
                if (contractId) {
                    state.expandedContractsByFicha[ficha.id] = [contractId];
                }
                persistState({ remote: false });
                render();
            };

            node.addEventListener('click', (event) => {
                if (event.target instanceof Element && event.target.closest('.finance-card__menu-wrap')) return;
                openSchedule();
            });
            node.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openSchedule();
            });
        });

        container.querySelectorAll('[data-cashbox-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextMode = String(button.dataset.cashboxFilter || 'tudo');
                if (!['mensal', 'anual', 'tudo'].includes(nextMode) || nextMode === state.cashboxFilterMode) return;
                state.cashboxFilterMode = nextMode;
                if (nextMode === 'mensal' && !/^\d{4}-\d{2}$/.test(state.cashboxFilterMonth || '')) {
                    state.cashboxFilterMonth = getCurrentMonthValue();
                }
                if (nextMode === 'anual' && !/^\d{4}$/.test(state.cashboxFilterYear || '')) {
                    state.cashboxFilterYear = getCurrentYearValue();
                }
                render();
            });
        });

        container.querySelectorAll('[data-ficha-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextMode = String(button.dataset.fichaFilter || 'tudo');
                if (!['mensal', 'anual', 'tudo'].includes(nextMode) || nextMode === state.fichaFilterMode) return;
                state.fichaFilterMode = nextMode;
                if (nextMode === 'mensal' && !/^\d{4}-\d{2}$/.test(state.fichaFilterMonth || '')) {
                    state.fichaFilterMonth = getCurrentMonthValue();
                }
                if (nextMode === 'anual' && !/^\d{4}$/.test(state.fichaFilterYear || '')) {
                    state.fichaFilterYear = getCurrentYearValue();
                }
                render();
            });
        });

        container.querySelectorAll('[data-cashbox-month]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextMonth = String(button.dataset.cashboxMonth || '');
                if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
                state.cashboxFilterMonth = nextMonth;
                render();
            });
        });

        container.querySelector('[name="cashbox_filter_year"]')?.addEventListener('change', (event) => {
            const nextYear = String(event.currentTarget.value || '');
            if (!/^\d{4}$/.test(nextYear)) return;
            state.cashboxFilterYear = nextYear;
            render();
        });

        container.querySelector('[name="cashbox_filter_month_year"]')?.addEventListener('change', (event) => {
            const nextYear = String(event.currentTarget.value || '');
            if (!/^\d{4}$/.test(nextYear)) return;
            const currentMonth = state.cashboxFilterMonth || getCurrentMonthValue();
            const [_, currentM] = currentMonth.split('-');
            state.cashboxFilterMonth = `${nextYear}-${currentM}`;
            render();
        });

        container.querySelectorAll('[data-ficha-month]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextMonth = String(button.dataset.fichaMonth || '');
                if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
                state.fichaFilterMonth = nextMonth;
                render();
            });
        });

        container.querySelector('[name="ficha_filter_year"]')?.addEventListener('change', (event) => {
            const nextYear = String(event.currentTarget.value || '');
            if (!/^\d{4}$/.test(nextYear)) return;
            state.fichaFilterYear = nextYear;
            render();
        });

        container.querySelector('[name="ficha_filter_month_year"]')?.addEventListener('change', (event) => {
            const nextYear = String(event.currentTarget.value || '');
            if (!/^\d{4}$/.test(nextYear)) return;
            const currentMonth = state.fichaFilterMonth || getCurrentMonthValue();
            const [_, currentM] = currentMonth.split('-');
            state.fichaFilterMonth = `${nextYear}-${currentM}`;
            render();
        });

        container.querySelectorAll('[data-ficha-contract-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                if (!selectedFicha) return;
                const contractId = String(button.dataset.fichaContractToggle || '');
                if (!contractId) return;
                const currentExpanded = Array.isArray(state.expandedContractsByFicha[selectedFicha.id])
                    ? state.expandedContractsByFicha[selectedFicha.id]
                    : [];
                const nextExpanded = currentExpanded.includes(contractId)
                    ? currentExpanded.filter((id) => id !== contractId)
                    : [...currentExpanded, contractId];
                state.expandedContractsByFicha[selectedFicha.id] = nextExpanded;
                render();
            });
        });

        container.querySelectorAll('[data-cashbox-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const action = String(button.dataset.cashboxAction || '');
                state.actionModal = {
                    type: action,
                    date: formatDateForInput(new Date().toISOString().slice(0, 10)),
                    description: '',
                    value: '',
                    destinationCashboxId: ''
                };
                render();
                container.querySelector('[name="cashbox_action_date"]')?.focus();
            });
        });

        container.querySelectorAll('[data-ficha-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const action = String(button.dataset.fichaAction || '');
                state.fichaModal = createFichaModalState(action);
                render();
                const firstField = action === 'contrato'
                    ? '[name="ficha_contract_description"]'
                    : '[name="ficha_linked_contract"]';
                container.querySelector(firstField)?.focus();
            });
        });

        container.querySelectorAll('[data-ficha-modal-cancel]').forEach((node) => {
            node.addEventListener('click', (event) => {
                if (event.target !== node && node.classList.contains('finance-modal-backdrop')) return;
                state.fichaModal = null;
                render();
            });
        });

        container.querySelector('[data-ficha-action-form]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!selectedFicha || !state.fichaModal) return;
            const formData = new FormData(event.currentTarget);
            const previousFicha = selectedFicha;
            const nextFichas = (state.itemsByTab.fichas || []).map((ficha) => {
                if (String(ficha.id) !== String(selectedFicha.id)) return ficha;
                return applyFichaModalSubmission(ficha, state.fichaModal, formData);
            });
            const updatedFicha = findItemById(nextFichas, selectedFicha.id);
            state.itemsByTab.fichas = nextFichas;

            if (previousFicha && updatedFicha) {
                state.itemsByTab.caixa = syncCashboxPaymentsWithFichas(
                    state.itemsByTab.caixa || [],
                    state.itemsByTab.fichas || []
                );
            }

            state.fichaModal = null;
            persistState();
            render();
            showInlineFeedback('Lançamento da ficha salvo com sucesso.');
        });

        container.querySelector('[name="ficha_contract_value"]')?.addEventListener('input', (event) => {
            event.currentTarget.value = formatCurrencyTyping(String(event.currentTarget.value || ''));
        });

        container.querySelector('[name="ficha_contract_date"]')?.addEventListener('input', (event) => {
            event.currentTarget.value = formatDateTyping(String(event.currentTarget.value || ''));
        });

        container.querySelector('[name="ficha_action_date"]')?.addEventListener('input', (event) => {
            event.currentTarget.value = formatDateTyping(String(event.currentTarget.value || ''));
        });

        container.querySelector('[name="ficha_action_value"]')?.addEventListener('input', (event) => {
            event.currentTarget.value = formatCurrencyTyping(String(event.currentTarget.value || ''));
        });

        container.querySelector('[data-ficha-action-form]')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            const target = event.target;
            if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
            const orderedFields = Array.from(container.querySelectorAll('[data-ficha-action-form] input, [data-ficha-action-form] select'));
            const currentIndex = orderedFields.indexOf(target);
            if (currentIndex < 0) return;
            if (currentIndex < orderedFields.length - 1) {
                event.preventDefault();
                orderedFields[currentIndex + 1]?.focus();
                return;
            }
            event.preventDefault();
            container.querySelector('[data-ficha-action-form]')?.requestSubmit();
        });

        container.querySelectorAll('[data-cashbox-action-cancel]').forEach((node) => {
            node.addEventListener('click', (event) => {
                if (event.target !== node && node.classList.contains('finance-modal-backdrop')) return;
                state.actionModal = null;
                render();
            });
        });

        container.querySelector('[data-cashbox-action-form]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!selectedCashbox || !state.actionModal) return;

            const formData = new FormData(event.currentTarget);
            const dateInput = String(formData.get('cashbox_action_date') || '').trim();
            const description = String(formData.get('cashbox_action_description') || '').trim();
            const valueInput = String(formData.get('cashbox_action_value') || '').trim();
            const destinationCashboxId = String(formData.get('cashbox_destination_cashbox') || '').trim();
            const date = parseInputDateToIso(dateInput);
            const numericValue = parseCurrencyInput(valueInput);

            if (!date || !description || !Number.isFinite(numericValue) || numericValue <= 0) {
                showNoticeModal('Caixa', 'Preencha data, descricao e um valor valido.');
                return;
            }

            if (state.actionModal.type === 'retirada' && state.actionModal.transferDirection === 'incoming') {
                showNoticeModal('Caixa', 'Edite esta transferencia pelo caixa de origem.');
                return;
            }

            if (state.actionModal.type === 'retirada' && !destinationCashboxId) {
                showNoticeModal('Caixa', 'Selecione o caixa de destino da transferencia.');
                return;
            }

            if (state.actionModal.type === 'retirada' && String(destinationCashboxId) === String(selectedCashbox.id)) {
                showNoticeModal('Caixa', 'Selecione um caixa de destino diferente do caixa atual.');
                return;
            }

            const updatedCashboxes = state.actionModal.type === 'retirada'
                ? (
                    state.actionModal.editingTransferId
                        ? updateCashboxTransfer(state.itemsByTab.caixa || [], state.actionModal.editingTransferId, {
                            sourceCashboxId: selectedCashbox.id,
                            destinationCashboxId,
                            date,
                            description,
                            value: numericValue
                        })
                        : createCashboxTransfer(state.itemsByTab.caixa || [], {
                            sourceCashboxId: selectedCashbox.id,
                            destinationCashboxId,
                            date,
                            description,
                            value: numericValue
                        })
                )
                : (state.itemsByTab.caixa || []).map((item) => {
                    if (String(item.id) !== String(selectedCashbox.id)) return item;
                    const nextTransactions = state.actionModal.editingTransactionId
                        ? updateCashboxTransactionList(item.transactions, state.actionModal.editingTransactionId, {
                            type: state.actionModal.type,
                            date,
                            description,
                            value: numericValue
                        })
                        : buildCashboxTransactionList(item.transactions, {
                            type: state.actionModal.type,
                            date,
                            description,
                            value: numericValue
                        });
                    return {
                        ...item,
                        transactions: nextTransactions,
                        ...buildCashboxCardMetrics(nextTransactions)
                    };
                });

            state.itemsByTab.caixa = updatedCashboxes;
            state.descriptionMemory = updateDescriptionMemory(state.descriptionMemory, description);
            state.actionModal = null;
            persistState();
            render();
            showInlineFeedback('Movimentacao de caixa registrada com sucesso.');
        });

        container.querySelector('[name="cashbox_action_date"]')?.addEventListener('input', (event) => {
            const formatted = formatDateTyping(String(event.currentTarget.value || ''));
            event.currentTarget.value = formatted;
            if (state.actionModal) state.actionModal.date = formatted;
        });

        container.querySelector('[name="cashbox_action_value"]')?.addEventListener('input', (event) => {
            const formatted = formatCurrencyTyping(String(event.currentTarget.value || ''));
            event.currentTarget.value = formatted;
            if (state.actionModal) state.actionModal.value = formatted;
        });

        container.querySelector('[name="cashbox_destination_cashbox"]')?.addEventListener('change', (event) => {
            if (state.actionModal) state.actionModal.destinationCashboxId = String(event.currentTarget.value || '');
        });

        const descriptionInput = container.querySelector('[name="cashbox_action_description"]');
        const descriptionMemoryList = container.querySelector('[data-description-memory-list]');
        let activeDescriptionMemoryIndex = -1;
        let currentDescriptionSuggestions = [];

        const applyDescriptionSuggestion = (value) => {
            if (!state.actionModal || !descriptionInput) return;
            state.actionModal.description = value;
            descriptionInput.value = value;
            activeDescriptionMemoryIndex = -1;
            refreshDescriptionMemoryList(value);
            descriptionInput.focus();
        };

        const refreshDescriptionMemoryList = (query) => {
            if (!descriptionMemoryList) return;
            currentDescriptionSuggestions = filterDescriptionMemory(state.descriptionMemory, query);
            if (activeDescriptionMemoryIndex >= currentDescriptionSuggestions.length) {
                activeDescriptionMemoryIndex = currentDescriptionSuggestions.length - 1;
            }
            if (currentDescriptionSuggestions.length === 0) {
                activeDescriptionMemoryIndex = -1;
            }
            descriptionMemoryList.innerHTML = renderDescriptionMemoryOptions(currentDescriptionSuggestions, activeDescriptionMemoryIndex);
            descriptionMemoryList.classList.toggle('is-hidden', currentDescriptionSuggestions.length === 0);
            descriptionMemoryList.querySelectorAll('[data-description-memory-item]').forEach((button) => {
                button.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    const value = String(button.dataset.descriptionMemoryItem || '');
                    applyDescriptionSuggestion(value);
                });
            });
        };

        const updateActiveDescriptionSuggestion = (nextIndex) => {
            if (!descriptionMemoryList || currentDescriptionSuggestions.length === 0) return;
            activeDescriptionMemoryIndex = nextIndex;
            descriptionMemoryList.innerHTML = renderDescriptionMemoryOptions(currentDescriptionSuggestions, activeDescriptionMemoryIndex);
            descriptionMemoryList.classList.remove('is-hidden');
            descriptionMemoryList.querySelectorAll('[data-description-memory-item]').forEach((button) => {
                button.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    const value = String(button.dataset.descriptionMemoryItem || '');
                    applyDescriptionSuggestion(value);
                });
            });
            descriptionMemoryList.querySelector('.finance-description-memory__item.is-active')?.scrollIntoView({ block: 'nearest' });
        };

        descriptionInput?.addEventListener('input', (event) => {
            const value = String(event.currentTarget.value || '');
            if (state.actionModal) state.actionModal.description = value;
             activeDescriptionMemoryIndex = -1;
            refreshDescriptionMemoryList(value);
        });

        descriptionInput?.addEventListener('focus', (event) => {
            activeDescriptionMemoryIndex = -1;
            refreshDescriptionMemoryList(String(event.currentTarget.value || ''));
        });

        descriptionInput?.addEventListener('blur', () => {
            window.setTimeout(() => {
                activeDescriptionMemoryIndex = -1;
                descriptionMemoryList?.classList.add('is-hidden');
            }, 120);
        });

        descriptionInput?.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                if (currentDescriptionSuggestions.length === 0) return;
                event.preventDefault();
                event.stopPropagation();
                const nextIndex = activeDescriptionMemoryIndex < currentDescriptionSuggestions.length - 1
                    ? activeDescriptionMemoryIndex + 1
                    : 0;
                updateActiveDescriptionSuggestion(nextIndex);
                return;
            }

            if (event.key === 'ArrowUp') {
                if (currentDescriptionSuggestions.length === 0) return;
                event.preventDefault();
                event.stopPropagation();
                const nextIndex = activeDescriptionMemoryIndex > 0
                    ? activeDescriptionMemoryIndex - 1
                    : currentDescriptionSuggestions.length - 1;
                updateActiveDescriptionSuggestion(nextIndex);
                return;
            }

            if (event.key === 'Enter' && activeDescriptionMemoryIndex >= 0 && currentDescriptionSuggestions[activeDescriptionMemoryIndex]) {
                event.preventDefault();
                event.stopPropagation();
                applyDescriptionSuggestion(currentDescriptionSuggestions[activeDescriptionMemoryIndex]);
                return;
            }

            if (event.key === 'Escape' && currentDescriptionSuggestions.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                activeDescriptionMemoryIndex = -1;
                descriptionMemoryList?.classList.add('is-hidden');
            }
        });

        container.querySelector('[data-cashbox-action-form]')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            const target = event.target;
            if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

            const orderedFields = [
                container.querySelector('[name="cashbox_action_date"]'),
                container.querySelector('[name="cashbox_action_description"]'),
                container.querySelector('[name="cashbox_action_value"]'),
                container.querySelector('[name="cashbox_destination_cashbox"]')
            ].filter(Boolean);

            const currentIndex = orderedFields.indexOf(target);
            if (currentIndex < 0) return;

            if (currentIndex < orderedFields.length - 1) {
                event.preventDefault();
                orderedFields[currentIndex + 1]?.focus();
                return;
            }

            event.preventDefault();
            container.querySelector('[data-cashbox-action-form]')?.requestSubmit();
        });

        container.querySelector('[data-finance-add]')?.addEventListener('click', () => {
            if (activeTab.id === 'caixa' || activeTab.id === 'fichas') {
                state.isAdding = true;
                state.editingItemId = null;
                state.draftName = '';
                state.openMenuId = null;
                render();
                container.querySelector('[name="item_name"]')?.focus();
                return;
            }

            const nextItem = createFinanceItem(activeTab, '');
            state.itemsByTab[activeTab.id] = [nextItem, ...(state.itemsByTab[activeTab.id] || [])];
            persistState();
            render();
            showInlineFeedback('Registro adicionado com sucesso.');
        });

        container.querySelectorAll('[data-finance-card-id]').forEach((card) => {
            card.addEventListener('click', () => {
                const item = findItemById(state.itemsByTab[activeTab.id], card.dataset.financeCardId);
                if (!item) return;
                if (activeTab.id === 'caixa') {
                    state.selectedCashboxId = item.id;
                    state.openMenuId = null;
                    state.detailMenuKey = null;
                    render();
                    return;
                }
                if (activeTab.id === 'fichas') {
                    state.selectedFichaId = item.id;
                    state.openMenuId = null;
                    state.detailMenuKey = null;
                    render();
                    return;
                }
                showInlineFeedback(`Abrindo ${item.title}.`, 'info');
            });
        });

        container.querySelectorAll('[data-finance-menu-trigger]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const itemId = String(button.dataset.financeMenuTrigger || '');
                state.openMenuId = state.openMenuId === itemId ? null : itemId;
                render();
            });
        });

        container.querySelectorAll('[data-finance-menu-action]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const action = String(button.dataset.financeMenuAction || '');
                const itemId = String(button.dataset.financeItemId || '');
                const currentItems = state.itemsByTab[activeTab.id] || [];
                const item = findItemById(currentItems, itemId);
                if (!item) return;

                if (action === 'edit') {
                    if (activeTab.id === 'caixa' || activeTab.id === 'fichas') {
                        state.isAdding = true;
                        state.editingItemId = itemId;
                        state.draftName = item.title || '';
                        state.openMenuId = null;
                        render();
                        container.querySelector('[name="item_name"]')?.focus();
                        return;
                    }
                    showInlineFeedback(`Edicao de ${item.title} sera a proxima etapa.`, 'info');
                    return;
                }

                if (action === 'delete') {
                    state.itemsByTab[activeTab.id] = currentItems.filter((entry) => String(entry.id) !== itemId);
                    state.openMenuId = null;
                    persistState();
                    render();
                    showInlineFeedback(`${item.title} foi excluido.`);
                }
            });
        });

        container.querySelectorAll('[data-finance-cancel-add]').forEach((node) => {
            node.addEventListener('click', (event) => {
                if (event.target !== node && node.classList.contains('finance-modal-backdrop')) return;
                state.isAdding = false;
                state.editingItemId = null;
                state.draftName = '';
                render();
            });
        });

        container.querySelector('[data-finance-create-form]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const itemName = String(formData.get('item_name') || '').trim();
            if (!itemName) return;
            const isEditing = Boolean(state.editingItemId);
            if (isEditing) {
                state.itemsByTab[activeTab.id] = (state.itemsByTab[activeTab.id] || []).map((item) => (
                    String(item.id) === String(state.editingItemId)
                        ? { ...item, title: itemName }
                        : item
                ));
            } else {
                const nextItem = createFinanceItem(activeTab, itemName);
                state.itemsByTab[activeTab.id] = [nextItem, ...(state.itemsByTab[activeTab.id] || [])];
            }
            state.isAdding = false;
            state.editingItemId = null;
            state.draftName = '';
            persistState();
            render();
            showInlineFeedback(
                isEditing
                    ? 'Registro atualizado com sucesso.'
                    : 'Registro adicionado com sucesso.'
            );
        });

        container.querySelector('[data-finance-create-form]')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) return;
            event.preventDefault();
            container.querySelector('[data-finance-create-form]')?.requestSubmit();
        });

        container.querySelector('[name="item_name"]')?.addEventListener('input', (event) => {
            state.draftName = String(event.currentTarget.value || '');
        });

        container.querySelectorAll('.finance-modal-card').forEach((card) => card.addEventListener('click', (event) => {
            event.stopPropagation();
        }));

        emitSyncState();
        hasRenderedOnce = true;
    };

    container.__financeViewController = {
        canApplyExternalSync,
        getUpdatedAt: () => state.updatedAt || null,
        applyRemoteState: (result) => {
            if (!canApplyExternalSync()) return false;
            return applyRemoteStateInPlace(result);
        }
    };

    render();
}

function buildPersistedFinanceState(state) {
    return {
        version: state.version,
        userScoped: true,
        activeTab: state.activeTab,
        itemsByTab: state.itemsByTab,
        descriptionMemory: state.descriptionMemory,
        categories: state.categories,
        entries: state.entries,
        snapshots: state.snapshots,
        cashboxViewMode: state.cashboxViewMode,
        fichaViewMode: state.fichaViewMode,
        updatedAt: state.updatedAt
    };
}

function applyPersistedState(state, nextState) {
    if (!nextState || typeof nextState !== 'object') return;
    state.version = nextState.version || state.version || 1;
    state.userScoped = true;
    state.activeTab = FINANCE_TABS.some((tab) => tab.id === nextState.activeTab) ? nextState.activeTab : state.activeTab;
    state.itemsByTab = normalizeItemsByTab(nextState.itemsByTab);
    state.itemsByTab.fichas = normalizeFichas(state.itemsByTab.fichas);
    state.itemsByTab.caixa = syncCashboxPaymentsWithFichas(
        normalizeCashboxes(state.itemsByTab.caixa),
        state.itemsByTab.fichas || []
    );
    state.descriptionMemory = Array.isArray(nextState.descriptionMemory) ? nextState.descriptionMemory : [];
    state.categories = Array.isArray(nextState.categories) ? nextState.categories : [];
    state.entries = Array.isArray(nextState.entries) ? nextState.entries : [];
    state.snapshots = Array.isArray(nextState.snapshots) ? nextState.snapshots : [];
    state.cashboxViewMode = nextState.cashboxViewMode === 'lista' ? 'lista' : 'cards';
    state.fichaViewMode = nextState.fichaViewMode === 'lista' ? 'lista' : 'cards';
    state.updatedAt = nextState.updatedAt || state.updatedAt || null;
}

function normalizeFinanceSyncResult(result, fallbackState = null) {
    if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'state')) {
        return {
            state: result.state,
            syncStatus: result.syncStatus || 'remote',
            updatedAt: result.updatedAt || result.state?.updatedAt || null,
            errorMessage: result.errorMessage || ''
        };
    }

    return {
        state: result ?? fallbackState,
        syncStatus: 'remote',
        updatedAt: result?.updatedAt || fallbackState?.updatedAt || null
    };
}

function mapSyncStatusToUi(syncStatus) {
    if (syncStatus === 'local-fallback') return 'offline';
    if (syncStatus === 'migrated-local') return 'syncing';
    if (syncStatus === 'remote') return 'synced';
    if (syncStatus === 'conflict') return 'conflict';
    if (syncStatus === 'refreshing') return 'refreshing';
    if (syncStatus === 'saving') return 'saving';
    return syncStatus || 'synced';
}

function getFinanceSyncLabel(syncStatus) {
    if (syncStatus === 'saving' || syncStatus === 'syncing') return 'Salvando na nuvem';
    if (syncStatus === 'refreshing') return 'Atualizando do remoto';
    if (syncStatus === 'conflict') return 'Atualizacao bloqueada';
    if (syncStatus === 'offline') return 'Salvo apenas neste navegador';
    return 'Sincronizado';
}

function getFinanceSyncHint(syncStatus, updatedAt, conflictUpdatedAt = null) {
    const suffix = updatedAt ? `Ultima atualizacao: ${formatSyncTimestamp(updatedAt)}` : '';
    if (syncStatus === 'saving' || syncStatus === 'syncing') return 'Aguarde antes de fechar a pagina.';
    if (syncStatus === 'refreshing') return 'Buscando os dados mais recentes do servidor.';
    if (syncStatus === 'conflict') {
        return conflictUpdatedAt
            ? `Servidor atualizado em ${formatSyncTimestamp(conflictUpdatedAt)}. Rascunho local preservado.`
            : 'O servidor tem uma versao mais recente. Rascunho local preservado neste navegador.';
    }
    if (syncStatus === 'offline') return 'Houve falha de rede. Use "Atualizar agora" depois que a conexao voltar.';
    return suffix || 'Os dados do financeiro ja estao na nuvem.';
}

function formatSyncTimestamp(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'agora';
    return parsed.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderAddIcon() {
    return `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14"></path>
            <path d="M5 12h14"></path>
            <circle cx="12" cy="12" r="9"></circle>
        </svg>
    `;
}

function normalizeItemsByTab(itemsByTab) {
    const safe = itemsByTab && typeof itemsByTab === 'object' ? itemsByTab : {};
    return {
        caixa: Array.isArray(safe.caixa) ? safe.caixa : [],
        fichas: Array.isArray(safe.fichas) ? safe.fichas : [],
        agendamentos: Array.isArray(safe.agendamentos) ? safe.agendamentos : []
    };
}

function normalizeFichas(fichas = []) {
    return (Array.isArray(fichas) ? fichas : []).map((ficha) => ({
        ...ficha,
        owners: '',
        contracts: Array.isArray(ficha.contracts) ? ficha.contracts : [],
        ...buildFichaCardMetrics(ficha.contracts || [])
    }));
}

function normalizeCashboxes(cashboxes = []) {
    return (cashboxes || []).map((cashbox) => {
        const normalizedTransactions = recomputeCashboxBalances(cashbox.transactions || []);
        return {
            ...cashbox,
            transactions: normalizedTransactions,
            ...buildCashboxCardMetrics(normalizedTransactions)
        };
    });
}

function createFinanceItem(activeTab, customName = '') {
    const timestamp = new Date().toISOString();
    const seed = Date.now();
    const safeName = String(customName || '').trim();

    if (activeTab.id === 'caixa') {
        return {
            id: `caixa-${seed}`,
            type: 'caixa',
            title: safeName || `Novo Caixa ${seed.toString().slice(-3)}`,
            owners: 'Responsavel nao informado',
            transactions: [],
            metrics: [
                { label: 'Entradas', value: 'R$ 0,00', tone: 'positive' },
                { label: 'Saidas', value: 'R$ 0,00', tone: 'negative' },
                { label: 'Saldo Total', value: 'R$ 0,00', tone: 'positive' }
            ],
            footer: [
                { label: 'A Receber', value: 'R$ 0,00', tone: 'info' },
                { label: 'Agendado', value: 'R$ 0,00', tone: 'warning' },
                { label: 'Vencido', value: 'R$ 0,00', tone: 'negative' }
            ],
            createdAt: timestamp
        };
    }

    if (activeTab.id === 'fichas') {
        return {
            id: `ficha-${seed}`,
            type: 'ficha',
            title: safeName || `Nova Ficha ${seed.toString().slice(-3)}`,
            owners: 'Titular nao informado',
            contracts: [],
            ...buildFichaCardMetrics([]),
            createdAt: timestamp
        };
    }

    return {
        id: `agendamento-${seed}`,
        type: 'agendamento',
        title: safeName || `Novo Agendamento ${seed.toString().slice(-3)}`,
        owners: 'Sem responsavel definido',
        metrics: [
            { label: 'Previsto', value: 'R$ 0,00', tone: 'warning' },
            { label: 'Recebido', value: 'R$ 0,00', tone: 'positive' },
            { label: 'Saldo', value: 'R$ 0,00', tone: 'info' }
        ],
        footer: [
            { label: 'Data', value: formatDateShort(timestamp), tone: 'info' },
            { label: 'Status', value: 'Pendente', tone: 'warning' },
            { label: 'Atraso', value: 'Nao', tone: 'negative' }
        ],
        createdAt: timestamp
    };
}



function renderFinanceCard(item, openMenuId) {
    if (item.type === 'caixa') {
        return renderCashboxFinanceCard(item, openMenuId);
    }

    if (item.type === 'ficha') {
        return renderFichaFinanceCard(item, openMenuId);
    }

    const isMenuOpen = String(openMenuId) === String(item.id);
    return `
        <article class="finance-card" data-finance-card-id="${escapeAttribute(item.id)}">
            <div class="finance-card__head">
                <div class="finance-card__title-wrap">
                    <span class="finance-card__icon">${renderCardIcon()}</span>
                    <strong class="finance-card__title">${item.title}</strong>
                </div>
                <div class="finance-card__menu-wrap">
                    <button
                        type="button"
                        class="finance-card__menu-trigger"
                        data-finance-menu-trigger="${escapeAttribute(item.id)}"
                        aria-label="Abrir acoes do card"
                    >
                        ${renderMenuIcon()}
                    </button>
                    ${isMenuOpen ? `
                        <div class="finance-card__menu">
                            <button type="button" data-finance-menu-action="edit" data-finance-item-id="${escapeAttribute(item.id)}">Editar</button>
                            <button type="button" data-finance-menu-action="delete" data-finance-item-id="${escapeAttribute(item.id)}">Excluir</button>
                        </div>
                    ` : ''}
                </div>
            </div>
            ${item.type === 'ficha' ? '' : `<p class="finance-card__owners">${item.owners}</p>`}
            <div class="finance-card__metrics">
                ${item.metrics.map((metric) => `
                    <div class="finance-card__metric">
                        <span>${metric.label}</span>
                        <strong class="is-${resolveMetricTone(item, metric)}">${metric.value}</strong>
                    </div>
                `).join('')}
            </div>
            <div class="finance-card__footer">
                ${item.footer.map((entry) => `
                    <div class="finance-card__footer-item">
                        <span>${entry.label}</span>
                        <strong class="is-${entry.tone}">${entry.value}</strong>
                    </div>
                `).join('')}
            </div>
        </article>
    `;
}

function renderFinanceCardMenu(item, openMenuId) {
    const isMenuOpen = String(openMenuId) === String(item.id);
    return `
        <div class="finance-card__menu-wrap">
            <button
                type="button"
                class="finance-card__menu-trigger"
                data-finance-menu-trigger="${escapeAttribute(item.id)}"
                aria-label="Abrir acoes do card"
            >
                ${renderMenuIcon()}
            </button>
            ${isMenuOpen ? `
                <div class="finance-card__menu">
                    <button type="button" data-finance-menu-action="edit" data-finance-item-id="${escapeAttribute(item.id)}">Editar</button>
                    <button type="button" data-finance-menu-action="delete" data-finance-item-id="${escapeAttribute(item.id)}">Excluir</button>
                </div>
            ` : ''}
        </div>
    `;
}

function renderCashboxFinanceCard(item, openMenuId) {
    const linkedSummary = item.linkedContractsSummary || { contracted: 0, paid: 0, outstanding: 0, scheduled: 0, contractCount: 0 };
    const entriesMetric = findMetricByLabel(item.metrics, 'Entradas')?.value || 'R$ 0,00';
    const exitsMetric = findMetricByLabel(item.metrics, 'Saidas')?.value || 'R$ 0,00';
    const balanceMetric = findMetricByLabel(item.metrics, 'Saldo Total')?.value || 'R$ 0,00';
    const balanceValue = parseCurrencyValue(balanceMetric);
    const outstandingValue = Number(linkedSummary.outstanding || 0);
    const contractCount = Number(linkedSummary.contractCount || 0);
    const contractLabel = `${contractCount} ${contractCount === 1 ? 'contrato vinculado' : 'contratos vinculados'}`;
    return `
        <article class="finance-card finance-card--cashbox" data-finance-card-id="${escapeAttribute(item.id)}">
            <div class="finance-card__head">
                <div class="finance-card__title-wrap">
                    <span class="finance-card__icon">${renderCardIcon()}</span>
                    <strong class="finance-card__title">${escapeHtml(item.title)}</strong>
                </div>
                ${renderFinanceCardMenu(item, openMenuId)}
            </div>

            <div class="cashbox-card__focus">
                <div class="cashbox-card__highlight cashbox-card__highlight--balance">
                    <span>Saldo total</span>
                    <strong class="${balanceValue < 0 ? 'is-negative' : 'is-positive'}">${escapeHtml(balanceMetric)}</strong>
                </div>
                <div class="cashbox-card__highlight cashbox-card__highlight--receivable">
                    <span>A receber</span>
                    <strong class="${outstandingValue > 0 ? 'is-info' : 'is-positive'}">${formatCurrency(outstandingValue)}</strong>
                    <small>${escapeHtml(contractLabel)}</small>
                </div>
            </div>

            <div class="cashbox-card__micro-grid">
                <div class="cashbox-card__micro">
                    <span>Entradas</span>
                    <strong class="is-positive">${escapeHtml(entriesMetric)}</strong>
                </div>
                <div class="cashbox-card__micro">
                    <span>Saídas</span>
                    <strong class="is-negative">${escapeHtml(exitsMetric)}</strong>
                </div>
                <div class="cashbox-card__micro">
                    <span>Contratado</span>
                    <strong class="is-info">${formatCurrency(linkedSummary.contracted || 0)}</strong>
                </div>
                <div class="cashbox-card__micro">
                    <span>Pago</span>
                    <strong class="is-positive">${formatCurrency(linkedSummary.paid || 0)}</strong>
                </div>
            </div>

            <div class="cashbox-card__bottom">
                <span>Agendado nos contratos</span>
                <strong class="is-warning">${formatCurrency(linkedSummary.scheduled || 0)}</strong>
            </div>
        </article>
    `;
}

function renderFichaFinanceCard(item, openMenuId) {
    const contracts = Array.isArray(item.contracts) ? item.contracts : [];
    const totals = buildFichaDetailTotals(contracts);
    const receivable = Math.max(totals.contracted - totals.paid, 0);
    const scheduled = contracts.reduce(
        (sum, contract) => sum + (contract.schedules || []).reduce((inner, entry) => inner + parseFinanceAmount(entry), 0),
        0
    );
    const contractCount = contracts.length;
    const contractLabel = `${contractCount} ${contractCount === 1 ? 'contrato' : 'contratos'}`;
    return `
        <article class="finance-card finance-card--ficha" data-finance-card-id="${escapeAttribute(item.id)}">
            <div class="finance-card__head">
                <div class="finance-card__title-wrap">
                    <span class="finance-card__icon">${renderCardIcon()}</span>
                    <strong class="finance-card__title">${escapeHtml(item.title)}</strong>
                </div>
                ${renderFinanceCardMenu(item, openMenuId)}
            </div>

            <div class="ficha-card__focus">
                <div class="ficha-card__highlight ficha-card__highlight--balance">
                    <span>Saldo da ficha</span>
                    <strong class="${totals.balance < 0 ? 'is-negative' : totals.balance > 0 ? 'is-positive' : 'is-info'}">${formatCurrency(totals.balance)}</strong>
                </div>
                <div class="ficha-card__highlight ficha-card__highlight--receivable">
                    <span>A receber</span>
                    <strong class="${receivable > 0 ? 'is-info' : 'is-positive'}">${formatCurrency(receivable)}</strong>
                    <small>${escapeHtml(contractLabel)}</small>
                </div>
            </div>

            <div class="ficha-card__micro-grid">
                <div class="ficha-card__micro">
                    <span>Contratado</span>
                    <strong class="is-info">${formatCurrency(totals.contracted)}</strong>
                </div>
                <div class="ficha-card__micro">
                    <span>Pago</span>
                    <strong class="is-positive">${formatCurrency(totals.paid)}</strong>
                </div>
                <div class="ficha-card__micro">
                    <span>Agendado</span>
                    <strong class="is-warning">${formatCurrency(scheduled)}</strong>
                </div>
                <div class="ficha-card__micro">
                    <span>Contratos</span>
                    <strong class="is-info">${String(contractCount).padStart(2, '0')}</strong>
                </div>
            </div>
        </article>
    `;
}

function renderFinanceListRow(item, openMenuId) {
    const isMenuOpen = String(openMenuId) === String(item.id);
    return `
        <article class="finance-list__row" data-finance-card-id="${escapeAttribute(item.id)}">
            <div class="finance-list__main">
                <div class="finance-list__title-wrap">
                    <span class="finance-card__icon">${renderCardIcon()}</span>
                    <div>
                        <strong class="finance-list__title">${item.title}</strong>
                        ${item.type === 'ficha' ? '' : `<p class="finance-list__owners">${item.owners}</p>`}
                    </div>
                </div>
                <div class="finance-list__metrics">
                    ${item.metrics.map((metric) => `
                        <div class="finance-list__metric">
                            <span>${metric.label}</span>
                            <strong class="is-${resolveMetricTone(item, metric)}">${metric.value}</strong>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="finance-card__menu-wrap">
                <button
                    type="button"
                    class="finance-card__menu-trigger is-visible"
                    data-finance-menu-trigger="${escapeAttribute(item.id)}"
                    aria-label="Abrir acoes do item"
                >
                    ${renderMenuIcon()}
                </button>
                ${isMenuOpen ? `
                    <div class="finance-card__menu">
                        <button type="button" data-finance-menu-action="edit" data-finance-item-id="${escapeAttribute(item.id)}">Editar</button>
                        <button type="button" data-finance-menu-action="delete" data-finance-item-id="${escapeAttribute(item.id)}">Excluir</button>
                    </div>
                ` : ''}
            </div>
        </article>
    `;
}

function renderFinanceScheduleDashboard(scheduleDashboard, legacyItems = [], openMenuId = null, detailMenuKey = null) {
    const dashboard = scheduleDashboard || buildFinanceScheduleDashboard([]);
    return `
        <div class="finance-schedule">
            <section class="finance-schedule__summary" aria-label="Resumo dos agendamentos">
                ${dashboard.summaryCards.map((card) => `
                    <article class="finance-schedule-summary finance-schedule-summary--${card.tone}">
                        <span>${card.label}</span>
                        <strong>${card.value}</strong>
                        <small>${card.countLabel}</small>
                    </article>
                `).join('')}
            </section>

            <div class="finance-schedule__groups">
                ${dashboard.groups.map((group) => renderFinanceScheduleGroup(group, detailMenuKey)).join('')}
            </div>

            ${legacyItems.length > 0 ? `
                <section class="finance-schedule__legacy">
                    <div class="finance-schedule__section-head">
                        <div>
                            <p class="label-tech">Registros avulsos</p>
                            <h3 class="font-black">Agendamentos antigos</h3>
                        </div>
                    </div>
                    <div class="finance-home__cards-grid finance-schedule__legacy-grid">
                        ${legacyItems.map((item) => renderFinanceCard(item, openMenuId)).join('')}
                    </div>
                </section>
            ` : ''}
        </div>
    `;
}

function renderFinanceScheduleGroup(group, detailMenuKey = null) {
    return `
        <section class="finance-schedule-group finance-schedule-group--${group.tone}">
            <div class="finance-schedule__section-head">
                <div>
                    <p class="label-tech">${group.eyebrow}</p>
                    <h3 class="font-black">${group.label}</h3>
                </div>
                <div class="finance-schedule-group__total">
                    <span>${group.rows.length} ${group.rows.length === 1 ? 'item' : 'itens'}</span>
                    <strong>${formatCurrency(group.total)}</strong>
                </div>
            </div>
            <div class="finance-schedule-group__rows">
                ${group.rows.length === 0 ? `
                    <div class="finance-schedule-empty">
                        <span>${group.emptyText}</span>
                    </div>
                ` : group.rows.map((row) => renderFinanceScheduleRow(row, detailMenuKey)).join('')}
            </div>
        </section>
    `;
}

function renderFinanceScheduleRow(row, detailMenuKey = null) {
    const menuKey = `schedule:${row.fichaId}:${row.contractId}:${row.entryId}`;
    return `
        <article
            class="finance-schedule-row finance-schedule-row--${row.tone}"
            data-finance-schedule-open="${escapeAttribute(row.entryId)}"
            data-ficha-id="${escapeAttribute(row.fichaId)}"
            data-contract-id="${escapeAttribute(row.contractId)}"
            role="button"
            tabindex="0"
        >
            <div class="finance-schedule-row__date">
                <strong>${escapeAttribute(row.day)}</strong>
                <span>${escapeAttribute(row.monthLabel)}</span>
            </div>
            <div class="finance-schedule-row__main">
                <div>
                    <strong>${escapeAttribute(row.description)}</strong>
                    <span>${escapeAttribute(row.fichaTitle)} - ${escapeAttribute(row.contractDescription)}</span>
                </div>
                <span class="finance-schedule-row__badge">${escapeAttribute(row.dueLabel)}</span>
            </div>
            <strong class="finance-schedule-row__value">${escapeAttribute(row.value)}</strong>
            <div class="finance-card__menu-wrap">
                <button type="button" class="cashbox-detail__row-menu" data-finance-detail-menu-trigger="${escapeAttribute(menuKey)}" aria-label="Abrir menu do agendamento">
                    ${renderMenuIcon()}
                </button>
                ${detailMenuKey === menuKey ? `
                    <div class="finance-card__menu">
                        <button
                            type="button"
                            data-finance-detail-action="edit-entry"
                            data-ficha-id="${escapeAttribute(row.fichaId)}"
                            data-contract-id="${escapeAttribute(row.contractId)}"
                            data-entry-type="schedule"
                            data-entry-id="${escapeAttribute(row.entryId)}"
                        >Editar</button>
                        <button
                            type="button"
                            data-finance-detail-action="repeat-entry"
                            data-ficha-id="${escapeAttribute(row.fichaId)}"
                            data-contract-id="${escapeAttribute(row.contractId)}"
                            data-entry-type="schedule"
                            data-entry-id="${escapeAttribute(row.entryId)}"
                        >Repetir</button>
                        <button
                            type="button"
                            data-finance-detail-action="delete-entry"
                            data-ficha-id="${escapeAttribute(row.fichaId)}"
                            data-contract-id="${escapeAttribute(row.contractId)}"
                            data-entry-type="schedule"
                            data-entry-id="${escapeAttribute(row.entryId)}"
                        >Excluir</button>
                    </div>
                ` : ''}
            </div>
        </article>
    `;
}

function getSortedFinanceItems(items = [], tabId = '') {
    const safeItems = Array.isArray(items) ? [...items] : [];
    if (tabId !== 'fichas') return safeItems;
    return safeItems.sort((left, right) => String(left?.title || '').localeCompare(String(right?.title || ''), 'pt-BR', { sensitivity: 'base' }));
}

function normalizeFinanceItemForRender(item, tabId = '', fichas = []) {
    if (tabId === 'caixa') {
        return {
            ...item,
            linkedContractsSummary: buildCashboxContractsSummary(fichas, item.id)
        };
    }

    if (tabId !== 'fichas') return item;
    const contracts = Array.isArray(item?.contracts) ? item.contracts : [];
    return {
        ...item,
        owners: '',
        contracts,
        ...buildFichaCardMetrics(contracts)
    };
}

function resolveMetricTone(item, metric) {
    if (item?.type === 'ficha' && String(metric?.label || '') === 'Saldo') {
        const numericValue = parseCurrencyValue(metric.value);
        return numericValue < 0 ? 'negative' : numericValue > 0 ? 'positive' : 'info';
    }
    return metric?.tone || 'info';
}

function findMetricByLabel(metrics = [], label = '') {
    const normalizedLabel = normalizeText(label);
    return (Array.isArray(metrics) ? metrics : []).find((metric) => normalizeText(metric?.label) === normalizedLabel) || null;
}

function renderCashboxDetailView(cashbox, fichas = [], detailMenuKey = null, filterMode = 'tudo', selectedMonth = getCurrentMonthValue(), selectedYear = getCurrentYearValue()) {
    const filterContext = buildCashboxFilterContext(cashbox.transactions || [], filterMode, selectedMonth, selectedYear);
    const transactions = filterContext.transactions;
    const contractsSummary = buildCashboxContractsSummary(fichas, cashbox.id);
    return `
        <div class="cashbox-detail cashbox-detail--cashbox">
            <div class="cashbox-detail__header">
                <div class="cashbox-detail__header-main">
                    <button type="button" class="cashbox-detail__back" data-finance-back aria-label="Voltar para caixas">
                        ${renderBackIcon()}
                    </button>
                    <div class="cashbox-detail__title-wrap">
                        <h2 class="font-black cashbox-detail__title">${cashbox.title}</h2>
                        <div class="cashbox-detail__filter" role="tablist" aria-label="Filtro do caixa">
                            <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'mensal' ? 'is-active' : ''}" data-cashbox-filter="mensal">Mensal</button>
                            <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'anual' ? 'is-active' : ''}" data-cashbox-filter="anual">Anual</button>
                            <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'tudo' ? 'is-active' : ''}" data-cashbox-filter="tudo">Tudo</button>
                            ${filterMode === 'mensal' ? `
                                <div class="cashbox-detail__months" role="tablist" aria-label="Meses do ano">
                                    ${renderCashboxMonthButtons(filterContext.selectedMonth, 'cashbox')}
                                    <select
                                        class="cashbox-detail__month-picker"
                                        name="cashbox_filter_month_year"
                                        aria-label="Selecionar ano"
                                    >
                                        ${renderCashboxYearOptions(filterContext.selectedMonth.split('-')[0], cashbox.transactions || [])}
                                    </select>
                                </div>
                            ` : filterMode === 'anual' ? `
                                <select
                                    class="cashbox-detail__month-picker"
                                    name="cashbox_filter_year"
                                    aria-label="Selecionar ano"
                                >
                                    ${renderCashboxYearOptions(filterContext.selectedYear, cashbox.transactions || [])}
                                </select>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <div class="cashbox-detail__actions">
                    <button type="button" class="cashbox-detail__action finance-export-trigger" data-finance-export-open="caixa" aria-label="Baixar caixa" title="Baixar caixa">
                        ${renderDownloadIcon()} <span class="finance-export-trigger__label">Baixar</span>
                    </button>
                    <button type="button" class="cashbox-detail__action cashbox-detail__action--entrada" data-cashbox-action="entrada">
                        ${renderPlusMiniIcon()} Crédito
                    </button>
                    <button type="button" class="cashbox-detail__action cashbox-detail__action--debito" data-cashbox-action="debito">
                        ${renderPlusMiniIcon()} Débito
                    </button>
                    <button type="button" class="cashbox-detail__action cashbox-detail__action--retirada" data-cashbox-action="retirada">
                        ${renderUserMiniIcon()} Transferência
                    </button>
                </div>
            </div>

            <div class="ficha-detail-totals cashbox-detail__totals">
                <div class="ficha-detail-totals__item">
                    <span>Total contratado</span>
                    <strong class="is-info">${formatCurrency(contractsSummary.contracted)}</strong>
                </div>
                <div class="ficha-detail-totals__item">
                    <span>Total pago</span>
                    <strong class="is-positive">${formatCurrency(contractsSummary.paid)}</strong>
                </div>
                <div class="ficha-detail-totals__item">
                    <span>Total em aberto</span>
                    <strong class="${contractsSummary.outstanding > 0 ? 'is-negative' : 'is-info'}">${formatCurrency(contractsSummary.outstanding)}</strong>
                </div>
            </div>

            <div class="cashbox-detail__table-wrap">
                <table class="cashbox-detail__table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Ficha</th>
                            <th>Descrição</th>
                            <th>Crédito</th>
                            <th>Débito</th>
                            <th>Saldo</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.length === 0 ? `
                            <tr>
                                <td colspan="7" class="cashbox-detail__empty">Nenhuma movimentacao registrada neste caixa ainda.</td>
                            </tr>
                        ` : transactions.map((row) => renderCashboxRow(row, detailMenuKey)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function buildCashboxFilterContext(transactions = [], filterMode = 'tudo', selectedMonth = getCurrentMonthValue(), selectedYear = getCurrentYearValue()) {
    const safeTransactions = Array.isArray(transactions) ? transactions : [];
    const latestIsoDate = safeTransactions
        .map((item) => normalizeDateStorageValue(item.isoDate || item.date || item.createdAt || ''))
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
        .sort()
        .at(-1);

    if (!latestIsoDate || filterMode === 'tudo') {
        return {
            transactions: safeTransactions,
            selectedMonth: /^\d{4}-\d{2}$/.test(selectedMonth || '') ? selectedMonth : getCurrentMonthValue(),
            selectedYear: /^\d{4}$/.test(selectedYear || '') ? selectedYear : getCurrentYearValue(),
            label: filterMode === 'tudo' ? 'Todos os lançamentos' : 'Sem período disponível'
        };
    }

    const [year, month] = latestIsoDate.split('-');

    if (filterMode === 'mensal') {
        const monthValue = /^\d{4}-\d{2}$/.test(selectedMonth || '') ? selectedMonth : getCurrentMonthValue();
        const transactionsByMonth = safeTransactions.filter((item) => {
            const isoDate = normalizeDateStorageValue(item.isoDate || item.date || item.createdAt || '');
            return isoDate.startsWith(monthValue);
        });
        const [selectedYear, selectedMonthNumber] = monthValue.split('-');
        return {
            transactions: transactionsByMonth,
            selectedMonth: monthValue,
            selectedYear: /^\d{4}$/.test(selectedYear || '') ? selectedYear : selectedYear,
            label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${selectedYear}-${selectedMonthNumber}-01T12:00:00`))
        };
    }

    const yearValue = /^\d{4}$/.test(selectedYear || '') ? selectedYear : year;
    const transactionsByYear = safeTransactions.filter((item) => {
        const isoDate = normalizeDateStorageValue(item.isoDate || item.date || item.createdAt || '');
        return isoDate.startsWith(yearValue);
    });

    return {
        transactions: transactionsByYear,
        selectedMonth: /^\d{4}-\d{2}$/.test(selectedMonth || '') ? selectedMonth : `${year}-${month}`,
        selectedYear: yearValue,
        label: yearValue
    };
}

function renderCashboxMonthButtons(selectedMonth, context) {
    const monthValue = /^\d{4}-\d{2}$/.test(selectedMonth || '') ? selectedMonth : getCurrentMonthValue();
    const [selectedYear] = monthValue.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return months.map((monthAbbr, index) => {
        const monthNumber = String(index + 1).padStart(2, '0');
        const value = `${selectedYear}-${monthNumber}`;
        const isActive = value === monthValue;
        return `<button type="button" class="cashbox-detail__month-tab ${isActive ? 'is-active' : ''}" data-${context}-month="${escapeAttribute(value)}">${monthAbbr}</button>`;
    }).join('');
}

function renderCashboxYearOptions(selectedYear, transactions = []) {
    const years = Array.from(new Set(
        (Array.isArray(transactions) ? transactions : [])
            .map((item) => normalizeDateStorageValue(item.isoDate || item.date || item.createdAt || ''))
            .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
            .map((value) => value.slice(0, 4))
    )).sort((left, right) => Number(right) - Number(left));
    const fallbackYear = /^\d{4}$/.test(selectedYear || '') ? selectedYear : getCurrentYearValue();
    const availableYears = years.length > 0 ? years : [fallbackYear];
    if (!availableYears.includes(fallbackYear)) {
        availableYears.unshift(fallbackYear);
    }
    return availableYears.map((year) => `
        <option value="${escapeAttribute(year)}" ${year === fallbackYear ? 'selected' : ''}>${year}</option>
    `).join('');
}

function renderFichaDetailView(
    ficha,
    cashboxes = [],
    detailMenuKey = null,
    filterMode = 'tudo',
    selectedMonth = getCurrentMonthValue(),
    selectedYear = getCurrentYearValue(),
    expandedContractIds = []
) {
    const contracts = Array.isArray(ficha.contracts) ? ficha.contracts : [];
    const generalStatement = buildFichaGeneralStatement(contracts);
    const filterEntries = contracts.flatMap((contract) => [...buildContractStatement(contract), ...buildContractScheduleRows(contract)]);
    const generalEntries = buildCashboxFilterContext(generalStatement, filterMode, selectedMonth, selectedYear).transactions;
    const totals = buildFichaDetailTotals(contracts);
    const visibleExpandedContractIds = expandedContractIds.length > 0
        ? expandedContractIds
        : contracts[0]
            ? [contracts[0].id]
            : [];
    return `
        <div class="cashbox-detail">
            <div class="cashbox-detail__header">
                <button type="button" class="cashbox-detail__back" data-finance-back aria-label="Voltar para fichas">
                    ${renderBackIcon()}
                </button>
                <div class="cashbox-detail__title-wrap">
                    <h2 class="font-black cashbox-detail__title">${ficha.title}</h2>
                </div>
                <div class="cashbox-detail__filter" role="tablist" aria-label="Filtro da ficha">
                    <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'mensal' ? 'is-active' : ''}" data-ficha-filter="mensal">Mensal</button>
                    <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'anual' ? 'is-active' : ''}" data-ficha-filter="anual">Anual</button>
                    <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'tudo' ? 'is-active' : ''}" data-ficha-filter="tudo">Tudo</button>
                    ${filterMode === 'mensal' ? `
                        <div class="cashbox-detail__months" role="tablist" aria-label="Meses da ficha">
                            ${renderCashboxMonthButtons(selectedMonth, 'ficha')}
                            <select
                                class="cashbox-detail__month-picker"
                                name="ficha_filter_month_year"
                                aria-label="Selecionar ano"
                            >
                                ${renderCashboxYearOptions(selectedMonth.split('-')[0], filterEntries)}
                            </select>
                        </div>
                    ` : filterMode === 'anual' ? `
                        <select
                            class="cashbox-detail__month-picker"
                            name="ficha_filter_year"
                            aria-label="Selecionar ano da ficha"
                        >
                            ${renderCashboxYearOptions(selectedYear, filterEntries)}
                        </select>
                    ` : ''}
                </div>
                <div class="cashbox-detail__actions">
                    <button type="button" class="cashbox-detail__action finance-export-trigger" data-finance-export-open="ficha" aria-label="Baixar ficha" title="Baixar ficha">
                        ${renderDownloadIcon()} <span class="finance-export-trigger__label">Baixar</span>
                    </button>
                    <button type="button" class="cashbox-detail__action ficha-detail__action--contrato" data-ficha-action="contrato">
                        ${renderPlusMiniIcon()} Contrato
                    </button>
                    <button type="button" class="cashbox-detail__action ficha-detail__action--credito" data-ficha-action="pagamento">
                        ${renderPlusMiniIcon()} Crédito
                    </button>
                    <button type="button" class="cashbox-detail__action cashbox-detail__action--debito" data-ficha-action="debito">
                        ${renderPlusMiniIcon()} Débito
                    </button>
                    <button type="button" class="cashbox-detail__action ficha-detail__action--agendamento" data-ficha-action="agendamento">
                        ${renderPlusMiniIcon()} Agendamento
                    </button>
                </div>
            </div>

            <div class="ficha-detail-layout">
                <section class="ficha-detail-panel ficha-detail-panel--statement">
                    <div class="ficha-detail-panel__head">
                        <div>
                            <p class="label-tech">Extrato Geral</p>
                            <h3 class="font-black ficha-detail-panel__title">Todos os lançamentos da ficha</h3>
                        </div>
                    </div>
                    <div class="ficha-detail-totals">
                        <div class="ficha-detail-totals__item">
                            <span>Valor contratado</span>
                            <strong class="is-info">${formatCurrency(totals.contracted)}</strong>
                        </div>
                        <div class="ficha-detail-totals__item">
                            <span>Valor pago</span>
                            <strong class="is-positive">${formatCurrency(totals.paid)}</strong>
                        </div>
                        <div class="ficha-detail-totals__item">
                            <span>Saldo</span>
                            <strong class="${totals.balance < 0 ? 'is-negative' : totals.balance > 0 ? 'is-positive' : 'is-info'}">${formatCurrency(totals.balance)}</strong>
                        </div>
                    </div>
                    <div class="cashbox-detail__table-wrap ficha-detail-panel__table ficha-detail-panel__table--statement custom-scrollbar">
                        <table class="cashbox-detail__table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Contrato</th>
                                    <th>Descrição</th>
                                    <th>Crédito</th>
                                    <th>Débito</th>
                                    <th>Saldo</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${generalEntries.length === 0 ? `
                                    <tr>
                                        <td colspan="7" class="cashbox-detail__empty">Nenhum lançamento encontrado para este filtro.</td>
                                    </tr>
                                ` : generalEntries.map((row) => renderFichaGeneralStatementRow(row, detailMenuKey)).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>

                <aside class="ficha-detail-panel ficha-detail-panel--contracts">
                    <div class="ficha-detail-panel__head">
                        <div>
                            <p class="label-tech">Contratos</p>
                            <h3 class="font-black ficha-detail-panel__title">Resumo por contrato</h3>
                        </div>
                    </div>
                    <div class="ficha-contract-list custom-scrollbar">
                        ${contracts.length === 0 ? `
                            <div class="finance-card finance-card--empty ficha-empty-state">
                                <div class="finance-card__empty-copy">
                                    <p class="label-tech">Ficha</p>
                                    <strong>Nenhum contrato criado</strong>
                                    <span>Comece criando um contrato para abrir a conta corrente desta ficha.</span>
                                </div>
                            </div>
                        ` : contracts.map((contract) => renderFichaContractCard(
                            contract,
                            cashboxes,
                            detailMenuKey,
                            filterMode,
                            selectedMonth,
                            selectedYear,
                            visibleExpandedContractIds.includes(contract.id)
                        )).join('')}
                    </div>
                </aside>
            </div>
        </div>
    `;
}

function renderFichaContractCard(
    contract,
    cashboxes = [],
    detailMenuKey = null,
    filterMode = 'tudo',
    selectedMonth = getCurrentMonthValue(),
    selectedYear = getCurrentYearValue(),
    isExpanded = false
) {
    const cashbox = findItemById(cashboxes, contract.cashboxId);
    const statementEntries = buildContractStatement(contract);
    const scheduleEntries = buildContractScheduleRows(contract);
    const entries = buildCashboxFilterContext(statementEntries, filterMode, selectedMonth, selectedYear).transactions;
    const schedules = buildCashboxFilterContext(scheduleEntries, filterMode, selectedMonth, selectedYear).transactions;
    const contractMenuKey = `contract:${contract.id}`;
    const contractSummary = buildContractFinancialSummary(contract);
    return `
        <section class="ficha-contract-card ${isExpanded ? 'is-expanded' : ''}">
            <div class="ficha-contract-card__head">
                <button
                    type="button"
                    class="ficha-contract-card__toggle"
                    data-ficha-contract-toggle="${escapeAttribute(contract.id)}"
                    aria-expanded="${isExpanded ? 'true' : 'false'}"
                >
                    <div>
                        <p class="label-tech">Contrato</p>
                        <h3 class="font-black ficha-contract-card__title">${contract.description}</h3>
                        <p class="ficha-contract-card__meta">Caixa vinculado: ${cashbox?.title || 'Nao definido'}</p>
                    </div>
                    <span class="finance-card__arrow ficha-contract-card__arrow">${renderChevronIcon()}</span>
                </button>
                <div class="finance-card__menu-wrap">
                    <button type="button" class="finance-card__menu-trigger is-visible" data-finance-detail-menu-trigger="${contractMenuKey}">
                        ${renderMenuIcon()}
                    </button>
                    ${detailMenuKey === contractMenuKey ? `
                        <div class="finance-card__menu">
                            <button type="button" data-finance-detail-action="edit-contract" data-contract-id="${escapeAttribute(contract.id)}">Editar</button>
                            <button type="button" data-finance-detail-action="delete-contract" data-contract-id="${escapeAttribute(contract.id)}">Excluir</button>
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="ficha-contract-card__summary">
                <div class="ficha-contract-card__summary-item">
                    <span>Valor contratado</span>
                    <strong class="is-info">${formatCurrency(contractSummary.contracted)}</strong>
                </div>
                <div class="ficha-contract-card__summary-item">
                    <span>Valor pago</span>
                    <strong class="is-positive">${formatCurrency(contractSummary.paid)}</strong>
                </div>
                <div class="ficha-contract-card__summary-item">
                    <span>Saldo</span>
                    <strong class="${contractSummary.balance < 0 ? 'is-negative' : contractSummary.balance > 0 ? 'is-positive' : 'is-info'}">${formatCurrency(contractSummary.balance)}</strong>
                </div>
            </div>
            ${isExpanded ? `
                <div class="ficha-contract-card__body">
                    <div class="cashbox-detail__table-wrap ficha-contract-card__table-wrap custom-scrollbar">
                        <table class="cashbox-detail__table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Descrição</th>
                                    <th>Crédito</th>
                                    <th>Débito</th>
                                    <th>Saldo</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${entries.length === 0 ? `
                                    <tr>
                                        <td colspan="6" class="cashbox-detail__empty">Nenhum lançamento registrado neste contrato ainda.</td>
                                    </tr>
                                ` : entries.map((row) => renderFichaContractStatementRow(row, contract.id, detailMenuKey)).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="ficha-contract-card__section">
                        <div class="ficha-contract-card__section-head">
                            <p class="label-tech">Agendamentos</p>
                        </div>
                        <div class="cashbox-detail__table-wrap ficha-contract-card__table-wrap custom-scrollbar">
                            <table class="cashbox-detail__table">
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>Descrição</th>
                                        <th>Valor</th>
                                        <th>Prazo</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${schedules.length === 0 ? `
                                        <tr>
                                            <td colspan="5" class="cashbox-detail__empty">Nenhum agendamento registrado neste contrato.</td>
                                        </tr>
                                    ` : schedules.map((row) => renderFichaContractScheduleRow(row, contract.id, detailMenuKey)).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ` : ''}
        </section>
    `;
}

function renderFichaGeneralStatementRow(row, detailMenuKey = null) {
    const menuKey = `${row.entryType}:${row.contractId}:${row.entryId}`;
    return `
        <tr>
            <td>${escapeAttribute(row.date)}</td>
            <td>${escapeAttribute(row.contractDescription)}</td>
            <td>${escapeAttribute(row.description)}</td>
            <td><span class="cashbox-detail__value cashbox-detail__value--credit">${escapeAttribute(row.credit || '-')}</span></td>
            <td><span class="cashbox-detail__value cashbox-detail__value--debit">${escapeAttribute(row.debit || '-')}</span></td>
            <td class="cashbox-detail__balance ${parseCurrencyValue(row.balance) < 0 ? 'is-negative' : 'is-positive'}"><span class="cashbox-detail__value">${escapeAttribute(row.balance)}</span></td>
            <td class="cashbox-detail__menu-cell">
                <div class="finance-card__menu-wrap">
                    <button type="button" class="cashbox-detail__row-menu" data-finance-detail-menu-trigger="${escapeAttribute(menuKey)}">
                        ${renderMenuIcon()}
                    </button>
                    ${detailMenuKey === menuKey ? `
                        <div class="finance-card__menu">
                            <button type="button" data-finance-detail-action="edit-entry" data-contract-id="${escapeAttribute(row.contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Editar</button>
                            <button type="button" data-finance-detail-action="repeat-entry" data-contract-id="${escapeAttribute(row.contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Repetir</button>
                            <button type="button" data-finance-detail-action="delete-entry" data-contract-id="${escapeAttribute(row.contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Excluir</button>
                        </div>
                    ` : ''}
                </div>
            </td>
        </tr>
    `;
}

function renderFichaContractStatementRow(row, contractId, detailMenuKey = null) {
    const menuKey = `${row.entryType}:${contractId}:${row.entryId}`;
    return `
        <tr>
            <td>${escapeAttribute(row.date)}</td>
            <td>${escapeAttribute(row.description)}</td>
            <td><span class="cashbox-detail__value cashbox-detail__value--credit">${escapeAttribute(row.credit || '-')}</span></td>
            <td><span class="cashbox-detail__value cashbox-detail__value--debit">${escapeAttribute(row.debit || '-')}</span></td>
            <td class="cashbox-detail__balance ${parseCurrencyValue(row.balance) < 0 ? 'is-negative' : 'is-positive'}"><span class="cashbox-detail__value">${escapeAttribute(row.balance)}</span></td>
            <td class="cashbox-detail__menu-cell">
                <div class="finance-card__menu-wrap">
                    <button type="button" class="cashbox-detail__row-menu" data-finance-detail-menu-trigger="${escapeAttribute(menuKey)}">
                        ${renderMenuIcon()}
                    </button>
                    ${detailMenuKey === menuKey ? `
                        <div class="finance-card__menu">
                            <button type="button" data-finance-detail-action="edit-entry" data-contract-id="${escapeAttribute(contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Editar</button>
                            <button type="button" data-finance-detail-action="repeat-entry" data-contract-id="${escapeAttribute(contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Repetir</button>
                            <button type="button" data-finance-detail-action="delete-entry" data-contract-id="${escapeAttribute(contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Excluir</button>
                        </div>
                    ` : ''}
                </div>
            </td>
        </tr>
    `;
}

function renderFichaContractScheduleRow(row, contractId, detailMenuKey = null) {
    const menuKey = `${row.entryType}:${contractId}:${row.entryId}`;
    return `
        <tr>
            <td>${escapeAttribute(row.date)}</td>
            <td>${escapeAttribute(row.description)}</td>
            <td><span class="cashbox-detail__value cashbox-detail__value--schedule">${escapeAttribute(row.value)}</span></td>
            <td><span class="ficha-contract-card__due ${row.daysUntilDue < 0 ? 'is-overdue' : row.daysUntilDue === 0 ? 'is-today' : 'is-upcoming'}">${escapeAttribute(row.dueLabel)}</span></td>
            <td class="cashbox-detail__menu-cell">
                <div class="finance-card__menu-wrap">
                    <button type="button" class="cashbox-detail__row-menu" data-finance-detail-menu-trigger="${escapeAttribute(menuKey)}">
                        ${renderMenuIcon()}
                    </button>
                    ${detailMenuKey === menuKey ? `
                        <div class="finance-card__menu">
                            <button type="button" data-finance-detail-action="edit-entry" data-contract-id="${escapeAttribute(contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Editar</button>
                            <button type="button" data-finance-detail-action="repeat-entry" data-contract-id="${escapeAttribute(contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Repetir</button>
                            <button type="button" data-finance-detail-action="delete-entry" data-contract-id="${escapeAttribute(contractId)}" data-entry-type="${escapeAttribute(row.entryType)}" data-entry-id="${escapeAttribute(row.entryId)}">Excluir</button>
                        </div>
                    ` : ''}
                </div>
            </td>
        </tr>
    `;
}

function renderCashboxRow(row, detailMenuKey = null) {
    const balanceValue = parseCurrencyValue(row.balance || 0);
    const creditValue = row.credit || '-';
    const debitValue = row.debit || '-';
    const menuKey = `cashbox:${row.id}`;
    return `
        <tr>
            <td>${escapeAttribute(row.date || '-')}</td>
            <td>${escapeAttribute(row.fichaTitle || '-')}</td>
            <td>${escapeAttribute(row.description || '-')}</td>
            <td class="cashbox-detail__credit"><span class="cashbox-detail__value cashbox-detail__value--credit">${escapeAttribute(creditValue)}</span></td>
            <td class="cashbox-detail__debit"><span class="cashbox-detail__value cashbox-detail__value--debit">${escapeAttribute(debitValue)}</span></td>
            <td class="cashbox-detail__balance ${balanceValue < 0 ? 'is-negative' : 'is-positive'}"><span class="cashbox-detail__value">${escapeAttribute(row.balance || 'R$ 0,00')}</span></td>
            <td class="cashbox-detail__menu-cell">
                <div class="finance-card__menu-wrap">
                    <button type="button" class="cashbox-detail__row-menu" data-finance-detail-menu-trigger="${menuKey}" aria-label="Abrir menu da movimentacao">
                        ${renderMenuIcon()}
                    </button>
                    ${detailMenuKey === menuKey ? `
                        <div class="finance-card__menu">
                            <button type="button" data-finance-detail-action="edit-cashbox-row" data-row-id="${escapeAttribute(row.id)}">Editar</button>
                            <button type="button" data-finance-detail-action="repeat-cashbox-row" data-row-id="${escapeAttribute(row.id)}">Repetir</button>
                            <button type="button" data-finance-detail-action="delete-cashbox-row" data-row-id="${escapeAttribute(row.id)}">Excluir</button>
                        </div>
                    ` : ''}
                </div>
            </td>
        </tr>
    `;
}

function renderCashboxActionModal(actionModal, descriptionMemory = [], cashboxes = [], currentCashboxId = '') {
    const actionLabel = actionModal.type === 'entrada'
        ? 'Crédito'
        : actionModal.type === 'debito'
            ? 'Débito'
            : 'Transferência';
    const suggestions = filterDescriptionMemory(descriptionMemory, actionModal.description);
    const availableCashboxes = (Array.isArray(cashboxes) ? cashboxes : []).filter((cashbox) => String(cashbox.id) !== String(currentCashboxId));

    return `
        <div class="finance-modal-backdrop" data-cashbox-action-cancel>
            <div class="finance-modal-card" role="dialog" aria-modal="true" aria-label="${actionLabel}">
                <form class="finance-home__create-form finance-action-form" data-cashbox-action-form>
                    <div class="finance-action-form__intro">
                        <p class="label-tech">Nova movimentacao</p>
                        <h3 class="font-black">${actionLabel}</h3>
                    </div>
                    <div class="finance-action-form__fields">
                        <label class="finance-home__create-field">
                            <span class="label-tech">Data</span>
                            <input
                                type="text"
                                name="cashbox_action_date"
                                value="${escapeAttribute(actionModal.date || '')}"
                                placeholder="dd/mm/aaaa"
                                inputmode="numeric"
                                maxlength="10"
                                required
                            />
                        </label>
                        <label class="finance-home__create-field">
                            <span class="label-tech">Descrição</span>
                            <div class="finance-description-memory">
                                <input
                                    type="text"
                                    name="cashbox_action_description"
                                    value="${escapeAttribute(actionModal.description || '')}"
                                    placeholder="Descreva a movimentacao"
                                    spellcheck="true"
                                    autocapitalize="sentences"
                                    autocomplete="off"
                                    required
                                />
                                <div class="finance-description-memory__list ${suggestions.length > 0 ? '' : 'is-hidden'}" data-description-memory-list>
                                    ${renderDescriptionMemoryOptions(suggestions)}
                                </div>
                            </div>
                        </label>
                        <label class="finance-home__create-field">
                            <span class="label-tech">Valor</span>
                            <input
                                type="text"
                                name="cashbox_action_value"
                                value="${escapeAttribute(actionModal.value || '')}"
                                inputmode="numeric"
                                placeholder="R$ 0,00"
                                required
                            />
                        </label>
                        ${actionModal.type === 'retirada' ? `
                            <label class="finance-home__create-field">
                                <span class="label-tech">Caixa de destino</span>
                                <select name="cashbox_destination_cashbox" ${actionModal.transferDirection === 'incoming' ? 'disabled' : ''} required>
                                    <option value="">Selecione um caixa</option>
                                    ${availableCashboxes.map((cashbox) => `<option value="${escapeAttribute(cashbox.id)}" ${String(actionModal.destinationCashboxId || '') === String(cashbox.id) ? 'selected' : ''}>${escapeAttribute(cashbox.title)}</option>`).join('')}
                                </select>
                            </label>
                        ` : ''}
                        <div class="finance-home__create-actions finance-action-form__actions">
                            <button type="button" class="btn-pill" data-cashbox-action-cancel>Cancelar</button>
                            <button type="submit" class="btn-pill btn-black">Salvar</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function renderFichaActionModal(fichaModal, ficha, cashboxes = []) {
    const contracts = Array.isArray(ficha.contracts) ? ficha.contracts : [];
    const titleByType = {
        contrato: 'Novo Contrato',
        pagamento: 'Novo Crédito',
        debito: 'Novo Débito',
        agendamento: 'Novo Agendamento'
    };

    return `
        <div class="finance-modal-backdrop" data-ficha-modal-cancel>
            <div class="finance-modal-card" role="dialog" aria-modal="true" aria-label="${titleByType[fichaModal.type] || 'Ficha'}">
                <form class="finance-home__create-form finance-action-form" data-ficha-action-form>
                    <div class="finance-action-form__intro">
                        <p class="label-tech">Ficha financeira</p>
                        <h3 class="font-black">${titleByType[fichaModal.type] || 'Ficha'}</h3>
                    </div>
                    <div class="finance-action-form__fields">
                        ${fichaModal.type === 'contrato' ? `
                            <label class="finance-home__create-field">
                                <span class="label-tech">Descrição do contrato</span>
                                <input type="text" name="ficha_contract_description" value="${escapeAttribute(fichaModal.description || '')}" placeholder="Ex.: Honorarios de consultoria" required />
                            </label>
                            <label class="finance-home__create-field">
                                <span class="label-tech">Caixa vinculado</span>
                                <select name="ficha_contract_cashbox" required>
                                    <option value="">Selecione um caixa</option>
                                    ${cashboxes.map((cashbox) => `<option value="${escapeAttribute(cashbox.id)}" ${String(fichaModal.cashboxId || '') === String(cashbox.id) ? 'selected' : ''}>${escapeAttribute(cashbox.title)}</option>`).join('')}
                                </select>
                            </label>
                        ` : `
                            <label class="finance-home__create-field">
                                <span class="label-tech">Contrato vinculado</span>
                                <select name="ficha_linked_contract" required>
                                    <option value="">Selecione um contrato</option>
                                    ${contracts.map((contract) => `<option value="${escapeAttribute(contract.id)}" ${String(fichaModal.linkedContractId || '') === String(contract.id) ? 'selected' : ''}>${escapeAttribute(contract.description)}</option>`).join('')}
                                </select>
                            </label>
                            <label class="finance-home__create-field">
                                <span class="label-tech">Data</span>
                                <input type="text" name="ficha_action_date" value="${escapeAttribute(fichaModal.date || formatDateForInput(new Date().toISOString().slice(0, 10)))}" placeholder="dd/mm/aaaa" inputmode="numeric" maxlength="10" required />
                            </label>
                            <label class="finance-home__create-field">
                                <span class="label-tech">Descrição</span>
                                <input type="text" name="ficha_action_description" value="${escapeAttribute(fichaModal.description || '')}" placeholder="Descreva o lancamento" required />
                            </label>
                            <label class="finance-home__create-field">
                                <span class="label-tech">Valor</span>
                                <input type="text" name="ficha_action_value" value="${escapeAttribute(fichaModal.value || '')}" inputmode="numeric" placeholder="R$ 0,00" required />
                            </label>
                        `}
                        <div class="finance-home__create-actions finance-action-form__actions">
                            <button type="button" class="btn-pill" data-ficha-modal-cancel>Cancelar</button>
                            <button type="submit" class="btn-pill btn-black">Salvar</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function createFinanceExportModalState(context) {
    const selected = getFinanceExportOptions(context).reduce((acc, option) => ({
        ...acc,
        [option.id]: option.defaultSelected !== false
    }), {});
    return {
        context,
        selected,
        isDownloading: false,
        activeFormat: null
    };
}

function buildFinanceExportPreview({
    context,
    cashbox = null,
    ficha = null,
    cashboxFilterMode = 'tudo',
    cashboxFilterMonth = getCurrentMonthValue(),
    cashboxFilterYear = getCurrentYearValue(),
    fichaFilterMode = 'tudo',
    fichaFilterMonth = getCurrentMonthValue(),
    fichaFilterYear = getCurrentYearValue()
} = {}) {
    if (context === 'caixa' && cashbox) {
        const filterContext = buildCashboxFilterContext(
            cashbox.transactions || [],
            cashboxFilterMode,
            cashboxFilterMonth,
            cashboxFilterYear
        );
        return {
            context,
            contextLabel: 'Caixa',
            title: cashbox.title || 'Caixa sem nome',
            periodLabel: filterContext.label || 'Todos os lançamentos'
        };
    }

    if (context === 'ficha' && ficha) {
        const contracts = Array.isArray(ficha.contracts) ? ficha.contracts : [];
        const filterEntries = contracts.flatMap((contract) => [
            ...buildContractStatement(contract),
            ...buildContractScheduleRows(contract)
        ]);
        const filterContext = buildCashboxFilterContext(
            filterEntries,
            fichaFilterMode,
            fichaFilterMonth,
            fichaFilterYear
        );
        return {
            context,
            contextLabel: 'Ficha',
            title: ficha.title || 'Ficha sem nome',
            periodLabel: filterContext.label || 'Todos os lançamentos'
        };
    }

    return {
        context,
        contextLabel: context === 'caixa' ? 'Caixa' : 'Ficha',
        title: '',
        periodLabel: 'Todos os lançamentos'
    };
}

function getFinanceExportOptions(context, periodLabel = '') {
    const safePeriod = periodLabel || 'filtro atual';
    if (context === 'caixa') {
        return [
            {
                id: 'summary',
                label: 'Resumo do caixa',
                hint: 'Totais do caixa, período selecionado e saldos vinculados.',
                defaultSelected: true
            },
            {
                id: 'filteredStatement',
                label: `Extrato do filtro (${safePeriod})`,
                hint: 'A mesma visão que está aberta agora no detalhe do caixa.',
                defaultSelected: true
            },
            {
                id: 'fullStatement',
                label: 'Extrato completo',
                hint: 'Todos os lançamentos do caixa, sem filtro de mês ou ano.',
                defaultSelected: false
            },
            {
                id: 'linkedContracts',
                label: 'Contratos vinculados',
                hint: 'Fichas e contratos que movimentam este caixa.',
                defaultSelected: true
            }
        ];
    }

    return [
        {
            id: 'summary',
            label: 'Resumo da ficha',
            hint: 'Valor contratado, pago, saldo e total agendado.',
            defaultSelected: true
        },
        {
            id: 'filteredStatement',
            label: `Extrato do filtro (${safePeriod})`,
            hint: 'Créditos e débitos conforme o filtro ativo da ficha.',
            defaultSelected: true
        },
        {
            id: 'fullStatement',
            label: 'Extrato completo',
            hint: 'Todos os créditos e débitos da ficha.',
            defaultSelected: false
        },
        {
            id: 'contracts',
            label: 'Contratos',
            hint: 'Resumo individual de contratos, caixas vinculados e saldos.',
            defaultSelected: true
        },
        {
            id: 'schedules',
            label: 'Agendamentos',
            hint: 'Compromissos financeiros da ficha com prazo e valor.',
            defaultSelected: true
        }
    ];
}

function renderFinanceExportModal(exportModal, preview) {
    if (!exportModal || !preview?.title) return '';
    const options = getFinanceExportOptions(exportModal.context, preview.periodLabel);
    const selected = exportModal.selected || {};
    const selectedCount = options.filter((option) => selected[option.id]).length;
    const isDownloading = Boolean(exportModal.isDownloading);
    const pdfBusy = isDownloading && exportModal.activeFormat === 'pdf';
    const excelBusy = isDownloading && exportModal.activeFormat === 'excel';

    return `
        <div class="finance-modal-backdrop" data-finance-export-cancel>
            <div class="finance-modal-card finance-export-modal" role="dialog" aria-modal="true" aria-label="Baixar financeiro">
                <div class="finance-export-modal__head">
                    <div>
                        <p class="label-tech">${escapeAttribute(preview.contextLabel)} financeiro</p>
                        <h3 class="font-black">Baixar ${escapeAttribute(preview.title)}</h3>
                        <span>${selectedCount} ${selectedCount === 1 ? 'item selecionado' : 'itens selecionados'} · ${escapeAttribute(preview.periodLabel)}</span>
                    </div>
                    <button type="button" class="finance-export-modal__close" data-finance-export-cancel aria-label="Fechar download" ${isDownloading ? 'disabled' : ''}>
                        ${renderCloseIcon()}
                    </button>
                </div>

                <div class="finance-export-modal__options" aria-label="Itens para baixar">
                    ${options.map((option) => `
                        <label class="finance-export-option ${selected[option.id] ? 'is-selected' : ''}">
                            <input
                                type="checkbox"
                                data-finance-export-option="${escapeAttribute(option.id)}"
                                ${selected[option.id] ? 'checked' : ''}
                                ${isDownloading ? 'disabled' : ''}
                            />
                            <span class="finance-export-option__check" aria-hidden="true"></span>
                            <span class="finance-export-option__copy">
                                <strong>${escapeAttribute(option.label)}</strong>
                                <small>${escapeAttribute(option.hint)}</small>
                            </span>
                        </label>
                    `).join('')}
                </div>

                <div class="finance-export-modal__formats" aria-label="Formatos para baixar">
                    <button type="button" class="finance-export-format finance-export-format--pdf" data-finance-export-format="pdf" ${isDownloading ? 'disabled' : ''}>
                        ${renderDownloadIcon()}
                        <span>
                            <strong>${pdfBusy ? 'Gerando PDF...' : 'PDF'}</strong>
                            <small>com logo da Geo</small>
                        </span>
                    </button>
                    <button type="button" class="finance-export-format finance-export-format--excel" data-finance-export-format="excel" ${isDownloading ? 'disabled' : ''}>
                        ${renderDownloadIcon()}
                        <span>
                            <strong>${excelBusy ? 'Gerando Excel...' : 'Excel'}</strong>
                            <small>planilha .xlsx</small>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function buildFinanceExportData({
    context,
    selected = {},
    cashbox = null,
    ficha = null,
    cashboxes = [],
    fichas = [],
    cashboxFilterMode = 'tudo',
    cashboxFilterMonth = getCurrentMonthValue(),
    cashboxFilterYear = getCurrentYearValue(),
    fichaFilterMode = 'tudo',
    fichaFilterMonth = getCurrentMonthValue(),
    fichaFilterYear = getCurrentYearValue()
} = {}) {
    const generatedAt = new Date();
    const generatedAtLabel = generatedAt.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    if (context === 'caixa' && cashbox) {
        const filterContext = buildCashboxFilterContext(
            cashbox.transactions || [],
            cashboxFilterMode,
            cashboxFilterMonth,
            cashboxFilterYear
        );
        const sections = buildCashboxExportSections({
            cashbox,
            fichas,
            selected,
            filterContext,
            generatedAtLabel
        });
        return {
            context,
            contextLabel: 'Caixa',
            title: `Caixa - ${cashbox.title || 'Sem nome'}`,
            entityTitle: cashbox.title || 'Caixa sem nome',
            periodLabel: filterContext.label || 'Todos os lançamentos',
            generatedAtLabel,
            fileBaseName: buildFinanceExportFileName('caixa', cashbox.title, generatedAt),
            sections
        };
    }

    if (context === 'ficha' && ficha) {
        const contracts = Array.isArray(ficha.contracts) ? ficha.contracts : [];
        const filterEntries = contracts.flatMap((contract) => [
            ...buildContractStatement(contract),
            ...buildContractScheduleRows(contract)
        ]);
        const filterContext = buildCashboxFilterContext(
            filterEntries,
            fichaFilterMode,
            fichaFilterMonth,
            fichaFilterYear
        );
        const statementFilterContext = buildCashboxFilterContext(
            buildFichaGeneralStatement(contracts),
            fichaFilterMode,
            fichaFilterMonth,
            fichaFilterYear
        );
        const sections = buildFichaExportSections({
            ficha,
            cashboxes,
            selected,
            filterContext,
            statementFilterContext,
            generatedAtLabel
        });
        return {
            context,
            contextLabel: 'Ficha',
            title: `Ficha - ${ficha.title || 'Sem nome'}`,
            entityTitle: ficha.title || 'Ficha sem nome',
            periodLabel: filterContext.label || 'Todos os lançamentos',
            generatedAtLabel,
            fileBaseName: buildFinanceExportFileName('ficha', ficha.title, generatedAt),
            sections
        };
    }

    return {
        context,
        contextLabel: context === 'caixa' ? 'Caixa' : 'Ficha',
        title: 'Financeiro',
        entityTitle: 'Financeiro',
        periodLabel: 'Todos os lançamentos',
        generatedAtLabel,
        fileBaseName: buildFinanceExportFileName('financeiro', 'relatorio', generatedAt),
        sections: []
    };
}

function buildCashboxExportSections({ cashbox, fichas = [], selected = {}, filterContext, generatedAtLabel }) {
    const sections = [];
    const transactions = Array.isArray(cashbox.transactions) ? cashbox.transactions : [];
    const allTransactions = buildCashboxFilterContext(transactions, 'tudo').transactions;
    const contractsSummary = buildCashboxContractsSummary(fichas, cashbox.id);
    const linkedContracts = buildCashboxLinkedContractRows(fichas, cashbox.id);
    const cardMetrics = buildCashboxCardMetrics(transactions).metrics;
    const currentBalance = cardMetrics.find((item) => item.label === 'Saldo Total')?.value || 'R$ 0,00';

    if (selected.summary) {
        sections.push({
            id: 'summary',
            kind: 'summary',
            title: 'Resumo do caixa',
            columns: ['Item', 'Valor'],
            widths: [0.38, 0.62],
            rows: [
                ['Caixa', cashbox.title || 'Caixa sem nome'],
                ['Periodo', filterContext.label || 'Todos os lançamentos'],
                ['Gerado em', generatedAtLabel],
                ['Total contratado', formatCurrency(contractsSummary.contracted)],
                ['Total pago', formatCurrency(contractsSummary.paid)],
                ['Total em aberto', formatCurrency(contractsSummary.outstanding)],
                ['Entradas', cardMetrics.find((item) => item.label === 'Entradas')?.value || 'R$ 0,00'],
                ['Saidas', cardMetrics.find((item) => item.label === 'Saidas')?.value || 'R$ 0,00'],
                ['Saldo atual', currentBalance]
            ]
        });
    }

    if (selected.filteredStatement) {
        sections.push({
            id: 'filteredStatement',
            title: `Extrato do filtro - ${filterContext.label || 'Todos os lançamentos'}`,
            columns: ['Data', 'Ficha', 'Descrição', 'Crédito', 'Débito', 'Saldo'],
            widths: [0.1, 0.13, 0.29, 0.16, 0.16, 0.16],
            rows: buildCashboxStatementExportRows(filterContext.transactions)
        });
    }

    if (selected.fullStatement) {
        sections.push({
            id: 'fullStatement',
            title: 'Extrato completo do caixa',
            columns: ['Data', 'Ficha', 'Descrição', 'Crédito', 'Débito', 'Saldo'],
            widths: [0.1, 0.13, 0.29, 0.16, 0.16, 0.16],
            rows: buildCashboxStatementExportRows(allTransactions)
        });
    }

    if (selected.linkedContracts) {
        sections.push({
            id: 'linkedContracts',
            title: 'Contratos vinculados ao caixa',
            columns: ['Ficha', 'Contrato', 'Contratado', 'Pago', 'Em aberto', 'Agendado'],
            widths: [0.18, 0.28, 0.14, 0.14, 0.14, 0.12],
            rows: linkedContracts
        });
    }

    return sections;
}

function buildFichaExportSections({ ficha, cashboxes = [], selected = {}, filterContext, statementFilterContext, generatedAtLabel }) {
    const sections = [];
    const contracts = Array.isArray(ficha.contracts) ? ficha.contracts : [];
    const fullStatement = buildFichaGeneralStatement(contracts);
    const totals = buildFichaDetailTotals(contracts);
    const scheduledTotal = contracts.reduce(
        (sum, contract) => sum + (contract.schedules || []).reduce((inner, item) => inner + parseFinanceAmount(item), 0),
        0
    );

    if (selected.summary) {
        sections.push({
            id: 'summary',
            kind: 'summary',
            title: 'Resumo da ficha',
            columns: ['Item', 'Valor'],
            widths: [0.38, 0.62],
            rows: [
                ['Ficha', ficha.title || 'Ficha sem nome'],
                ['Periodo', filterContext.label || 'Todos os lançamentos'],
                ['Gerado em', generatedAtLabel],
                ['Valor contratado', formatCurrency(totals.contracted)],
                ['Valor pago', formatCurrency(totals.paid)],
                ['Saldo', formatCurrency(totals.balance)],
                ['Agendado', formatCurrency(scheduledTotal)],
                ['Contratos', String(contracts.length)]
            ]
        });
    }

    if (selected.filteredStatement) {
        sections.push({
            id: 'filteredStatement',
            title: `Extrato do filtro - ${filterContext.label || 'Todos os lançamentos'}`,
            columns: ['Data', 'Contrato', 'Descrição', 'Crédito', 'Débito', 'Saldo'],
            widths: [0.1, 0.17, 0.27, 0.15, 0.15, 0.16],
            rows: buildFichaStatementExportRows(statementFilterContext?.transactions || [])
        });
    }

    if (selected.fullStatement) {
        sections.push({
            id: 'fullStatement',
            title: 'Extrato completo da ficha',
            columns: ['Data', 'Contrato', 'Descrição', 'Crédito', 'Débito', 'Saldo'],
            widths: [0.1, 0.17, 0.27, 0.15, 0.15, 0.16],
            rows: buildFichaStatementExportRows(fullStatement)
        });
    }

    if (selected.contracts) {
        sections.push({
            id: 'contracts',
            title: 'Contratos da ficha',
            columns: ['Contrato', 'Caixa', 'Contratado', 'Pago', 'Saldo', 'Agendado'],
            widths: [0.28, 0.2, 0.13, 0.13, 0.13, 0.13],
            rows: buildFichaContractExportRows(contracts, cashboxes)
        });
    }

    if (selected.schedules) {
        sections.push({
            id: 'schedules',
            title: 'Agendamentos da ficha',
            columns: ['Data', 'Contrato', 'Descrição', 'Valor', 'Prazo'],
            widths: [0.12, 0.24, 0.34, 0.14, 0.16],
            rows: buildFichaScheduleExportRows(contracts)
        });
    }

    return sections;
}

function buildCashboxStatementExportRows(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row) => [
        row.date || '-',
        row.fichaTitle || '-',
        row.description || '-',
        row.credit || '-',
        row.debit || '-',
        row.balance || 'R$ 0,00'
    ]);
}

function buildFichaStatementExportRows(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row) => [
        row.date || '-',
        row.contractDescription || '-',
        row.description || '-',
        row.credit || '-',
        row.debit || '-',
        row.balance || 'R$ 0,00'
    ]);
}

function buildCashboxLinkedContractRows(fichas = [], cashboxId = '') {
    return (Array.isArray(fichas) ? fichas : []).flatMap((ficha) => (
        (Array.isArray(ficha?.contracts) ? ficha.contracts : [])
            .filter((contract) => String(contract.cashboxId || '') === String(cashboxId))
            .map((contract) => {
                const summary = buildContractFinancialSummary(contract);
                const scheduled = (contract.schedules || []).reduce((sum, item) => sum + parseFinanceAmount(item), 0);
                return [
                    ficha.title || 'Ficha sem nome',
                    contract.description || 'Contrato sem descrição',
                    formatCurrency(summary.contracted),
                    formatCurrency(summary.paid),
                    formatCurrency(Math.max(summary.contracted - summary.paid, 0)),
                    formatCurrency(scheduled)
                ];
            })
    ));
}

function buildFichaContractExportRows(contracts = [], cashboxes = []) {
    return (Array.isArray(contracts) ? contracts : []).map((contract) => {
        const summary = buildContractFinancialSummary(contract);
        const scheduled = (contract.schedules || []).reduce((sum, item) => sum + parseFinanceAmount(item), 0);
        const cashbox = findItemById(cashboxes, contract.cashboxId);
        return [
            contract.description || 'Contrato sem descrição',
            cashbox?.title || 'Nao definido',
            formatCurrency(summary.contracted),
            formatCurrency(summary.paid),
            formatCurrency(summary.balance),
            formatCurrency(scheduled)
        ];
    });
}

function buildFichaScheduleExportRows(contracts = []) {
    return (Array.isArray(contracts) ? contracts : []).flatMap((contract) => (
        buildContractScheduleRows(contract).map((row) => [
            row.date || '-',
            contract.description || 'Contrato sem descrição',
            row.description || '-',
            row.value || 'R$ 0,00',
            row.dueLabel || '-'
        ])
    ));
}

function buildFinanceExportFileName(context, title, generatedAt = new Date()) {
    const datePart = generatedAt.toISOString().slice(0, 10);
    const safeTitle = String(title || 'relatorio')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'relatorio';
    return `financeiro-${context}-${safeTitle}-${datePart}`;
}

async function downloadFinancePdf(exportData) {
    const globeImage = await loadImageElement(systemGlobeTexture).catch(() => null);
    const canvases = renderFinancePdfCanvases(exportData, globeImage);
    if (!canvases.length) {
        throw new Error('Nao ha dados para gerar o PDF.');
    }
    const pageImages = canvases.map((canvas) => ({
        bytes: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92)),
        width: canvas.width,
        height: canvas.height
    }));
    const pdfBytes = buildPdfFromJpegPages(pageImages);
    downloadBlob(`${exportData.fileBaseName}.pdf`, new Blob([pdfBytes], { type: 'application/pdf' }));
}

function renderFinancePdfCanvases(exportData, globeImage = null) {
    const pageConfig = {
        width: 1240,
        height: 1754,
        margin: 88,
        footerTop: 1630,
        contentWidth: 1240 - 176
    };
    const pages = [];
    let current = null;

    const createPage = () => {
        const canvas = document.createElement('canvas');
        canvas.width = pageConfig.width;
        canvas.height = pageConfig.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Nao foi possivel preparar o PDF.');
        const page = { canvas, ctx, y: 0 };
        page.y = drawFinancePdfPageBackground(page, exportData, globeImage, pageConfig);
        pages.push(page);
        current = page;
        return page;
    };

    const ensureSpace = (height) => {
        if (!current) createPage();
        if (current.y + height <= pageConfig.footerTop) return;
        createPage();
    };

    const drawContinuationTitle = (section) => {
        ensureSpace(70);
        const ctx = current.ctx;
        ctx.fillStyle = '#334155';
        ctx.font = '700 22px Arial, sans-serif';
        ctx.fillText(`${section.title} (continuação)`, pageConfig.margin, current.y);
        current.y += 32;
    };

    const drawTableHeader = (section, columnWidths) => {
        const ctx = current.ctx;
        const headerHeight = 46;
        drawRoundedRect(ctx, pageConfig.margin, current.y, pageConfig.contentWidth, headerHeight, 14, '#e8f1f8');
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 17px Arial, sans-serif';
        let x = pageConfig.margin;
        section.columns.forEach((column, index) => {
            drawPdfCellText(ctx, column, x + 14, current.y + 28, columnWidths[index] - 28, 20, shouldAlignFinanceColumnRight(column) ? 'right' : 'left');
            x += columnWidths[index];
        });
        current.y += headerHeight;
    };

    const drawTable = (section) => {
        const rows = section.rows.length > 0 ? section.rows : [Array(section.columns.length).fill('Sem dados para este item.')];
        const widthRatios = Array.isArray(section.widths) && section.widths.length === section.columns.length
            ? section.widths
            : section.columns.map(() => 1 / section.columns.length);
        const columnWidths = widthRatios.map((ratio) => pageConfig.contentWidth * ratio);
        let needsHeader = true;

        rows.forEach((row, rowIndex) => {
            const ctx = current.ctx;
            ctx.font = '16px Arial, sans-serif';
            const cellLines = section.columns.map((_, index) => (
                shouldKeepFinanceColumnSingleLine(section.columns[index])
                    ? [String(row[index] ?? '-')]
                    : wrapCanvasText(ctx, row[index] ?? '', Math.max(columnWidths[index] - 28, 42), 4)
            ));
            const rowHeight = Math.max(48, Math.max(...cellLines.map((lines) => lines.length)) * 20 + 22);

            if (needsHeader) {
                ensureSpace(46 + rowHeight + 12);
                drawTableHeader(section, columnWidths);
                needsHeader = false;
            } else if (current.y + rowHeight > pageConfig.footerTop) {
                createPage();
                drawContinuationTitle(section);
                drawTableHeader(section, columnWidths);
            }

            const y = current.y;
            const fill = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
            ctx.fillStyle = fill;
            ctx.fillRect(pageConfig.margin, y, pageConfig.contentWidth, rowHeight);
            ctx.strokeStyle = '#dbe5ef';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pageConfig.margin, y + rowHeight);
            ctx.lineTo(pageConfig.margin + pageConfig.contentWidth, y + rowHeight);
            ctx.stroke();

            let x = pageConfig.margin;
            section.columns.forEach((column, index) => {
                const align = shouldAlignFinanceColumnRight(column) ? 'right' : 'left';
                const textX = align === 'right' ? x + columnWidths[index] - 14 : x + 14;
                drawPdfTextLines(ctx, cellLines[index], textX, y + 27, columnWidths[index] - 28, 20, align);
                x += columnWidths[index];
            });
            current.y += rowHeight;
        });
    };

    createPage();
    exportData.sections.forEach((section, index) => {
        ensureSpace(94);
        if (index > 0) current.y += 18;
        const ctx = current.ctx;
        ctx.fillStyle = '#2563eb';
        ctx.font = '700 15px Arial, sans-serif';
        ctx.fillText(String(index + 1).padStart(2, '0'), pageConfig.margin, current.y);
        ctx.fillStyle = '#0f172a';
        ctx.font = '800 28px Arial, sans-serif';
        ctx.fillText(section.title, pageConfig.margin + 48, current.y + 2);
        current.y += 34;
        drawTable(section);
    });

    pages.forEach((page, index) => {
        drawFinancePdfFooter(page, index + 1, pages.length, pageConfig);
    });

    return pages.map((page) => page.canvas);
}

function drawFinancePdfPageBackground(page, exportData, globeImage, pageConfig) {
    const { ctx } = page;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageConfig.width, pageConfig.height);

    drawFinanceSystemLogo(ctx, pageConfig.margin, 58, globeImage);

    drawRoundedRect(ctx, pageConfig.width - pageConfig.margin - 222, 60, 222, 44, 22, '#e0f2fe');
    ctx.fillStyle = '#0369a1';
    ctx.font = '700 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RELATORIO FINANCEIRO', pageConfig.width - pageConfig.margin - 111, 88);
    ctx.textAlign = 'left';

    let y = 198;
    const titleMaxWidth = pageConfig.contentWidth;
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 34px Arial, sans-serif';
    const titleLines = wrapCanvasText(ctx, exportData.title, titleMaxWidth, 2);
    titleLines.forEach((line) => {
        ctx.fillText(line, pageConfig.margin, y);
        y += 40;
    });

    ctx.fillStyle = '#64748b';
    ctx.font = '18px Arial, sans-serif';
    const metaLine = `${exportData.contextLabel}: ${exportData.entityTitle}`;
    const periodLine = `Periodo: ${exportData.periodLabel} · Gerado em ${exportData.generatedAtLabel}`;
    wrapCanvasText(ctx, metaLine, titleMaxWidth, 1).forEach((line) => {
        ctx.fillText(line, pageConfig.margin, y);
        y += 28;
    });
    wrapCanvasText(ctx, periodLine, titleMaxWidth, 1).forEach((line) => {
        ctx.fillText(line, pageConfig.margin, y);
        y += 28;
    });

    const separatorY = y + 10;
    ctx.strokeStyle = '#dbe5ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pageConfig.margin, separatorY);
    ctx.lineTo(pageConfig.width - pageConfig.margin, separatorY);
    ctx.stroke();
    return separatorY + 44;
}

function drawFinanceSystemLogo(ctx, x, y, globeImage = null) {
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 54px Arial, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('GEOC', x, y + 48);
    const geocWidth = ctx.measureText('GEOC').width;
    const globeSize = 52;
    const globeX = x + geocWidth + 8;
    const globeY = y + 2;
    drawFinanceSystemGlobe(ctx, globeX, globeY, globeSize, globeImage);
    ctx.fillText('NSULT', globeX + globeSize + 8, y + 48);

    const taglineY = y + 70;
    drawRoundedRect(ctx, x, taglineY, 382, 28, 14, '#eef4f8');
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.font = '700 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SISTEMA DE GESTAO INTELIGENTE', x + 191, taglineY + 18);
    ctx.textAlign = 'left';
    ctx.restore();
}

function drawFinanceSystemGlobe(ctx, x, y, size, globeImage = null) {
    const center = { x: x + size / 2, y: y + size / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(-23.5 * Math.PI / 180);
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#00102a';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    if (globeImage) {
        ctx.drawImage(globeImage, -size / 2, -size / 2, size, size);
    }
    const shine = ctx.createRadialGradient(-size * 0.22, -size * 0.25, 1, -size * 0.12, -size * 0.16, size * 0.5);
    shine.addColorStop(0, 'rgba(255,255,255,0.52)');
    shine.addColorStop(0.32, 'rgba(172,224,255,0.2)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(-size / 2, -size / 2, size, size);

    const shade = ctx.createRadialGradient(size * 0.28, size * 0.12, size * 0.05, 0, 0, size * 0.68);
    shade.addColorStop(0, 'rgba(2,6,23,0.04)');
    shade.addColorStop(0.62, 'rgba(2,6,23,0.08)');
    shade.addColorStop(1, 'rgba(1,8,24,0.68)');
    ctx.fillStyle = shade;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(96,165,250,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawFinancePdfFooter(page, pageNumber, pageTotal, pageConfig) {
    const { ctx } = page;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pageConfig.margin, pageConfig.height - 86);
    ctx.lineTo(pageConfig.width - pageConfig.margin, pageConfig.height - 86);
    ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText('GEOCONSULT · Geologia, Mineração e Serviços Ambientais', pageConfig.margin, pageConfig.height - 52);
    ctx.textAlign = 'right';
    ctx.fillText(`Pagina ${pageNumber} de ${pageTotal}`, pageConfig.width - pageConfig.margin, pageConfig.height - 52);
    ctx.textAlign = 'left';
}

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawPdfCellText(ctx, text, x, y, width, lineHeight, align = 'left') {
    drawPdfTextLines(ctx, wrapCanvasText(ctx, text, width, 1), align === 'right' ? x + width : x, y, width, lineHeight, align);
}

function drawPdfTextLines(ctx, lines, x, y, width, lineHeight, align = 'left') {
    ctx.textAlign = align;
    ctx.fillStyle = '#0f172a';
    lines.forEach((line, index) => {
        ctx.fillText(line, x, y + (index * lineHeight), width);
    });
    ctx.textAlign = 'left';
}

function wrapCanvasText(ctx, value, maxWidth, maxLines = 4) {
    const words = String(value || '-').replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach((word) => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width <= maxWidth) {
            currentLine = testLine;
            return;
        }
        if (currentLine) lines.push(currentLine);
        currentLine = word;
    });

    if (currentLine) lines.push(currentLine);
    if (lines.length <= maxLines) return lines;

    const visibleLines = lines.slice(0, maxLines);
    let lastLine = visibleLines[visibleLines.length - 1] || '';
    while (lastLine.length > 1 && ctx.measureText(`${lastLine}...`).width > maxWidth) {
        lastLine = lastLine.slice(0, -1);
    }
    visibleLines[visibleLines.length - 1] = `${lastLine.trim()}...`;
    return visibleLines;
}

function shouldAlignFinanceColumnRight(column) {
    return /valor|credito|crédito|debito|débito|saldo|pago|contratado|aberto|agendado|saidas|saídas|entradas/i.test(String(column || ''));
}

function shouldKeepFinanceColumnSingleLine(column) {
    return /valor|credito|crédito|debito|débito|saldo|pago|contratado|aberto|agendado|saidas|saídas|entradas/i.test(String(column || ''));
}

function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function dataUrlToBytes(dataUrl) {
    const base64 = String(dataUrl || '').split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function buildPdfFromJpegPages(pageImages) {
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const builder = createPdfObjectBuilder();
    const pagesId = builder.reserveObject();
    const catalogId = builder.reserveObject();
    const pageIds = pageImages.map((pageImage) => {
        const imageId = builder.addObject(createPdfStreamObject(
            `/Type /XObject /Subtype /Image /Width ${pageImage.width} /Height ${pageImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
            pageImage.bytes
        ));
        const content = `q ${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm /Im1 Do Q`;
        const contentBytes = stringToBytes(content);
        const contentId = builder.addObject(createPdfStreamObject('', contentBytes));
        return builder.addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    });

    builder.setObject(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    builder.setObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    return builder.build(catalogId);
}

function createPdfObjectBuilder() {
    const objects = [];
    return {
        reserveObject() {
            objects.push(null);
            return objects.length;
        },
        setObject(id, value) {
            objects[id - 1] = value instanceof Uint8Array ? value : stringToBytes(String(value));
        },
        addObject(value) {
            objects.push(value instanceof Uint8Array ? value : stringToBytes(String(value)));
            return objects.length;
        },
        build(rootId) {
            const chunks = [];
            const offsets = [0];
            let offset = 0;
            const append = (chunk) => {
                chunks.push(chunk);
                offset += chunk.length;
            };
            append(stringToBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
            objects.forEach((objectBytes, index) => {
                offsets[index + 1] = offset;
                append(stringToBytes(`${index + 1} 0 obj\n`));
                append(objectBytes || stringToBytes('<<>>'));
                append(stringToBytes('\nendobj\n'));
            });
            const xrefOffset = offset;
            const xrefRows = offsets.map((entryOffset, index) => (
                index === 0
                    ? '0000000000 65535 f '
                    : `${String(entryOffset).padStart(10, '0')} 00000 n `
            ));
            append(stringToBytes(`xref\n0 ${objects.length + 1}\n${xrefRows.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root ${rootId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
            return concatBytes(chunks);
        }
    };
}

function createPdfStreamObject(dictionary, streamBytes) {
    return concatBytes([
        stringToBytes(`<< ${dictionary ? `${dictionary} ` : ''}/Length ${streamBytes.length} >>\nstream\n`),
        streamBytes,
        stringToBytes('\nendstream')
    ]);
}

function stringToBytes(value) {
    return new TextEncoder().encode(value);
}

function concatBytes(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    chunks.forEach((chunk) => {
        output.set(chunk, offset);
        offset += chunk.length;
    });
    return output;
}

async function downloadFinanceExcel(exportData) {
    const zip = new JSZip();
    const sheets = buildFinanceWorkbookSheets(exportData);
    if (!sheets.length) {
        throw new Error('Nao ha dados para gerar o Excel.');
    }

    zip.file('[Content_Types].xml', buildXlsxContentTypes(sheets.length));
    zip.folder('_rels').file('.rels', buildXlsxRootRelationships());
    zip.folder('xl').file('workbook.xml', buildXlsxWorkbookXml(sheets));
    zip.folder('xl').folder('_rels').file('workbook.xml.rels', buildXlsxWorkbookRelationships(sheets.length));
    sheets.forEach((sheet, index) => {
        zip.folder('xl').folder('worksheets').file(`sheet${index + 1}.xml`, buildXlsxWorksheetXml(sheet.rows));
    });

    const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    downloadBlob(`${exportData.fileBaseName}.xlsx`, blob);
}

function buildFinanceWorkbookSheets(exportData) {
    const usedNames = new Set();
    return exportData.sections.map((section) => {
        const rows = section.kind === 'summary'
            ? section.rows
            : [
                section.columns,
                ...(section.rows.length > 0 ? section.rows : [Array(section.columns.length).fill('Sem dados')])
            ];
        return {
            name: getUniqueWorksheetName(section.title, usedNames),
            rows
        };
    });
}

function getUniqueWorksheetName(name, usedNames) {
    const baseName = String(name || 'Planilha')
        .replace(/[\\/?*\[\]:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 31) || 'Planilha';
    let candidate = baseName;
    let counter = 2;
    while (usedNames.has(candidate.toLowerCase())) {
        const suffix = ` ${counter}`;
        candidate = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
        counter += 1;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
}

function buildXlsxContentTypes(sheetCount) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    ${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n    ')}
</Types>`;
}

function buildXlsxRootRelationships() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function buildXlsxWorkbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <sheets>
        ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('\n        ')}
    </sheets>
</workbook>`;
}

function buildXlsxWorkbookRelationships(sheetCount) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${Array.from({ length: sheetCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('\n    ')}
</Relationships>`;
}

function buildXlsxWorksheetXml(rows) {
    const safeRows = rows.length > 0 ? rows : [['Sem dados']];
    const maxColumns = safeRows.reduce((max, row) => Math.max(max, row.length), 1);
    const columnXml = Array.from({ length: maxColumns }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 24 : 18}" customWidth="1"/>`).join('');
    const rowXml = safeRows.map((row, rowIndex) => `
        <row r="${rowIndex + 1}">
            ${row.map((cell, columnIndex) => {
                const cellRef = `${columnIndexToName(columnIndex + 1)}${rowIndex + 1}`;
                return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
            }).join('')}
        </row>
    `).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <cols>${columnXml}</cols>
    <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function columnIndexToName(index) {
    let value = index;
    let name = '';
    while (value > 0) {
        const remainder = (value - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        value = Math.floor((value - 1) / 26);
    }
    return name;
}

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function downloadBlob(fileName, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function formatDateShort(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR').format(parsed);
}

function renderCardIcon() {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="4" y="5" width="14" height="14" rx="2"></rect>
            <path d="M8 3v4"></path>
            <path d="M14 3v4"></path>
            <path d="M4 10h14"></path>
        </svg>
    `;
}

function renderBackIcon() {
    return `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6"></path>
        </svg>
    `;
}

function renderPlusMiniIcon() {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14"></path>
            <path d="M5 12h14"></path>
        </svg>
    `;
}

function renderUserMiniIcon() {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
        </svg>
    `;
}

function renderMenuIcon() {
    return `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="5" r="1.5"></circle>
            <circle cx="12" cy="12" r="1.5"></circle>
            <circle cx="12" cy="19" r="1.5"></circle>
        </svg>
    `;
}

function renderChevronIcon() {
    return `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6"></path>
        </svg>
    `;
}

function renderDownloadIcon() {
    return `
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3v12"></path>
            <path d="m7 10 5 5 5-5"></path>
            <path d="M5 21h14"></path>
        </svg>
    `;
}

function renderCloseIcon() {
    return `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
        </svg>
    `;
}

function findItemById(items, id) {
    return (items || []).find((item) => String(item.id) === String(id)) || null;
}

function findContractById(contracts, id) {
    return (contracts || []).find((contract) => String(contract.id) === String(id)) || null;
}

function buildCashboxTransactionList(currentTransactions = [], payload) {
    const entries = Array.isArray(currentTransactions) ? [...currentTransactions] : [];
    const amount = Number(payload.value || 0);
    const isCredit = payload.type === 'entrada';

    entries.push({
        id: `txn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        date: payload.date,
        isoDate: payload.date,
        description: payload.description,
        type: payload.type,
        credit: isCredit ? formatCurrency(amount) : '',
        debit: isCredit ? '' : formatCurrency(-amount),
        balance: 'R$ 0,00'
    });

    return recomputeCashboxBalances(entries);
}

function updateCashboxTransactionList(currentTransactions = [], transactionId, payload) {
    const entries = (currentTransactions || []).map((item) => {
        if (String(item.id) !== String(transactionId)) return item;
        const amount = Number(payload.value || 0);
        const isCredit = payload.type === 'entrada';
        return {
            ...item,
            date: payload.date,
            isoDate: payload.date,
            description: payload.description,
            type: payload.type,
            credit: isCredit ? formatCurrency(amount) : '',
            debit: isCredit ? '' : formatCurrency(-amount)
        };
    });
    return recomputeCashboxBalances(entries);
}

function createCashboxTransfer(cashboxes = [], payload) {
    const transferId = `transfer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    return applyCashboxTransfer(cashboxes, transferId, payload);
}

function updateCashboxTransfer(cashboxes = [], transferId, payload) {
    const cleaned = deleteCashboxTransfer(cashboxes, transferId);
    return applyCashboxTransfer(cleaned, transferId, payload);
}

function deleteCashboxTransfer(cashboxes = [], transferId) {
    return (cashboxes || []).map((cashbox) => {
        const nextTransactions = (cashbox.transactions || []).filter((item) => String(item.transferId || '') !== String(transferId));
        const normalizedTransactions = recomputeCashboxBalances(nextTransactions);
        return {
            ...cashbox,
            transactions: normalizedTransactions,
            ...buildCashboxCardMetrics(normalizedTransactions)
        };
    });
}

function applyCashboxTransfer(cashboxes = [], transferId, payload) {
    const sourceCashbox = findItemById(cashboxes, payload.sourceCashboxId);
    const destinationCashbox = findItemById(cashboxes, payload.destinationCashboxId);
    if (!sourceCashbox || !destinationCashbox) return cashboxes;

    return (cashboxes || []).map((cashbox) => {
        const baseTransactions = Array.isArray(cashbox.transactions) ? [...cashbox.transactions] : [];

        if (String(cashbox.id) === String(payload.sourceCashboxId)) {
            baseTransactions.push({
                id: `${transferId}-out`,
                transferId,
                transferDirection: 'outgoing',
                counterpartCashboxId: payload.destinationCashboxId,
                date: payload.date,
                isoDate: payload.date,
                description: payload.description,
                type: 'retirada',
                credit: '',
                debit: formatCurrency(-Number(payload.value || 0)),
                balance: 'R$ 0,00'
            });
        }

        if (String(cashbox.id) === String(payload.destinationCashboxId)) {
            baseTransactions.push({
                id: `${transferId}-in`,
                transferId,
                transferDirection: 'incoming',
                counterpartCashboxId: payload.sourceCashboxId,
                date: payload.date,
                isoDate: payload.date,
                description: payload.description,
                type: 'entrada',
                credit: formatCurrency(Number(payload.value || 0)),
                debit: '',
                balance: 'R$ 0,00'
            });
        }

        const normalizedTransactions = recomputeCashboxBalances(baseTransactions);
        return {
            ...cashbox,
            transactions: normalizedTransactions,
            ...buildCashboxCardMetrics(normalizedTransactions)
        };
    });
}

function recomputeCashboxBalances(currentTransactions = []) {
    const sorted = [...(currentTransactions || [])].sort((a, b) => {
        const leftDate = normalizeDateStorageValue(a.isoDate || a.date || a.createdAt || '');
        const rightDate = normalizeDateStorageValue(b.isoDate || b.date || b.createdAt || '');
        return leftDate.localeCompare(rightDate) || String(a.id).localeCompare(String(b.id));
    });
    let runningBalance = 0;
    return sorted.map((item) => {
        const delta = item.credit ? parseCurrencyValue(item.credit) : -Math.abs(parseCurrencyValue(item.debit));
        runningBalance += delta;
        const normalizedDate = normalizeDateStorageValue(item.isoDate || item.date || item.createdAt || '');
        return {
            ...item,
            isoDate: normalizedDate,
            date: formatDateForInput(normalizedDate || item.date),
            balance: formatCurrency(runningBalance)
        };
    });
}

function buildCashboxCardMetrics(transactions = []) {
    const entries = Array.isArray(transactions) ? transactions : [];
    const totalCredits = entries.reduce((sum, row) => sum + parseCurrencyValue(row.credit), 0);
    const totalDebits = entries.reduce((sum, row) => sum + parseCurrencyValue(row.debit), 0);
    const balance = entries.length > 0 ? parseCurrencyValue(entries[entries.length - 1].balance) : 0;

    return {
        metrics: [
            { label: 'Entradas', value: formatCurrency(totalCredits), tone: 'positive' },
            { label: 'Saidas', value: formatCurrency(totalDebits), tone: 'negative' },
            { label: 'Saldo Total', value: formatCurrency(balance), tone: balance >= 0 ? 'positive' : 'negative' }
        ],
        footer: [
            { label: 'A Receber', value: 'R$ 0,00', tone: 'info' },
            { label: 'Agendado', value: 'R$ 0,00', tone: 'warning' },
            { label: 'Vencido', value: 'R$ 0,00', tone: 'negative' }
        ]
    };
}

function buildFichaCardMetrics(contracts = []) {
    const safeContracts = Array.isArray(contracts) ? contracts : [];
    const totals = buildFichaDetailTotals(safeContracts);
    const totalScheduled = safeContracts.reduce(
        (sum, contract) => sum + (contract.schedules || []).reduce((inner, item) => inner + parseFinanceAmount(item), 0),
        0
    );
    return {
        metrics: [
            { label: 'Valor Contratado', value: formatCurrency(totals.contracted), tone: 'info' },
            { label: 'Pagamentos', value: formatCurrency(totals.paid), tone: 'positive' },
            { label: 'Saldo', value: formatCurrency(totals.balance), tone: totals.balance < 0 ? 'negative' : totals.balance > 0 ? 'positive' : 'info' }
        ],
        footer: [
            { label: 'Agendado', value: formatCurrency(totalScheduled), tone: 'warning' },
            { label: 'Recebido', value: formatCurrency(totals.paid), tone: 'positive' },
            { label: 'Contratos', value: String(safeContracts.length), tone: 'info' }
        ]
    };
}

function createFichaModalState(type) {
    return { type };
}

function applyFichaModalSubmission(ficha, fichaModal, formData) {
    const contracts = Array.isArray(ficha.contracts) ? [...ficha.contracts] : [];

    if (fichaModal.type === 'contrato') {
        const description = String(formData.get('ficha_contract_description') || '').trim();
        const cashboxId = String(formData.get('ficha_contract_cashbox') || '').trim();
        if (!description || !cashboxId) return ficha;
        if (fichaModal.editingContractId) {
            const nextContracts = contracts.map((contract) => (
                String(contract.id) === String(fichaModal.editingContractId)
                    ? { ...contract, description, cashboxId }
                    : contract
            ));
            return { ...ficha, contracts: nextContracts, ...buildFichaCardMetrics(nextContracts) };
        }
        contracts.unshift({
            id: `contract-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            createdAt: new Date().toISOString().slice(0, 10),
            description,
            amount: 0,
            cashboxId,
            payments: [],
            debits: [],
            schedules: []
        });
    }

    if (fichaModal.type === 'pagamento' || fichaModal.type === 'debito' || fichaModal.type === 'agendamento') {
        const contractId = String(formData.get('ficha_linked_contract') || '').trim();
        const date = parseInputDateToIso(String(formData.get('ficha_action_date') || '').trim());
        const description = String(formData.get('ficha_action_description') || '').trim();
        const value = parseCurrencyInput(String(formData.get('ficha_action_value') || '').trim());
        if (!contractId || !date || !description || value <= 0) return ficha;

        const collectionKey = fichaModal.type === 'pagamento'
            ? 'payments'
            : fichaModal.type === 'debito'
                ? 'debits'
                : 'schedules';
        const nextContracts = contracts.map((contract) => (
            String(contract.id) === contractId
                ? {
                    ...contract,
                    [collectionKey]: fichaModal.editingEntryId
                        ? (contract[collectionKey] || []).map((entry) => (
                            String(entry.id) === String(fichaModal.editingEntryId)
                                ? { ...entry, date, description, value }
                                : entry
                        ))
                        : [
                            {
                                id: `${collectionKey}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                                date,
                                description,
                                value
                            },
                            ...(contract[collectionKey] || [])
                        ]
                }
                : contract
        ));
        return {
            ...ficha,
            contracts: nextContracts,
            ...buildFichaCardMetrics(nextContracts)
        };
    }

    return {
        ...ficha,
        contracts,
        ...buildFichaCardMetrics(contracts)
    };
}

function syncCashboxPaymentsWithFichas(cashboxes = [], fichas = []) {
    const payments = (fichas || []).flatMap((ficha) => extractFichaPayments(ficha));
    return (cashboxes || []).map((cashbox) => {
        const manualTransactions = (cashbox.transactions || []).filter((item) => !String(item.id || '').startsWith('ficha-payment-'));
        const paymentTransactions = payments
            .filter((payment) => String(payment.cashboxId) === String(cashbox.id))
            .map((payment) => ({
                id: `ficha-payment-${payment.id}`,
                date: payment.date,
                isoDate: payment.date,
                fichaTitle: payment.fichaTitle,
                description: payment.description,
                type: 'entrada',
                credit: formatCurrency(payment.value),
                debit: '',
                balance: 'R$ 0,00'
            }));
        const nextTransactions = recomputeCashboxBalances([...manualTransactions, ...paymentTransactions]);
        return {
            ...cashbox,
            transactions: nextTransactions,
            ...buildCashboxCardMetrics(nextTransactions)
        };
    });
}

function extractFichaPayments(ficha) {
    const contracts = Array.isArray(ficha?.contracts) ? ficha.contracts : [];
    return contracts.flatMap((contract) => (contract.payments || []).map((payment) => ({
        ...payment,
        fichaTitle: ficha?.title || '',
        cashboxId: contract.cashboxId
    })));
}

function findFichaPaymentReference(fichas = [], paymentId) {
    for (const ficha of fichas || []) {
        for (const contract of ficha.contracts || []) {
            const entry = (contract.payments || []).find((payment) => String(payment.id) === String(paymentId));
            if (entry) {
                return {
                    fichaId: ficha.id,
                    contractId: contract.id,
                    entry
                };
            }
        }
    }
    return null;
}

function getFichaEntryCollectionKey(entryType) {
    if (entryType === 'payment') return 'payments';
    if (entryType === 'debit') return 'debits';
    return 'schedules';
}

function buildContractStatement(contract) {
    const events = [];

    (contract.debits || []).forEach((item) => {
        events.push({
            date: item.date,
            description: item.description,
            delta: -parseFinanceAmount(item),
            entryType: 'debit',
            entryId: item.id
        });
    });

    (contract.payments || []).forEach((item) => {
        events.push({
            date: item.date,
            description: item.description,
            delta: parseFinanceAmount(item),
            entryType: 'payment',
            entryId: item.id
        });
    });

    const sorted = events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let runningBalance = 0;
    return sorted.map((event) => {
        runningBalance += Number(event.delta || 0);
        return {
            isoDate: event.date,
            date: formatDateForInput(event.date),
            description: event.description,
            credit: event.delta > 0 ? formatCurrency(event.delta) : '',
            debit: event.delta < 0 ? formatCurrency(event.delta) : '',
            balance: formatCurrency(runningBalance),
            entryType: event.entryType,
            entryId: event.entryId
        };
    });
}

function buildContractFinancialSummary(contract) {
    const contracted = (contract.debits || []).reduce((sum, item) => sum + parseFinanceAmount(item), 0);
    const paid = (contract.payments || []).reduce((sum, item) => sum + parseFinanceAmount(item), 0);
    // O resumo deve espelhar o saldo acumulado do extrato: creditos menos debitos.
    return {
        contracted,
        paid,
        balance: paid - contracted
    };
}

function buildCashboxContractsSummary(fichas = [], cashboxId) {
    return (Array.isArray(fichas) ? fichas : []).reduce((acc, ficha) => {
        (Array.isArray(ficha?.contracts) ? ficha.contracts : []).forEach((contract) => {
            if (String(contract?.cashboxId) !== String(cashboxId)) return;
            const summary = buildContractFinancialSummary(contract);
            acc.contracted += summary.contracted;
            acc.paid += summary.paid;
            acc.outstanding += Math.max(summary.contracted - summary.paid, 0);
            acc.scheduled += (contract.schedules || []).reduce((sum, item) => sum + parseFinanceAmount(item), 0);
            acc.contractCount += 1;
        });
        return acc;
    }, { contracted: 0, paid: 0, outstanding: 0, scheduled: 0, contractCount: 0 });
}

function buildFichaDetailTotals(contracts = []) {
    return (Array.isArray(contracts) ? contracts : []).reduce((acc, contract) => {
        const summary = buildContractFinancialSummary(contract);
        acc.contracted += summary.contracted;
        acc.paid += summary.paid;
        acc.balance += summary.balance;
        return acc;
    }, { contracted: 0, paid: 0, balance: 0 });
}

function buildFichaGeneralStatement(contracts = []) {
    const events = (Array.isArray(contracts) ? contracts : []).flatMap((contract) => (
        buildContractStatement(contract).map((row) => ({
            ...row,
            contractId: contract.id,
            contractDescription: contract.description,
            delta: row.credit ? parseCurrencyValue(row.credit) : -Math.abs(parseCurrencyValue(row.debit))
        }))
    ));

    const sorted = events.sort((left, right) => (
        String(left.isoDate || '').localeCompare(String(right.isoDate || '')) ||
        String(left.contractDescription || '').localeCompare(String(right.contractDescription || '')) ||
        String(left.entryId || '').localeCompare(String(right.entryId || ''))
    ));

    let runningBalance = 0;
    return sorted.map((event) => {
        runningBalance += Number(event.delta || 0);
        return {
            ...event,
            balance: formatCurrency(runningBalance)
        };
    });
}

function buildContractScheduleRows(contract) {
    return (contract.schedules || [])
        .map((item) => {
            const isoDate = normalizeDateStorageValue(item.date || '');
            const daysUntilDue = calculateDaysUntilDate(isoDate);
            return {
                isoDate,
                date: formatDateForInput(isoDate),
                description: item.description,
                value: formatCurrency(item.value),
                daysUntilDue,
                dueLabel: formatDueLabel(daysUntilDue),
                entryType: 'schedule',
                entryId: item.id
            };
        })
        .sort((left, right) => String(left.isoDate || '').localeCompare(String(right.isoDate || '')));
}

function buildFinanceScheduleDashboard(fichas = []) {
    const rows = extractFinanceScheduleRows(fichas);
    const groupDefinitions = [
        {
            id: 'overdue',
            label: 'Vencidos',
            eyebrow: 'Atenção',
            tone: 'negative',
            emptyText: 'Nenhum agendamento vencido.',
            matcher: (row) => row.daysUntilDue < 0
        },
        {
            id: 'today',
            label: 'Hoje',
            eyebrow: 'Vencem hoje',
            tone: 'info',
            emptyText: 'Nada vence hoje.',
            matcher: (row) => row.daysUntilDue === 0
        },
        {
            id: 'next7',
            label: 'Próximos 7 dias',
            eyebrow: 'Curto prazo',
            tone: 'warning',
            emptyText: 'Nenhum compromisso nos próximos 7 dias.',
            matcher: (row) => row.daysUntilDue > 0 && row.daysUntilDue <= 7
        },
        {
            id: 'next30',
            label: 'Próximos 30 dias',
            eyebrow: 'Agenda do mês',
            tone: 'neutral',
            emptyText: 'Nenhum compromisso entre 8 e 30 dias.',
            matcher: (row) => row.daysUntilDue > 7 && row.daysUntilDue <= 30
        },
        {
            id: 'later',
            label: 'Depois de 30 dias',
            eyebrow: 'Futuro',
            tone: 'info',
            emptyText: 'Nenhum compromisso futuro distante.',
            matcher: (row) => row.daysUntilDue > 30
        }
    ];

    const groups = groupDefinitions.map((definition) => {
        const groupRows = rows.filter(definition.matcher);
        return {
            ...definition,
            rows: groupRows,
            total: groupRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
        };
    });

    const countLabel = (count) => `${count} ${count === 1 ? 'item' : 'itens'}`;
    return {
        rows,
        groups,
        summaryCards: [
            {
                label: 'Vencido',
                value: formatCurrency(groups.find((group) => group.id === 'overdue')?.total || 0),
                countLabel: countLabel(groups.find((group) => group.id === 'overdue')?.rows.length || 0),
                tone: 'negative'
            },
            {
                label: 'Hoje',
                value: formatCurrency(groups.find((group) => group.id === 'today')?.total || 0),
                countLabel: countLabel(groups.find((group) => group.id === 'today')?.rows.length || 0),
                tone: 'info'
            },
            {
                label: '7 dias',
                value: formatCurrency(groups.find((group) => group.id === 'next7')?.total || 0),
                countLabel: countLabel(groups.find((group) => group.id === 'next7')?.rows.length || 0),
                tone: 'warning'
            },
            {
                label: '30 dias',
                value: formatCurrency(groups.find((group) => group.id === 'next30')?.total || 0),
                countLabel: countLabel(groups.find((group) => group.id === 'next30')?.rows.length || 0),
                tone: 'neutral'
            }
        ]
    };
}

function extractFinanceScheduleRows(fichas = []) {
    return (Array.isArray(fichas) ? fichas : [])
        .flatMap((ficha) => {
            const contracts = Array.isArray(ficha?.contracts) ? ficha.contracts : [];
            return contracts.flatMap((contract) => (
                (Array.isArray(contract?.schedules) ? contract.schedules : []).map((schedule) => {
                    const isoDate = normalizeDateStorageValue(schedule.date || '');
                    const amount = parseFinanceAmount(schedule);
                    const daysUntilDue = calculateDaysUntilDate(isoDate);
                    const [year, month, day] = /^\d{4}-\d{2}-\d{2}$/.test(isoDate)
                        ? isoDate.split('-')
                        : ['', '', ''];
                    return {
                        id: `${ficha.id}:${contract.id}:${schedule.id}`,
                        fichaId: ficha.id,
                        fichaTitle: ficha.title || 'Ficha sem nome',
                        contractId: contract.id,
                        contractDescription: contract.description || 'Contrato sem descrição',
                        entryId: schedule.id,
                        isoDate,
                        date: formatDateForInput(isoDate),
                        day: day || '--',
                        monthLabel: formatScheduleMonthLabel(year, month),
                        description: schedule.description || 'Agendamento sem descrição',
                        amount,
                        value: formatCurrency(amount),
                        daysUntilDue,
                        dueLabel: formatDueLabel(daysUntilDue),
                        tone: getFinanceScheduleTone(daysUntilDue)
                    };
                })
            ));
        })
        .sort((left, right) => (
            String(left.isoDate || '').localeCompare(String(right.isoDate || '')) ||
            String(left.fichaTitle || '').localeCompare(String(right.fichaTitle || ''), 'pt-BR', { sensitivity: 'base' }) ||
            String(left.description || '').localeCompare(String(right.description || ''), 'pt-BR', { sensitivity: 'base' })
        ));
}

function formatScheduleMonthLabel(year, month) {
    if (!/^\d{4}$/.test(String(year || '')) || !/^\d{2}$/.test(String(month || ''))) return 'Sem data';
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${year}-${month}-01T12:00:00`));
    return label.replace('.', '').toUpperCase();
}

function getFinanceScheduleTone(daysUntilDue) {
    if (daysUntilDue < 0) return 'negative';
    if (daysUntilDue === 0) return 'info';
    if (daysUntilDue <= 7) return 'warning';
    return 'neutral';
}

function formatCurrency(value) {
    const numeric = Number(value || 0);
    const formatted = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Math.abs(numeric));
    return numeric < 0 ? `-${formatted}` : formatted;
}

function getCurrentMonthValue() {
    return new Date().toISOString().slice(0, 7);
}

function getCurrentYearValue() {
    return new Date().toISOString().slice(0, 4);
}

function calculateDaysUntilDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return 0;
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const [year, month, day] = String(isoDate).split('-').map(Number);
    const dueUtc = Date.UTC(year, month - 1, day);
    return Math.round((dueUtc - todayUtc) / 86400000);
}

function formatDueLabel(daysUntilDue) {
    if (daysUntilDue < 0) {
        const daysOverdue = Math.abs(daysUntilDue);
        return daysOverdue === 1 ? '1 dia vencido' : `${daysOverdue} dias vencidos`;
    }
    if (daysUntilDue === 0) return 'Vence hoje';
    if (daysUntilDue === 1) return 'Vence em 1 dia';
    return `Vence em ${daysUntilDue} dias`;
}

function parseCurrencyValue(value) {
    if (!value) return 0;
    const normalized = String(value)
        .replace(/[R$\s]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
}

function parseFinanceAmount(entry) {
    const rawValue = entry && typeof entry === 'object' ? entry.value ?? entry.amount : entry;
    if (typeof rawValue === 'number') {
        return Number.isFinite(rawValue) ? rawValue : 0;
    }
    if (typeof rawValue === 'string') {
        return parseCurrencyValue(rawValue);
    }
    const numeric = Number(rawValue || 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function formatDateForInput(value) {
    if (!value) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(value))) return String(value);
    const [year, month, day] = String(value).split('-');
    if (!year || !month || !day) return '';
    return `${day}/${month}/${year}`;
}

function normalizeDateStorageValue(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) return raw.replace(/\//g, '-');
    const parsedDate = new Date(raw);
    if (!Number.isNaN(parsedDate.getTime())) {
        const year = parsedDate.getFullYear();
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const day = String(parsedDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const parsed = parseInputDateToIso(raw);
    return parsed || raw;
}

function formatDateTyping(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseInputDateToIso(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 8) return '';
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4, 8));
    if (!day || !month || !year || month > 12 || day > 31) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatCurrencyTyping(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    const numeric = Number(digits) / 100;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(numeric);
}

function parseCurrencyInput(value) {
    const normalized = String(value || '')
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
}

function updateDescriptionMemory(currentMemory = [], description = '') {
    const normalized = String(description || '').trim();
    if (!normalized) return Array.isArray(currentMemory) ? currentMemory : [];
    const safeMemory = Array.isArray(currentMemory) ? currentMemory : [];
    return [normalized, ...safeMemory.filter((item) => item !== normalized)].slice(0, 20);
}

function filterDescriptionMemory(currentMemory = [], query = '') {
    const safeMemory = Array.isArray(currentMemory) ? currentMemory : [];
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return [];
    return safeMemory
        .filter((item) => String(item || '').toLowerCase().startsWith(normalizedQuery))
        .slice(0, 12);
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function renderDescriptionMemoryOptions(suggestions = [], activeIndex = -1) {
    return suggestions.map((item, index) => `
        <button
            type="button"
            class="finance-description-memory__item ${index === activeIndex ? 'is-active' : ''}"
            data-description-memory-item="${escapeAttribute(item)}"
        >
            ${escapeAttribute(item)}
        </button>
    `).join('');
}

function escapeAttribute(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
