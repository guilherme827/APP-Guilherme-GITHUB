import { escapeHtml } from '../utils/sanitize.js';

/**
 * Premium Confirmation Modal
 * @param {string} title - Modal title
 * @param {string} message - Confirmation message
 * @param {function} onConfirm - Callback on confirm
 */
export function showConfirmModal(title, message, onConfirm) {
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-backdrop animate-fade-in';
    backdrop.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999; padding: 2rem;
    `;

    backdrop.innerHTML = `
        <div class="glass-card rounded-3xl shadow-2xl animate-slide-up" style="max-width: 450px; width: 100%; padding: 3rem; border: 1px solid rgba(255,255,255,0.4); text-align: center;">
            <div style="width: 64px; height: 64px; background: var(--rose-50); color: var(--rose-500); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem;">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-4 5v5m4-5v5"/></svg>
            </div>
            
            <h3 class="font-black" style="font-size: 1.5rem; margin-bottom: 1rem;">${safeTitle}</h3>
            <p style="color: var(--slate-500); line-height: 1.6; margin-bottom: 2.5rem;">${safeMessage}</p>
            
            <div style="display: flex; gap: 1rem;">
                <button id="confirm-cancel" class="btn-pill" style="flex: 1; background: var(--bg-main); color: var(--slate-900); border: 1px solid var(--slate-200);">CANCELAR</button>
                <button id="confirm-yes" class="btn-pill" style="flex: 1; background: var(--rose-500); color: white;">EXCLUIR</button>
            </div>
        </div>

        <style>
            @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        </style>
    `;

    document.body.appendChild(backdrop);

    const close = () => {
        backdrop.classList.add('animate-fade-out');
        setTimeout(() => backdrop.remove(), 300);
    };

    backdrop.querySelector('#confirm-cancel').onclick = close;
    backdrop.querySelector('#confirm-yes').onclick = async () => {
        const confirmButton = backdrop.querySelector('#confirm-yes');
        const cancelButton = backdrop.querySelector('#confirm-cancel');
        confirmButton.disabled = true;
        cancelButton.disabled = true;
        confirmButton.textContent = 'EXCLUINDO...';
        try {
            await onConfirm();
            close();
        } catch {
            confirmButton.disabled = false;
            cancelButton.disabled = false;
            confirmButton.textContent = 'EXCLUIR';
        }
    };

    // Close on backdrop click
    backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
}
