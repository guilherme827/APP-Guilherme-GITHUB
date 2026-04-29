import fs from 'node:fs';
import path from 'node:path';

export async function loadNetworkErrorFunctions() {
    const modulePath = path.resolve(process.cwd(), 'src/utils/networkErrors.js');
    const source = fs.readFileSync(modulePath, 'utf8').replace(/export\s+/g, '');
    const factory = new Function(
        `${source}
        return {
            isNetworkLoadError,
            normalizeAuthError,
            normalizeApiError
        };`
    );
    return factory();
}
