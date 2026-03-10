export const MOCK_PROJECTS = [
    {
        id: 9001,
        clientId: 103,
        name: 'Projeto Tapajos Norte'
    },
    {
        id: 9002,
        clientId: 147,
        name: 'Projeto Rio Dourado'
    }
];

export const MOCK_PROCESSES = [
    {
        id: 10001,
        clientId: 103,
        projectId: 9001,
        fase: 'Requerimento',
        tipo: 'Licenca de Operacao',
        tipoSigla: 'LO',
        tipologia: 'Pesquisa mineral',
        area: '148,72 ha',
        municipio: 'Itaituba/PA',
        orgaoSigla: 'ANM',
        orgaoNomeCompleto: 'Agencia Nacional de Mineracao',
        orgao: 'ANM - Agencia Nacional de Mineracao',
        numeroProcesso: '850.321/2025',
        dataProtocolo: '2025-09-12',
        numeroTitulo: '',
        dataValidade: '',
        dataOutorga: '',
        deadlines: [
            {
                id: '10001-deadline-1',
                desc: 'Enviar comprovante de taxa anual',
                date: '2026-04-15',
                status: 'pending'
            },
            {
                id: '10001-deadline-2',
                desc: 'Responder exigencia tecnica',
                date: '2026-02-20',
                status: 'completed'
            }
        ],
        events: [
            {
                id: '10001-event-inicial',
                isInitial: true,
                usesProcessDocument: true,
                type: 'protocolo',
                description: 'Protocolo inicial',
                date: '2025-09-12',
                documents: []
            },
            {
                id: '10001-event-2',
                type: 'movimentacao',
                description: 'Processo distribuido para analise tecnica',
                date: '2025-10-03',
                documents: []
            },
            {
                id: '10001-event-3',
                type: 'exigencia',
                description: 'Exigencia tecnica para complementacao documental',
                date: '2026-01-18',
                documents: []
            }
        ],
        docBase64: '',
        docStoragePath: '',
        docName: '',
        docType: ''
    },
    {
        id: 10002,
        clientId: 147,
        projectId: 9002,
        fase: 'Titulo',
        tipo: 'Portaria de Lavra Garimpeira',
        tipoSigla: 'PLG',
        tipologia: 'Extracao de ouro',
        area: '52,10 ha',
        municipio: 'Jacareacanga/PA',
        orgaoSigla: 'ANM',
        orgaoNomeCompleto: 'Agencia Nacional de Mineracao',
        orgao: 'ANM - Agencia Nacional de Mineracao',
        numeroProcesso: '850.654/2024',
        dataProtocolo: '2024-06-07',
        numeroTitulo: 'PLG-22/2025',
        dataValidade: '2027-06-07',
        dataOutorga: '2025-06-07',
        deadlines: [
            {
                id: '10002-deadline-1',
                desc: 'Renovar licenca ambiental vinculada',
                date: '2026-05-05',
                status: 'pending'
            },
            {
                id: '10002-deadline-2',
                desc: 'Arquivar comprovante de outorga',
                date: '2025-07-01',
                status: 'archived'
            }
        ],
        events: [
            {
                id: '10002-event-inicial',
                isInitial: true,
                usesProcessDocument: true,
                type: 'titulo',
                description: 'Titulo inicial',
                date: '2025-06-07',
                documents: []
            },
            {
                id: '10002-event-2',
                type: 'movimentacao',
                description: 'Publicacao da outorga no diario oficial',
                date: '2025-06-15',
                documents: []
            }
        ],
        docBase64: '',
        docStoragePath: '',
        docName: '',
        docType: ''
    },
    {
        id: 10003,
        clientId: 105,
        projectId: null,
        fase: 'Requerimento',
        tipo: 'Autorizacao de Pesquisa',
        tipoSigla: 'AP',
        tipologia: 'Areia e cascalho',
        area: '75,00 ha',
        municipio: 'Santarem/PA',
        orgaoSigla: 'SEMAS',
        orgaoNomeCompleto: 'Secretaria de Meio Ambiente e Sustentabilidade',
        orgao: 'SEMAS - Secretaria de Meio Ambiente e Sustentabilidade',
        numeroProcesso: '2026/000145',
        dataProtocolo: '2026-01-10',
        numeroTitulo: '',
        dataValidade: '',
        dataOutorga: '',
        deadlines: [
            {
                id: '10003-deadline-1',
                desc: 'Apresentar mapa georreferenciado',
                date: '2026-03-25',
                status: 'pending'
            }
        ],
        events: [
            {
                id: '10003-event-inicial',
                isInitial: true,
                usesProcessDocument: true,
                type: 'protocolo',
                description: 'Protocolo inicial',
                date: '2026-01-10',
                documents: []
            }
        ],
        docBase64: '',
        docStoragePath: '',
        docName: '',
        docType: ''
    }
];
