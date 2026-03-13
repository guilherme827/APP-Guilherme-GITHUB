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
        `${classModule}\nreturn ProcessStore;`
    );
    const supabaseMock = createSupabaseMock();
    const ProcessStore = factory(
        supabaseMock,
        (process) => `project-${process?.id || 'x'}`,
        () => [],
        (model) => model,
        (row) => row
    );
    ProcessStore.__supabaseMock = supabaseMock;
    return ProcessStore;
}
