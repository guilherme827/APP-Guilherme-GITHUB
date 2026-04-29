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
        throw new Error(payload?.error || 'Falha na API de Controle da IA.');
    }
    return payload?.data;
}

export const aiControlService = {
    async load() {
        return request('/api/ai-control', { method: 'GET' });
    },
    async saveProviderConfig(item) {
        return request('/api/ai-control', {
            method: 'POST',
            body: JSON.stringify({ action: 'upsert_provider_config', item })
        });
    },
    async deleteProviderConfig(id) {
        return request('/api/ai-control', {
            method: 'POST',
            body: JSON.stringify({ action: 'delete_provider_config', id })
        });
    },
    async saveAiModel(item) {
        return request('/api/ai-control', {
            method: 'POST',
            body: JSON.stringify({ action: 'upsert_ai_model', item })
        });
    },
    async deleteAiModel(id) {
        return request('/api/ai-control', {
            method: 'POST',
            body: JSON.stringify({ action: 'delete_ai_model', id })
        });
    },
    async saveAiAgent(item) {
        return request('/api/ai-control', {
            method: 'POST',
            body: JSON.stringify({ action: 'update_ai_agent', item })
        });
    }
};
