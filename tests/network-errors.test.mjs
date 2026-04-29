import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNetworkErrorFunctions } from './helpers/loadNetworkErrorFunctions.mjs';

const {
    isNetworkLoadError,
    normalizeAuthError,
    normalizeApiError
} = await loadNetworkErrorFunctions();

test('isNetworkLoadError should detect generic fetch failures', () => {
    assert.equal(isNetworkLoadError(new Error('Load failed')), true);
    assert.equal(isNetworkLoadError(new Error('Failed to fetch')), true);
    assert.equal(isNetworkLoadError(new Error('network request failed')), true);
    assert.equal(isNetworkLoadError(new Error('Invalid login credentials')), false);
});

test('normalizeAuthError should classify Supabase connectivity failures', () => {
    const error = normalizeAuthError(new Error('Failed to fetch'), {
        fallbackMessage: 'Nao foi possivel entrar.',
        operation: 'signInWithPassword',
        target: 'supabase-auth'
    });

    assert.equal(error.message.includes('Supabase'), true);
    assert.equal(error.diagnostics.category, 'auth');
    assert.equal(error.diagnostics.kind, 'network');
    assert.equal(error.diagnostics.operation, 'signInWithPassword');
    assert.equal(error.diagnostics.target, 'supabase-auth');
});

test('normalizeApiError should mention endpoint for local API failures', () => {
    const error = normalizeApiError(new Error('Load failed'), {
        fallbackMessage: 'Falha na API.',
        operation: 'GET',
        endpoint: '/api/account',
        target: 'local-api'
    });

    assert.equal(error.message.includes('/api/account'), true);
    assert.equal(error.diagnostics.category, 'api');
    assert.equal(error.diagnostics.kind, 'network');
    assert.equal(error.diagnostics.endpoint, '/api/account');
});

test('normalizeApiError should preserve service errors and attach diagnostics', () => {
    const original = new Error('Token expirado');
    const error = normalizeApiError(original, {
        fallbackMessage: 'Falha na API.',
        operation: 'GET',
        endpoint: '/api/account',
        target: 'local-api'
    });

    assert.equal(error.message, 'Token expirado');
    assert.equal(error.diagnostics.category, 'api');
    assert.equal(error.diagnostics.kind, 'service');
});
