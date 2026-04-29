import { authService } from './AuthService.js';

async function request(path, options = {}) {
    const accessToken = await authService.getAccessToken();
    const response = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {})
        }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Falha na API da base de conhecimento.');
    }
    return payload?.data;
}

export const aiKnowledgeService = {
    async loadStats() {
        return request('/api/ai-knowledge', { method: 'GET' });
    },
    async rebuild() {
        return request('/api/ai-knowledge', {
            method: 'POST',
            body: JSON.stringify({ action: 'rebuild' })
        });
    }
};
