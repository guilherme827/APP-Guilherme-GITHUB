export const DASHBOARD_EDITOR_MODE_NONE = 'none';
export const DASHBOARD_EDITOR_MODE_FULL = 'full';
export const DASHBOARD_EDITOR_MODE_AGENDA_ITEM = 'agenda-item';

export function createDashboardUiState() {
    return {
        addWidgetMenuOpen: false,
        openWidgetMenuId: null,
        openEditorWidgetId: null,
        openEditorMode: DASHBOARD_EDITOR_MODE_NONE,
        openTaskMenuKey: null,
        pendingWidgetType: null
    };
}

export function toggleAddWidgetMenu(state) {
    return {
        ...state,
        addWidgetMenuOpen: !state.addWidgetMenuOpen,
        openWidgetMenuId: null,
        openEditorWidgetId: null,
        openEditorMode: DASHBOARD_EDITOR_MODE_NONE,
        openTaskMenuKey: null,
        pendingWidgetType: null
    };
}

export function toggleWidgetMenu(state, widgetId) {
    return {
        ...state,
        openWidgetMenuId: state.openWidgetMenuId === widgetId ? null : widgetId,
        openEditorMode: DASHBOARD_EDITOR_MODE_NONE,
        openTaskMenuKey: null
    };
}

export function openWidgetEditor(state, widgetId, widgetType) {
    const nextOpenEditorWidgetId = state.openEditorWidgetId === widgetId ? null : widgetId;
    const nextEditorMode = ['pauta', 'lista'].includes(widgetType) && nextOpenEditorWidgetId
        ? DASHBOARD_EDITOR_MODE_FULL
        : DASHBOARD_EDITOR_MODE_NONE;

    return {
        ...state,
        openWidgetMenuId: null,
        openEditorWidgetId: nextOpenEditorWidgetId,
        openEditorMode: nextEditorMode,
        openTaskMenuKey: null
    };
}

export function closeTransientUi(state) {
    return {
        ...state,
        addWidgetMenuOpen: false,
        openWidgetMenuId: null,
        openEditorWidgetId: null,
        openEditorMode: DASHBOARD_EDITOR_MODE_NONE,
        openTaskMenuKey: null,
        pendingWidgetType: null
    };
}

