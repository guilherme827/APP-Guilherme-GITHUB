export class AIService {
    static async fileToPayload(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = String(reader.result || '');
                const base64Data = result.includes(',') ? result.split(',')[1] : '';
                resolve({
                    base64Data,
                    mimeType: file?.type || 'application/octet-stream',
                    fileName: file?.name || 'documento'
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    static async analyzeDocument(file) {
        if (!file) {
            throw new Error('Arquivo não informado para análise.');
        }

        try {
            const payload = await this.fileToPayload(file);
            const response = await fetch('/api/ai-analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result?.error || 'Falha ao analisar o documento.');
            }

            return result?.data || {};
        } catch (error) {
            console.error('Erro na análise da IA:', error);
            throw new Error(`Falha ao analisar o documento: ${error.message}`);
        }
    }
}
