import { activityLogger } from '../utils/ActivityLogger.js';

function el(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className' || key === 'class') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key === 'innerHTML') {
            element.innerHTML = value;
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.substring(2).toLowerCase(), value);
        } else {
            element.setAttribute(key, value);
        }
    }
    for (const child of children) {
        if (typeof child === 'string' || typeof child === 'number') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    }
    return element;
}

function searchIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" class="w-5 h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
}

export function ActivityLogView() {
    let logs = [];
    let isLoading = true;
    let currentFilterType = 'all'; // all, day, month, year
    let currentFilterValue = '';
    let currentSearchTerm = '';

    const container = el('div', { class: 'activity-log-view h-full flex flex-col' });
    const headerContainer = el('div', { class: 'flex-shrink-0 mb-4' });
    const listContainer = el('div', { class: 'flex-1 min-h-0 overflow-y-auto' });
    
    container.appendChild(headerContainer);
    container.appendChild(listContainer);

    async function loadData() {
        isLoading = true;
        renderList();
        logs = await activityLogger.getLogs(currentFilterType, currentFilterValue);
        isLoading = false;
        renderList();
    }

    function formatDate(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}, ${day}/${month}/${year}`;
    }

    function getActionDetails(type) {
        switch (type) {
            case 'CREATE': return { label: 'Adicionado', color: '#10b981', bg: '#d1fae5', icon: 'M12 4v16m8-8H4' };
            case 'UPDATE': return { label: 'Editado', color: '#f59e0b', bg: '#fef3c7', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' };
            case 'SOFT_DELETE': return { label: 'Enviado p/ Lixeira', color: '#ef4444', bg: '#fee2e2', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' };
            case 'RESTORE': return { label: 'Restaurado', color: '#3b82f6', bg: '#dbeafe', icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' };
            case 'PERMANENT_DELETE': return { label: 'Excluído Permanente', color: '#000000', bg: '#e5e7eb', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' };
            default: return { label: type, color: '#6b7280', bg: '#f3f4f6', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' };
        }
    }

    function renderLogItem(log) {
        const action = getActionDetails(log.action_type);
        
        return el('div', { class: 'log-item-row' }, [
            el('div', { class: 'log-date' }, [formatDate(log.created_at)]),
            el('div', { class: 'log-icon-wrapper', style: `background-color: ${action.bg}; color: ${action.color}` }, [
                el('svg', { 
                    class: 'h-4 w-4', 
                    fill: 'none', 
                    viewBox: '0 0 24 24', 
                    stroke: 'currentColor', 
                    'stroke-width': '2' 
                }, [
                    el('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: action.icon })
                ])
            ]),
            el('span', { class: 'log-action-badge', style: `color: ${action.color}; border: 1px solid ${action.color}40; background-color: ${action.bg}` }, [action.label]),
            el('span', { class: 'log-entity-type' }, [`${log.entity_type === 'TITULAR' ? 'Titular' : 'Processo'} › `]),
            el('span', { class: 'log-entity-label', title: log.entity_label }, [log.entity_label]),
            el('span', { class: 'log-user' }, [log.user_name])
        ]);
    }

    function renderHeader() {
        headerContainer.innerHTML = '';

        const header = el('div', { class: 'admin-section-header flex flex-col md:flex-row md:items-center gap-4 w-full' }, [
            el('div', { class: 'flex items-center gap-3 w-full' }, [
                // BUSCA (Estilo Titular/Processo)
                el('div', { class: 'flex-1' }, [
                    el('label', { class: 'client-master-search m-0' }, [
                        el('span', { class: 'client-master-search-icon', innerHTML: searchIcon(), 'aria-hidden': 'true' }),
                        el('input', {
                            type: 'search',
                            name: 'log-search',
                            placeholder: 'Buscar registro...',
                            value: currentSearchTerm,
                            oninput: (e) => {
                                currentSearchTerm = e.target.value;
                                renderList();
                            }
                        })
                    ])
                ]),
                // FILTRO DE PERIODO
                el('div', { class: 'flex items-center gap-2 bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm flex-shrink-0' }, [
                    el('label', { class: 'text-xs font-semibold text-gray-500 ml-1 uppercase tracking-wider hidden sm:block' }, ['Período:']),
                    el('select', { 
                        class: 'text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 pr-8 py-1',
                        onchange: (e) => {
                            currentFilterType = e.target.value;
                            if (currentFilterType === 'all') {
                                currentFilterValue = '';
                                loadData();
                                renderHeader();
                                return;
                            } else if (currentFilterType === 'day') {
                                currentFilterValue = new Date().toISOString().split('T')[0];
                            } else if (currentFilterType === 'month') {
                                currentFilterValue = new Date().toISOString().substring(0, 7);
                            } else if (currentFilterType === 'year') {
                                currentFilterValue = new Date().getFullYear().toString();
                            }
                            renderHeader();
                            loadData();
                        }
                    }, [
                        el('option', { value: 'all', selected: currentFilterType === 'all' }, ['Tudo']),
                        el('option', { value: 'day', selected: currentFilterType === 'day' }, ['Específico (Dia)']),
                        el('option', { value: 'month', selected: currentFilterType === 'month' }, ['Mês Todo']),
                        el('option', { value: 'year', selected: currentFilterType === 'year' }, ['Ano Inteiro'])
                    ]),
                    currentFilterType !== 'all' ? el('div', { class: 'flex items-center pl-2 border-l border-gray-100' }, [
                        currentFilterType === 'year' 
                        ? el('select', {
                            class: 'text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 py-1',
                            onchange: (e) => {
                                currentFilterValue = e.target.value;
                                loadData();
                            }
                        }, Array.from({length: 10}, (_, i) => new Date().getFullYear() - i).map(y => 
                            el('option', { value: String(y), selected: String(y) === currentFilterValue }, [String(y)])
                        ))
                        : el('input', {
                            type: currentFilterType === 'month' ? 'month' : 'date',
                            class: 'text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 py-1',
                            value: currentFilterValue,
                            onchange: (e) => {
                                currentFilterValue = e.target.value;
                                loadData();
                            }
                        })
                    ]) : null
                ].filter(Boolean))
            ])
        ]);
        headerContainer.appendChild(header);
    }

    function renderList() {
        listContainer.innerHTML = '';

        if (isLoading) {
            listContainer.appendChild(
                el('div', { class: 'flex justify-center items-center py-12' }, [
                    el('div', { class: 'spinner h-8 w-8 text-indigo-500' }),
                    el('span', { class: 'ml-3 text-gray-500' }, ['Carregando registros...'])
                ])
            );
            return;
        }

        const search = currentSearchTerm.toLowerCase();
        const filteredLogs = logs.filter(log => {
            if (!search) return true;
            const action = getActionDetails(log.action_type);
            const searchString = `${action.label} ${log.entity_type === 'TITULAR' ? 'Titular' : 'Processo'} ${log.entity_label || ''} ${log.user_name || ''}`.toLowerCase();
            return searchString.includes(search);
        });

        if (filteredLogs.length === 0) {
            listContainer.appendChild(
                el('div', { class: 'empty-state p-8 text-center bg-gray-50 rounded-xl border border-gray-100 mt-2' }, [
                    el('div', { class: 'text-gray-400 mb-2' }, [
                        el('svg', { class: 'h-12 w-12 mx-auto', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
                            el('path', { d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
                        ])
                    ]),
                    el('h3', { class: 'text-lg font-medium text-gray-900' }, ['Nenhum registro encontrado']),
                    el('p', { class: 'text-sm text-gray-500 mt-1' }, [
                        currentSearchTerm ? 'Tente buscar com outros termos.' : 'As atividades recentes da organização aparecerão aqui.'
                    ])
                ])
            );
            return;
        }

        const listItems = el('div', { class: 'log-list space-y-3' }, filteredLogs.map(renderLogItem));
        listContainer.appendChild(listItems);
    }

    // Adicionando um pouco de CSS ao main se não existir
    if (!document.getElementById('activity-log-styles')) {
        const style = el('style', { id: 'activity-log-styles' }, [`
            .log-item-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1.25rem; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.02); flex-wrap: nowrap; overflow: hidden; }
            .log-item-row:hover { border-color: #d1d5db; box-shadow: 0 4px 6px rgba(0,0,0,0.04); transform: translateY(-1px); }
            .log-date { font-size: 0.85rem; color: #6b7280; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: nowrap; }
            .log-icon-wrapper { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .log-action-badge { font-size: 0.7rem; font-weight: 700; padding: 0.125rem 0.6rem; border-radius: 9999px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.025em; }
            .log-entity-type { font-size: 0.8rem; color: #4b5563; font-weight: 600; white-space: nowrap; margin-right: -0.25rem; }
            .log-entity-label { font-size: 0.9rem; color: #111827; font-weight: 500; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
            .log-user { font-size: 0.85rem; color: #6b7280; font-weight: 500; white-space: nowrap; margin-left: auto; padding-left: 1rem; }
        `]);
        document.head.appendChild(style);
    }

    renderHeader();
    loadData();

    return container;
}
