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

export function removeUserScopedJsonStorage(storageKey) {
    if (!storageKey) return;
    localStorage.removeItem(storageKey);
}

export function clearUserScopedJsonStorage(baseKeys = [], userId = '') {
    const safeUserId = String(userId || '').trim();
    const keys = (Array.isArray(baseKeys) ? baseKeys : [baseKeys])
        .map((baseKey) => getUserScopedStorageKey(baseKey, safeUserId))
        .filter(Boolean);

    keys.forEach((key) => {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}:conflict-backup`);
    });
}
