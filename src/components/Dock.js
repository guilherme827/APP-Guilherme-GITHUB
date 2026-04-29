export function renderDock({ visibleIds = [] } = {}) {
    const primaryItems = [
        { id: 'organizacoes', label: 'Organizações', icon: iconBuildings() },
        { id: 'ia-chat', label: 'Chat IA', icon: iconSparkles() },
        { id: 'painel', label: 'Painel Central', icon: iconDashboard() },
        { id: 'clientes', label: 'Titulares', icon: iconUsers() },
        { id: 'processos', label: 'Processos', icon: iconFolder() },
        { id: 'prazos', label: 'Prazos', icon: iconCalendar() },
        { id: 'financeiro', label: 'Financeiro', icon: iconDollar() }
    ].filter((item) => visibleIds.length === 0 || visibleIds.includes(item.id));

    const settingsEnabled = visibleIds.length === 0 || visibleIds.includes('configuracoes');
    const adminPanelEnabled = visibleIds.length === 0 || visibleIds.includes('admin-panel');

    return `
        <nav id="dock-container" aria-label="Navegacao principal">
            ${primaryItems.map((item) => renderDockItem(item)).join('')}
            ${adminPanelEnabled || settingsEnabled ? '<div class="dock-separator" aria-hidden="true"></div>' : ''}
            ${adminPanelEnabled ? renderDockItem({ id: 'admin-panel', label: 'Painel do administrador', icon: iconAdmin() }) : ''}
            ${settingsEnabled ? renderDockItem({ id: 'configuracoes', label: 'Configurações', icon: iconSettings() }) : ''}
        </nav>
    `;
}

function renderDockItem(item) {
    return `
        <button type="button" class="dock-item" data-id="${item.id}" data-dock-icon="${item.id}" aria-label="${item.label}">
            <span class="dock-icon-wrapper">
                ${item.icon}
                <span class="dock-active-dot" aria-hidden="true"></span>
            </span>
            <span class="dock-tooltip">${item.label}</span>
        </button>
    `;
}

export function initDock(onNavigate) {
    const items = document.querySelectorAll('.dock-item');
    items.forEach((item) => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            if (!id) return;
            document.querySelectorAll('.dock-item').forEach((node) => {
                node.classList.toggle('active', node.dataset.id === id);
            });
            if (typeof onNavigate === 'function') {
                onNavigate(id);
            }
        });
    });
}

function iconDashboard() {
    return `<svg class="dock-icon-svg dock-icon-svg--painel" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect class="dock-panel-tile tile-a" x="3" y="3" width="7" height="7"></rect><rect class="dock-panel-tile tile-b" x="14" y="3" width="7" height="7"></rect><rect class="dock-panel-tile tile-c" x="14" y="14" width="7" height="7"></rect><rect class="dock-panel-tile tile-d" x="3" y="14" width="7" height="7"></rect></svg>`;
}

function iconBuildings() {
    return `<svg class="dock-icon-svg dock-icon-svg--organizacoes" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path><path d="M9 9h.01"></path><path d="M9 13h.01"></path><path d="M9 17h.01"></path><path d="M13 13h.01"></path><path d="M13 17h.01"></path></svg>`;
}

function iconSparkles() {
    return `<svg class="dock-icon-svg dock-icon-svg--ia-chat" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path><path d="M5 3v3"></path><path d="M3.5 4.5h3"></path><path d="M19 18v3"></path><path d="M17.5 19.5h3"></path></svg>`;
}

function iconUsers() {
    return `<svg class="dock-icon-svg dock-icon-svg--clientes" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path class="dock-users-base" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle class="dock-users-head" cx="9" cy="7" r="4"></circle><path class="dock-users-side" d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path class="dock-users-side" d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
}

function iconFolder() {
    return `<svg class="dock-icon-svg dock-icon-svg--processos" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path class="dock-folder-shell" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line class="dock-folder-plus plus-v" x1="12" y1="11" x2="12" y2="17"></line><line class="dock-folder-plus plus-h" x1="9" y1="14" x2="15" y2="14"></line></svg>`;
}

function iconCalendar() {
    return `<svg class="dock-icon-svg dock-icon-svg--prazos" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle class="dock-calendar-clock" cx="16" cy="16" r="3"></circle><path class="dock-calendar-hand" d="M16 14v2l1 1"></path></svg>`;
}

function iconDollar() {
    return `<svg class="dock-icon-svg dock-icon-svg--financeiro" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path><circle cx="12" cy="12" r="10" stroke-opacity="0.2"></circle></svg>`;
}

function iconAdmin() {
    return `<svg class="dock-icon-svg dock-icon-svg--admin-panel" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>`;
}

function iconSettings() {
    return `<svg class="dock-icon-svg dock-icon-svg--configuracoes" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 2 2 2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></svg>`;
}
