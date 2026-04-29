import fs from 'node:fs';
import path from 'node:path';

export async function loadUserPreferencesFunctions() {
    const modulePath = path.resolve(process.cwd(), 'src/utils/UserPreferences.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    const withoutImports = source.replace(/^import[\s\S]*?;\n/gm, '');
    const sanitized = withoutImports.replace(/export\s+/g, '');
    const factory = new Function(
        `${sanitized}
        return {
            hasMeaningfulDashboardValue,
            hasMeaningfulFinanceValue,
            selectPreferredPreferenceValue
        };`
    );
    return factory();
}
