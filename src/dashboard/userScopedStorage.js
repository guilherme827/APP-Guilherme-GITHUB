export function getUserScopedStorageKey(baseKey, userId) {
    const safeBaseKey = String(baseKey || '').trim();
    const safeUserId = String(userId || '').trim();
    if (!safeBaseKey) return '';
    if (!safeUserId) return safeBaseKey;
    return `${safeBaseKey}:${safeUserId}`;
}

export function loadUserScopedJsonStorage(storageKey, fallbackValue) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return fallbackValue;
        return JSON.parse(raw);
    } catch (_error) {
        return fallbackValue;
    }
}

export function saveUserScopedJsonStorage(storageKey, value) {
    localStorage.setItem(storageKey, JSON.stringify(value));
    return value;
}

