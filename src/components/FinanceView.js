import {
    loadUserScopedJsonStorage,
    saveUserScopedJsonStorage
} from '../dashboard/userScopedStorage.js';

export function renderFinanceiroView(container, storageKey) {
    const defaultFinanceState = {
        version: 1,
        userScoped: true,
        categories: [],
        entries: [],
        snapshots: [],
        updatedAt: null
    };
    const existingState = loadUserScopedJsonStorage(storageKey, null);
    const financeState = existingState && typeof existingState === 'object'
        ? {
            ...defaultFinanceState,
            ...existingState,
            userScoped: true
        }
        : defaultFinanceState;

    if (!existingState) {
        saveUserScopedJsonStorage(storageKey, financeState);
    }

    container.innerHTML = `
        <div class="animate-fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6rem 0;">
            <div style="width: 120px; height: 120px; background: #FFF1F2; border-radius: 32px; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem;">
                <div style="width: 40px; height: 40px; border: 4px solid #F43F5E; border-radius: 999px;"></div>
            </div>
            <h2 class="font-black" style="font-size: 2rem; color: var(--slate-950);">Financeiro individual preparado.</h2>
            <p class="label-tech" style="margin-top: 1rem;">BASE PRIVADA POR USUARIO</p>
            <p style="margin-top: 0.9rem; max-width: 520px; text-align: center; color: var(--slate-600); line-height: 1.6;">
                Esta area ja nasce isolada por usuario. Nenhum dado financeiro sera compartilhado entre contas, mesmo quando o modulo for ativado no DOC do administrador.
            </p>
            <p style="margin-top: 0.8rem; font-size: 0.82rem; color: var(--slate-500);">
                Storage: <strong>${storageKey}</strong> • Versao: ${financeState.version}
            </p>
        </div>
    `;
}
