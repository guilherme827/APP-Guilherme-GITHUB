import fs from 'node:fs';
import path from 'node:path';

export async function loadFinanceStoreFunctions({
    loadUserScopedJsonStorage,
    saveUserScopedJsonStorage,
    authService,
    normalizeApiError,
    reportUiError,
    reportUiEvent
}) {
    const modulePath = path.resolve(process.cwd(), 'src/utils/FinanceStore.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    const withoutImports = source.replace(/^import[\s\S]*?;\n/gm, '');
    const sanitized = withoutImports.replace(/export\s+/g, '');
    const factory = new Function(
        'loadUserScopedJsonStorage',
        'saveUserScopedJsonStorage',
        'authService',
        'normalizeApiError',
        'reportUiError',
        'reportUiEvent',
        `${sanitized}
        return { financeStore };`
    );

    return factory(
        loadUserScopedJsonStorage,
        saveUserScopedJsonStorage,
        authService,
        normalizeApiError,
        reportUiError,
        reportUiEvent
    );
}
