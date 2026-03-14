export function reportUiEvent(scope, meta = {}) {
    console.info('[ui-event]', {
        scope,
        meta,
        timestamp: new Date().toISOString()
    });
}

export function reportUiError(scope, error, meta = {}) {
    const message = error?.message || String(error || 'Erro desconhecido');
    const payload = {
        scope,
        message,
        meta,
        timestamp: new Date().toISOString()
    };
    if (error?.stack) payload.stack = error.stack;
    console.error('[ui-error]', payload);
}

export function installGlobalUiErrorHandlers() {
    window.addEventListener('error', (event) => {
        reportUiError('window.error', event?.error || new Error(event?.message || 'Erro global'), {
            filename: event?.filename || '',
            lineno: event?.lineno || 0,
            colno: event?.colno || 0
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        reportUiError('window.unhandledrejection', event?.reason || new Error('Promise rejeitada sem tratamento'));
    });
}
