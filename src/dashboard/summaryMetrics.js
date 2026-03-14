import { getDateOnly, getTodayDate } from './viewHelpers.js';

export function buildDashboardSummaryMetrics(processes, totalTitulares) {
    const safeProcesses = Array.isArray(processes) ? processes : [];
    const totalProcessos = safeProcesses.length;
    const titularesComProcesso = new Set(
        safeProcesses.map((process) => String(process?.clientId || '').trim()).filter(Boolean)
    ).size;
    const titularesSemProcesso = Math.max(totalTitulares - titularesComProcesso, 0);
    const titularesComProcessoPercent = totalTitulares ? Math.round((titularesComProcesso / totalTitulares) * 100) : 0;

    const processTypeCounts = safeProcesses.reduce((acc, process) => {
        const label = String(process?.tipoSigla || process?.tipo || 'OUT').trim().toUpperCase();
        const safeLabel = label.length > 10 ? label.slice(0, 10) : label;
        acc.set(safeLabel, (acc.get(safeLabel) || 0) + 1);
        return acc;
    }, new Map());

    const today = getTodayDate();
    const prazoItems = safeProcesses.reduce((acc, process) => {
        const deadlines = Array.isArray(process?.deadlines) ? process.deadlines : [];
        deadlines.forEach((deadline, index) => {
            const date = getDateOnly(deadline?.date);
            if (!date) return;
            acc.push({
                id: String(deadline?.id || `${process?.id || 'process'}-${index}`),
                diffDays: Math.round((date.getTime() - today.getTime()) / 86400000)
            });
        });
        return acc;
    }, []);

    const overdueDeadlines = prazoItems.filter((item) => item.diffDays < 0);
    const todayDeadlines = prazoItems.filter((item) => item.diffDays === 0);
    const weekDeadlines = prazoItems.filter((item) => item.diffDays > 0 && item.diffDays <= 7);
    const monthDeadlines = prazoItems.filter((item) => item.diffDays > 7 && item.diffDays <= 30);
    const laterDeadlines = prazoItems.filter((item) => item.diffDays > 30);
    const totalPrazos = prazoItems.length;
    const maxDeadlineBucket = Math.max(
        overdueDeadlines.length,
        todayDeadlines.length,
        weekDeadlines.length,
        monthDeadlines.length,
        laterDeadlines.length,
        1
    );
    const prazoDistribution = [
        { label: 'Atrasados', value: overdueDeadlines.length, tone: 'late' },
        { label: 'Hoje', value: todayDeadlines.length, tone: 'today' },
        { label: 'Prox. semana', value: weekDeadlines.length, tone: 'soon' },
        { label: 'Prox. 30 dias', value: monthDeadlines.length, tone: 'month' },
        { label: 'Mais de 30 dias', value: laterDeadlines.length, tone: 'future' }
    ];
    const topProcessTypes = [...processTypeCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([label, value]) => ({ label, value }));

    return {
        totalProcessos,
        titularesComProcesso,
        titularesSemProcesso,
        titularesComProcessoPercent,
        totalPrazos,
        maxDeadlineBucket,
        prazoDistribution,
        topProcessTypes,
        hasCriticalDeadlines: overdueDeadlines.length > 0
    };
}
