import { escapeHtml } from '../utils/sanitize.js';

export function renderHeader() {
    return `
        <header id="top-header">
            <div class="header-brand">
                <div class="header-logo-lockup">
                    <div class="header-wordmark" aria-label="GEOCONSULT">
                        <span class="header-wordmark-text">GEOC</span>
                        <span class="header-globe" aria-hidden="true">
                            <span class="header-globe-track">
                                <span class="header-globe-map"></span>
                                <span class="header-globe-map"></span>
                            </span>
                            <span class="header-globe-shine"></span>
                            <span class="header-globe-shade"></span>
                        </span>
                        <span class="header-wordmark-text">NSULT</span>
                    </div>
                    <p class="header-tagline-pill">SISTEMA DE GESTAO INTELIGENTE</p>
                </div>
            </div>

            <div class="header-actions">
                <label class="header-search">
                    <span class="header-search-icon" aria-hidden="true">${searchIcon()}</span>
                    <input type="search" placeholder="Buscar titulares, processos, prazos..." aria-label="Pesquisar" />
                </label>
                <button type="button" class="header-bell-button" aria-label="Notificacoes">
                    ${bellIcon()}
                </button>
            </div>
        </header>
    `;
}

export function initHeaderMenu() {
    return () => {};
}

export function getUserInitials(fullName = '', email = '') {
    const source = String(fullName || email || 'GC').trim();
    const tokens = source.includes('@')
        ? source.split('@')[0].split(/[.\s_-]+/)
        : source.split(/\s+/);

    return tokens
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'GC';
}

export function escapeUserName(value) {
    return escapeHtml(value || 'Usuario');
}

function searchIcon() {
    return `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
        </svg>
    `;
}

function bellIcon() {
    return `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
            <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.674C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
        </svg>
    `;
}
