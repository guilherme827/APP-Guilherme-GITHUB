import { escapeHtml } from '../utils/sanitize.js';
import { getUserInitials } from './Header.js';

export function renderDock({ visibleIds = [], fullName = '', email = '' } = {}) {
    const primaryItems = [
        { id: 'painel', label: 'Painel Central', icon: iconDashboard() },
        { id: 'clientes', label: 'Titulares', icon: iconUsers() },
        { id: 'processos', label: 'Processos', icon: iconFolder() },
        { id: 'prazos', label: 'Prazos', icon: iconCalendar() },
        { id: 'financeiro', label: 'Financeiro', icon: iconDollar() }
    ].filter((item) => visibleIds.length === 0 || visibleIds.includes(item.id));

    const settingsEnabled = visibleIds.length === 0 || visibleIds.includes('configuracoes');
    const safeName = escapeHtml(fullName || email || 'Usuario');
    const initials = escapeHtml(getUserInitials(fullName, email));

    return `
        <nav id="dock-container" aria-label="Navegacao principal">
            ${primaryItems.map((item) => renderDockItem(item)).join('')}
            <div class="dock-separator" aria-hidden="true"></div>
            ${settingsEnabled ? renderDockItem({ id: 'configuracoes', label: 'Configuracoes', icon: iconSettings() }) : ''}
            <div class="dock-separator" aria-hidden="true"></div>
            <button type="button" class="dock-profile-button dock-item" data-id="configuracoes" aria-label="${safeName}">
                <span class="dock-profile-ring">
                    <span class="dock-profile-core">${initials}</span>
                </span>
                <span class="dock-tooltip">${safeName}</span>
            </button>
        </nav>
    `;
}

function renderDockItem(item) {
    return `
        <button type="button" class="dock-item" data-id="${item.id}" aria-label="${item.label}">
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
                node.classList.toggle('active', node.dataset.id === id && !node.classList.contains('dock-profile-button'));
            });
            if (typeof onNavigate === 'function') {
                onNavigate(id);
            }
        });
    });
}

function iconDashboard() {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;
}

function iconUsers() {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
}

function iconFolder() {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>`;
}

function iconCalendar() {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="16" cy="16" r="3"></circle><path d="M16 14v2l1 1"></path></svg>`;
}

function iconDollar() {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path><circle cx="12" cy="12" r="10" stroke-opacity="0.2"></circle></svg>`;
}

function iconSettings() {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></svg>`;
}
