import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUserScopeStorageFunctions } from './helpers/loadUserScopeStorageFunctions.mjs';

const {
    getUserScopedStorageKey,
    loadUserScopedJsonStorage,
    saveUserScopedJsonStorage
} = await loadUserScopeStorageFunctions();

const DASHBOARD_WIDGETS_STORAGE_KEY = 'app-control-dashboard-widgets-v1';
const FINANCE_STORAGE_KEY = 'app-control-finance-v1';

function createLocalStorageMock() {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        }
    };
}

test('getUserScopedStorageKey should isolate dashboard and finance per user', () => {
    const dashboardUserA = getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, 'user-a');
    const dashboardUserB = getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, 'user-b');
    const financeUserA = getUserScopedStorageKey(FINANCE_STORAGE_KEY, 'user-a');
    const financeUserB = getUserScopedStorageKey(FINANCE_STORAGE_KEY, 'user-b');

    assert.notEqual(dashboardUserA, dashboardUserB);
    assert.notEqual(financeUserA, financeUserB);
    assert.ok(dashboardUserA.endsWith(':user-a'));
    assert.ok(financeUserB.endsWith(':user-b'));
});

test('getUserScopedStorageKey should fallback to base key when user id is missing', () => {
    assert.equal(getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, ''), DASHBOARD_WIDGETS_STORAGE_KEY);
    assert.equal(getUserScopedStorageKey(FINANCE_STORAGE_KEY, null), FINANCE_STORAGE_KEY);
    assert.equal(getUserScopedStorageKey('', 'user-a'), '');
});

test('save/load user-scoped JSON storage should keep values isolated', () => {
    globalThis.localStorage = createLocalStorageMock();

    const keyA = getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, 'user-a');
    const keyB = getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, 'user-b');
    const valueA = [{ id: 'w-a', slot: 1 }];
    const valueB = [{ id: 'w-b', slot: 3 }];

    saveUserScopedJsonStorage(keyA, valueA);
    saveUserScopedJsonStorage(keyB, valueB);

    assert.deepEqual(loadUserScopedJsonStorage(keyA, []), valueA);
    assert.deepEqual(loadUserScopedJsonStorage(keyB, []), valueB);
});

test('loadUserScopedJsonStorage should return fallback for missing or invalid JSON', () => {
    globalThis.localStorage = createLocalStorageMock();

    const fallback = { ok: true };
    assert.deepEqual(loadUserScopedJsonStorage('missing-key', fallback), fallback);

    localStorage.setItem('broken', '{not-json');
    assert.deepEqual(loadUserScopedJsonStorage('broken', fallback), fallback);
});
