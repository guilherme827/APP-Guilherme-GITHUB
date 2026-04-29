import { authService } from './AuthService.js';

export const aiAgentService = {
    async run({ agentSlug, prompt, context = [], history = [], feature = 'agent_chat' }) {
        const accessToken = await authService.getAccessToken();
        const response = await fetch('/api/ai-agent-run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                agentSlug,
                prompt,
                context,
                history,
                feature
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || 'Falha ao executar o agente de IA.');
        }
        return payload?.data;
    }
};
