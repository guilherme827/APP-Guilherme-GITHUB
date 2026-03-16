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
