import fs from 'node:fs';
import path from 'node:path';

export async function loadViewHelpersFunctions() {
    const modulePath = path.resolve(process.cwd(), 'src/dashboard/viewHelpers.js');
    const source = fs.readFileSync(modulePath, 'utf8').replace(/export\s+/g, '');
    const factory = new Function(
        `${source}
        return {
            normalizeAgendaTask,
            normalizeListItem,
            getDateOnly,
            getTodayDate,
            getTaskPriorityRank,
            sortAgendaTasks,
            getTaskDeadlineBadge,
            formatClockParts
        };`
    );
    return factory();
}
