export function normalizeAgendaTask(task, index) {
    const text = String(task?.text || task?.label || '').trim();
    if (!text) return null;
    const priorityType = ['today', 'week', 'month', 'date'].includes(task?.priorityType)
        ? task.priorityType
        : 'week';
    const dueDate = String(task?.dueDate || '').trim();
    const status = ['open', 'done', 'skipped'].includes(task?.status) ? task.status : 'open';
    return {
        id: String(task?.id || `task-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`),
        text,
        priorityType,
        dueDate,
        status,
        meta: task?.meta && typeof task.meta === 'object'
            ? {
                source: String(task.meta.source || '').trim(),
                processNumbers: Array.isArray(task.meta.processNumbers)
                    ? task.meta.processNumbers.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
                    : [],
                clientLabel: String(task.meta.clientLabel || '').trim(),
                promptExcerpt: String(task.meta.promptExcerpt || '').trim(),
                createdFromMessageId: String(task.meta.createdFromMessageId || '').trim()
            }
            : null,
        createdAt: Number.isFinite(Number(task?.createdAt)) ? Number(task.createdAt) : Date.now(),
        updatedAt: Number.isFinite(Number(task?.updatedAt)) ? Number(task.updatedAt) : Date.now()
    };
}

export function normalizeListItem(item, index) {
    const text = String(item?.text || item?.label || '').trim();
    if (!text) return null;
    return {
        id: String(item?.id || `list-item-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`),
        text,
        createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : Date.now(),
        updatedAt: Number.isFinite(Number(item?.updatedAt)) ? Number(item.updatedAt) : Date.now()
    };
}

export function getDateOnly(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

export function getTodayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getTaskPriorityRank(task) {
    if (task.status !== 'open') return task.status === 'done' ? 1000 : 1100;
    const today = getTodayDate();
    if (task.priorityType === 'today') return 0;
    if (task.priorityType === 'week') return 7;
    if (task.priorityType === 'month') return 30;
    const dueDate = getDateOnly(task.dueDate);
    if (!dueDate) return 45;
    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
    return diffDays <= 0 ? diffDays : diffDays + 14;
}

export function sortAgendaTasks(items) {
    return [...items].sort((a, b) => {
        const priorityDiff = getTaskPriorityRank(a) - getTaskPriorityRank(b);
        if (priorityDiff !== 0) return priorityDiff;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });
}

export function getTaskDeadlineBadge(task) {
    if (task.status === 'done') return { label: 'Feito', tone: 'done' };
    if (task.status === 'skipped') return { label: 'Nao sera', tone: 'muted' };
    if (task.priorityType === 'today') return { label: 'Hoje', tone: 'today' };
    if (task.priorityType === 'week' || task.priorityType === 'month') return { label: 'No prazo', tone: 'ok' };
    const dueDate = getDateOnly(task.dueDate);
    if (!dueDate) return { label: 'No prazo', tone: 'ok' };
    const today = getTodayDate();
    if (dueDate.getTime() < today.getTime()) return { label: 'Vencido', tone: 'late' };
    if (dueDate.getTime() === today.getTime()) return { label: 'Hoje', tone: 'today' };
    return { label: 'No prazo', tone: 'ok' };
}

export function formatClockParts(date = new Date()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const weekdayFull = date.toLocaleDateString('pt-BR', { weekday: 'long' });
    const monthFull = date.toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear());
    const weekday = weekdayFull.replace('-feira', ' Feira').replace(/^./, (char) => char.toUpperCase());
    const fullDate = `${day} de ${monthFull} de ${year}`;
    const dayMonth = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
    return { hours, minutes, seconds, weekday, fullDate, dayMonth };
}
