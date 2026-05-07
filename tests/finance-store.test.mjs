import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFinanceStoreFunctions } from './helpers/loadFinanceStoreFunctions.mjs';

test('finance store should merge remote domain data with cached ui preferences', async () => {
    const storage = new Map([
        ['finance-key', { activeTab: 'fichas', cashboxViewMode: 'lista', fichaViewMode: 'cards', descriptionMemory: ['Aluguel'] }]
    ]);
    global.fetch = async () => ({
        ok: true,
        async json() {
            return {
                data: {
                    state: {
                        version: 2,
                        userScoped: false,
                        itemsByTab: {
                            caixa: [{ id: 'cash-1', title: 'Geoconsult', transactions: [] }],
                            fichas: [],
                            agendamentos: []
                        },
                        updatedAt: '2026-04-28T12:00:00Z'
                    },
                    updatedAt: '2026-04-28T12:00:00Z'
                }
            };
        }
    });

    const { financeStore } = await loadFinanceStoreFunctions({
        loadUserScopedJsonStorage: (key, fallbackValue) => storage.has(key) ? storage.get(key) : fallbackValue,
        saveUserScopedJsonStorage: (key, value) => {
            storage.set(key, value);
            return value;
        },
        authService: { getAccessToken: async () => 'token-1' },
        normalizeApiError: (error) => error,
        reportUiError: () => {},
        reportUiEvent: () => {}
    });

    const result = await financeStore.getStateResult({ localStorageKey: 'finance-key', fallbackValue: null });
    assert.equal(result.syncStatus, 'remote');
    assert.equal(result.state.activeTab, 'fichas');
    assert.equal(result.state.cashboxViewMode, 'lista');
    assert.deepEqual(result.state.itemsByTab.caixa.map((item) => item.id), ['cash-1']);
});

test('finance store should persist only canonical data remotely while keeping ui prefs local', async () => {
    const payloads = [];
    const storage = new Map();
    global.fetch = async (_url, options = {}) => {
        payloads.push(JSON.parse(String(options.body || '{}')));
        return {
            ok: true,
            async json() {
                return {
                    data: {
                        state: payloads.at(-1).state,
                        updatedAt: '2026-04-28T13:00:00Z'
                    }
                };
            }
        };
    };

    const { financeStore } = await loadFinanceStoreFunctions({
        loadUserScopedJsonStorage: (_key, fallbackValue) => fallbackValue,
        saveUserScopedJsonStorage: (key, value) => {
            storage.set(key, value);
            return value;
        },
        authService: { getAccessToken: async () => 'token-1' },
        normalizeApiError: (error) => error,
        reportUiError: () => {},
        reportUiEvent: () => {}
    });

    const localState = {
        activeTab: 'fichas',
        cashboxViewMode: 'lista',
        fichaViewMode: 'cards',
        descriptionMemory: ['Aluguel'],
        itemsByTab: {
            caixa: [{ id: 'cash-1', title: 'Geoconsult', transactions: [] }],
            fichas: [],
            agendamentos: []
        },
        updatedAt: '2026-04-28T13:00:00Z'
    };

    const result = await financeStore.saveStateResult({ localStorageKey: 'finance-key', state: localState });
    assert.equal(result.syncStatus, 'remote');
    assert.deepEqual(payloads[0], {
        state: {
            version: 2,
            userScoped: false,
            itemsByTab: {
                caixa: [{ id: 'cash-1', title: 'Geoconsult', transactions: [] }],
                fichas: [],
                agendamentos: []
            },
            updatedAt: '2026-04-28T13:00:00Z'
        },
        baseUpdatedAt: '2026-04-28T13:00:00Z'
    });
    assert.equal(storage.get('finance-key').activeTab, 'fichas');
    assert.deepEqual(storage.get('finance-key').itemsByTab.caixa.map((item) => item.id), ['cash-1']);
});

test('finance store should serialize rapid saves with the latest remote timestamp', async () => {
    const payloads = [];
    let releaseFirstSave = null;
    global.fetch = async (_url, options = {}) => {
        const payload = JSON.parse(String(options.body || '{}'));
        payloads.push(payload);
        const callIndex = payloads.length;
        if (callIndex === 1) {
            await new Promise((resolve) => {
                releaseFirstSave = resolve;
            });
        }
        return {
            ok: true,
            async json() {
                return {
                    data: {
                        state: payload.state,
                        updatedAt: callIndex === 1 ? '2026-04-28T13:00:00Z' : '2026-04-28T13:01:00Z'
                    }
                };
            }
        };
    };

    const { financeStore } = await loadFinanceStoreFunctions({
        loadUserScopedJsonStorage: (_key, fallbackValue) => fallbackValue,
        saveUserScopedJsonStorage: (_key, value) => value,
        authService: { getAccessToken: async () => 'token-1' },
        normalizeApiError: (error) => error,
        reportUiError: () => {},
        reportUiEvent: () => {}
    });

    const firstSave = financeStore.saveStateResult({
        localStorageKey: 'finance-key',
        state: {
            itemsByTab: { caixa: [{ id: 'cash-1', title: 'Primeiro', transactions: [] }], fichas: [], agendamentos: [] },
            updatedAt: '2026-04-28T12:00:00Z'
        }
    });
    const secondSave = financeStore.saveStateResult({
        localStorageKey: 'finance-key',
        state: {
            itemsByTab: { caixa: [{ id: 'cash-2', title: 'Segundo', transactions: [] }], fichas: [], agendamentos: [] },
            updatedAt: '2026-04-28T12:00:00Z'
        }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(payloads.length, 1);
    releaseFirstSave();

    const [, secondResult] = await Promise.all([firstSave, secondSave]);

    assert.equal(secondResult.syncStatus, 'remote');
    assert.equal(payloads.length, 2);
    assert.equal(payloads[1].baseUpdatedAt, '2026-04-28T13:00:00Z');
});

test('finance store should fall back to local cache when remote save fails', async () => {
    const storage = new Map();
    const reportedErrors = [];
    global.fetch = async () => {
        throw new Error('Failed to fetch');
    };

    const { financeStore } = await loadFinanceStoreFunctions({
        loadUserScopedJsonStorage: (_key, fallbackValue) => fallbackValue,
        saveUserScopedJsonStorage: (key, value) => {
            storage.set(key, value);
            return value;
        },
        authService: { getAccessToken: async () => 'token-1' },
        normalizeApiError: (error) => error,
        reportUiError: (scope, error) => reportedErrors.push({ scope, message: error?.message || '' }),
        reportUiEvent: () => {}
    });

    const state = {
        activeTab: 'caixa',
        cashboxViewMode: 'cards',
        fichaViewMode: 'cards',
        descriptionMemory: [],
        itemsByTab: {
            caixa: [{ id: 'cash-9', title: 'Offline', transactions: [] }],
            fichas: [],
            agendamentos: []
        },
        updatedAt: '2026-04-28T14:00:00Z'
    };

    const result = await financeStore.saveStateResult({ localStorageKey: 'finance-key', state });
    assert.equal(result.syncStatus, 'local-fallback');
    assert.deepEqual(storage.get('finance-key').itemsByTab.caixa.map((item) => item.id), ['cash-9']);
    assert.equal(reportedErrors[0]?.scope, 'financeStore.saveState');
});

test('finance store should keep local draft when remote detects a stale save', async () => {
    const storage = new Map();
    const reportedErrors = [];
    global.fetch = async () => ({
        ok: false,
        status: 409,
        async json() {
            return {
                error: 'O financeiro foi atualizado em outra aba.',
                code: 'FINANCE_STATE_CONFLICT',
                currentUpdatedAt: '2026-04-28T15:00:00Z'
            };
        }
    });

    const { financeStore } = await loadFinanceStoreFunctions({
        loadUserScopedJsonStorage: (_key, fallbackValue) => fallbackValue,
        saveUserScopedJsonStorage: (key, value) => {
            storage.set(key, value);
            return value;
        },
        authService: { getAccessToken: async () => 'token-1' },
        normalizeApiError: (error) => error,
        reportUiError: (scope, error) => reportedErrors.push({ scope, message: error?.message || '' }),
        reportUiEvent: () => {}
    });

    const result = await financeStore.saveStateResult({
        localStorageKey: 'finance-key',
        state: {
            activeTab: 'fichas',
            itemsByTab: {
                caixa: [],
                fichas: [{ id: 'ficha-local', title: 'Rascunho local' }],
                agendamentos: []
            },
            updatedAt: '2026-04-28T14:00:00Z',
            baseUpdatedAt: '2026-04-28T13:00:00Z'
        }
    });

    assert.equal(result.syncStatus, 'conflict');
    assert.equal(result.updatedAt, '2026-04-28T15:00:00Z');
    assert.equal(storage.has('finance-key'), false);
    assert.deepEqual(storage.get('finance-key:conflict-backup').itemsByTab.fichas.map((item) => item.id), ['ficha-local']);
    assert.equal(storage.get('finance-key:conflict-backup').baseUpdatedAt, '2026-04-28T13:00:00Z');
    assert.equal(reportedErrors[0]?.scope, 'financeStore.saveState.conflict');
});
