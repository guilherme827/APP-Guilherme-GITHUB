const PENDING_AI_CHAT_KEY = 'app-control-ai-chat-pending';

export function openAiChat(payload = {}) {
    try {
        window.sessionStorage.setItem(PENDING_AI_CHAT_KEY, JSON.stringify(payload));
    } catch {
        // noop
    }
    window.dispatchEvent(new CustomEvent('app-control:navigate', {
        detail: { section: 'ia-chat' }
    }));
}

export function consumePendingAiChatRequest() {
    try {
        const raw = window.sessionStorage.getItem(PENDING_AI_CHAT_KEY);
        if (!raw) return null;
        window.sessionStorage.removeItem(PENDING_AI_CHAT_KEY);
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
