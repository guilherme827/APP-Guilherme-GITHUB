import { GoogleGenerativeAI } from "@google/generative-ai";

// Recupera a API Key do ambiente
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
    console.warn("AVISO: VITE_GEMINI_API_KEY não encontrada no ambiente.");
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

export class AIService {
    /**
     * Converte um arquivo em uma string base64 legível pela Gemini API
     */
    static async fileToGenerativePart(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Data = reader.result.split(',')[1];
                resolve({
                    inlineData: {
                        data: base64Data,
                        mimeType: file.type
                    },
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Analisa um documento de órgão regulador (ANM, SEMAS, etc) e extrai dados estruturados.
     */
    static async analyzeDocument(file) {
        if (!genAI) {
            throw new Error("API Key do Gemini não configurada. Verifique o arquivo .env.");
        }

        try {
            const docPart = await this.fileToGenerativePart(file);
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

            let result;
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                result = await model.generateContent([prompt, docPart]);
            } catch (flashError) {
                console.error("Falha no Flash 2.0:", flashError);
                try {
                    const modelPro = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                    result = await modelPro.generateContent([prompt, docPart]);
                } catch (proError) {
                    console.error("Falha no Flash 2.5:", proError);
                    const modelLatest = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
                    result = await modelLatest.generateContent([prompt, docPart]);
                }
            }

            const response = await result.response;
            const text = response.text();
            
            // Limpa possíveis marcações de markdown do JSON
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("A IA não retornou um formato JSON válido.");
            
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error("Erro na análise da IA:", error);
            throw new Error("Falha ao analisar o documento: " + error.message);
        }
    }
}
