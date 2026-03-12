const { GoogleGenerativeAI } = require('@google/generative-ai');

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += String(chunk || '');
        });
        req.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

async function generateWithFallback(genAI, prompt, docPart) {
    const models = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
    let lastError = null;

    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            return await model.generateContent([prompt, docPart]);
        } catch (error) {
            lastError = error;
            console.error(`[ai-analyze] falha no modelo ${modelName}:`, error);
        }
    }

    throw lastError || new Error('Falha ao gerar conteúdo com os modelos Gemini disponíveis.');
}

module.exports = async function aiAnalyzeHandler(req, res, env = process.env) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Método não suportado.' });
        return;
    }

    const apiKey = String(env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        sendJson(res, 500, { error: 'GEMINI_API_KEY não configurada no servidor.' });
        return;
    }

    let body;
    try {
        body = await parseBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const base64Data = String(body?.base64Data || '').trim();
    const mimeType = String(body?.mimeType || 'application/octet-stream').trim();

    if (!base64Data) {
        sendJson(res, 400, { error: 'Arquivo em base64 não informado.' });
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `
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

    try {
        const result = await generateWithFallback(genAI, prompt, {
            inlineData: {
                data: base64Data,
                mimeType
            }
        });

        const response = await result.response;
        const text = response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('A IA não retornou um formato JSON válido.');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        sendJson(res, 200, { data: parsed });
    } catch (error) {
        console.error('[ai-analyze] erro na análise:', error);
        sendJson(res, 500, { error: error?.message || 'Falha ao analisar o documento.' });
    }
};
