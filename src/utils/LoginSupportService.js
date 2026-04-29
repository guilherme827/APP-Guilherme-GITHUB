import { normalizeApiError } from './networkErrors.js';

async function postLoginSupport(action, payload) {
    try {
        const response = await fetch('/api/login-support', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action,
                ...payload
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || 'Falha ao processar a solicitacao.');
        }

        return data;
    } catch (error) {
        throw normalizeApiError(error, {
            fallbackMessage: 'Falha ao processar a solicitacao.',
            operation: action,
            endpoint: '/api/login-support',
            target: 'local-api'
        });
    }
}

export const loginSupportService = {
    async sendPasswordRecovery(email) {
        return postLoginSupport('forgot-password', { email });
    },

    async sendAccessRequest(payload) {
        return postLoginSupport('request-access', payload);
    }
};
