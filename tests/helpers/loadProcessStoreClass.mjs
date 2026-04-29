import fs from 'node:fs';
import path from 'node:path';

function createSupabaseMock() {
    let rows = [];
    let idSeed = 1000;

    const clone = (value) => JSON.parse(JSON.stringify(value));

    const api = {
        __setRows(nextRows) {
            rows = clone(Array.isArray(nextRows) ? nextRows : []);
        },
        __getRows() {
            return clone(rows);
        },
        from(tableName) {
            if (tableName !== 'processes') {
                return {
                    select: async () => ({ data: [], error: null })
                };
            }

            const state = {
                mode: 'select',
                payload: null,
                idFilter: null
            };

            const builder = {
                select() {
                    if (state.mode === 'select') {
                        return Promise.resolve({ data: clone(rows), error: null });
                    }
                    return builder;
                },
                order() {
                    return Promise.resolve({ data: clone(rows), error: null });
                },
                insert(payload) {
                    state.mode = 'insert';
                    state.payload = clone(payload);
                    return builder;
                },
                update(payload) {
                    state.mode = 'update';
                    state.payload = clone(payload);
                    return builder;
                },
                delete() {
                    state.mode = 'delete';
                    return builder;
                },
                eq(field, value) {
                    if (field === 'id') state.idFilter = String(value);

                    if (state.mode === 'delete') {
                        rows = rows.filter((row) => String(row.id) !== state.idFilter);
                        return Promise.resolve({ error: null });
                    }
                    return builder;
                },
                single() {
                    if (state.mode === 'insert') {
                        const inserted = { ...state.payload };
                        if (inserted.id === undefined || inserted.id === null || inserted.id === '') {
                            inserted.id = idSeed++;
                        }
                        rows.push(inserted);
                        return Promise.resolve({ data: clone(inserted), error: null });
                    }

                    if (state.mode === 'update') {
                        const index = rows.findIndex((row) => String(row.id) === state.idFilter);
                        if (index < 0) {
                            return Promise.resolve({ data: null, error: { message: 'Registro não encontrado.' } });
                        }
                        rows[index] = { ...rows[index], ...state.payload, id: rows[index].id };
                        return Promise.resolve({ data: clone(rows[index]), error: null });
                    }

                    return Promise.resolve({ data: null, error: { message: 'Operação inválida.' } });
                }
            };

            return builder;
        }
    };

    return api;
}

export function loadProcessStoreClass() {
    const storePath = path.resolve(process.cwd(), 'src/utils/ProcessStore.js');
    const source = fs.readFileSync(storePath, 'utf8');
    const withoutImports = source.replace(/^import[\s\S]*?;\n/gm, '');
    const withoutInstance = withoutImports.replace(/\nexport const processStore = new ProcessStore\(\);\s*$/m, '\n');
    const classModule = withoutInstance.replace('export class ProcessStore', 'class ProcessStore');
    const factory = new Function(
        'supabase',
        'buildProjectId',
        'buildProjectsFromProcesses',
        'mapProcessModelToRow',
        'mapProcessRowToModel',
        'getActiveOrganizationId',
        'trashStore',
        'activityLogger',
        'clientStore',
        'authService',
        `${classModule}\nreturn ProcessStore;`
    );
    const supabaseMock = createSupabaseMock();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
        if (String(url) !== '/api/processes') {
            if (typeof originalFetch === 'function') {
                return originalFetch(url, options);
            }
            throw new Error(`Unhandled fetch in test helper: ${url}`);
        }

        const method = String(options.method || 'GET').toUpperCase();
        const payload = options.body ? JSON.parse(options.body) : {};
        const rows = supabaseMock.__getRows();

        if (method === 'GET') {
            return {
                ok: true,
                async json() {
                    return { data: rows };
                }
            };
        }

        if (method === 'POST') {
            const nextId = payload.id ?? (rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1);
            const created = { ...payload, id: nextId };
            supabaseMock.__setRows([...rows, created]);
            return {
                ok: true,
                async json() {
                    return { data: created };
                }
            };
        }

        if (method === 'PATCH') {
            const targetId = String(payload.id);
            const nextRows = rows.map((row) => (
                String(row.id) === targetId
                    ? { ...row, ...payload, id: row.id }
                    : row
            ));
            const updated = nextRows.find((row) => String(row.id) === targetId) || null;
            supabaseMock.__setRows(nextRows);
            return {
                ok: Boolean(updated),
                async json() {
                    return updated
                        ? { data: updated }
                        : { error: 'Registro não encontrado.' };
                }
            };
        }

        if (method === 'DELETE') {
            const targetId = String(payload.id);
            supabaseMock.__setRows(rows.filter((row) => String(row.id) !== targetId));
            return {
                ok: true,
                async json() {
                    return { data: true };
                }
            };
        }

        return {
            ok: false,
            async json() {
                return { error: `Método não suportado: ${method}` };
            }
        };
    };
    const ProcessStore = factory(
        supabaseMock,
        (process) => `project-${process?.id || 'x'}`,
        () => [],
        (model) => model,
        (row) => row,
        () => null,
        {},
        { logAction() {} },
        { clients: [] },
        { getAccessToken: async () => '' }
    );
    ProcessStore.__supabaseMock = supabaseMock;
    return ProcessStore;
}
