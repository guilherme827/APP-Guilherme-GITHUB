import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const aiAgentRunHandler = require('../server/aiAgentRunHandler.cjs');

test('routeEstagiarioPrompt should keep estagiario when no specialist signal is present', () => {
    const result = aiAgentRunHandler.routeEstagiarioPrompt('Organize os proximos passos e resuma o que ja foi feito.');
    assert.equal(result.primarySlug, 'estagiario');
    assert.equal(result.specialists.length, 0);
    assert.equal(result.confidence, 'low');
});

test('routeEstagiarioPrompt should rank multiple specialists for mixed requests', () => {
    const result = aiAgentRunHandler.routeEstagiarioPrompt(
        'Preciso revisar a exigencia legal da licenca ambiental e montar um email para o cliente.'
    );

    assert.deepEqual(result.specialists.map((item) => item.slug), ['tecnico', 'compliance', 'secretaria']);
    assert.equal(result.confidence, 'high');
});

test('buildSpecialistExecutionPlan should preserve multi-specialist routing for estagiario', () => {
    const routingDecision = {
        confidence: 'high',
        specialists: [
            { slug: 'tecnico' },
            { slug: 'compliance' }
        ]
    };

    const plan = aiAgentRunHandler.buildSpecialistExecutionPlan('estagiario', routingDecision, 'pedido');
    assert.equal(plan.shouldConsultSpecialists, true);
    assert.deepEqual(plan.consultedAgentSlugs, ['tecnico', 'compliance']);
    assert.equal(plan.finalResponderSlug, 'estagiario');
});

test('parseSpecialistPayload should normalize strict internal specialist JSON', () => {
    const parsed = aiAgentRunHandler.parseSpecialistPayload('```json\n{"diagnostico":"Ha exigencia ambiental.","acoes":["Revisar licenca","Protocolar resposta"],"pendencias":["Falta data do protocolo"],"risco":"alto"}\n```');
    assert.equal(parsed.diagnostico, 'Ha exigencia ambiental.');
    assert.deepEqual(parsed.acoes, ['Revisar licenca', 'Protocolar resposta']);
    assert.deepEqual(parsed.pendencias, ['Falta data do protocolo']);
    assert.equal(parsed.risco, 'alto');
});

test('parseEstagiarioPayload and formatFinalResponse should produce stable final text', () => {
    const parsed = aiAgentRunHandler.parseEstagiarioPayload('{"resumo":"Pedido analisado.","acao_recomendada":"Responder a exigencia.","execucao":["Levantar documento","Enviar minuta"],"atencao":["Prazo curto"]}');
    const formatted = aiAgentRunHandler.formatFinalResponse(parsed);
    assert.match(formatted, /RESUMO:\nPedido analisado\./);
    assert.match(formatted, /ACAO RECOMENDADA:\nResponder a exigencia\./);
    assert.match(formatted, /1\. Levantar documento/);
    assert.match(formatted, /- Prazo curto/);
});

test('parseEstagiarioPayloadSafe should create a fallback response for empty greeting output', () => {
    const parsed = aiAgentRunHandler.parseEstagiarioPayloadSafe('', 'oi');
    assert.equal(parsed.resumo, 'Contato iniciado com sucesso no Chat Global.');
    assert.match(parsed.acao_recomendada, /Descreva o que voce precisa/);
    assert.ok(Array.isArray(parsed.execucao));
    assert.ok(parsed.execucao.length > 0);
});
