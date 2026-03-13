import fs from 'node:fs';
import path from 'node:path';

export async function loadDashboardGridFunctions() {
    const modulePath = path.resolve(process.cwd(), 'src/dashboard/gridEngine.js');
    const source = fs.readFileSync(modulePath, 'utf8').replace(/export\s+/g, '');
    const factory = new Function(
        `${source}
        return {
            getDashboardWidgetSpan,
            getDashboardPlacementForSlot,
            buildDashboardGridState,
            canPlaceDashboardWidgetAtSlot
        };`
    );
    return factory();
}
