export function reportDashboardError(scope, error, meta = {}) {
    const message = error?.message || String(error || 'Erro desconhecido');
    const payload = {
        scope,
        message,
        meta,
        timestamp: new Date().toISOString()
    };
    if (error?.stack) payload.stack = error.stack;
    console.error('[dashboard-error]', payload);
}

