import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUserPreferencesFunctions } from './helpers/loadUserPreferencesFunctions.mjs';

const {
    hasMeaningfulDashboardValue,
    hasMeaningfulFinanceValue,
    selectPreferredPreferenceValue
} = await loadUserPreferencesFunctions();

test('dashboard preference treats widget payload as meaningful only when widgets exist', () => {
    assert.equal(hasMeaningfulDashboardValue(null), false);
    assert.equal(hasMeaningfulDashboardValue({ widgets: [] }), false);
    assert.equal(hasMeaningfulDashboardValue([]), false);
    assert.equal(hasMeaningfulDashboardValue({ widgets: [{ id: 'w-1' }] }), true);
});

test('finance preference treats empty state as non-meaningful', () => {
    assert.equal(hasMeaningfulFinanceValue(null), false);
    assert.equal(hasMeaningfulFinanceValue({ itemsByTab: { caixa: [], fichas: [], agendamentos: [] } }), false);
    assert.equal(hasMeaningfulFinanceValue({ itemsByTab: { caixa: [{ id: 'cash-1' }], fichas: [], agendamentos: [] } }), true);
});

test('preference selection should migrate meaningful local state when remote is missing', () => {
    const selected = selectPreferredPreferenceValue({
        localValue: { updatedAt: Date.now(), widgets: [{ id: 'w-1' }] },
        localUpdatedAt: Date.now(),
        hasLocal: true,
        remoteValue: null,
        remoteUpdatedAt: 0,
        hasRemote: false,
        fallbackValue: { widgets: [] },
        hasMeaningfulData: hasMeaningfulDashboardValue
    });

    assert.deepEqual(selected.value.widgets, [{ id: 'w-1' }]);
    assert.equal(selected.source, 'local');
    assert.equal(selected.shouldWriteRemote, true);
});

test('preference selection should prefer newest meaningful state between local and remote', () => {
    const selected = selectPreferredPreferenceValue({
        localValue: { updatedAt: 5000, widgets: [{ id: 'local' }] },
        localUpdatedAt: 5000,
        hasLocal: true,
        remoteValue: { updatedAt: 1000, widgets: [{ id: 'remote' }] },
        remoteUpdatedAt: 1000,
        hasRemote: true,
        fallbackValue: { widgets: [] },
        hasMeaningfulData: hasMeaningfulDashboardValue
    });

    assert.deepEqual(selected.value.widgets, [{ id: 'local' }]);
    assert.equal(selected.source, 'local');
    assert.equal(selected.shouldWriteRemote, true);
});

test('preference selection should ignore empty local placeholder when remote has real data', () => {
    const selected = selectPreferredPreferenceValue({
        localValue: { widgets: [] },
        localUpdatedAt: 9000,
        hasLocal: true,
        remoteValue: { widgets: [{ id: 'remote-1' }] },
        remoteUpdatedAt: 1000,
        hasRemote: true,
        fallbackValue: { widgets: [] },
        hasMeaningfulData: hasMeaningfulDashboardValue
    });

    assert.deepEqual(selected.value.widgets, [{ id: 'remote-1' }]);
    assert.equal(selected.source, 'remote');
    assert.equal(selected.shouldWriteLocal, true);
});
