export function getDashboardWidgetSpan(widget, columns = 6) {
    if (widget?.type === 'calendario') {
        return { cols: 1, rows: 1 };
    }
    if (widget?.type === 'pauta' || widget?.type === 'lista') {
        const visibleColumns = Math.min(2, columns);
        const itemCount = Array.isArray(widget?.options?.items) ? widget.options.items.length : 0;
        return { cols: visibleColumns, rows: itemCount > 4 ? 2 : 1 };
    }
    return { cols: 1, rows: 1 };
}

export function getDashboardPlacementForSlot(slot, spanCols, columns) {
    const safeSlot = Math.max(1, Math.floor(slot || 1));
    const zeroBased = safeSlot - 1;
    const row = Math.floor(zeroBased / columns) + 1;
    const preferredCol = (zeroBased % columns) + 1;
    const maxCol = Math.max(1, columns - spanCols + 1);
    const col = Math.min(preferredCol, maxCol);
    return {
        row,
        col,
        slot: ((row - 1) * columns) + col
    };
}

export function buildDashboardGridState(widgets, columns = 6, ignoredWidgetIds = []) {
    const ignored = new Set(Array.isArray(ignoredWidgetIds) ? ignoredWidgetIds : [ignoredWidgetIds]);
    const placements = new Map();
    const occupied = new Set();
    const orderedWidgets = [...widgets]
        .filter((widget) => !ignored.has(widget.id))
        .sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));

    orderedWidgets.forEach((widget) => {
        const span = getDashboardWidgetSpan(widget, columns);
        const placement = getDashboardPlacementForSlot(widget.slot, span.cols, columns);
        placements.set(widget.id, { ...placement, ...span });
        for (let rowOffset = 0; rowOffset < span.rows; rowOffset += 1) {
            for (let colOffset = 0; colOffset < span.cols; colOffset += 1) {
                occupied.add(((placement.row - 1 + rowOffset) * columns) + placement.col + colOffset);
            }
        }
    });

    return { columns, placements, occupied };
}

export function canPlaceDashboardWidgetAtSlot(widgets, slot, spanCols, spanRows, ignoredWidgetIds = [], columns = 6) {
    const placement = getDashboardPlacementForSlot(slot, spanCols, columns);
    const state = buildDashboardGridState(widgets, columns, ignoredWidgetIds);
    for (let rowOffset = 0; rowOffset < spanRows; rowOffset += 1) {
        for (let colOffset = 0; colOffset < spanCols; colOffset += 1) {
            const occupiedSlot = ((placement.row - 1 + rowOffset) * columns) + placement.col + colOffset;
            if (state.occupied.has(occupiedSlot)) return false;
        }
    }
    return true;
}

