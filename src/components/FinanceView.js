import {
    loadUserScopedJsonStorage,
    saveUserScopedJsonStorage
} from '../dashboard/userScopedStorage.js';
import { escapeHtml } from '../utils/sanitize.js';
import { showNoticeModal } from './NoticeModal.js';
import { showConfirmModal } from './ConfirmModal.js';

const FINANCE_TABS = [
    { id: 'caixa', label: 'Caixa', title: 'Operacoes de caixa', copy: 'Registre manualmente entradas, saidas e consultas do caixa selecionado.' },
    { id: 'fichas', label: 'Fichas', title: 'Fichas financeiras', copy: 'Organize as fichas financeiras e acompanhe os registros de cada titular.' },
    { id: 'agendamentos', label: 'Agendamentos', title: 'Agendamentos financeiros', copy: 'Visualize compromissos, cobrancas e operacoes programadas.' }
];

const GEOCONSULT_LEGACY_DATE_FIXES = [
    { type: 'entrada', amount: 57413.75, descriptions: ['saldo anterior'], isoDate: '2026-01-01' },
    { type: 'debito', amount: 50, descriptions: ['plano de integralizacao do capital - sicredi'], isoDate: '2026-01-02' },
    { type: 'debito', amount: 5000, descriptions: ['aluguel'], isoDate: '2026-01-05' },
    { type: 'debito', amount: 4500, descriptions: ['salario do matheus', 'salario matheus'], isoDate: '2026-01-05' },
    { type: 'debito', amount: 3036, descriptions: ['salario gladis'], isoDate: '2026-01-05' },
    { type: 'debito', amount: 2750, descriptions: ['salario emanuel'], isoDate: '2026-01-05' },
    { type: 'debito', amount: 194.95, descriptions: ['taxa licenciamento'], isoDate: '2026-01-05' },
    { type: 'debito', amount: 63.8, descriptions: ['cesta de relacionamento sicredi'], isoDate: '2026-01-05' },
    { type: 'debito', amount: 306, descriptions: ['pagamento da internet'], isoDate: '2026-01-05' },
    { type: 'debito', amount: 7020, descriptions: ['salario elizabeth'], isoDate: '2026-01-05' },
    { type: 'debito', amount: 255.84, descriptions: ['combustivel onix'], isoDate: '2026-01-19' },
    { type: 'debito', amount: 4851.31, descriptions: ['simples nacional'], isoDate: '2026-01-20' },
    { type: 'debito', amount: 1669.51, descriptions: ['simples nacional'], isoDate: '2026-01-20' },
    { type: 'entrada', amount: 12400, descriptions: ['pea'], isoDate: '2026-01-21' }
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
        expandedContractsByFicha: {},
        syncStatus: mapSyncStatusToUi(initialSyncMeta?.syncStatus || 'remote'),
        syncUpdatedAt: initialSyncMeta?.updatedAt || existingState?.updatedAt || null,
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

    const canApplyExternalSync = () => !state.isAdding && !state.actionModal && !state.fichaModal;

    const applyRemoteStateInPlace = (result, { isManualRefresh = false } = {}) => {
        const normalized = normalizeFinanceSyncResult(result, buildPersistedFinanceState(state));
        const nextUpdatedAt = normalized.updatedAt || normalized.state?.updatedAt || null;
        if (!isManualRefresh && nextUpdatedAt && nextUpdatedAt === (state.updatedAt || null)) {
            return false;
        }
        applyPersistedState(state, normalized.state);
        state.syncStatus = mapSyncStatusToUi(normalized.syncStatus);
        state.syncUpdatedAt = normalized.updatedAt || state.updatedAt || null;
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
            shouldBlockUnload: ['saving', 'syncing', 'refreshing'].includes(state.syncStatus)
        });
    };

    const persistState = () => {
        state.updatedAt = new Date().toISOString();
        const snapshot = buildPersistedFinanceState(state);
        if (persistPreference) {
            state.syncStatus = 'saving';
            state.syncUpdatedAt = state.updatedAt;
            const currentVersion = ++persistVersion;
            emitSyncState();
            render();
            void Promise.resolve(persistPreference(snapshot))
                .then((result) => {
                    if (currentVersion !== persistVersion) return;
                    const normalized = normalizeFinanceSyncResult(result, snapshot);
                    applyPersistedState(state, normalized.state);
                    state.syncUpdatedAt = normalized.updatedAt || state.updatedAt || new Date().toISOString();
                    state.syncStatus = mapSyncStatusToUi(normalized.syncStatus);
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

        if (action === 'edit-cashbox-row' && selectedCashbox) {
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
                    editingContractId: paymentRef.contractId,
                    editingEntryId: paymentRef.entry.id,
                    linkedContractId: paymentRef.contractId,
                    date: formatDateForInput(paymentRef.entry.date),
                    description: paymentRef.entry.description,
                    value: formatCurrency(paymentRef.entry.value)
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
                value: row.credit || row.debit || '',
                editingTransactionId: row.id,
                editingTransferId: row.transferId || '',
                transferDirection: row.transferDirection || '',
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

                if ((action === 'edit-entry' || action === 'delete-entry') && selectedFicha) {
                    const contract = findContractById(selectedFicha.contracts, button.dataset.contractId);
                    const entryType = String(button.dataset.entryType || '');
                    const collectionKey = getFichaEntryCollectionKey(entryType);
                    const entry = findItemById(contract?.[collectionKey] || [], button.dataset.entryId);
                    if (!contract || !entry) return;

                    if (action === 'edit-entry') {
                        state.fichaModal = {
                            type: entryType === 'payment' ? 'pagamento' : entryType === 'debit' ? 'debito' : 'agendamento',
                            editingContractId: contract.id,
                            editingEntryId: entry.id,
                            linkedContractId: contract.id,
                    date: formatDateForInput(entry.date),
                    description: entry.description,
                    value: formatCurrency(entry.value)
                };
                state.detailMenuKey = null;
                render();
                container.querySelector('[name="ficha_linked_contract"]')?.focus();
                return;
            }

            showConfirmModal('Excluir lançamento', `Deseja excluir o lançamento "${entry.description}"?`, async () => {
                state.itemsByTab.fichas = (state.itemsByTab.fichas || []).map((ficha) => {
                    if (String(ficha.id) !== String(selectedFicha.id)) return ficha;
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
        const activeItems = getSortedFinanceItems(state.itemsByTab[activeTab.id] || [], activeTab.id).map((item) => normalizeFinanceItemForRender(item, activeTab.id));
        const selectedCashbox = activeTab.id === 'caixa'
            ? findItemById(state.itemsByTab.caixa, state.selectedCashboxId)
            : null;
        const selectedFicha = activeTab.id === 'fichas'
            ? findItemById(state.itemsByTab.fichas, state.selectedFichaId)
            : null;
        const shouldShowSyncBar = state.syncStatus !== 'synced' || state.isRefreshingRemote;

        container.innerHTML = `
            <section class="finance-home ${hasRenderedOnce ? '' : 'animate-fade-in'}">
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
                                        <span>${getFinanceSyncHint(state.syncStatus, state.syncUpdatedAt)}</span>
                                    </div>
                                </div>
                                ${state.syncStatus === 'offline' || state.isRefreshingRemote ? `
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
                                <button
                                    type="button"
                                    class="client-master-add"
                                    data-finance-add="${activeTab.id}"
                                    aria-label="Adicionar ${activeTab.label}"
                                    title="Adicionar ${activeTab.label}"
                                >
                                    ${renderAddIcon()}
                                </button>
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
                persistState();
                render();
            });
        });

        container.querySelector('[data-finance-refresh]')?.addEventListener('click', async () => {
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
        });

        container.querySelectorAll('[data-cashbox-view-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextMode = String(button.dataset.cashboxViewMode || '');
                if (!['cards', 'lista'].includes(nextMode) || nextMode === state.cashboxViewMode) return;
                state.cashboxViewMode = nextMode;
                persistState();
                render();
            });
        });

        container.querySelectorAll('[data-ficha-view-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextMode = String(button.dataset.fichaViewMode || '');
                if (!['cards', 'lista'].includes(nextMode) || nextMode === state.fichaViewMode) return;
                state.fichaViewMode = nextMode;
                persistState();
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
            render();
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

        container.querySelector('[name="cashbox_filter_month"]')?.addEventListener('change', (event) => {
            const nextMonth = String(event.currentTarget.value || '');
            if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
            state.cashboxFilterMonth = nextMonth;
            render();
        });

        container.querySelector('[name="cashbox_filter_year"]')?.addEventListener('change', (event) => {
            const nextYear = String(event.currentTarget.value || '');
            if (!/^\d{4}$/.test(nextYear)) return;
            state.cashboxFilterYear = nextYear;
            render();
        });

        container.querySelector('[name="ficha_filter_month"]')?.addEventListener('change', (event) => {
            const nextMonth = String(event.currentTarget.value || '');
            if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
            state.fichaFilterMonth = nextMonth;
            render();
        });

        container.querySelector('[name="ficha_filter_year"]')?.addEventListener('change', (event) => {
            const nextYear = String(event.currentTarget.value || '');
            if (!/^\d{4}$/.test(nextYear)) return;
            state.fichaFilterYear = nextYear;
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

        container.querySelector('.finance-modal-card')?.addEventListener('click', (event) => {
            event.stopPropagation();
        });

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
            updatedAt: result.updatedAt || result.state?.updatedAt || null
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
    if (syncStatus === 'refreshing') return 'refreshing';
    if (syncStatus === 'saving') return 'saving';
    return syncStatus || 'synced';
}

function getFinanceSyncLabel(syncStatus) {
    if (syncStatus === 'saving' || syncStatus === 'syncing') return 'Salvando na nuvem';
    if (syncStatus === 'refreshing') return 'Atualizando do remoto';
    if (syncStatus === 'offline') return 'Salvo apenas neste navegador';
    return 'Sincronizado';
}

function getFinanceSyncHint(syncStatus, updatedAt) {
    const suffix = updatedAt ? `Ultima atualizacao: ${formatSyncTimestamp(updatedAt)}` : '';
    if (syncStatus === 'saving' || syncStatus === 'syncing') return 'Aguarde antes de fechar a pagina.';
    if (syncStatus === 'refreshing') return 'Buscando os dados mais recentes do servidor.';
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
        const repairedTransactions = repairLegacyCashboxTransactions(cashbox);
        const normalizedTransactions = recomputeCashboxBalances(repairedTransactions);
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

function repairLegacyCashboxTransactions(cashbox) {
    const transactions = Array.isArray(cashbox?.transactions) ? cashbox.transactions : [];
    if (normalizeText(cashbox?.title) !== 'geoconsult') return transactions;

    return transactions.map((transaction) => {
        if (String(transaction?.id || '').startsWith('ficha-payment-')) {
            return transaction;
        }

        const match = GEOCONSULT_LEGACY_DATE_FIXES.find((rule) => {
            const description = normalizeText(transaction.description);
            const amount = transaction.credit
                ? parseCurrencyValue(transaction.credit)
                : Math.abs(parseCurrencyValue(transaction.debit));
            const type = transaction.credit ? 'entrada' : 'debito';
            return (
                type === rule.type &&
                Math.abs(amount - rule.amount) < 0.001 &&
                rule.descriptions.some((label) => (
                    description === label ||
                    description.includes(label) ||
                    label.includes(description)
                ))
            );
        });

        if (!match) return transaction;

        return {
            ...transaction,
            isoDate: match.isoDate,
            date: formatDateForInput(match.isoDate)
        };
    });
}

function renderFinanceCard(item, openMenuId) {
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

function getSortedFinanceItems(items = [], tabId = '') {
    const safeItems = Array.isArray(items) ? [...items] : [];
    if (tabId !== 'fichas') return safeItems;
    return safeItems.sort((left, right) => String(left?.title || '').localeCompare(String(right?.title || ''), 'pt-BR', { sensitivity: 'base' }));
}

function normalizeFinanceItemForRender(item, tabId = '') {
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

function renderCashboxDetailView(cashbox, fichas = [], detailMenuKey = null, filterMode = 'tudo', selectedMonth = getCurrentMonthValue(), selectedYear = getCurrentYearValue()) {
    const filterContext = buildCashboxFilterContext(cashbox.transactions || [], filterMode, selectedMonth, selectedYear);
    const transactions = filterContext.transactions;
    const contractsSummary = buildCashboxContractsSummary(fichas, cashbox.id);
    return `
        <div class="cashbox-detail">
            <div class="cashbox-detail__header">
                <button type="button" class="cashbox-detail__back" data-finance-back aria-label="Voltar para caixas">
                    ${renderBackIcon()}
                </button>
                <div class="cashbox-detail__title-wrap">
                    <h2 class="font-black cashbox-detail__title">${cashbox.title}</h2>
                </div>
                <div class="cashbox-detail__filter" role="tablist" aria-label="Filtro do caixa">
                    <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'mensal' ? 'is-active' : ''}" data-cashbox-filter="mensal">Mensal</button>
                    <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'anual' ? 'is-active' : ''}" data-cashbox-filter="anual">Anual</button>
                    <button type="button" class="cashbox-detail__filter-pill ${filterMode === 'tudo' ? 'is-active' : ''}" data-cashbox-filter="tudo">Tudo</button>
                    ${filterMode === 'mensal' ? `
                        <select
                            class="cashbox-detail__month-picker"
                            name="cashbox_filter_month"
                            aria-label="Selecionar mês"
                        >
                            ${renderCashboxMonthOptions(filterContext.selectedMonth)}
                        </select>
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
                <div class="cashbox-detail__actions">
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

function renderCashboxMonthOptions(selectedMonth) {
    const monthValue = /^\d{4}-\d{2}$/.test(selectedMonth || '') ? selectedMonth : getCurrentMonthValue();
    const [selectedYear] = monthValue.split('-');
    return Array.from({ length: 12 }, (_, index) => {
        const monthNumber = String(index + 1).padStart(2, '0');
        const value = `${selectedYear}-${monthNumber}`;
        const label = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(`${selectedYear}-${monthNumber}-01T12:00:00`));
        const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
        return `<option value="${escapeAttribute(value)}" ${value === monthValue ? 'selected' : ''}>${displayLabel}</option>`;
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
                        <select
                            class="cashbox-detail__month-picker"
                            name="ficha_filter_month"
                            aria-label="Selecionar mês da ficha"
                        >
                            ${renderCashboxMonthOptions(selectedMonth)}
                        </select>
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
                    <div class="cashbox-detail__table-wrap ficha-detail-panel__table">
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
                    <div class="ficha-contract-list">
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
                    <div class="cashbox-detail__table-wrap">
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
                        <div class="cashbox-detail__table-wrap ficha-contract-card__table-wrap">
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
        });
        return acc;
    }, { contracted: 0, paid: 0, outstanding: 0 });
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
