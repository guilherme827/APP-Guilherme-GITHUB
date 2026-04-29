const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
    parseJsonBody,
    authenticateAiRequester,
    loadAgentBundle,
    getMonthUsage,
    assertAgentCanRun,
    logUsage
} = require('./aiRuntime.cjs');

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function getPrompt() {
    return `
        Analise este documento técnico (como uma Licença Ambiental, Requerimento, Título de Outorga, etc.) e extraia as seguintes informações no formato JSON estrito:
        {
            "cliente": "Nome do titular ou empresa",
            "fase": "Requerimento" ou "Título",
            "tipo": "Sigla do documento (ex: PLG, LO, LI)",
            "tipologia": "Atividade (ex: Lavra Garimpeira de Ouro)",
            "orgao": "Sigla do órgão (ex: ANM, SEMAS, IBAMA)",
            "numeroProcesso": "Formato xxxxx.xxx/xxxx",
            "numeroTitulo": "Número do título se houver",
            "dataProtocolo": "YYYY-MM-DD",
            "dataOutorga": "YYYY-MM-DD",
            "dataValidade": "YYYY-MM-DD",
            "deadlines": [
                { "desc": "Descrição resumida do prazo ou condicionante", "date": "YYYY-MM-DD se houver, ou null" }
            ]
        }
        IMPORTANTE:
        1. Extraia TODOS os prazos, condicionantes e notificações mencionadas no documento, mantendo a ordem original.
        2. Se uma data não estiver clara, coloque null.
        3. Responda APENAS o JSON, sem markdown ou explicações.
    `;
}

async function executeTechnicalDocumentAnalyze(bundle, payload) {
    const provider = String(bundle?.model?.provider || '').trim().toLowerCase();
    if (provider !== 'gemini') {
        throw new Error('Nesta fase, a análise documental do Técnico suporta apenas modelos Gemini cadastrados na Central de IA.');
    }

    const apiKey = String(bundle?.providerConfig?.api_key || '').trim();
    const modelName = String(bundle?.model?.model || '').trim();
    if (!apiKey || !modelName) {
        throw new Error('O agente Técnico precisa de uma IA Gemini configurada com credencial válida.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([
        getPrompt(),
        {
            inlineData: {
                data: payload.base64Data,
                mimeType: payload.mimeType
            }
        }
    ]);

    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('A IA não retornou um formato JSON válido.');
    }

    return {
        parsed: JSON.parse(jsonMatch[0]),
        usage: {
            input_tokens: Number(response?.usageMetadata?.promptTokenCount) || 0,
            output_tokens: Number(response?.usageMetadata?.candidatesTokenCount) || 0,
            total_tokens: Number(response?.usageMetadata?.totalTokenCount) || 0
        },
        requestMeta: {
            file_name: payload.fileName || 'documento',
            mime_type: payload.mimeType || 'application/octet-stream'
        }
    };
}

module.exports = async function aiAnalyzeHandler(req, res, env = process.env) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Método não suportado.' });
        return;
    }

    const auth = await authenticateAiRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    let body;
    try {
        body = await parseJsonBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const base64Data = String(body?.base64Data || '').trim();
    const mimeType = String(body?.mimeType || 'application/octet-stream').trim();
    const fileName = String(body?.fileName || 'documento').trim();

    if (!base64Data) {
        sendJson(res, 400, { error: 'Arquivo em base64 não informado.' });
        return;
    }

    try {
        const bundle = await loadAgentBundle(auth.serviceClient, auth.profile.organization_id, 'tecnico');
        const monthUsage = await getMonthUsage(auth.serviceClient, auth.profile.organization_id, 'tecnico');
        assertAgentCanRun(bundle, monthUsage);

        const execution = await executeTechnicalDocumentAnalyze(bundle, { base64Data, mimeType, fileName });
        await logUsage(
            auth.serviceClient,
            auth.profile.organization_id,
            auth.user.id,
            bundle,
            'document_analyze',
            execution.usage,
            'success',
            execution.requestMeta
        );

        sendJson(res, 200, { data: execution.parsed });
    } catch (error) {
        try {
            const bundle = await loadAgentBundle(auth.serviceClient, auth.profile.organization_id, 'tecnico').catch(() => null);
            if (bundle?.agent) {
                await logUsage(
                    auth.serviceClient,
                    auth.profile.organization_id,
                    auth.user.id,
                    bundle,
                    'document_analyze',
                    { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
                    'error',
                    { message: error?.message || 'Falha ao analisar o documento.', file_name: fileName, mime_type: mimeType }
                );
            }
        } catch {
            // noop
        }

        console.error('[ai-analyze] erro na análise:', error);
        sendJson(res, 500, { error: error?.message || 'Falha ao analisar o documento.' });
    }
};
