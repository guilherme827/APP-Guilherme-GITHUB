import { sortAgendaTasks, getTaskDeadlineBadge } from './viewHelpers.js';
import { iconMoreDots } from './widgetVisuals.js';

export function createAgendaController(context) {
    const {
        widgets,
        agendaDrafts,
        container,
        persistWidgets,
        render,
        getWidgetById,
        renderWidgetOverlayActions,
        getOpenEditorWidgetId,
        getOpenEditorMode,
        setOpenEditorWidgetId,
        setOpenEditorMode,
        getOpenTaskMenuKey,
        setOpenTaskMenuKey,
        getOpenTaskMenuAnchor,
        setOpenTaskMenuAnchor,
        editorModes
    } = context;

    const getAgendaDraft = (widget) => {
        const stored = agendaDrafts.get(widget.id) || {};
        return {
            title: stored.title ?? widget.options.title ?? (widget.type === 'lista' ? 'Lista' : 'Tarefas'),
            text: stored.text ?? '',
            priorityType: stored.priorityType ?? 'week',
            dueDate: stored.dueDate ?? '',
            editingTaskId: stored.editingTaskId ?? ''
        };
    };

    const setAgendaDraft = (widgetId, nextDraft) => {
        const widget = getWidgetById(widgetId);
        if (!widget || !['pauta', 'lista'].includes(widget.type)) return;
        agendaDrafts.set(widgetId, { ...getAgendaDraft(widget), ...nextDraft });
    };

    const clearAgendaDraft = (widgetId) => {
        agendaDrafts.delete(widgetId);
    };

    const addOrUpdateAgendaTask = (widgetId) => {
        const widget = getWidgetById(widgetId);
        if (!widget || !['pauta', 'lista'].includes(widget.type)) return;
        const editor = container.querySelector(`[data-editor-widget-id="${widgetId}"]`);
        if (!editor) return;
        const text = String(editor.querySelector('[data-field="agenda-text"]')?.value || '').trim();
        const priorityType = String(editor.querySelector('[data-field="agenda-priority"]')?.value || 'week');
        const dueDate = String(editor.querySelector('[data-field="agenda-date"]')?.value || '').trim();
        const editingTaskId = String(editor.querySelector('[data-field="agenda-editing-task-id"]')?.value || '').trim();
        if (!text) return;

        if (editingTaskId) {
            const task = widget.options.items.find((item) => item.id === editingTaskId);
            if (task) {
                task.text = text;
                if (widget.type === 'pauta') {
                    task.priorityType = ['today', 'week', 'month', 'date'].includes(priorityType) ? priorityType : 'week';
                    task.dueDate = dueDate;
                }
                task.updatedAt = Date.now();
            }
        } else {
            widget.options.items.push({
                id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                text,
                ...(widget.type === 'pauta' ? {
                    priorityType: ['today', 'week', 'month', 'date'].includes(priorityType) ? priorityType : 'week',
                    dueDate,
                    status: 'open'
                } : {}),
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        clearAgendaDraft(widgetId);
        setOpenEditorMode(editorModes.agendaItem);
        persistWidgets();
        render();
    };

    const updateAgendaTaskStatus = (widgetId, taskId, status) => {
        const widget = getWidgetById(widgetId);
        if (!widget || widget.type !== 'pauta') return;
        const task = widget.options.items.find((item) => item.id === taskId);
        if (!task) return;
        task.status = status;
        task.updatedAt = Date.now();
        setOpenTaskMenuKey(null);
        persistWidgets();
        render();
    };

    const deleteAgendaTask = (widgetId, taskId) => {
        const widget = getWidgetById(widgetId);
        if (!widget || !['pauta', 'lista'].includes(widget.type)) return;
        widget.options.items = widget.options.items.filter((item) => item.id !== taskId);
        setOpenTaskMenuKey(null);
        persistWidgets();
        render();
    };

    const beginAgendaTaskEdit = (widgetId, taskId) => {
        const widget = getWidgetById(widgetId);
        if (!widget || !['pauta', 'lista'].includes(widget.type)) return;
        const task = widget.options.items.find((item) => item.id === taskId);
        if (!task) return;
        setAgendaDraft(widgetId, {
            title: widget.options.title,
            text: task.text,
            priorityType: task.priorityType || 'week',
            dueDate: task.dueDate || '',
            editingTaskId: task.id
        });
        setOpenTaskMenuKey(null);
        setOpenEditorWidgetId(widgetId);
        setOpenEditorMode(editorModes.agendaItem);
        render();
    };

    const renderAgendaWidget = (widget) => {
        const isSimpleList = widget.type === 'lista';
        const tasks = isSimpleList ? [...(widget.options.items || [])] : sortAgendaTasks(widget.options.items || []);
        const openCount = isSimpleList ? tasks.length : tasks.filter((task) => task.status === 'open').length;
        const doneCount = isSimpleList ? 0 : tasks.filter((task) => task.status === 'done').length;
        const draft = getAgendaDraft(widget);
        const openEditorMode = getOpenEditorMode();
        const showTitleField = openEditorMode === editorModes.full;
        const showTitleOnlyEditor = openEditorMode === editorModes.agendaTitle;
        const openTaskMenuKey = getOpenTaskMenuKey();
        const activeTaskId = openTaskMenuKey?.startsWith(`${widget.id}:`)
            ? openTaskMenuKey.slice(widget.id.length + 1)
            : null;
        const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) : null;
        const openTaskMenuAnchor = getOpenTaskMenuAnchor();
        const floatingMenuTop = Number.isFinite(Number(openTaskMenuAnchor?.top)) ? Number(openTaskMenuAnchor.top) : 68;
        const floatingMenuLeft = Number.isFinite(Number(openTaskMenuAnchor?.left)) ? Number(openTaskMenuAnchor.left) : 12;

        return `
            <article class="bento-widget bento-widget--agenda" data-widget-id="${widget.id}">
                ${renderWidgetOverlayActions(widget)}
                <div class="bento-agenda-head">
                    <div class="bento-agenda-head-main">
                        <h3 class="bento-agenda-title">${widget.options.title}</h3>
                        <div class="bento-agenda-meta">
                            <span>${openCount} ${isSimpleList ? 'itens' : 'em aberto'}</span>
                            <strong>${isSimpleList ? 'livres' : `${doneCount} concluidos`}</strong>
                        </div>
                    </div>
                    <button type="button" class="bento-agenda-add-button" data-action="open-agenda-add-item" data-widget-id="${widget.id}">Adicionar item</button>
                </div>
                <div class="bento-agenda-list${tasks.length > 5 ? ' has-scroll' : ''}">
                    ${tasks.length ? tasks.map((task) => {
                        const badge = isSimpleList ? null : getTaskDeadlineBadge(task);
                        const metaLine = !isSimpleList && task?.meta
                            ? [
                                task.meta.clientLabel ? `cliente ${task.meta.clientLabel}` : '',
                                Array.isArray(task.meta.processNumbers) && task.meta.processNumbers.length > 0
                                    ? `processo ${task.meta.processNumbers.join(', ')}`
                                    : '',
                                task.meta.source === 'ai-chat' ? 'origem IA' : ''
                            ].filter(Boolean).join(' • ')
                            : '';
                        return `
                            <div class="bento-agenda-item${isSimpleList ? '' : ` is-${task.status}`}">
                                <div class="bento-agenda-bullet" aria-hidden="true"></div>
                                <div class="bento-agenda-copy">
                                    <p>${task.text}</p>
                                    ${metaLine ? `<span style="display:block; margin-top:0.2rem; font-size:0.72rem; color:var(--slate-400);">${metaLine}</span>` : ''}
                                </div>
                                <div class="bento-agenda-side">
                                    ${badge ? `<span class="bento-agenda-deadline tone-${badge.tone}">${badge.label}</span>` : ''}
                                    <div class="bento-agenda-item-actions">
                                        <button type="button" class="bento-widget-menu-trigger bento-widget-menu-trigger--plain" data-action="toggle-task-menu" data-widget-id="${widget.id}" data-task-id="${task.id}" aria-label="Ações da tarefa">
                                            ${iconMoreDots()}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') : `
                        <div class="bento-agenda-empty">
                            <strong>Sem itens ainda</strong>
                            <span>Use Adicionar item para montar esta ${isSimpleList ? 'lista' : 'lista de tarefas'}.</span>
                        </div>
                    `}
                </div>
                ${activeTask ? `
                    <div class="bento-widget-menu bento-widget-menu--floating" style="top:${floatingMenuTop}px; left:${floatingMenuLeft}px;" role="menu">
                        ${isSimpleList ? '' : `
                            <button type="button" data-action="mark-task-done" data-widget-id="${widget.id}" data-task-id="${activeTask.id}" role="menuitem">Marcar como Feito</button>
                            <button type="button" data-action="skip-task" data-widget-id="${widget.id}" data-task-id="${activeTask.id}" role="menuitem">Nao sera feito</button>
                        `}
                        <button type="button" data-action="edit-task" data-widget-id="${widget.id}" data-task-id="${activeTask.id}" role="menuitem">Editar</button>
                        <button type="button" data-action="delete-task" data-widget-id="${widget.id}" data-task-id="${activeTask.id}" role="menuitem">Excluir</button>
                    </div>
                ` : ''}
                ${getOpenEditorWidgetId() === widget.id ? `
                    <div class="bento-widget-editor bento-widget-editor--agenda" data-editor-widget-id="${widget.id}">
                        ${(showTitleField || showTitleOnlyEditor) ? `
                            <label class="bento-editor-block">
                                <span>Titulo</span>
                                <input type="text" data-action="change-agenda-title" data-widget-id="${widget.id}" value="${draft.title}" />
                            </label>
                        ` : ''}
                        ${showTitleOnlyEditor ? '' : `
                            <div class="bento-agenda-editor-grid">
                                <label class="bento-editor-block bento-editor-block--full">
                                    <span>Item</span>
                                    <input type="text" data-field="agenda-text" value="${draft.text}" placeholder="${isSimpleList ? 'Ex.: ideia, anotacao ou referencia' : 'Ex.: responder cliente ou avisar sobre o RAL'}" />
                                </label>
                                ${isSimpleList ? '' : `
                                    <label class="bento-editor-block">
                                        <span>Urgencia</span>
                                        <select data-field="agenda-priority">
                                            <option value="today" ${draft.priorityType === 'today' ? 'selected' : ''}>Hoje</option>
                                            <option value="week" ${draft.priorityType === 'week' ? 'selected' : ''}>Esta semana</option>
                                            <option value="month" ${draft.priorityType === 'month' ? 'selected' : ''}>Este mes</option>
                                            <option value="date" ${draft.priorityType === 'date' ? 'selected' : ''}>Por data</option>
                                        </select>
                                    </label>
                                    <label class="bento-editor-block">
                                        <span>Data</span>
                                        <input type="date" data-field="agenda-date" value="${draft.dueDate}" ${draft.priorityType === 'date' ? '' : 'disabled'} />
                                    </label>
                                `}
                                <div class="bento-editor-inline-submit">
                                    <span>&nbsp;</span>
                                    <button type="button" class="bento-agenda-add-button bento-agenda-add-button--inline" data-action="save-agenda-task" data-widget-id="${widget.id}">Salvar</button>
                                </div>
                            </div>
                            <input type="hidden" data-field="agenda-editing-task-id" value="${draft.editingTaskId}" />
                            ${draft.editingTaskId ? `
                                <div class="bento-agenda-editor-actions">
                                    <button type="button" class="btn btn-ghost" data-action="cancel-agenda-task" data-widget-id="${widget.id}">Cancelar</button>
                                </div>
                            ` : ''}
                        `}
                    </div>
                ` : ''}
            </article>
        `;
    };

    return {
        getAgendaDraft,
        setAgendaDraft,
        clearAgendaDraft,
        addOrUpdateAgendaTask,
        updateAgendaTaskStatus,
        deleteAgendaTask,
        beginAgendaTaskEdit,
        renderAgendaWidget
    };
}
