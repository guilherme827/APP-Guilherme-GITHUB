import fs from 'node:fs';
import path from 'node:path';

export async function loadUserScopeStorageFunctions() {
    const modulePath = path.resolve(process.cwd(), 'src/dashboard/userScopedStorage.js');
    const source = fs.readFileSync(modulePath, 'utf8').replace(/export\s+/g, '');
    const factory = new Function(
        `${source}
        return {
            getUserScopedStorageKey,
            loadUserScopedJsonStorage,
            saveUserScopedJsonStorage
        };`
    );
    return factory();
}
