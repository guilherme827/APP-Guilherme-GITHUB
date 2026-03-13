import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve(process.cwd(), 'src/dashboard/uiState.js');
const source = fs.readFileSync(modulePath, 'utf8').replace(/export\s+/g, '');
const uiState = new Function(
    `${source}
    return {
        DASHBOARD_EDITOR_MODE_NONE,
        DASHBOARD_EDITOR_MODE_FULL,
        DASHBOARD_EDITOR_MODE_AGENDA_ITEM,
        createDashboardUiState,
        toggleAddWidgetMenu,
        toggleWidgetMenu,
        openWidgetEditor,
        closeTransientUi
    };`
)();

test('toggleAddWidgetMenu should open menu and reset transient UI', () => {
    const initial = {
        ...uiState.createDashboardUiState(),
        openWidgetMenuId: 'w-1',
        openEditorWidgetId: 'w-2',
        openTaskMenuKey: 'w-2:t-1',
        pendingWidgetType: 'lista'
    };

    const next = uiState.toggleAddWidgetMenu(initial);
    assert.equal(next.addWidgetMenuOpen, true);
    assert.equal(next.openWidgetMenuId, null);
    assert.equal(next.openEditorWidgetId, null);
    assert.equal(next.openTaskMenuKey, null);
    assert.equal(next.pendingWidgetType, null);
});

test('toggleWidgetMenu should alternate current widget menu', () => {
    const initial = uiState.createDashboardUiState();
    const opened = uiState.toggleWidgetMenu(initial, 'w-1');
    const closed = uiState.toggleWidgetMenu(opened, 'w-1');
    assert.equal(opened.openWidgetMenuId, 'w-1');
    assert.equal(closed.openWidgetMenuId, null);
});

test('openWidgetEditor should use FULL mode for pauta/lista and NONE for others', () => {
    const initial = uiState.createDashboardUiState();
    const pautaEditor = uiState.openWidgetEditor(initial, 'w-pauta', 'pauta');
    const resumoEditor = uiState.openWidgetEditor(initial, 'w-resumo', 'resumo');

    assert.equal(pautaEditor.openEditorWidgetId, 'w-pauta');
    assert.equal(pautaEditor.openEditorMode, uiState.DASHBOARD_EDITOR_MODE_FULL);
    assert.equal(resumoEditor.openEditorWidgetId, 'w-resumo');
    assert.equal(resumoEditor.openEditorMode, uiState.DASHBOARD_EDITOR_MODE_NONE);
});

test('closeTransientUi should close all temporary UI state', () => {
    const initial = {
        addWidgetMenuOpen: true,
        openWidgetMenuId: 'w-1',
        openEditorWidgetId: 'w-2',
        openEditorMode: uiState.DASHBOARD_EDITOR_MODE_FULL,
        openTaskMenuKey: 'w-2:t-1',
        pendingWidgetType: 'pauta'
    };

    const next = uiState.closeTransientUi(initial);
    assert.deepEqual(next, uiState.createDashboardUiState());
});
