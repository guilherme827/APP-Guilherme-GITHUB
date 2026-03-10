// Simple State Management for Clients
export class ClientStore {
    constructor() {
        this.storageKey = 'control_clients';
        const saved = this.parseStoredArray('control_clients');
        const initial = this.getInitialData();
        
        // Merge and Deduplicate
        this.clients = this.deduplicate([...saved, ...initial]);
        this.save();
        this.ready = Promise.resolve();
    }

    parseStoredArray(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    normalizeDoc(doc) {
        return doc ? doc.replace(/\D/g, '') : '';
    }

    normalizeName(name) {
        return name ? name.toLowerCase().trim().replace(/[^\w\s]/g, '') : '';
    }

    deduplicate(list) {
        const seenNames = new Set();
        const seenDocs = new Set();
        
        return list.filter(client => {
            const name = this.normalizeName(client.type === 'PF' ? client.nome : client.nomeFantasia);
            const doc = this.normalizeDoc(client.type === 'PF' ? client.cpf : client.cnpj);
            
            let isDuplicate = false;
            if (name && seenNames.has(name)) isDuplicate = true;
            if (doc && seenDocs.has(doc)) isDuplicate = true;
            
            if (isDuplicate) return false;
            
            if (name) seenNames.add(name);
            if (doc) seenDocs.add(doc);
            return true;
        });
    }

    getInitialData() {
        return [
            { id: 101, type: 'PJ', nomeFantasia: 'C. R. Macedo dos Santos Júnior', cnpj: '45.974.868/0001-28', nomeEmpresarial: 'C. R. Macedo dos Santos Júnior', documents: [] },
            { id: 102, type: 'PJ', nomeFantasia: 'CAL NAVE', cnpj: '15.651.718/0001-15', nomeEmpresarial: 'CALNAVE MINERACAO, NAVEGACAO & RODOVIARIO LTDA', documents: [] },
            { id: 103, type: 'PJ', nomeFantasia: 'CGL', cnpj: '37.150.910/0001-60', nomeEmpresarial: 'Ouro Norte Cooperativa do Garimpeiro Legal CGL', documents: [] },
            { id: 104, type: 'PJ', nomeFantasia: 'CGM MINUANO', cnpj: '47.978.289/0001-81', nomeEmpresarial: 'Cooperativa De Mineradores De Desenvolvimento Econômico e Social do Progresso Minuano', documents: [] },
            { id: 105, type: 'PF', nome: 'Christian Costa Dos Santos', cpf: '647.936.482-15', documents: [] },
            { id: 106, type: 'PJ', nomeFantasia: 'COEMIABRA', cnpj: '17.959.728/0001-48', nomeEmpresarial: 'Cooperativa de Extração Mineral do Água Branca Ltda', documents: [] },
            { id: 107, type: 'PJ', nomeFantasia: 'COMIDEC', cnpj: '15.421.210/0001-20', nomeEmpresarial: 'Cooperativa Mineral da Bacia do Tapajós de Itaituba', documents: [] },
            { id: 108, type: 'PJ', nomeFantasia: 'COOMIGAPA', cnpj: '17.831.186/0001-23', nomeEmpresarial: 'COOMIGAPA', documents: [] },
            { id: 109, type: 'PJ', nomeFantasia: 'COOMPITAR', cnpj: '38.123.054/0001-17', nomeEmpresarial: 'Cooperativa De Mineradores E Produtores De Itaituba E Região', documents: [] },
            { id: 110, type: 'PJ', nomeFantasia: 'COOPEMNA', cnpj: '38.195.094/0001-74', nomeEmpresarial: 'Cooperativa Familiar Extrativista Mineral de Novo Aripuanã Ltda', documents: [] },
            { id: 111, type: 'PJ', nomeFantasia: 'COOPEMIC', cnpj: '31.511.309/0001-70', nomeEmpresarial: 'Cooperativa de Pesquisa, Extração Mineral, Indústria, Comércio e Conservação', documents: [] },
            { id: 112, type: 'PJ', nomeFantasia: 'Cooperativa Dos Garimpeiros E Mineradores Da Amazonia Legal', cnpj: '01.738.809/0001-88', nomeEmpresarial: 'Cooperativa dos Garimpeiros e Mineradores da Amazônia Legal', documents: [] },
            { id: 113, type: 'PJ', nomeFantasia: 'COOPERSOBERANA', cnpj: '39.836.313/0001-10', nomeEmpresarial: 'COOPERSOBERANA', documents: [] },
            { id: 114, type: 'PJ', nomeFantasia: 'COOPERGREEN', cnpj: '41.829.772/0001-18', nomeEmpresarial: 'Cooperativa Mineral do Tapajós e Amazonas - Coopergreen', documents: [] },
            { id: 115, type: 'PJ', nomeFantasia: 'COOPERITA', cnpj: '45.795.943/0001-96', nomeEmpresarial: 'Cooperativa dos Garimpeiros de Itaituba', documents: [] },
            { id: 116, type: 'PJ', nomeFantasia: 'COOPERMI', cnpj: '46.365.982/0001-16', nomeEmpresarial: 'Cooperativa de Mineração Vale dos Garimpeiros', documents: [] },
            { id: 117, type: 'PJ', nomeFantasia: 'COOPERMIGAMA', cnpj: '33.650.760/0001-01', nomeEmpresarial: 'Cooperativa De Trabalho De Mineradores De Garimpo Do Marupá', documents: [] },
            { id: 118, type: 'PJ', nomeFantasia: 'COOPERMINÉRIOS', cnpj: '11.507.678/0001-81', nomeEmpresarial: 'Cooperativa Mista De Exploração Mineral E Extrativismo Vegetal De Novo Progresso', documents: [] },
            { id: 119, type: 'PJ', nomeFantasia: 'COOPERMIX GOLD', cnpj: '37.499.752/0001-59', nomeEmpresarial: 'Cooperativa Mineral da Bacia do Tapajós de Itaituba', documents: [] },
            { id: 120, type: 'PJ', nomeFantasia: 'COOPERNORTE', cnpj: '45.158.333/0001-81', nomeEmpresarial: 'Cooperativa Dos Garimpeiros Da Região Norte', documents: [] },
            { id: 121, type: 'PJ', nomeFantasia: 'COOPERSUPA', cnpj: '41.281.384/0001-45', nomeEmpresarial: 'Cooperativa Dos Garimpeiros Do Sudoeste Do Pará', documents: [] },
            { id: 122, type: 'PJ', nomeFantasia: 'COOPERTIN', cnpj: '26.021.163/0001-44', nomeEmpresarial: 'Cooperativa De Produtores De Estanho Do Brasil', documents: [] },
            { id: 123, type: 'PJ', nomeFantasia: 'COOPERTRANS', cnpj: '27.339.736/0001-45', nomeEmpresarial: 'COOPERTRANS', documents: [] },
            { id: 124, type: 'PJ', nomeFantasia: 'COOPOLRO', cnpj: '17.601.735/0001-73', nomeEmpresarial: 'Cooperativa Dos Garimpeiros Mineradores E Produtores De Ouro Do Tapajós', documents: [] },
            { id: 125, type: 'PJ', nomeFantasia: 'COOPTAP', cnpj: '35.741.430/0001-49', nomeEmpresarial: 'COOPTAP', documents: [] },
            { id: 126, type: 'PF', nome: 'Cristiane Ferreira de Sousa', cpf: '511.417.872-53', documents: [] },
            { id: 127, type: 'PJ', nomeFantasia: 'CVA Mineração', cnpj: '44.153.405/0001-35', nomeEmpresarial: 'CVA Mineração e Empreendimentos LTDA', documents: [] },
            { id: 128, type: 'PJ', nomeFantasia: 'D Fernandes', cnpj: '40.061.548/0001-66', nomeEmpresarial: 'D Fernandes', documents: [] },
            { id: 129, type: 'PF', nome: 'Débora da Conceição dos Santos Mello', cpf: '046.036.872-90', documents: [] },
            { id: 130, type: 'PF', nome: 'Denivaldo Gadelha', cpf: '856.547.952-87', documents: [] },
            { id: 131, type: 'PF', nome: 'Diego D\'Almeida Peralta', cpf: '777.154.032-53', documents: [] },
            { id: 132, type: 'PF', nome: 'Diego De Mello', cpf: '008.740.211-46', documents: [] },
            { id: 133, type: 'PF', nome: 'Dirceu Santos Frederico Sobrinho', cpf: '075.375.258-11', documents: [] },
            { id: 134, type: 'PF', nome: 'Ed Wilson Palha Sousa', cpf: '323.500.402-59', documents: [] },
            { id: 135, type: 'PF', nome: 'Edilene Bezerra Feitosa Torres', cpf: '402.574.282-91', documents: [] },
            { id: 136, type: 'PF', nome: 'Edinéia Brandt', cpf: '419.152.912-91', documents: [] },
            { id: 137, type: 'PF', nome: 'Edson Carlos Willerman', cpf: '388.197.839-91', documents: [] },
            { id: 138, type: 'PF', nome: 'Elson Lima Tabosa', cpf: '272.773.723-87', documents: [] },
            { id: 139, type: 'PF', nome: 'Francisco Do Nascimento Moura', cpf: '152.866.902-97', documents: [] },
            { id: 140, type: 'PF', nome: 'Francisco Pereira Viegas', cpf: '176.388.103-25', documents: [] },
            { id: 141, type: 'PF', nome: 'Francisco Soares Pereira', cpf: '238.102.702-53', documents: [] },
            { id: 142, type: 'PJ', nomeFantasia: 'GARIMPAR', cnpj: '48.660.790/0001-68', nomeEmpresarial: 'Cooperativa Dos Garimpeiros Do Pará', documents: [] },
            { id: 143, type: 'PF', nome: 'Gerson Harkel Seider', cpf: '014.071.211-97', documents: [] },
            { id: 144, type: 'PF', nome: 'Guilherme De Oliveira Paiva', cpf: '041.609.541-03', documents: [] },
            { id: 145, type: 'PF', nome: 'Harley Franco Sandoval', cpf: '806.914.471-87', documents: [] },
            { id: 146, type: 'PF', nome: 'Ivanildo Canuto Soares', cpf: '166.549.168-08', documents: [] },
            { id: 147, type: 'PJ', nomeFantasia: 'Jaay Consultoria', cnpj: '27.101.449/0001-00', nomeEmpresarial: 'Jaay Consultoria', documents: [] },
            { id: 148, type: 'PF', nome: 'Jansen Murielvas Aguiar Barros', cpf: '010.493.272-41', documents: [] },
            { id: 149, type: 'PF', nome: 'Jasmim Coelho Lima', cpf: '005.732.732-78', documents: [] },
            { id: 150, type: 'PF', nome: 'João Batista Abreu Vieira', cpf: '250.470.352-04', documents: [] },
            { id: 151, type: 'PF', nome: 'João Nogueira Lima', cpf: '222.027.731-34', documents: [] },
            { id: 152, type: 'PF', nome: 'Joaquim Carlos Barbosa Lima', cpf: '696.781.462-15', documents: [] },
            { id: 153, type: 'PF', nome: 'José Antônio Pereira Dos Santos', cpf: '179.583.343-20', documents: [] },
            { id: 154, type: 'PF', nome: 'José Carneiro Da Silva', cpf: '038.011.522-00', documents: [] },
            { id: 155, type: 'PF', nome: 'José Domingos Lemos', cpf: '832.197.082-15', documents: [] },
            { id: 156, type: 'PF', nome: 'José Lourival Alves De Santana', cpf: '720.407.772-53', documents: [] },
            { id: 157, type: 'PF', nome: 'José Nilmar Alves De Oliveira', cpf: '238.674.852-91', documents: [] },
            { id: 158, type: 'PF', nome: 'José Pedro De Oliveira', cpf: '381.134.062-04', documents: [] },
            { id: 159, type: 'PF', nome: 'Josimar da Rocha Pereira', cpf: '079.712.573-68', documents: [] },
            { id: 160, type: 'PF', nome: 'Kênio Andrade da Fonseca', cpf: '835.152.832-34', documents: [] },
            { id: 161, type: 'PF', nome: 'Leandro Sousa Rodrigues', cpf: '939.116.882-53', documents: [] },
            { id: 162, type: 'PF', nome: 'Liliam De Moraes Danelchen', cpf: '340.429.031-34', documents: [] },
            { id: 163, type: 'PF', nome: 'Lilian Rodrigues Pena Fernandes', cpf: '003.969.202-74', documents: [] },
            { id: 164, type: 'PF', nome: 'Lorraine Costa Amorim', cpf: '046.708.742-33', documents: [] },
            { id: 165, type: 'PJ', nomeFantasia: 'LRP Fernandes Mineração', cnpj: '43.114.456/0001-95', nomeEmpresarial: 'LRP Fernandes Mineração', documents: [] },
            { id: 166, type: 'PF', nome: 'Lucas De Lima Soares', cpf: '093.814.094-98', documents: [] },
            { id: 167, type: 'PF', nome: 'Luís Rodrigues de Castro', cpf: '110.562.312-20', documents: [] },
            { id: 168, type: 'PF', nome: 'Luiz Silva Carrias', cpf: '282.617.203-49', documents: [] },
            { id: 169, type: 'PF', nome: 'Luz Silva De Sousa', cpf: '073.030.762-04', documents: [] },
            { id: 170, type: 'PF', nome: 'Marcos Rosendo Da Silva', cpf: '538.150.921-91', documents: [] },
            { id: 171, type: 'PF', nome: 'Mário Augusto da Silva Castro', cpf: '637.517.392-20', documents: [] },
            { id: 172, type: 'PF', nome: 'Marlene Rezzadori', cpf: '427.953.209/59', documents: [] },
            { id: 173, type: 'PF', nome: 'Marleni Ficks', cpf: '190.856.991-34', documents: [] },
            { id: 174, type: 'PF', nome: 'Marlon Rodrigues Fernandes', cpf: '957.161.062-34', documents: [] },
            { id: 175, type: 'PF', nome: 'Miguel Viana Da Silva', cpf: '154.800.892-34', documents: [] },
            { id: 176, type: 'PF', nome: 'Moacir José Damiani', cpf: '551.216.321-34', documents: [] },
            { id: 177, type: 'PF', nome: 'Nelson Seber', cpf: '545.246.871-49', documents: [] },
            { id: 178, type: 'PF', nome: 'Nikolas Octávio Ayoub Godoy', cpf: '001.805.601-66', documents: [] },
            { id: 179, type: 'PF', nome: 'Nilo Francisco Weber', cpf: '026.990.959-15', documents: [] },
            { id: 180, type: 'PF', nome: 'Paulo Henrique De Brito Ribeiro', cpf: '971.952.351-49', documents: [] },
            { id: 181, type: 'PF', nome: 'Pedro Augusto Almeida Frederico', cpf: '474.018.148-70', documents: [] },
            { id: 182, type: 'PF', nome: 'Pedro de Paiva Júnior', cpf: '531.987.601-78', documents: [] },
            { id: 183, type: 'PF', nome: 'Pedro De Paula E Silva', cpf: '673.084.572-49', documents: [] },
            { id: 184, type: 'PF', nome: 'Pedro Lopes de Araújo Silva', cpf: '496.383.001-91', documents: [] },
            { id: 185, type: 'PF', nome: 'Raiane Oliveira De Castro', cpf: '019.246.031-52', documents: [] },
            { id: 186, type: 'PF', nome: 'Renato Da Silva Moreira', cpf: '882.963.932-04', documents: [] },
            { id: 187, type: 'PF', nome: 'Rômulo Souza de Mendonça', cpf: '960.425.082-53', documents: [] },
            { id: 188, type: 'PF', nome: 'Rozângela Bogéa Pereira', cpf: '495.887.962-53', documents: [] },
            { id: 189, type: 'PF', nome: 'Theodoro Maurício de Olanda', cpf: '144.270.102-10', documents: [] },
            { id: 190, type: 'PJ', nomeFantasia: 'UNIQUO', cnpj: '41.304.024/0001-11', nomeEmpresarial: 'Cooperativa De Garimpeiros', documents: [] },
            { id: 191, type: 'PF', nome: 'Valdinei Mauro De Sousa', cpf: '568.360.581-49', documents: [] },
            { id: 192, type: 'PF', nome: 'Vanderley Aguiar Do Nascimento', cpf: '686.629.473-87', documents: [] },
            { id: 193, type: 'PF', nome: 'Wagner Augusto de Oliveira', cpf: '621.706.271-20', documents: [] },
            { id: 194, type: 'PF', nome: 'Walter Alves de Sousa', cpf: '222.009.912-15', documents: [] },
            { id: 195, type: 'PF', nome: 'Keila Maria Almeida Bezerra', cpf: '267.301.622-87', documents: [] }
        ];
    }

    getClients() {
        return [...this.clients].sort((a, b) => {
            const nameA = a.type === 'PF' ? a.nome : a.nomeFantasia;
            const nameB = b.type === 'PF' ? b.nome : b.nomeFantasia;
            return nameA.localeCompare(nameB);
        });
    }

    checkUniqueness(client, currentId = null) {
        const doc = this.normalizeDoc(client.type === 'PF' ? client.cpf : client.cnpj);
        const name = this.normalizeName(client.type === 'PF' ? client.nome : client.nomeFantasia);

        const duplicate = this.clients.find(c => {
            if (currentId && c.id === currentId) return false;
            const cDoc = this.normalizeDoc(c.type === 'PF' ? c.cpf : c.cnpj);
            const cName = this.normalizeName(c.type === 'PF' ? c.nome : c.nomeFantasia);
            return (doc && cDoc === doc) || (name && cName === name);
        });

        if (duplicate) {
            const isDoc = this.normalizeDoc(duplicate.type === 'PF' ? duplicate.cpf : duplicate.cnpj) === doc;
            throw new Error(`Este ${isDoc ? 'Documento' : 'Nome'} já está cadastrado para outro titular.`);
        }
    }

    addClient(client) {
        this.checkUniqueness(client);
        this.clients.push({ ...client, id: Date.now(), documents: client.documents || [] });
        this.save();
    }

    updateClient(id, updatedData) {
        this.checkUniqueness(updatedData, id);
        this.clients = this.clients.map(c => c.id === id ? { ...c, ...updatedData } : c);
        this.save();
    }

    deleteClient(id) {
        const hasLinks = this.checkLinks(id);
        if (hasLinks) {
            throw new Error('Não é possível excluir: titular possui processos ou extratos vinculados.');
        }
        this.clients = this.clients.filter(c => c.id !== id);
        this.save();
    }

    checkLinks(id) {
        // Mock linked process check - extend this later
        return false; 
    }

    save() {
        try {
            localStorage.setItem('control_clients', JSON.stringify(this.clients));
        } catch (error) {
            console.error('Falha ao salvar titulares no localStorage:', error);
        }
    }
}

export const clientStore = new ClientStore();
