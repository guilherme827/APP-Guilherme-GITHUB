import { supabase } from '../lib/supabaseClient.js';

export const USER_PREFERENCE_KEYS = {
    THEME: 'ui.theme',
    ALERT_LEAD_DAYS: 'ui.alert_lead_days',
    DASHBOARD_LAYOUT: 'dashboard.layout',
    FINANCE_STATE: 'finance.state'
};

function toTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : 0;
    }
    return 0;
}

function defaultHasMeaningfulData(value) {
    return value !== null && value !== undefined && value !== '';
}

function valuesAreEquivalent(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function readLocalValue(localStorageKey, storageKind) {
    if (!localStorageKey || typeof window === 'undefined' || !window.localStorage) {
        return { exists: false, value: null, updatedAt: 0 };
    }

    try {
        const rawValue = window.localStorage.getItem(localStorageKey);
        if (rawValue == null) {
            return { exists: false, value: null, updatedAt: 0 };
        }

        if (storageKind === 'string') {
            return { exists: true, value: rawValue, updatedAt: 0 };
        }

        const parsed = JSON.parse(rawValue);
        return {
            exists: true,
            value: parsed,
            updatedAt: toTimestamp(parsed?.updatedAt)
        };
    } catch {
        return { exists: false, value: null, updatedAt: 0 };
    }
}

function writeLocalValue(localStorageKey, storageKind, value) {
    if (!localStorageKey || typeof window === 'undefined' || !window.localStorage) return value;
    if (value === undefined) return value;

    if (storageKind === 'string') {
        window.localStorage.setItem(localStorageKey, String(value ?? ''));
        return value;
    }

    window.localStorage.setItem(localStorageKey, JSON.stringify(value));
    return value;
}

function isMissingPreferenceTable(error) {
    const message = String(error?.message || '');
    return error?.code === 'PGRST205'
        || /relation .*user_preferences/i.test(message)
        || /could not find the table/i.test(message)
        || /schema cache/i.test(message);
}

function buildPreferenceQuery(userId, preferenceKey, organizationId) {
    let query = supabase
        .from('user_preferences')
        .select('id, preference_value, updated_at')
        .eq('user_id', userId)
        .eq('preference_key', preferenceKey);

    query = organizationId
        ? query.eq('organization_id', organizationId)
        : query.is('organization_id', null);

    return query;
}

async function fetchRemotePreference(userId, preferenceKey, organizationId) {
    if (!userId) return { exists: false, value: null, updatedAt: 0, remoteAvailable: false };

    const { data, error } = await buildPreferenceQuery(userId, preferenceKey, organizationId).maybeSingle();
    if (error) {
        if (isMissingPreferenceTable(error)) {
            return { exists: false, value: null, updatedAt: 0, remoteAvailable: false };
        }
        throw error;
    }

    if (!data) {
        return { exists: false, value: null, updatedAt: 0, remoteAvailable: true };
    }

    return {
        exists: true,
        id: data.id,
        value: data.preference_value,
        updatedAt: toTimestamp(data.updated_at),
        remoteAvailable: true
    };
}

async function persistRemotePreference(userId, preferenceKey, organizationId, value) {
    if (!userId) return;

    const existing = await fetchRemotePreference(userId, preferenceKey, organizationId);
    if (!existing.remoteAvailable) return;

    if (existing.exists && existing.id) {
        const { error } = await supabase
            .from('user_preferences')
            .update({ preference_value: value })
            .eq('id', existing.id);
        if (error) throw error;
        return;
    }

    const payload = {
        user_id: userId,
        organization_id: organizationId || null,
        preference_key: preferenceKey,
        preference_value: value
    };

    const { error } = await supabase
        .from('user_preferences')
        .insert(payload);

    if (error) throw error;
}

export function hasMeaningfulDashboardValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (!value || typeof value !== 'object') return false;
    return Array.isArray(value.widgets) && value.widgets.length > 0;
}

export function hasMeaningfulFinanceValue(value) {
    if (!value || typeof value !== 'object') return false;

    const itemsByTab = value.itemsByTab && typeof value.itemsByTab === 'object'
        ? Object.values(value.itemsByTab)
        : [];

    return itemsByTab.some((items) => Array.isArray(items) && items.length > 0)
        || (Array.isArray(value.entries) && value.entries.length > 0)
        || (Array.isArray(value.snapshots) && value.snapshots.length > 0)
        || (Array.isArray(value.categories) && value.categories.length > 0)
        || (Array.isArray(value.descriptionMemory) && value.descriptionMemory.length > 0);
}

export function selectPreferredPreferenceValue({
    localValue,
    localUpdatedAt,
    hasLocal = false,
    remoteValue,
    remoteUpdatedAt,
    hasRemote = false,
    fallbackValue = null,
    hasMeaningfulData = defaultHasMeaningfulData
} = {}) {
    const localIsMeaningful = hasLocal && hasMeaningfulData(localValue);
    const remoteIsMeaningful = hasRemote && hasMeaningfulData(remoteValue);
    const localTime = toTimestamp(localUpdatedAt);
    const remoteTime = toTimestamp(remoteUpdatedAt);

    if (localIsMeaningful && remoteIsMeaningful) {
        if (localTime > 0 && remoteTime > 0 && localTime > remoteTime) {
            return { value: localValue, source: 'local', shouldWriteRemote: true, shouldWriteLocal: false };
        }
        return { value: remoteValue, source: 'remote', shouldWriteRemote: false, shouldWriteLocal: !valuesAreEquivalent(localValue, remoteValue) };
    }

    if (remoteIsMeaningful) {
        return { value: remoteValue, source: 'remote', shouldWriteRemote: false, shouldWriteLocal: !valuesAreEquivalent(localValue, remoteValue) };
    }

    if (localIsMeaningful) {
        return { value: localValue, source: 'local', shouldWriteRemote: true, shouldWriteLocal: false };
    }

    if (hasRemote) {
        return { value: remoteValue ?? fallbackValue, source: 'remote-empty', shouldWriteRemote: false, shouldWriteLocal: remoteValue !== undefined && !valuesAreEquivalent(localValue, remoteValue) };
    }

    if (hasLocal) {
        return { value: localValue ?? fallbackValue, source: 'local-empty', shouldWriteRemote: false, shouldWriteLocal: false };
    }

    return { value: fallbackValue, source: 'fallback', shouldWriteRemote: false, shouldWriteLocal: false };
}

export async function loadUserPreference({
    userId,
    organizationId = null,
    preferenceKey,
    localStorageKey = '',
    fallbackValue = null,
    storageKind = 'json',
    hasMeaningfulData = defaultHasMeaningfulData
} = {}) {
    const localRecord = readLocalValue(localStorageKey, storageKind);

    try {
        const remoteRecord = await fetchRemotePreference(userId, preferenceKey, organizationId);
        const selected = selectPreferredPreferenceValue({
            localValue: localRecord.value,
            localUpdatedAt: localRecord.updatedAt,
            hasLocal: localRecord.exists,
            remoteValue: remoteRecord.value,
            remoteUpdatedAt: remoteRecord.updatedAt,
            hasRemote: remoteRecord.exists,
            fallbackValue,
            hasMeaningfulData
        });

        if (selected.shouldWriteLocal && localStorageKey) {
            writeLocalValue(localStorageKey, storageKind, selected.value);
        }

        if (selected.shouldWriteRemote && remoteRecord.remoteAvailable) {
            await persistRemotePreference(userId, preferenceKey, organizationId, selected.value);
        }

        return selected.value;
    } catch (error) {
        console.warn(`[UserPreferences] Falha ao carregar ${preferenceKey}:`, error?.message || error);
        if (localRecord.exists) return localRecord.value;
        return fallbackValue;
    }
}

export async function saveUserPreference({
    userId,
    organizationId = null,
    preferenceKey,
    localStorageKey = '',
    value,
    storageKind = 'json'
} = {}) {
    writeLocalValue(localStorageKey, storageKind, value);

    try {
        await persistRemotePreference(userId, preferenceKey, organizationId, value);
    } catch (error) {
        if (!isMissingPreferenceTable(error)) {
            console.warn(`[UserPreferences] Falha ao salvar ${preferenceKey}:`, error?.message || error);
        }
    }

    return value;
}
