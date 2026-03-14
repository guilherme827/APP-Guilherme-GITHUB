import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSummaryMetricsFunctions } from './helpers/loadSummaryMetricsFunctions.mjs';

const { buildDashboardSummaryMetrics } = await loadSummaryMetricsFunctions();

test('buildDashboardSummaryMetrics should summarize titulares and process types', () => {
    const metrics = buildDashboardSummaryMetrics([
        { id: 'p1', clientId: 'c1', tipoSigla: 'PLG' },
        { id: 'p2', clientId: 'c2', tipoSigla: 'PLG' },
        { id: 'p3', clientId: 'c2', tipoSigla: 'OUT' }
    ], 4);

    assert.equal(metrics.totalProcessos, 3);
    assert.equal(metrics.titularesComProcesso, 2);
    assert.equal(metrics.titularesSemProcesso, 2);
    assert.equal(metrics.titularesComProcessoPercent, 50);
    assert.deepEqual(metrics.topProcessTypes, [
        { label: 'PLG', value: 2 },
        { label: 'OUT', value: 1 }
    ]);
});

test('buildDashboardSummaryMetrics should classify deadline buckets', () => {
    const now = new Date();
    const asDate = (offsetDays) => {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
        return date.toISOString().slice(0, 10);
    };

    const metrics = buildDashboardSummaryMetrics([
        {
            id: 'p1',
            deadlines: [
                { id: 'd1', date: asDate(-1) },
                { id: 'd2', date: asDate(0) },
                { id: 'd3', date: asDate(3) },
                { id: 'd4', date: asDate(20) },
                { id: 'd5', date: asDate(45) }
            ]
        }
    ], 0);

    assert.equal(metrics.totalPrazos, 5);
    assert.equal(metrics.hasCriticalDeadlines, true);
    assert.deepEqual(metrics.prazoDistribution.map((item) => item.value), [1, 1, 1, 1, 1]);
});
