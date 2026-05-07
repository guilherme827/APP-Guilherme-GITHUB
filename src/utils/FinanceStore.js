import { loadUserScopedJsonStorage, saveUserScopedJsonStorage } from '../dashboard/userScopedStorage.js';
import { authService } from './AuthService.js';
import { normalizeApiError } from './networkErrors.js';
import { reportUiError, reportUiEvent } from './uiTelemetry.js';

function normalizeItemsByTab(itemsByTab) {
    const safe = itemsByTab && typeof itemsByTab === 'object' ? itemsByTab : {};
    return {
        caixa: Array.isArray(safe.caixa) ? safe.caixa : [],
        fichas: Array.isArray(safe.fichas) ? safe.fichas : [],
        agendamentos: Array.isArray(safe.agendamentos) ? safe.agendamentos : []
    };
}

function buildDomainState(state = {}) {
    return {
        version: 2,
        userScoped: false,
        itemsByTab: normalizeItemsByTab(state.itemsByTab),
        updatedAt: state.updatedAt || null
    };
}

function getFinanceBaseUpdatedAt(state = {}) {
    return state.baseUpdatedAt || state.remoteUpdatedAt || state.syncUpdatedAt || state.updatedAt || null;
}

function isFinanceConflictError(error) {
    return error?.code === 'FINANCE_STATE_CONFLICT'
        || error?.status === 409
        || error?.statusCode === 409;
}

function buildUiState(state = {}) {
    return {
        activeTab: ['caixa', 'fichas', 'agendamentos'].includes(String(state.activeTab || ''))
            ? String(state.activeTab)
            : 'caixa',
        cashboxViewMode: state.cashboxViewMode === 'lista' ? 'lista' : 'cards',
        fichaViewMode: state.fichaViewMode === 'lista' ? 'lista' : 'cards',
        descriptionMemory: Array.isArray(state.descriptionMemory) ? state.descriptionMemory : []
    };
}

function mergeFinanceState(domainState = {}, uiState = {}) {
    return {
        version: 2,
        userScoped: false,
        activeTab: buildUiState(uiState).activeTab,
        cashboxViewMode: buildUiState(uiState).cashboxViewMode,
        fichaViewMode: buildUiState(uiState).fichaViewMode,
        descriptionMemory: buildUiState(uiState).descriptionMemory,
        categories: [],
        entries: [],
        snapshots: [],
        itemsByTab: normalizeItemsByTab(domainState.itemsByTab),
        updatedAt: domainState.updatedAt || null
    };
}

let financeSaveQueue = Promise.resolve();
let financeSaveScopeKey = '';
let lastKnownRemoteUpdatedAt = null;

function ensureFinanceSaveScope(localStorageKey = '') {
    const safeKey = String(localStorageKey || '');
    if (safeKey === financeSaveScopeKey) return;
    financeSaveScopeKey = safeKey;
    financeSaveQueue = Promise.resolve();
    lastKnownRemoteUpdatedAt = null;
}

function enqueueFinanceSave(task) {
    const queued = financeSaveQueue.catch(() => {}).then(task);
    financeSaveQueue = queued.catch(() => {});
    return queued;
}

async function fetchFinanceApi(options = {}) {
    try {
        const accessToken = await authService.getAccessToken();
        const response = await fetch('/api/finance', {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                ...(options.headers || {})
            }
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(payload?.error || 'Falha na API do financeiro.');
            error.status = response.status;
            error.statusCode = response.status;
            error.code = payload?.code || '';
            error.currentUpdatedAt = payload?.currentUpdatedAt || null;
            throw error;
        }

        return payload?.data || { state: null, updatedAt: null };
    } catch (error) {
        throw normalizeApiError(error, {
            fallbackMessage: 'Falha na API do financeiro.',
            operation: options.method || 'GET',
            endpoint: '/api/finance',
            target: 'local-api'
        });
    }
}

export const financeStore = {
    async getStateResult({ localStorageKey = '', fallbackValue = null } = {}) {
        ensureFinanceSaveScope(localStorageKey);
        const cachedState = localStorageKey
            ? loadUserScopedJsonStorage(localStorageKey, fallbackValue)
            : fallbackValue;
        const cachedUiState = buildUiState(cachedState || {});

        try {
            const remote = await fetchFinanceApi({ method: 'GET' });
            const merged = mergeFinanceState(remote?.state || fallbackValue || {}, cachedUiState);
            if (localStorageKey) {
                saveUserScopedJsonStorage(localStorageKey, merged);
            }
            lastKnownRemoteUpdatedAt = remote?.updatedAt || merged.updatedAt || null;
            return {
                state: merged,
                syncStatus: 'remote',
                updatedAt: remote?.updatedAt || merged.updatedAt || null
            };
        } catch (error) {
            reportUiError('financeStore.getState', error, { endpoint: '/api/finance' });
            return {
                state: cachedState,
                syncStatus: 'local-fallback',
                updatedAt: cachedState?.updatedAt || null
            };
        }
    },

    async saveStateResult({ state, localStorageKey = '' } = {}) {
        ensureFinanceSaveScope(localStorageKey);
        return enqueueFinanceSave(async () => {
            const uiState = buildUiState(state || {});
            const domainState = buildDomainState(state || {});
            const baseUpdatedAt = lastKnownRemoteUpdatedAt || getFinanceBaseUpdatedAt(state || {});

            try {
                const remote = await fetchFinanceApi({
                    method: 'PUT',
                    body: JSON.stringify({
                        state: domainState,
                        baseUpdatedAt
                    })
                });
                const merged = mergeFinanceState(remote?.state || domainState, uiState);
                if (localStorageKey) {
                    saveUserScopedJsonStorage(localStorageKey, merged);
                }
                lastKnownRemoteUpdatedAt = remote?.updatedAt || merged.updatedAt || null;
                return {
                    state: merged,
                    syncStatus: 'remote',
                    updatedAt: remote?.updatedAt || merged.updatedAt || null
                };
            } catch (error) {
                const merged = mergeFinanceState(domainState, uiState);
                if (isFinanceConflictError(error)) {
                    lastKnownRemoteUpdatedAt = error.currentUpdatedAt || lastKnownRemoteUpdatedAt;
                    if (localStorageKey) {
                        saveUserScopedJsonStorage(`${localStorageKey}:conflict-backup`, {
                            ...merged,
                            conflictDetectedAt: new Date().toISOString(),
                            remoteUpdatedAt: error.currentUpdatedAt || null,
                            baseUpdatedAt
                        });
                    }
                    reportUiError('financeStore.saveState.conflict', error, { endpoint: '/api/finance' });
                    return {
                        state: merged,
                        syncStatus: 'conflict',
                        updatedAt: error.currentUpdatedAt || null,
                        errorMessage: error.message || 'O financeiro foi atualizado em outra sessão.'
                    };
                }
                if (localStorageKey) {
                    saveUserScopedJsonStorage(localStorageKey, merged);
                }
                reportUiError('financeStore.saveState', error, { endpoint: '/api/finance' });
                reportUiEvent('finance.local-cache-fallback', { endpoint: '/api/finance' });
                return {
                    state: merged,
                    syncStatus: 'local-fallback',
                    updatedAt: merged.updatedAt || null
                };
            }
        });
    }
};
