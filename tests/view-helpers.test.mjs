import test from 'node:test';
import assert from 'node:assert/strict';
import { loadViewHelpersFunctions } from './helpers/loadViewHelpersFunctions.mjs';

const {
    normalizeAgendaTask,
    normalizeListItem,
    sortAgendaTasks,
    getTaskDeadlineBadge,
    formatClockParts
} = await loadViewHelpersFunctions();

test('normalizeAgendaTask should sanitize invalid values', () => {
    const task = normalizeAgendaTask({ text: ' Retornar cliente ', priorityType: 'x', status: 'y' }, 0);
    assert.equal(task.text, 'Retornar cliente');
    assert.equal(task.priorityType, 'week');
    assert.equal(task.status, 'open');
});

test('normalizeListItem should ignore empty text', () => {
    assert.equal(normalizeListItem({ text: '   ' }, 0), null);
});

test('sortAgendaTasks should prioritize today before later tasks', () => {
    const items = [
        { id: '2', text: 'semana', priorityType: 'week', status: 'open', createdAt: 2 },
        { id: '1', text: 'hoje', priorityType: 'today', status: 'open', createdAt: 1 }
    ];
    const sorted = sortAgendaTasks(items);
    assert.deepEqual(sorted.map((item) => item.id), ['1', '2']);
});

test('getTaskDeadlineBadge should flag done and overdue states', () => {
    assert.deepEqual(getTaskDeadlineBadge({ status: 'done' }), { label: 'Feito', tone: 'done' });
    const overdue = getTaskDeadlineBadge({ status: 'open', priorityType: 'date', dueDate: '2000-01-01' });
    assert.equal(overdue.tone, 'late');
});

test('formatClockParts should return zero-padded fields', () => {
    const parts = formatClockParts(new Date('2025-03-14T09:05:07'));
    assert.equal(parts.hours, '09');
    assert.equal(parts.minutes, '05');
    assert.equal(parts.seconds, '07');
});
