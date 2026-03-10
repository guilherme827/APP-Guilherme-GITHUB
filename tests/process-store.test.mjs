import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProcessStoreClass } from './helpers/loadProcessStoreClass.mjs';

function createLocalStorageMock() {
    const data = new Map();
    return {
        getItem(key) {
            return data.has(key) ? data.get(key) : null;
        },
        setItem(key, value) {
            data.set(key, String(value));
        },
        removeItem(key) {
            data.delete(key);
        },
        clear() {
            data.clear();
        }
    };
}

function setupStore(initialProcesses = [], initialProjects = []) {
    globalThis.localStorage = createLocalStorageMock();
    localStorage.setItem('control_processes', JSON.stringify(initialProcesses));
    localStorage.setItem('control_projects', JSON.stringify(initialProjects));
    const ProcessStore = loadProcessStoreClass();
    return new ProcessStore();
}

test('updateProcess must update when id is string and stored id is number', () => {
    const store = setupStore([
        { id: 101, clientId: 1, tipo: 'LO', deadlines: [], events: [] }
    ]);

    const updated = store.updateProcess('101', { tipo: 'LO Atualizada' });

    assert.equal(updated, true);
    assert.equal(store.processes[0].tipo, 'LO Atualizada');

    const persisted = JSON.parse(localStorage.getItem('control_processes'));
    assert.equal(persisted[0].tipo, 'LO Atualizada');
});

test('updateProcess must return false when process does not exist', () => {
    const store = setupStore([]);
    const updated = store.updateProcess('999', { tipo: 'Teste' });
    assert.equal(updated, false);
});

test('addProcessEvent with exigencia must create pending deadline', () => {
    const store = setupStore([
        { id: 202, clientId: 1, tipo: 'LO', deadlines: [], events: [] }
    ]);

    store.addProcessEvent('202', {
        type: 'exigencia',
        description: 'Apresentar relatório complementar',
        date: '2026-03-08',
        documents: []
    });

    assert.equal(store.processes[0].events.length, 1);
    assert.equal(store.processes[0].deadlines.length, 1);
    assert.equal(store.processes[0].deadlines[0].status, 'pending');
});

test('addProcess with initial document must create protocolo event for requerimento', async () => {
    const store = setupStore([]);

    await store.addProcess({
        clientId: 1,
        fase: 'Requerimento',
        tipo: 'Licença de Operação - LO',
        docBase64: 'data:application/pdf;base64,AAA',
        docName: 'requerimento.pdf',
        docType: 'application/pdf',
        deadlines: [],
        events: []
    });

    assert.equal(store.processes.length, 1);
    assert.equal(store.processes[0].events.length, 1);
    assert.equal(store.processes[0].events[0].type, 'protocolo');
});

test('updateProcess must sync initial event document when base attachment changes', () => {
    const store = setupStore([
        {
            id: 303,
            clientId: 1,
            fase: 'Requerimento',
            docBase64: 'data:application/pdf;base64,OLD',
            docName: 'arquivo-antigo.pdf',
            docType: 'application/pdf',
            deadlines: [],
            events: [
                {
                    id: '303-event-inicial',
                    isInitial: true,
                    type: 'protocolo',
                    description: 'Protocolo inicial',
                    date: '2026-03-01',
                    documents: [
                        {
                            id: '303-doc-inicial',
                            name: 'arquivo-antigo.pdf',
                            type: 'application/pdf',
                            base64: 'data:application/pdf;base64,OLD'
                        }
                    ]
                }
            ]
        }
    ]);

    const updated = store.updateProcess(303, {
        docBase64: 'data:application/pdf;base64,NEW',
        docName: 'arquivo-novo.pdf',
        docType: 'application/pdf'
    });

    assert.equal(updated, true);
    const initialEvent = store.processes[0].events.find((event) => event.isInitial === true);
    assert.ok(initialEvent);
    assert.equal(initialEvent.usesProcessDocument, true);
    assert.equal(initialEvent.documents.length, 0);
    assert.equal(store.processes[0].docName, 'arquivo-novo.pdf');
    assert.equal(store.processes[0].docBase64, 'data:application/pdf;base64,NEW');
});

test('sync should identify initial event by text even when id is not event-inicial', () => {
    const store = setupStore([
        {
            id: 404,
            clientId: 1,
            fase: 'Título',
            docBase64: 'data:application/pdf;base64,BASE',
            docName: 'titulo-base.pdf',
            docType: 'application/pdf',
            deadlines: [],
            events: [
                {
                    id: 'evt-random-1',
                    type: 'titulo',
                    description: 'Título inicial',
                    date: '2026-01-01',
                    documents: [
                        {
                            id: 'old-doc',
                            name: 'old.pdf',
                            type: 'application/pdf',
                            base64: 'data:application/pdf;base64,OLD'
                        }
                    ]
                }
            ]
        }
    ]);

    const updated = store.updateProcess(404, { docName: 'titulo-atualizado.pdf' });
    assert.equal(updated, true);

    const evt = store.processes[0].events[0];
    assert.equal(evt.isInitial, true);
    assert.equal(evt.usesProcessDocument, true);
    assert.equal(evt.documents.length, 0);
    assert.equal(store.processes[0].docName, 'titulo-atualizado.pdf');
    assert.equal(store.processes[0].docBase64, 'data:application/pdf;base64,BASE');
});

test('updateProcess must keep working when localStorage quota is exceeded', () => {
    const store = setupStore([
        { id: 505, clientId: 1, tipo: 'LO', deadlines: [], events: [] }
    ]);

    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
        const error = new Error('Quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
    };

    const updated = store.updateProcess(505, { tipo: 'Licença de Operação - LO' });
    assert.equal(updated, true);
    assert.equal(store.processes[0].tipo, 'Licença de Operação - LO');

    localStorage.setItem = originalSetItem;
});

test('updateProcess must preserve edited initial event fields', () => {
    const store = setupStore([
        {
            id: 606,
            clientId: 1,
            fase: 'Título',
            docBase64: 'data:application/pdf;base64,BASE',
            docName: 'titulo.pdf',
            docType: 'application/pdf',
            deadlines: [],
            events: [
                {
                    id: '606-event-inicial',
                    isInitial: true,
                    usesProcessDocument: true,
                    type: 'titulo',
                    description: 'Descrição personalizada',
                    date: '2026-02-10',
                    documents: []
                }
            ]
        }
    ]);

    const updated = store.updateProcess(606, {
        events: [
            {
                id: '606-event-inicial',
                isInitial: true,
                usesProcessDocument: true,
                type: 'titulo',
                description: 'Descrição editada pelo usuário',
                date: '2026-02-15',
                documents: []
            }
        ]
    });

    assert.equal(updated, true);
    assert.equal(store.processes[0].events[0].description, 'Descrição editada pelo usuário');
    assert.equal(store.processes[0].events[0].date, '2026-02-15');
});

test('syncInitialExtractEvent must deduplicate multiple legacy initial events', () => {
    const store = setupStore([
        {
            id: 707,
            clientId: 1,
            fase: 'Título',
            docBase64: 'data:application/pdf;base64,BASE',
            docName: 'titulo.pdf',
            docType: 'application/pdf',
            deadlines: [],
            events: [
                {
                    id: 'legacy-1',
                    type: 'titulo',
                    description: 'Título inicial',
                    date: '2025-01-01',
                    documents: []
                },
                {
                    id: '707-event-inicial',
                    isInitial: true,
                    usesProcessDocument: true,
                    type: 'titulo',
                    description: 'Descrição correta',
                    date: '2026-01-01',
                    documents: []
                }
            ]
        }
    ]);

    const updated = store.updateProcess(707, { tipo: 'Licença de Operação - LO' });
    assert.equal(updated, true);
    assert.equal(store.processes[0].events.length, 1);
    assert.equal(store.processes[0].events[0].description, 'Descrição correta');
});
