function getErrorMessage(error) {
    return String(error?.message || error || '').trim();
}

function buildNormalizedError(message, originalError, diagnostics = {}) {
    const normalized = new Error(message);
    normalized.cause = originalError;
    normalized.originalMessage = getErrorMessage(originalError);
    normalized.diagnostics = diagnostics;
    return normalized;
}

function resolveContext(input, fallbackMessage) {
    if (typeof input === 'string') {
        return { fallbackMessage: input };
    }

    if (input && typeof input === 'object') {
        return {
            fallbackMessage: input.fallbackMessage || fallbackMessage,
            operation: input.operation || '',
            endpoint: input.endpoint || '',
            target: input.target || ''
        };
    }

    return { fallbackMessage };
}

export function isNetworkLoadError(error) {
    const message = getErrorMessage(error).toLowerCase();
    return message === 'load failed'
        || message === 'failed to fetch'
        || message.includes('networkerror')
        || message.includes('network request failed')
        || message.includes('fetch failed')
        || message.includes('network error');
}

export function normalizeAuthError(error, input = 'Nao foi possivel concluir a autenticacao.') {
    const context = resolveContext(input, 'Nao foi possivel concluir a autenticacao.');
    const diagnostics = {
        category: 'auth',
        target: context.target || 'supabase',
        operation: context.operation || 'unknown'
    };

    if (isNetworkLoadError(error)) {
        return buildNormalizedError(
            'Falha de conexao com o Supabase. Verifique sua internet e confirme que o servico de autenticacao esta acessivel.',
            error,
            {
                ...diagnostics,
                kind: 'network'
            }
        );
    }

    const message = getErrorMessage(error);
    if (!message) {
        return buildNormalizedError(context.fallbackMessage, error, {
            ...diagnostics,
            kind: 'unknown'
        });
    }
    return error instanceof Error
        ? Object.assign(error, {
            diagnostics: error.diagnostics || {
                ...diagnostics,
                kind: 'service'
            }
        })
        : buildNormalizedError(message, error, {
            ...diagnostics,
            kind: 'service'
        });
}

export function normalizeApiError(error, input = 'Nao foi possivel conectar com a API local.') {
    const context = resolveContext(input, 'Nao foi possivel conectar com a API local.');
    const diagnostics = {
        category: 'api',
        target: context.target || 'local-api',
        endpoint: context.endpoint || '',
        operation: context.operation || 'unknown'
    };

    if (isNetworkLoadError(error)) {
        const endpointLabel = context.endpoint ? ` (${context.endpoint})` : '';
        return buildNormalizedError(
            `Falha de conexao com a API local${endpointLabel}. Confirme que o app foi iniciado com \`npm run dev\` e recarregue a pagina.`,
            error,
            {
                ...diagnostics,
                kind: 'network'
            }
        );
    }

    const message = getErrorMessage(error);
    if (!message) {
        return buildNormalizedError(context.fallbackMessage, error, {
            ...diagnostics,
            kind: 'unknown'
        });
    }
    return error instanceof Error
        ? Object.assign(error, {
            diagnostics: error.diagnostics || {
                ...diagnostics,
                kind: 'service'
            }
        })
        : buildNormalizedError(message, error, {
            ...diagnostics,
            kind: 'service'
        });
}
