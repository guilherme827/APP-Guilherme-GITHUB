// Header Component
export function renderHeader(userEmail = '') {
    const initials = String(userEmail || 'GC')
        .split('@')[0]
        .split(/[.\s_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'GC';

    return `
        <header id="top-header">
            <div class="header-container">
                <div class="logo-area">
                    <img src="/geoconsult-logo.png" alt="GEOCONSULT" class="brand-logo" />
                </div>
                
                <div class="search-area">
                    <div class="search-pill rounded-full">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="text" placeholder="BUSCAR..." class="label-tech" spellcheck="true">
                    </div>
                </div>

                <div class="actions-area">
                    <div class="header-user-meta">
                        <p class="label-tech">SESSÃO ATIVA</p>
                        <p class="header-user-email">${userEmail || 'usuario@sistema.com'}</p>
                    </div>
                    <button class="header-logout-btn" id="btn-logout" type="button">Sair</button>
                    <div class="avatar-emerald rounded-full">${initials}</div>
                </div>
            </div>
        </header>

        <style>
            #top-header {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 64px; /* More compact header */
                background: var(--glass-header);
                backdrop-filter: var(--blur-md);
                -webkit-backdrop-filter: var(--blur-md);
                border-bottom: 1px solid var(--slate-200);
                z-index: 1000;
            }

            .header-container {
                max-width: 1800px;
                margin: 0 auto;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 2rem;
            }

            .logo-area {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .brand-logo {
                display: block;
                height: 44px;
                width: auto;
                object-fit: contain;
            }

            .logo-wrapper {
                display: flex;
                align-items: center;
                justify-content: center;
                transition: var(--transition);
            }

            .logo-wrapper:hover {
                transform: rotate(-5deg) scale(1.05);
            }

            .logo-text-group {
                display: flex;
                align-items: baseline;
                gap: 1px;
            }

            .logo-text { 
                font-size: 1.4rem; 
                color: var(--slate-950);
                letter-spacing: -0.03em;
            }
            .logo-dot { color: var(--primary); font-weight: 900; font-size: 1.25rem; margin-left: -2px; }

            @media (max-width: 900px) {
                .brand-logo {
                    height: 34px;
                }
            }

            .search-pill {
                background: var(--slate-100);
                padding: 0.5rem 1.2rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                width: 300px;
                transition: var(--transition);
                border: 1px solid transparent;
            }

            .search-pill:focus-within {
                background: var(--card-bg);
                border-color: rgba(16, 185, 129, 0.3);
                box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
            }

            .search-pill input {
                background: transparent;
                border: none;
                outline: none;
                width: 100%;
            }

            .actions-area {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .header-user-meta {
                text-align: right;
            }

            .header-user-email {
                font-size: 0.82rem;
                color: var(--slate-800);
                font-weight: 600;
                margin-top: 0.15rem;
            }

            .header-logout-btn {
                border: 1px solid var(--slate-200);
                background: rgba(255, 255, 255, 0.5);
                color: var(--slate-900);
                border-radius: 9999px;
                padding: 0.55rem 1rem;
                cursor: pointer;
                font-size: 0.74rem;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                transition: var(--transition);
            }

            .header-logout-btn:hover {
                transform: translateY(-1px);
                border-color: var(--primary);
                color: var(--primary);
            }

            .avatar-emerald {
                width: 36px;
                height: 36px;
                background: var(--primary);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.75rem;
                font-weight: 700;
            }

            @media (max-width: 900px) {
                .search-area {
                    display: none;
                }

                .header-user-meta {
                    display: none;
                }

                .header-container {
                    padding: 0 1rem;
                }
            }
        </style>
    `;
}
