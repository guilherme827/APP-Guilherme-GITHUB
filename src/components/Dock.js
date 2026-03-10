// Floating Dock Component
export function renderDock() {
    const items = [
        { 
            id: 'painel', 
            label: 'Painel Central', 
            icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
                   </svg>`
        },
        { 
            id: 'clientes', 
            label: 'Titulares', 
            icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                   </svg>`
        },
        { 
            id: 'processos', 
            label: 'Processos', 
            icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    <line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line>
                   </svg>`
        },
        { 
            id: 'prazos', 
            label: 'Prazos', 
            icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
                    <circle cx="16" cy="16" r="3"></circle><path d="M16 14v2l1 1"></path>
                   </svg>`
        },
        { 
            id: 'financeiro', 
            label: 'Financeiro', 
            separator: true,
            icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    <circle cx="12" cy="12" r="10" stroke-opacity="0.2"></circle>
                   </svg>`
        },
        { 
            id: 'configuracoes', 
            label: 'Configurações', 
            icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                   </svg>`
        },
    ];

    return `
        <div id="dock-container">
            <nav class="dock glass-dock rounded-full">
                ${items.map(item => `
                    ${item.separator ? '<div class="dock-divider"></div>' : ''}
                    <div class="dock-item" data-id="${item.id}">
                        <div class="dock-icon-wrapper">
                            ${item.icon}
                            <div class="active-indicator"></div>
                        </div>
                        <div class="dock-tooltip rounded-3xl label-tech">${item.label}</div>
                    </div>
                `).join('')}
            </nav>
        </div>

        <style>
            #dock-container {
                position: fixed;
                bottom: 32px;
                left: 0;
                width: 100%;
                display: flex;
                justify-content: center;
                z-index: 1000;
                pointer-events: none;
            }

            .dock {
                background: var(--glass-dock);
                backdrop-filter: var(--blur-xl);
                -webkit-backdrop-filter: var(--blur-xl);
                padding: 0.6rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                border: 1px solid var(--border-glass);
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
                pointer-events: auto;
            }

            .dock-item {
                position: relative;
                width: 48px;
                height: 48px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: var(--transition);
                border-radius: 9999px;
            }

            .dock-icon-wrapper {
                color: var(--slate-400);
                transition: var(--transition);
                display: flex;
                flex-direction: column;
                align-items: center;
            }

            .dock-item:hover {
                transform: translateY(-8px) scale(1.15);
                background: var(--dock-hover-bg);
            }

            .dock-item:hover .dock-icon-wrapper {
                color: var(--slate-950);
            }

            .dock-item.active {
                background: var(--slate-950);
                color: white !important;
            }

            .dock-item.active .dock-icon-wrapper {
                color: white;
            }

            .active-indicator {
                width: 4px;
                height: 4px;
                background: var(--dock-hover-bg);
                border-radius: 50%;
                margin-top: 4px;
                opacity: 0;
                transition: var(--transition);
            }

            .dock-item.active .active-indicator {
                opacity: 1;
            }

            .dock-tooltip {
                position: absolute;
                bottom: 70px;
                background: var(--slate-950);
                color: white;
                padding: 0.5rem 1rem;
                white-space: nowrap;
                opacity: 0;
                visibility: hidden;
                transform: translateY(10px);
                transition: var(--transition);
                pointer-events: none;
                font-size: 9px !important;
            }

            .dock-item:hover .dock-tooltip {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }

            .dock-divider {
                width: 1px;
                height: 24px;
                background: var(--slate-200);
                margin: 0 0.5rem;
            }
        </style>
    `;
}

export function initDock(onNavigate) {
    const items = document.querySelectorAll('.dock-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            items.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            onNavigate(item.dataset.id);
        });
    });
}
