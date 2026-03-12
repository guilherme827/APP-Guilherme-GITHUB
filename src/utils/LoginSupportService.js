async function postLoginSupport(action, payload) {
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
        throw new Error(data?.error || 'Falha ao processar a solicitação.');
    }

    return data;
}

export const loginSupportService = {
    async sendPasswordRecovery(email) {
        return postLoginSupport('forgot-password', { email });
    },

    async sendAccessRequest(payload) {
        return postLoginSupport('request-access', payload);
    }
};
