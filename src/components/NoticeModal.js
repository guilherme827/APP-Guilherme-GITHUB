import { escapeHtml } from '../utils/sanitize.js';

export function showNoticeModal(title, message) {
    const safeTitle = escapeHtml(title || 'Aviso');
    const safeMessage = escapeHtml(message || '');

    const backdrop = document.createElement('div');
    backdrop.className = 'notice-backdrop animate-fade-in';
    backdrop.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999; padding: 2rem;
    `;

    backdrop.innerHTML = `
        <div class="glass-card rounded-3xl" style="max-width: 460px; width: 100%; padding: 2.5rem; text-align: center;">
            <h3 class="font-black" style="font-size: 1.35rem; margin-bottom: 1rem;">${safeTitle}</h3>
            <p style="color: var(--slate-500); line-height: 1.6; margin-bottom: 2rem;">${safeMessage}</p>
            <button id="notice-ok" class="btn-pill btn-black" style="min-width: 120px;">OK</button>
        </div>
    `;

    const close = () => backdrop.remove();

    backdrop.querySelector('#notice-ok').onclick = close;
    backdrop.onclick = (e) => {
        if (e.target === backdrop) close();
    };

    document.body.appendChild(backdrop);
}
