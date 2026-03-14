export function createDragController(context) {
    const {
        container,
        widgets,
        getWidgetById,
        getCurrentGridColumns,
        getCurrentGridState,
        setDraggingWidgetId,
        getDraggingWidgetId,
        setDropTargetSlotIndex,
        getDropTargetSlotIndex,
        setActivePointerId,
        getActivePointerId,
        setDragOrigin,
        getDragOrigin,
        setPendingDrag,
        getPendingDrag,
        getUiReset,
        persistWidgets,
        render,
        getDashboardWidgetSpan,
        getDashboardPlacementForSlot,
        canPlaceDashboardWidgetAtSlot
    } = context;

    const moveWidgetToSlot = (widgetId, targetSlotIndex) => {
        if (!widgetId || !Number.isFinite(targetSlotIndex) || targetSlotIndex < 1) return false;

        const dragged = getWidgetById(widgetId);
        if (!dragged) return false;
        const columns = getCurrentGridColumns();
        const draggedSpan = getDashboardWidgetSpan(dragged, columns);
        const normalizedTargetSlot = getDashboardPlacementForSlot(targetSlotIndex, draggedSpan.cols, columns).slot;
        if (dragged.slot === normalizedTargetSlot) return false;

        if (canPlaceDashboardWidgetAtSlot(widgets, normalizedTargetSlot, draggedSpan.cols, draggedSpan.rows, widgetId, columns)) {
            dragged.slot = normalizedTargetSlot;
            persistWidgets();
            return true;
        }

        const currentGridState = getCurrentGridState();
        const targetWidget = widgets.find((widget) => {
            if (widget.id === widgetId) return false;
            const placement = currentGridState?.placements.get(widget.id);
            if (!placement) return false;
            for (let rowOffset = 0; rowOffset < placement.rows; rowOffset += 1) {
                for (let colOffset = 0; colOffset < placement.cols; colOffset += 1) {
                    const occupiedSlot = ((placement.row - 1 + rowOffset) * columns) + placement.col + colOffset;
                    if (occupiedSlot === normalizedTargetSlot) return true;
                }
            }
            return false;
        });

        if (!targetWidget) return false;

        const targetSpan = getDashboardWidgetSpan(targetWidget, columns);
        const normalizedOriginSlot = getDashboardPlacementForSlot(dragged.slot, targetSpan.cols, columns).slot;
        if (!canPlaceDashboardWidgetAtSlot(widgets, normalizedTargetSlot, draggedSpan.cols, draggedSpan.rows, [widgetId, targetWidget.id], columns)) {
            return false;
        }
        if (!canPlaceDashboardWidgetAtSlot(widgets, normalizedOriginSlot, targetSpan.cols, targetSpan.rows, [targetWidget.id, widgetId], columns)) {
            return false;
        }

        targetWidget.slot = normalizedOriginSlot;
        dragged.slot = normalizedTargetSlot;
        persistWidgets();
        return true;
    };

    const resolveDropSlotIndex = (clientX, clientY) => {
        const grid = container.querySelector('#dashboard-bento-grid');
        if (!grid) return null;
        const styles = window.getComputedStyle(grid);
        const rect = grid.getBoundingClientRect();
        const paddingLeft = parseFloat(styles.paddingLeft) || 0;
        const paddingRight = parseFloat(styles.paddingRight) || 0;
        const paddingTop = parseFloat(styles.paddingTop) || 0;
        const gap = parseFloat(styles.columnGap || styles.gap) || 16;
        const columns = getCurrentGridColumns();
        const contentWidth = rect.width - paddingLeft - paddingRight;
        const cellSize = (contentWidth - gap * (columns - 1)) / columns;
        if (!(cellSize > 0)) return null;

        const localX = clientX - rect.left - paddingLeft;
        const localY = clientY - rect.top - paddingTop;
        const column = Math.min(
            columns,
            Math.max(1, Math.round((localX - cellSize / 2) / (cellSize + gap)) + 1)
        );
        const row = Math.max(1, Math.round((localY - cellSize / 2) / (cellSize + gap)) + 1);
        return ((row - 1) * columns) + column;
    };

    const clearDropTargets = () => {
        container.querySelectorAll('.is-drop-target').forEach((item) => item.classList.remove('is-drop-target'));
    };

    const clearPendingDrag = () => {
        const pendingDrag = getPendingDrag();
        if (pendingDrag.timer) {
            clearTimeout(pendingDrag.timer);
        }
        setPendingDrag({ widgetId: null, pointerId: null, timer: null });
    };

    const activateDrag = (card, pointerId, clientX, clientY) => {
        const grid = container.querySelector('#dashboard-bento-grid');
        setDraggingWidgetId(card.dataset.widgetId);
        setActivePointerId(pointerId);
        setDragOrigin({ x: clientX, y: clientY });
        setDropTargetSlotIndex(null);
        getUiReset()();

        grid?.classList.add('is-dragging');
        card.classList.add('is-dragging');
        card.style.pointerEvents = 'none';
        card.setPointerCapture?.(pointerId);
        clearPendingDrag();
    };

    const finishDrag = (clientX, clientY) => {
        clearPendingDrag();
        const draggingWidgetId = getDraggingWidgetId();
        if (!draggingWidgetId) return;
        const draggedCard = container.querySelector(`[data-widget-id="${draggingWidgetId}"]`);
        if (draggedCard) {
            draggedCard.classList.remove('is-dragging');
            draggedCard.style.transform = '';
            draggedCard.style.pointerEvents = '';
            draggedCard.releasePointerCapture?.(getActivePointerId());
        }
        const grid = container.querySelector('#dashboard-bento-grid');
        grid?.classList.remove('is-dragging');

        const resolvedSlot = (
            Number.isFinite(clientX) && Number.isFinite(clientY)
                ? resolveDropSlotIndex(clientX, clientY)
                : null
        ) || getDropTargetSlotIndex();

        clearDropTargets();
        if (Number.isFinite(resolvedSlot) && resolvedSlot >= 1) {
            moveWidgetToSlot(draggingWidgetId, resolvedSlot);
        }

        setDraggingWidgetId(null);
        setDropTargetSlotIndex(null);
        setActivePointerId(null);
        setDragOrigin({ x: 0, y: 0 });
        render();
    };

    return {
        moveWidgetToSlot,
        resolveDropSlotIndex,
        clearDropTargets,
        clearPendingDrag,
        activateDrag,
        finishDrag
    };
}
