import { processStore } from '../utils/ProcessStore.js';
import { clientStore } from '../utils/ClientStore.js';
import {
    getDashboardWidgetSpan,
    getDashboardPlacementForSlot,
    buildDashboardGridState,
    canPlaceDashboardWidgetAtSlot
} from '../dashboard/gridEngine.js';
import { reportDashboardError } from '../dashboard/logger.js';
import {
    normalizeAgendaTask,
    normalizeListItem,
    formatClockParts
} from '../dashboard/viewHelpers.js';
import {
    iconMoreDots,
    iconPlusWidget,
    renderWidgetTypePreview
} from '../dashboard/widgetVisuals.js';
import { createAgendaController } from '../dashboard/agendaController.js';
import { createDragController } from '../dashboard/dragController.js';
import { buildDashboardSummaryMetrics } from '../dashboard/summaryMetrics.js';

const DASHBOARD_WIDGETS_SCHEMA_VERSION = 2;
const DASHBOARD_WIDGETS_STORAGE_KEY = 'app-control-dashboard-widgets-v1';
const DASHBOARD_EDITOR_MODE_NONE = 'none';
const DASHBOARD_EDITOR_MODE_FULL = 'full';
const DASHBOARD_EDITOR_MODE_AGENDA_ITEM = 'agenda-item';
const DASHBOARD_EDITOR_MODE_AGENDA_TITLE = 'agenda-title';

export function renderDashboard(container, actionHost, storageKey = DASHBOARD_WIDGETS_STORAGE_KEY, deadlineAlertDays = 15) {
    let clockTicker = null;
    let currentGridColumns = 6;
    let currentGridState = null;
    let addWidgetMenuOpen = false;
    let openWidgetMenuId = null;
    let openEditorWidgetId = null;
    let openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
    let openTaskMenuKey = null;
    let openTaskMenuAnchor = null;
    let pendingWidgetType = null;
    let pendingDragWidgetId = null;
    let pendingDragPointerId = null;
    let pendingDragTimer = null;
    let draggingWidgetId = null;
    let dropTargetSlotIndex = null;
    let activePointerId = null;
    let dragOriginX = 0;
    let dragOriginY = 0;
    let resizeFrameId = 0;
    const agendaDrafts = new Map();

    const getDashboardColumns = () => {
        if (window.innerWidth >= 1320) return 6;
        if (window.innerWidth >= 900) return 4;
        return 2;
    };

    const normalizeLoadedWidgets = (items) => {
        const usedIds = new Set();
        return items
            .map((item, index) => {
                const rawId = String(item?.id || '').trim() || `widget-${Date.now()}-${index}`;
                const id = usedIds.has(rawId) ? `${rawId}-${index}` : rawId;
                usedIds.add(id);

                const type = ['resumo', 'relogio', 'calendario', 'meta_mes', 'pauta', 'lista'].includes(item?.type) ? item.type : '';
                const rawSlot = Number(item?.slot);
                const slot = Number.isFinite(rawSlot) && rawSlot >= 1 ? Math.floor(rawSlot) : index + 1;
                const defaultClockMode = String(item?.options?.clockMode || 'digital');

                if (type === 'relogio') {
                    return {
                        id,
                        type,
                        slot,
                        options: {
                            clockMode: ['digital', 'ponteiros', 'compacto', 'faixa'].includes(defaultClockMode)
                                ? defaultClockMode
                                : 'digital'
                        }
                    };
                }

                if (type === 'calendario') {
                    return {
                        id,
                        type,
                        slot,
                        options: {}
                    };
                }

                if (type === 'meta_mes') {
                    return {
                        id,
                        type,
                        slot,
                        options: {}
                    };
                }

                if (type === 'pauta') {
                    const tasks = Array.isArray(item?.options?.items)
                        ? item.options.items.map(normalizeAgendaTask).filter(Boolean)
                        : [];
                    return {
                        id,
                        type,
                        slot,
                        options: {
                            title: String(item?.options?.title || 'Tarefas').trim() || 'Tarefas',
                            items: tasks
                        }
                    };
                }

                if (type === 'lista') {
                    const items = Array.isArray(item?.options?.items)
                        ? item.options.items.map(normalizeListItem).filter(Boolean)
                        : [];
                    return {
                        id,
                        type,
                        slot,
                        options: {
                            title: String(item?.options?.title || 'Lista').trim() || 'Lista',
                            items
                        }
                    };
                }

                return {
                    id,
                    type,
                    slot,
                    options: {
                        totalTitulares: Boolean(item?.options?.totalTitulares),
                        titularesComProcesso: Boolean(item?.options?.titularesComProcesso),
                        totalProcessos: Boolean(item?.options?.totalProcessos || item?.options?.totalProjetos),
                        resumoPrazos: Boolean(item?.options?.resumoPrazos)
                    }
                };
            })
            .filter((item) => item.id && item.type);
    };

    const loadWidgets = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (Array.isArray(parsed)) {
                const migratedWidgets = normalizeLoadedWidgets(parsed);
                localStorage.setItem(storageKey, JSON.stringify({
                    schemaVersion: DASHBOARD_WIDGETS_SCHEMA_VERSION,
                    updatedAt: Date.now(),
                    widgets: migratedWidgets
                }));
                return migratedWidgets;
            }
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.widgets)) return [];
            return normalizeLoadedWidgets(parsed.widgets);
        } catch (error) {
            reportDashboardError('dashboard-load-widgets', error, { storageKey });
            return [];
        }
    };

    const widgets = loadWidgets();
    const widgetTypes = [
        { id: 'resumo', label: 'Resumo', copy: 'Indicadores centrais do painel' },
        { id: 'relogio', label: 'Relogio', copy: 'Hora em formatos dinamicos' },
        { id: 'calendario', label: 'Calendario', copy: 'Mes atual com todos os dias visiveis' },
        { id: 'meta_mes', label: 'Meta do mes', copy: 'Outorgas e requerimentos protocolados no mes atual' },
        { id: 'pauta', label: 'Tarefas', copy: 'Lista priorizada de tarefas e retornos' },
        { id: 'lista', label: 'Lista', copy: 'Itens livres para ideias, notas e registros' }
    ];

    const getWidgetById = (widgetId) => widgets.find((widget) => widget.id === widgetId);

    const getNextFreeSlot = (type = 'resumo', ignoreWidgetId = null, columns = currentGridColumns) => {
        const span = getDashboardWidgetSpan({ id: '__temp__', type, options: { items: [] } }, columns);
        let slot = 1;
        while (slot < 500) {
            if (canPlaceDashboardWidgetAtSlot(widgets, slot, span.cols, span.rows, ignoreWidgetId, columns)) {
                return getDashboardPlacementForSlot(slot, span.cols, columns).slot;
            }
            slot += 1;
        }
        return 1;
    };

    const persistWidgets = () => {
        const serialized = widgets.map((widget) => {
            if (widget.type === 'relogio') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {
                        clockMode: widget.options?.clockMode || 'digital'
                    }
                };
            }

            if (widget.type === 'calendario') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {}
                };
            }

            if (widget.type === 'meta_mes') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {}
                };
            }

            if (widget.type === 'pauta') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {
                        title: String(widget.options?.title || 'Tarefas').trim() || 'Tarefas',
                        items: Array.isArray(widget.options?.items)
                            ? widget.options.items.map((task, index) => normalizeAgendaTask(task, index)).filter(Boolean)
                            : []
                    }
                };
            }

            if (widget.type === 'lista') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {
                        title: String(widget.options?.title || 'Lista').trim() || 'Lista',
                        items: Array.isArray(widget.options?.items)
                            ? widget.options.items.map((item, index) => normalizeListItem(item, index)).filter(Boolean)
                            : []
                    }
                };
            }

            return {
                id: widget.id,
                type: widget.type,
                slot: widget.slot,
                options: {
                    totalTitulares: Boolean(widget.options?.totalTitulares),
                    titularesComProcesso: Boolean(widget.options?.titularesComProcesso),
                    totalProcessos: Boolean(widget.options?.totalProcessos),
                    resumoPrazos: Boolean(widget.options?.resumoPrazos)
                }
            };
        });
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                schemaVersion: DASHBOARD_WIDGETS_SCHEMA_VERSION,
                updatedAt: Date.now(),
                widgets: serialized
            }));
        } catch (error) {
            reportDashboardError('dashboard-persist-widgets', error, { storageKey, widgetsCount: serialized.length });
        }
    };

    const createWidget = (type, options = {}) => {
        const columns = getDashboardColumns();
        const pautaTitle = String(options.title || '').trim();
        widgets.push({
            id: `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type,
            slot: getNextFreeSlot(type, null, columns),
            options: type === 'relogio'
                ? { clockMode: 'digital' }
                : type === 'calendario'
                    ? {}
                : type === 'meta_mes'
                    ? {}
                : type === 'pauta'
                    ? { title: pautaTitle || 'Tarefas', items: [] }
                    : type === 'lista'
                        ? { title: pautaTitle || 'Lista', items: [] }
                    : {
                        totalTitulares: false,
                        titularesComProcesso: false,
                        totalProcessos: false,
                        resumoPrazos: false
                    }
        });
        persistWidgets();
        addWidgetMenuOpen = false;
        pendingWidgetType = null;
        openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
        render();
    };

    const deleteWidget = (widgetId) => {
        const index = widgets.findIndex((widget) => widget.id === widgetId);
        if (index < 0) return;
        widgets.splice(index, 1);
        agendaDrafts.delete(widgetId);
        persistWidgets();
        openWidgetMenuId = null;
        openEditorWidgetId = null;
        openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
        openTaskMenuKey = null;
        render();
    };

    const updateResumoOption = (widgetId, optionKey, checked) => {
        const widget = widgets.find((item) => item.id === widgetId && item.type === 'resumo');
        if (!widget) return;
        widget.options[optionKey] = Boolean(checked);
        persistWidgets();
        render();
    };

    const updateClockMode = (widgetId, clockMode) => {
        const widget = widgets.find((item) => item.id === widgetId && item.type === 'relogio');
        if (!widget) return;
        widget.options.clockMode = ['digital', 'ponteiros', 'compacto', 'faixa'].includes(clockMode) ? clockMode : 'digital';
        persistWidgets();
        render();
    };

    const updateAgendaTitle = (widgetId, title) => {
        const widget = widgets.find((item) => item.id === widgetId && ['pauta', 'lista'].includes(item.type));
        if (!widget) return;
        widget.options.title = String(title || '').trim() || (widget.type === 'lista' ? 'Lista' : 'Tarefas');
        persistWidgets();
        render();
    };

    const resetTransientUi = () => {
        addWidgetMenuOpen = false;
        pendingWidgetType = null;
        openWidgetMenuId = null;
        openEditorWidgetId = null;
        openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
        openTaskMenuKey = null;
        openTaskMenuAnchor = null;
    };

    const renderClockFace = (clockMode) => {
        if (clockMode === 'ponteiros') {
            return `
                <div class="clock-face clock-face--analog" data-clock-face="ponteiros">
                    <div class="clock-analog-shell">
                        <div class="clock-analog-markers">
                            <span></span><span></span><span></span><span></span>
                        </div>
                        <i class="clock-hand hour" data-clock-hand="hour"></i>
                        <i class="clock-hand minute" data-clock-hand="minute"></i>
                        <i class="clock-hand second" data-clock-hand="second"></i>
                        <i class="clock-hand-center"></i>
                    </div>
                </div>
            `;
        }

        if (clockMode === 'compacto') {
            return `
                <div class="clock-face clock-face--compact" data-clock-face="compacto">
                    <p class="clock-mini-kicker" data-clock-day></p>
                    <p class="clock-compact-time"><span data-clock-hours></span><b>:</b><span data-clock-minutes></span></p>
                    <p class="clock-mini-copy" data-clock-date></p>
                </div>
            `;
        }

        if (clockMode === 'faixa') {
            return `
                <div class="clock-face clock-face--strip" data-clock-face="faixa">
                    <div class="clock-strip-main">
                        <span data-clock-hours></span>
                        <b>:</b>
                        <span data-clock-minutes></span>
                    </div>
                    <div class="clock-strip-meta">
                        <span data-clock-seconds></span>
                        <span data-clock-date></span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="clock-face clock-face--digital" data-clock-face="digital">
                <p class="clock-digital-time"><span data-clock-hours></span><b>:</b><span data-clock-minutes></span></p>
            </div>
        `;
    };

    const renderWidgetOverlayActions = (widget) => `
        <div class="bento-widget-actions bento-widget-actions--overlay">
            <button
                type="button"
                class="bento-widget-menu-trigger bento-widget-menu-trigger--plain"
                data-action="toggle-widget-menu"
                data-widget-id="${widget.id}"
                aria-label="Ações do widget"
            >
                ${iconMoreDots()}
            </button>
            ${openWidgetMenuId === widget.id ? `
                <div class="bento-widget-menu" role="menu">
                    ${['calendario', 'meta_mes'].includes(widget.type) ? '' : `<button type="button" data-action="edit-widget" data-widget-id="${widget.id}" role="menuitem">Editar</button>`}
                    <button type="button" data-action="delete-widget" data-widget-id="${widget.id}" role="menuitem">Excluir</button>
                </div>
            ` : ''}
        </div>
    `;

    const renderClockWidget = (widget) => {
        const clockMode = widget.options.clockMode || 'digital';
        return `
            <article class="bento-widget bento-widget--summary bento-widget--clock" data-widget-id="${widget.id}" data-clock-widget-id="${widget.id}" data-clock-mode="${clockMode}">
                ${renderWidgetOverlayActions(widget)}
                <div class="bento-clock-content">
                    ${renderClockFace(clockMode)}
                </div>
                ${openEditorWidgetId === widget.id ? `
                    <div class="bento-widget-editor" data-editor-widget-id="${widget.id}">
                        <label><input type="radio" name="clock-mode-${widget.id}" data-action="change-clock-mode" data-widget-id="${widget.id}" value="digital" ${clockMode === 'digital' ? 'checked' : ''} />Relogio digital</label>
                        <label><input type="radio" name="clock-mode-${widget.id}" data-action="change-clock-mode" data-widget-id="${widget.id}" value="ponteiros" ${clockMode === 'ponteiros' ? 'checked' : ''} />Relogio de ponteiros</label>
                        <label><input type="radio" name="clock-mode-${widget.id}" data-action="change-clock-mode" data-widget-id="${widget.id}" value="compacto" ${clockMode === 'compacto' ? 'checked' : ''} />Relogio compacto</label>
                        <label><input type="radio" name="clock-mode-${widget.id}" data-action="change-clock-mode" data-widget-id="${widget.id}" value="faixa" ${clockMode === 'faixa' ? 'checked' : ''} />Relogio em faixa</label>
                    </div>
                ` : ''}
            </article>
        `;
    };

    const renderCalendarWidget = (widget) => {
        const now = new Date();
        const year = now.getFullYear();
        const monthForLabel = now.toLocaleDateString('pt-BR', { month: 'long' });
        const monthLabel = monthForLabel.charAt(0).toUpperCase() + monthForLabel.slice(1);
        const today = now.getDate();
        const month = now.getMonth();
        const firstDay = new Date(year, month, 1);
        const firstWeekday = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const weekdayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        const cells = [];

        for (let index = 0; index < firstWeekday; index += 1) {
            cells.push('<span class="calendar-day is-empty" aria-hidden="true"></span>');
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dayLabel = `${day} de ${monthForLabel} de ${year}`;
            cells.push(`<span class="calendar-day${day === today ? ' is-today' : ''}" role="gridcell" aria-label="${dayLabel}">${day}</span>`);
        }

        while (cells.length < 42) {
            cells.push('<span class="calendar-day is-empty" aria-hidden="true"></span>');
        }

        return `
            <article class="bento-widget bento-widget--summary bento-widget--calendar-panel" data-widget-id="${widget.id}">
                ${renderWidgetOverlayActions(widget)}
                <div class="calendar-panel">
                    <div class="calendar-panel-header">
                        <div class="calendar-panel-title-group">
                            <h3 class="calendar-panel-title">${monthLabel}</h3>
                            <span class="calendar-panel-year">${year}</span>
                        </div>
                        <div class="calendar-panel-today-badge">Hoje, ${today}</div>
                    </div>
                    <div class="calendar-weekdays">
                        ${weekdayLabels.map((label) => `<span>${label}</span>`).join('')}
                    </div>
                    <div class="calendar-grid">
                        ${cells.join('')}
                    </div>
                </div>
            </article>
        `;
    };

    const renderMonthlyGoalWidget = (widget) => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthLabel = now
            .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            .replace(/^./, (char) => char.toUpperCase());

        const safeProcesses = Array.isArray(processStore.processes) ? processStore.processes : [];
        const outorgadosNoMes = safeProcesses.filter((process) => {
            const rawDate = String(process?.dataOutorga || '').trim();
            if (!rawDate) return false;
            const parsedDate = new Date(`${rawDate}T00:00:00`);
            if (Number.isNaN(parsedDate.getTime())) return false;
            return parsedDate.getMonth() === currentMonth && parsedDate.getFullYear() === currentYear;
        });
        const requerimentosProtocoladosNoMes = safeProcesses.filter((process) => {
            const rawDate = String(process?.dataProtocolo || '').trim();
            if (!rawDate) return false;
            const parsedDate = new Date(`${rawDate}T00:00:00`);
            if (Number.isNaN(parsedDate.getTime())) return false;
            const hasTitulo = Boolean(String(process?.numeroTitulo || '').trim());
            const fase = String(process?.fase || '')
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .toLowerCase()
                .trim();
            const isRequerimento = !hasTitulo || fase.includes('requerimento');
            return isRequerimento && parsedDate.getMonth() === currentMonth && parsedDate.getFullYear() === currentYear;
        });

        return `
            <article class="bento-widget bento-widget--summary bento-widget--monthly-goal" data-widget-id="${widget.id}">
                ${renderWidgetOverlayActions(widget)}
                <div class="monthly-goal-panel">
                    <p class="monthly-goal-kicker">Meta do mes</p>
                    <div class="monthly-goal-metrics">
                        <div class="monthly-goal-metric">
                            <h3 class="monthly-goal-title">Titulos outorgados</h3>
                            <p class="monthly-goal-value">${outorgadosNoMes.length}</p>
                        </div>
                        <div class="monthly-goal-metric">
                            <h3 class="monthly-goal-title">Processos protocolados</h3>
                            <p class="monthly-goal-value">${requerimentosProtocoladosNoMes.length}</p>
                        </div>
                    </div>
                    <p class="monthly-goal-period">${monthLabel}</p>
                </div>
            </article>
        `;
    };

    const updateClockWidgets = () => {
        const now = new Date();
        const { hours, minutes, seconds, weekday, fullDate, dayMonth } = formatClockParts(now);
        container.querySelectorAll('[data-clock-widget-id]').forEach((widgetNode) => {
            widgetNode.querySelectorAll('[data-clock-hours]').forEach((node) => { node.textContent = hours; });
            widgetNode.querySelectorAll('[data-clock-minutes]').forEach((node) => { node.textContent = minutes; });
            widgetNode.querySelectorAll('[data-clock-seconds]').forEach((node) => { node.textContent = seconds; });
            widgetNode.querySelectorAll('[data-clock-date]').forEach((node) => { node.textContent = dayMonth; });
            widgetNode.querySelectorAll('[data-clock-day]').forEach((node) => { node.textContent = weekday; });
            widgetNode.querySelectorAll('[data-clock-full-date]').forEach((node) => { node.textContent = fullDate; });
            widgetNode.querySelectorAll('[data-clock-weekday]').forEach((node) => { node.textContent = weekday; });

            if (widgetNode.dataset.clockMode !== 'ponteiros') return;
            const hoursNum = now.getHours() % 12;
            const minutesNum = now.getMinutes();
            const secondsNum = now.getSeconds();
            const hourDeg = (hoursNum + minutesNum / 60) * 30;
            const minuteDeg = (minutesNum + secondsNum / 60) * 6;
            const secondDeg = secondsNum * 6;
            const hourHand = widgetNode.querySelector('[data-clock-hand="hour"]');
            const minuteHand = widgetNode.querySelector('[data-clock-hand="minute"]');
            const secondHand = widgetNode.querySelector('[data-clock-hand="second"]');
            if (hourHand) hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
            if (minuteHand) minuteHand.style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
            if (secondHand) secondHand.style.transform = `translateX(-50%) rotate(${secondDeg}deg)`;
        });
    };

    const startClockTicker = () => {
        if (clockTicker) clearInterval(clockTicker);
        if (!widgets.some((widget) => widget.type === 'relogio')) return;
        updateClockWidgets();
        clockTicker = window.setInterval(updateClockWidgets, 1000);
    };

    const renderResumoWidget = (widget) => {
        const safeProcesses = Array.isArray(processStore.processes) ? processStore.processes : [];
        const totalTitulares = clientStore.getClients().length;
        const showTitulares = widget.options.totalTitulares;
        const showTitularesComProcesso = widget.options.titularesComProcesso;
        const showProcessos = widget.options.totalProcessos;
        const showPrazos = widget.options.resumoPrazos;
        const {
            totalProcessos,
            titularesComProcesso,
            titularesSemProcesso,
            titularesComProcessoPercent,
            totalPrazos,
            maxDeadlineBucket,
            prazoDistribution,
            topProcessTypes,
            hasCriticalDeadlines
        } = buildDashboardSummaryMetrics(safeProcesses, totalTitulares);
        const showTitularesSection = showTitulares || showTitularesComProcesso;
        const hasAnySection = showTitularesSection || showProcessos || showPrazos;

        return `
            <article class="bento-widget bento-widget--summary" data-widget-id="${widget.id}">
                ${renderWidgetOverlayActions(widget)}
                <div class="bento-summary-content${hasAnySection ? '' : ' is-empty'}">
                    ${hasAnySection ? `
                        <div class="bento-summary-panels">
                            ${showTitularesSection ? `
                                <section class="bento-summary-panel tone-primary">
                                    <div class="bento-summary-panel-head">
                                        <p class="bento-summary-panel-label">Titulares</p>
                                        ${showTitulares ? `<p class="bento-summary-panel-total">${totalTitulares}</p>` : ''}
                                    </div>
                                    <div class="bento-summary-titulares">
                                        ${showTitularesComProcesso ? `
                                            <div class="bento-summary-emphasis">
                                                <strong class="bento-summary-emphasis-value">${titularesComProcesso}</strong>
                                                <span class="bento-summary-emphasis-copy">com processo vinculado</span>
                                            </div>
                                            ${showTitulares ? `
                                                <div class="bento-summary-progress-track" aria-hidden="true"><span style="width:${titularesComProcessoPercent}%;"></span></div>
                                                <div class="bento-summary-split">
                                                    <span>${titularesComProcessoPercent}% da base</span>
                                                    <strong>${titularesSemProcesso} sem processo</strong>
                                                </div>
                                            ` : ''}
                                        ` : ''}
                                        ${showTitulares && !showTitularesComProcesso ? `
                                            <div class="bento-summary-emphasis">
                                                <strong class="bento-summary-emphasis-value">${totalTitulares}</strong>
                                                <span class="bento-summary-emphasis-copy">titulares cadastrados</span>
                                            </div>
                                        ` : ''}
                                        ${showTitulares ? `
                                            <div class="bento-summary-footnote">
                                                <span>Total da carteira</span>
                                                <strong>${totalTitulares}</strong>
                                            </div>
                                        ` : ''}
                                    </div>
                                </section>
                            ` : ''}
                            ${showProcessos ? `
                                <section class="bento-summary-panel tone-secondary">
                                    <div class="bento-summary-panel-head">
                                        <p class="bento-summary-panel-label">Processos</p>
                                        <p class="bento-summary-panel-total">${totalProcessos}</p>
                                    </div>
                                    <div class="bento-summary-breakdown">
                                        ${topProcessTypes.length ? topProcessTypes.map((item) => `
                                            <div class="bento-summary-chip">
                                                <span>${item.value}</span>
                                                <strong>${item.label}</strong>
                                            </div>
                                        `).join('') : '<div class="bento-summary-chip is-empty"><strong>Sem tipos</strong></div>'}
                                    </div>
                                </section>
                            ` : ''}
                            ${showPrazos ? `
                                <section class="bento-summary-panel tone-alert${hasCriticalDeadlines ? ' has-critical' : ''}">
                                    <div class="bento-summary-panel-head">
                                        <p class="bento-summary-panel-label">Prazos a Cumprir</p>
                                        <p class="bento-summary-panel-total">${totalPrazos}</p>
                                    </div>
                                    ${totalPrazos ? `
                                        <div class="bento-summary-deadlines">
                                            <div class="bento-summary-deadline-bars">
                                                ${prazoDistribution.map((item) => `
                                                    <div class="bento-summary-deadline-row tone-${item.tone}">
                                                        <span>${item.label}</span>
                                                        <div class="bento-summary-deadline-bar"><i style="width:${Math.max((item.value / maxDeadlineBucket) * 100, item.value ? 12 : 0)}%;"></i></div>
                                                        <strong>${item.value}</strong>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : `
                                        <div class="bento-summary-deadlines-empty">
                                            <strong>Sem prazos ativos</strong>
                                            <span>Nenhum vencimento registrado nos processos.</span>
                                        </div>
                                    `}
                                </section>
                            ` : ''}
                        </div>
                    ` : `
                        <div class="bento-summary-empty-state">
                            <span class="bento-summary-empty-kicker">Resumo</span>
                            <p>Escolha os indicadores em Editar para montar este widget.</p>
                        </div>
                    `}
                </div>
                ${openEditorWidgetId === widget.id ? `
                    <div class="bento-widget-editor" data-editor-widget-id="${widget.id}">
                        <label><input type="checkbox" data-action="toggle-summary-option" data-widget-id="${widget.id}" data-option-key="totalTitulares" ${showTitulares ? 'checked' : ''} />O numero total de Titulares</label>
                        <label><input type="checkbox" data-action="toggle-summary-option" data-widget-id="${widget.id}" data-option-key="titularesComProcesso" ${showTitularesComProcesso ? 'checked' : ''} />O numero de Titulares com processos</label>
                        <label><input type="checkbox" data-action="toggle-summary-option" data-widget-id="${widget.id}" data-option-key="totalProcessos" ${showProcessos ? 'checked' : ''} />O numero total de Processos</label>
                        <label><input type="checkbox" data-action="toggle-summary-option" data-widget-id="${widget.id}" data-option-key="resumoPrazos" ${showPrazos ? 'checked' : ''} />Resumo de Prazos</label>
                    </div>
                ` : ''}
            </article>
        `;
    };

    function render() {
        try {
            if (clockTicker) {
                clearInterval(clockTicker);
                clockTicker = null;
            }
            renderWidgets();
            bindActions();
            startClockTicker();
        } catch (error) {
            reportDashboardError('dashboard-render', error, { storageKey });
            const safeMsg = String(error?.message || 'Erro Desconhecido').replace(/</g, '&lt;');
            const safeStack = String(error?.stack || '').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
            container.innerHTML = `
                <div class="glass-card" style="padding: 1.2rem;">
                    <p class="label-tech" style="color: var(--rose-500);">ERRO NO PAINEL</p>
                    <p style="margin-top: 0.5rem; color: var(--slate-600);">Nao foi possivel renderizar os widgets.</p>
                    <div style="margin-top: 1rem; padding: 1rem; background: #fee2e2; border-radius: 8px; color: #991b1b; font-family: monospace; font-size: 0.85rem; overflow-x: auto;">
                        <strong>${safeMsg}</strong><br/>
                        ${safeStack}
                    </div>
                </div>
            `;
        }
    }

    const agendaController = createAgendaController({
        widgets,
        agendaDrafts,
        container,
        persistWidgets,
        render,
        getWidgetById,
        renderWidgetOverlayActions,
        getOpenEditorWidgetId: () => openEditorWidgetId,
        getOpenEditorMode: () => openEditorMode,
        setOpenEditorWidgetId: (value) => { openEditorWidgetId = value; },
        setOpenEditorMode: (value) => { openEditorMode = value; },
        getOpenTaskMenuKey: () => openTaskMenuKey,
        setOpenTaskMenuKey: (value) => { openTaskMenuKey = value; },
        getOpenTaskMenuAnchor: () => openTaskMenuAnchor,
        setOpenTaskMenuAnchor: (value) => { openTaskMenuAnchor = value; },
        editorModes: {
            full: DASHBOARD_EDITOR_MODE_FULL,
            agendaItem: DASHBOARD_EDITOR_MODE_AGENDA_ITEM,
            agendaTitle: DASHBOARD_EDITOR_MODE_AGENDA_TITLE
        }
    });
    const {
        clearAgendaDraft,
        addOrUpdateAgendaTask,
        updateAgendaTaskStatus,
        deleteAgendaTask,
        beginAgendaTaskEdit,
        renderAgendaWidget
    } = agendaController;

    const dragController = createDragController({
        container,
        widgets,
        getWidgetById,
        getCurrentGridColumns: () => currentGridColumns,
        getCurrentGridState: () => currentGridState,
        setDraggingWidgetId: (value) => { draggingWidgetId = value; },
        getDraggingWidgetId: () => draggingWidgetId,
        setDropTargetSlotIndex: (value) => { dropTargetSlotIndex = value; },
        getDropTargetSlotIndex: () => dropTargetSlotIndex,
        setActivePointerId: (value) => { activePointerId = value; },
        getActivePointerId: () => activePointerId,
        setDragOrigin: ({ x, y }) => {
            dragOriginX = x;
            dragOriginY = y;
        },
        getDragOrigin: () => ({ x: dragOriginX, y: dragOriginY }),
        setPendingDrag: ({ widgetId, pointerId, timer }) => {
            pendingDragWidgetId = widgetId;
            pendingDragPointerId = pointerId;
            pendingDragTimer = timer;
        },
        getPendingDrag: () => ({
            widgetId: pendingDragWidgetId,
            pointerId: pendingDragPointerId,
            timer: pendingDragTimer
        }),
        getUiReset: () => resetTransientUi,
        persistWidgets,
        render,
        getDashboardWidgetSpan,
        getDashboardPlacementForSlot,
        canPlaceDashboardWidgetAtSlot
    });
    const {
        clearPendingDrag,
        clearDropTargets,
        activateDrag,
        finishDrag,
        resolveDropSlotIndex
    } = dragController;

    const renderWidgets = () => {
        currentGridColumns = getDashboardColumns();
        currentGridState = buildDashboardGridState(widgets, currentGridColumns);
        const placementEntries = [...currentGridState.placements.entries()];
        const maxOccupiedSlot = placementEntries.reduce((max, [widgetId, placement]) => {
            const highest = ((placement.row + placement.rows - 2) * currentGridColumns) + placement.col + placement.cols - 1;
            return Math.max(max, highest);
        }, 0);
        const slotCount = Math.max(currentGridColumns * 3, maxOccupiedSlot + currentGridColumns * 2);
        const anchorSlots = new Map(placementEntries.map(([widgetId, placement]) => [placement.slot, { widget: getWidgetById(widgetId), placement }]));

        if (actionHost) {
            // O menu de tipos de widget é renderizado acoplado ao Ghost Card na grade
            actionHost.innerHTML = '';
        }

        const cells = Array.from({ length: slotCount }, (_, index) => {
            const slotIndex = index + 1;
            const row = Math.floor(index / currentGridColumns) + 1;
            const col = (index % currentGridColumns) + 1;
            const widgetEntry = anchorSlots.get(slotIndex);
            const widgetOccupiesSlot = currentGridState.occupied.has(slotIndex);

            if (widgetEntry) {
                const { widget, placement } = widgetEntry;
                const widgetHtml = widget.type === 'relogio'
                    ? renderClockWidget(widget)
                    : widget.type === 'calendario'
                        ? renderCalendarWidget(widget)
                    : widget.type === 'meta_mes'
                        ? renderMonthlyGoalWidget(widget)
                    : (widget.type === 'pauta' || widget.type === 'lista')
                        ? renderAgendaWidget(widget)
                        : renderResumoWidget(widget);
                return `
                    <div
                        class="bento-grid-slot bento-grid-slot--widget"
                        data-slot-index="${placement.slot}"
                        data-widget-kind="${widget.type}"
                        style="grid-column:${placement.col} / span ${placement.cols}; grid-row:${placement.row} / span ${placement.rows};"
                    >
                        ${widgetHtml}
                    </div>
                `;
            }

            if (widgetOccupiesSlot) return '';

            return `
                <div
                    class="bento-grid-slot bento-grid-slot--empty"
                    data-slot-index="${slotIndex}"
                    style="grid-column:${col}; grid-row:${row};"
                >
                    <div class="bento-drop-slot" aria-hidden="true"></div>
                </div>
            `;
        }).join('');

        // Ghost Card: encontrar o primeiro slot vazio da primeira linha
        const firstRowSlots = Array.from({ length: currentGridColumns }, (_, i) => i + 1);
        const firstEmptyInRow1 = firstRowSlots.find((slot) => !currentGridState.occupied.has(slot)) ?? (maxOccupiedSlot + 1);
        const ghostSlotIndex = firstEmptyInRow1;
        const ghostRow = Math.floor((ghostSlotIndex - 1) / currentGridColumns) + 1;
        const ghostCol = ((ghostSlotIndex - 1) % currentGridColumns) + 1;

        const ghostCard = `
            <div
                class="bento-grid-slot bento-grid-slot--ghost"
                style="grid-column:${ghostCol}; grid-row:${ghostRow};"
            >
                <button
                    type="button"
                    class="bento-ghost-card"
                    data-action="toggle-add-widget-menu"
                    aria-label="Adicionar widget"
                    aria-haspopup="menu"
                    aria-expanded="${addWidgetMenuOpen ? 'true' : 'false'}"
                >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span class="bento-ghost-label">Adicionar Widget</span>
                </button>
                ${addWidgetMenuOpen ? `
                    <div class="bento-add-menu bento-ghost-menu ${ghostCol > Math.ceil(currentGridColumns / 2) ? 'bento-ghost-menu--right' : ''}" id="dashboard-widget-type-menu" role="menu" aria-label="Tipos de widget">
                        ${widgetTypes.map((type) => `
                            <button type="button" class="bento-add-menu-item" data-action="create-widget" data-widget-type="${type.id}" role="menuitem">
                                <span class="bento-add-menu-item-title">${type.label}</span>
                                <span class="bento-add-menu-item-preview" aria-hidden="true">${renderWidgetTypePreview(type.id)}</span>
                                <span class="bento-add-menu-item-copy">${type.copy}</span>
                            </button>
                        `).join('')}
                        ${pendingWidgetType === 'pauta' || pendingWidgetType === 'lista' ? `
                            <div class="bento-add-inline-creator">
                                <label class="bento-add-inline-field">
                                    <span>${pendingWidgetType === 'lista' ? 'Nome da lista' : 'Nome das tarefas'}</span>
                                    <input type="text" data-field="new-pauta-title" placeholder="${pendingWidgetType === 'lista' ? 'Ex.: Ideias APP' : 'Ex.: Retornos urgentes'}" />
                                </label>
                                <div class="bento-add-inline-actions">
                                    <button type="button" class="btn btn-primary" data-action="confirm-create-pauta">Criar ${pendingWidgetType === 'lista' ? 'lista' : 'tarefas'}</button>
                                    <button type="button" class="btn btn-ghost" data-action="cancel-create-pauta">Cancelar</button>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;

        container.innerHTML = `
            <section class="bento-grid bento-grid--dashboard animate-fade-in" id="dashboard-bento-grid">
                ${cells}
                ${ghostCard}
            </section>
        `;
    };

    const bindActions = () => {
        const handleActionClick = (event) => {
            const target = event.target;
            const actionElement = target.closest('[data-action]');
            const action = actionElement?.dataset.action;

            if (action === 'toggle-add-widget-menu') {
                event.stopPropagation();
                addWidgetMenuOpen = !addWidgetMenuOpen;
                pendingWidgetType = null;
                openWidgetMenuId = null;
                openEditorWidgetId = null;
                openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
                openTaskMenuKey = null;
                render();
                return;
            }

            if (action === 'create-widget') {
                event.stopPropagation();
                const widgetType = actionElement.dataset.widgetType;
                if (widgetType === 'pauta' || widgetType === 'lista') {
                    pendingWidgetType = pendingWidgetType === widgetType ? null : widgetType;
                    render();
                    const nextInput = actionHost?.querySelector('[data-field="new-pauta-title"]');
                    nextInput?.focus();
                    return;
                }
                createWidget(widgetType);
                return;
            }

            if (action === 'confirm-create-pauta') {
                event.stopPropagation();
                const title = String(actionHost?.querySelector('[data-field="new-pauta-title"]')?.value || '').trim();
                if (!title) return;
                createWidget(pendingWidgetType || 'pauta', { title });
                return;
            }

            if (action === 'cancel-create-pauta') {
                event.stopPropagation();
                pendingWidgetType = null;
                openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
                render();
                return;
            }

            if (action === 'open-agenda-add-item') {
                event.stopPropagation();
                const widgetId = actionElement.dataset.widgetId;
                openWidgetMenuId = null;
                openTaskMenuKey = null;
                openTaskMenuAnchor = null;
                openEditorWidgetId = widgetId;
                openEditorMode = DASHBOARD_EDITOR_MODE_AGENDA_ITEM;
                clearAgendaDraft(widgetId);
                render();
                return;
            }

            if (action === 'toggle-widget-menu') {
                event.stopPropagation();
                const widgetId = actionElement.dataset.widgetId;
                openWidgetMenuId = openWidgetMenuId === widgetId ? null : widgetId;
                openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
                openTaskMenuKey = null;
                render();
                return;
            }

            if (action === 'edit-widget') {
                event.stopPropagation();
                const widgetId = actionElement.dataset.widgetId;
                const widget = getWidgetById(widgetId);
                if (!widget || ['calendario', 'meta_mes'].includes(widget.type)) {
                    openWidgetMenuId = null;
                    render();
                    return;
                }
                openWidgetMenuId = null;
                const willOpen = openEditorWidgetId !== widgetId;
                openEditorWidgetId = willOpen ? widgetId : null;
                openEditorMode = willOpen
                    ? (widget?.type === 'lista' ? DASHBOARD_EDITOR_MODE_AGENDA_TITLE : DASHBOARD_EDITOR_MODE_FULL)
                    : DASHBOARD_EDITOR_MODE_NONE;
                openTaskMenuKey = null;
                openTaskMenuAnchor = null;
                render();
                return;
            }

            if (action === 'delete-widget') {
                event.stopPropagation();
                deleteWidget(actionElement.dataset.widgetId);
                return;
            }

            if (action === 'toggle-task-menu') {
                event.stopPropagation();
                const key = `${actionElement.dataset.widgetId}:${actionElement.dataset.taskId}`;
                if (openTaskMenuKey === key) {
                    openTaskMenuKey = null;
                    openTaskMenuAnchor = null;
                    render();
                    return;
                }

                const widgetNode = container.querySelector(`[data-widget-id="${actionElement.dataset.widgetId}"]`);
                const widgetRect = widgetNode?.getBoundingClientRect();
                const triggerRect = actionElement.getBoundingClientRect();
                const estimatedMenuWidth = 176;
                const estimatedMenuHeight = 176;
                const padding = 12;
                let left = 12;
                let top = 68;

                if (widgetRect) {
                    left = triggerRect.right - widgetRect.left - estimatedMenuWidth;
                    left = Math.max(padding, Math.min(left, widgetRect.width - estimatedMenuWidth - padding));
                    top = triggerRect.bottom - widgetRect.top + 8;
                    if (top + estimatedMenuHeight > widgetRect.height - padding) {
                        top = triggerRect.top - widgetRect.top - estimatedMenuHeight - 8;
                    }
                    top = Math.max(padding, top);
                }

                openTaskMenuKey = key;
                openTaskMenuAnchor = { top: Math.round(top), left: Math.round(left) };
                render();
                return;
            }

            if (action === 'mark-task-done') {
                event.stopPropagation();
                updateAgendaTaskStatus(actionElement.dataset.widgetId, actionElement.dataset.taskId, 'done');
                return;
            }

            if (action === 'skip-task') {
                event.stopPropagation();
                updateAgendaTaskStatus(actionElement.dataset.widgetId, actionElement.dataset.taskId, 'skipped');
                return;
            }

            if (action === 'edit-task') {
                event.stopPropagation();
                beginAgendaTaskEdit(actionElement.dataset.widgetId, actionElement.dataset.taskId);
                return;
            }

            if (action === 'delete-task') {
                event.stopPropagation();
                deleteAgendaTask(actionElement.dataset.widgetId, actionElement.dataset.taskId);
                return;
            }

            if (action === 'save-agenda-task') {
                event.stopPropagation();
                addOrUpdateAgendaTask(actionElement.dataset.widgetId);
                return;
            }

            if (action === 'cancel-agenda-task') {
                event.stopPropagation();
                clearAgendaDraft(actionElement.dataset.widgetId);
                openEditorMode = DASHBOARD_EDITOR_MODE_AGENDA_ITEM;
                render();
                return;
            }

            if (
                target.closest('.bento-add-wrap')
                || target.closest('.bento-widget-actions')
                || target.closest('.bento-widget-editor')
                || target.closest('.bento-agenda-item-actions')
            ) {
                return;
            }
            if (!addWidgetMenuOpen && !openWidgetMenuId && !openEditorWidgetId && !openTaskMenuKey) return;
            addWidgetMenuOpen = false;
            pendingWidgetType = null;
            openWidgetMenuId = null;
            openEditorWidgetId = null;
            openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
            openTaskMenuKey = null;
            openTaskMenuAnchor = null;
            render();
        };

        container.onclick = handleActionClick;
        if (actionHost) actionHost.onclick = handleActionClick;

        container.onchange = (event) => {
            const checkbox = event.target.closest('[data-action="toggle-summary-option"]');
            if (checkbox) {
                updateResumoOption(checkbox.dataset.widgetId, checkbox.dataset.optionKey, checkbox.checked);
                return;
            }

            const radio = event.target.closest('[data-action="change-clock-mode"]');
            if (radio) {
                updateClockMode(radio.dataset.widgetId, radio.value);
                return;
            }

            const titleInput = event.target.closest('[data-action="change-agenda-title"]');
            if (titleInput) {
                if (openEditorMode !== DASHBOARD_EDITOR_MODE_AGENDA_TITLE) {
                    openEditorMode = DASHBOARD_EDITOR_MODE_FULL;
                }
                updateAgendaTitle(titleInput.dataset.widgetId, titleInput.value);
                return;
            }

            const priorityInput = event.target.closest('[data-field="agenda-priority"]');
            if (!priorityInput) return;
            const editor = priorityInput.closest('[data-editor-widget-id]');
            const dateInput = editor?.querySelector('[data-field="agenda-date"]');
            if (dateInput) dateInput.disabled = priorityInput.value !== 'date';
        };

        const handleActionKeyDown = (event) => {
            const target = event.target;

            if (event.key === 'Escape') {
                if (target.closest('[data-field="new-pauta-title"]')) {
                    event.preventDefault();
                    pendingWidgetType = null;
                    render();
                    return;
                }

                const editor = target.closest('[data-editor-widget-id]');
                if (editor) {
                    event.preventDefault();
                    const widgetId = editor.dataset.editorWidgetId;
                    clearAgendaDraft(widgetId);
                    openEditorWidgetId = null;
                    openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
                    render();
                }
                return;
            }

            if (event.key !== 'Enter' || event.shiftKey) return;

            if (target.closest('[data-field="new-pauta-title"]')) {
                const title = String(target.value || '').trim();
                if (!title) return;
                event.preventDefault();
                createWidget(pendingWidgetType || 'pauta', { title });
                return;
            }

            const editor = target.closest('[data-editor-widget-id]');
            if (!editor) return;
            if (target.matches('[data-action="change-agenda-title"]')) return;
            if (target.tagName === 'TEXTAREA') return;

            event.preventDefault();
            addOrUpdateAgendaTask(editor.dataset.editorWidgetId);
        };

        container.onpointerdown = (event) => {
            if (event.button !== 0) return;
            const card = event.target.closest('[data-widget-id]');
            if (!card) return;
            if (event.target.closest('[data-action]') || event.target.closest('.bento-widget-editor')) return;

            event.preventDefault();
            clearPendingDrag();
            pendingDragWidgetId = card.dataset.widgetId;
            pendingDragPointerId = event.pointerId;
            dragOriginX = event.clientX;
            dragOriginY = event.clientY;
            card.setPointerCapture?.(event.pointerId);
            pendingDragTimer = window.setTimeout(() => {
                const liveCard = container.querySelector(`[data-widget-id="${card.dataset.widgetId}"]`);
                if (!liveCard) {
                    clearPendingDrag();
                    return;
                }
                activateDrag(liveCard, event.pointerId, dragOriginX, dragOriginY);
            }, 700);
        };

        let dragAnimationFrame = null;

        container.onpointermove = (event) => {
            if (!draggingWidgetId && pendingDragWidgetId === event.target.closest('[data-widget-id]')?.dataset.widgetId && pendingDragPointerId === event.pointerId) {
                const distance = Math.hypot(event.clientX - dragOriginX, event.clientY - dragOriginY);
                if (distance > 8) {
                    clearPendingDrag();
                }
                return;
            }
            if (!draggingWidgetId && pendingDragPointerId === event.pointerId) {
                const distance = Math.hypot(event.clientX - dragOriginX, event.clientY - dragOriginY);
                if (distance > 8) clearPendingDrag();
                return;
            }
            if (!draggingWidgetId || activePointerId !== event.pointerId) return;
            
            const clientX = event.clientX;
            const clientY = event.clientY;

            if (dragAnimationFrame) cancelAnimationFrame(dragAnimationFrame);
            
            dragAnimationFrame = requestAnimationFrame(() => {
                const draggedCard = container.querySelector(`[data-widget-id="${draggingWidgetId}"]`);
                const draggedWidget = getWidgetById(draggingWidgetId);
                if (!draggedCard || !draggedWidget) return;

                const translateX = clientX - dragOriginX;
                const translateY = clientY - dragOriginY;
                draggedCard.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(1.02)`;

                const slotIndex = resolveDropSlotIndex(clientX, clientY);
                if (!Number.isFinite(slotIndex) || slotIndex < 1) {
                    if (dropTargetSlotIndex !== null) {
                        clearDropTargets();
                        dropTargetSlotIndex = null;
                    }
                    return;
                }
                
                const span = getDashboardWidgetSpan(draggedWidget, currentGridColumns);
                const normalizedSlot = getDashboardPlacementForSlot(slotIndex, span.cols, currentGridColumns).slot;
                
                if (dropTargetSlotIndex !== normalizedSlot) {
                    clearDropTargets();
                    dropTargetSlotIndex = normalizedSlot;
                    const targetSlot = container.querySelector(`[data-slot-index="${normalizedSlot}"]`);
                    if (targetSlot) targetSlot.classList.add('is-drop-target');
                }
            });
        };

        container.onpointerup = (event) => {
            if (!draggingWidgetId && pendingDragPointerId === event.pointerId) {
                clearPendingDrag();
                return;
            }
            if (!draggingWidgetId || activePointerId !== event.pointerId) return;
            finishDrag(event.clientX, event.clientY);
        };

        container.onpointercancel = (event) => {
            if (!draggingWidgetId && pendingDragPointerId === event.pointerId) {
                clearPendingDrag();
                return;
            }
            if (!draggingWidgetId || activePointerId !== event.pointerId) return;
            finishDrag(undefined, undefined);
        };

        container.onkeydown = handleActionKeyDown;
        if (actionHost) actionHost.onkeydown = handleActionKeyDown;
    };

    if (container.__dashboardResizeHandler) {
        window.removeEventListener('resize', container.__dashboardResizeHandler);
    }
    if (container.__dashboardResizeCleanup) {
        container.__dashboardResizeCleanup();
    }
    container.__dashboardResizeHandler = () => {
        if (resizeFrameId) return;
        resizeFrameId = window.requestAnimationFrame(() => {
            resizeFrameId = 0;
            render();
        });
    };
    container.__dashboardResizeCleanup = () => {
        if (!resizeFrameId) return;
        window.cancelAnimationFrame(resizeFrameId);
        resizeFrameId = 0;
    };
    window.addEventListener('resize', container.__dashboardResizeHandler);

    render();
}
