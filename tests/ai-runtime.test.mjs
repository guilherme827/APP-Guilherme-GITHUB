import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    isRetryableProviderError,
    rankFallbackCandidates
} = require('../server/aiRuntime.cjs');

test('isRetryableProviderError should detect quota and rate limit failures', () => {
    assert.equal(isRetryableProviderError(new Error('Quota exceeded for this request.')), true);
    assert.equal(isRetryableProviderError(new Error('429 RESOURCE_EXHAUSTED')), true);
    assert.equal(isRetryableProviderError(new Error('Rate limit exceeded for requests')), true);
});

test('isRetryableProviderError should ignore non-retryable authentication failures', () => {
    assert.equal(isRetryableProviderError(new Error('API key not valid. Please pass a valid API key.')), false);
    assert.equal(isRetryableProviderError(new Error('Authentication failed')), false);
});

test('rankFallbackCandidates should prefer same provider and different credential first', () => {
    const ordered = rankFallbackCandidates([
        { id: 2, provider: 'gemini', api_config_id: 10 },
        { id: 3, provider: 'openai', api_config_id: 11 },
        { id: 4, provider: 'gemini', api_config_id: 12 }
    ], {
        model: { id: 1, provider: 'gemini' },
        providerConfig: { id: 10 }
    });

    assert.deepEqual(ordered.map((item) => item.id), [4, 2, 3]);
});
