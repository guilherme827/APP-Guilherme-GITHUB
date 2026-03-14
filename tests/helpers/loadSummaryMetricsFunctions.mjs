import fs from 'node:fs';
import path from 'node:path';

export async function loadSummaryMetricsFunctions() {
    const viewHelpersPath = path.resolve(process.cwd(), 'src/dashboard/viewHelpers.js');
    const summaryMetricsPath = path.resolve(process.cwd(), 'src/dashboard/summaryMetrics.js');
    const viewHelpersSource = fs.readFileSync(viewHelpersPath, 'utf8').replace(/export\s+/g, '');
    const summaryMetricsSource = fs
        .readFileSync(summaryMetricsPath, 'utf8')
        .replace(/import\s+\{[^}]+\}\s+from\s+'\.\/viewHelpers\.js';\n/, '')
        .replace(/export\s+/g, '');

    const factory = new Function(
        `${viewHelpersSource}
        ${summaryMetricsSource}
        return {
            buildDashboardSummaryMetrics
        };`
    );

    return factory();
}
