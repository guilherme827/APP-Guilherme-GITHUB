import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboardGridFunctions } from './helpers/loadDashboardGridFunctions.mjs';

const {
    getDashboardWidgetSpan,
    getDashboardPlacementForSlot,
    buildDashboardGridState,
    canPlaceDashboardWidgetAtSlot
} = await loadDashboardGridFunctions();

test('getDashboardWidgetSpan should keep calendario as 1x1', () => {
    const span = getDashboardWidgetSpan({ type: 'calendario', options: {} }, 6);
    assert.deepEqual(span, { cols: 1, rows: 1 });
});

test('getDashboardWidgetSpan should expand pauta/lista row span with more than 4 items', () => {
    const pautaSpan = getDashboardWidgetSpan(
        { type: 'pauta', options: { items: [{}, {}, {}, {}, {}] } },
        6
    );
    const listaSpan = getDashboardWidgetSpan(
        { type: 'lista', options: { items: [{}, {}, {}, {}, {}] } },
        6
    );
    assert.deepEqual(pautaSpan, { cols: 2, rows: 2 });
    assert.deepEqual(listaSpan, { cols: 2, rows: 2 });
});

test('getDashboardPlacementForSlot should clamp col when span would overflow row', () => {
    const placement = getDashboardPlacementForSlot(6, 2, 6);
    assert.deepEqual(placement, { row: 1, col: 5, slot: 5 });
});

test('buildDashboardGridState should mark occupied slots for multi-span widget', () => {
    const widgets = [
        { id: 'w-cal', type: 'calendario', slot: 1, options: {} },
        { id: 'w-task', type: 'pauta', slot: 8, options: { items: [{}, {}, {}, {}, {}] } }
    ];
    const state = buildDashboardGridState(widgets, 6);
    assert.ok(state.occupied.has(1), 'calendario slot must be occupied');
    assert.ok(state.occupied.has(8), 'pauta anchor slot must be occupied');
    assert.ok(state.occupied.has(9), 'pauta second col must be occupied');
    assert.ok(state.occupied.has(14), 'pauta second row must be occupied');
    assert.ok(state.occupied.has(15), 'pauta 2x2 footprint must be occupied');
});

test('canPlaceDashboardWidgetAtSlot should reject occupied positions and allow ignored widget id', () => {
    const widgets = [
        { id: 'w-1', type: 'calendario', slot: 1, options: {} },
        { id: 'w-2', type: 'resumo', slot: 2, options: {} }
    ];

    const blocked = canPlaceDashboardWidgetAtSlot(widgets, 1, 1, 1, [], 6);
    assert.equal(blocked, false);

    const allowedWhenIgnoringSame = canPlaceDashboardWidgetAtSlot(widgets, 1, 1, 1, ['w-1'], 6);
    assert.equal(allowedWhenIgnoringSame, true);
});
