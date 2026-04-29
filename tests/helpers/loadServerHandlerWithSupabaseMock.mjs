import { createRequire } from 'node:module';
import path from 'node:path';
import Module from 'node:module';

const require = createRequire(import.meta.url);

export function loadServerHandlerWithSupabaseMock(relativeModulePath, createClientMock) {
    const handlerPath = path.resolve(process.cwd(), relativeModulePath);
    const originalLoad = Module._load;
    const projectRoot = process.cwd();

    delete require.cache[handlerPath];
    Object.keys(require.cache).forEach((cacheKey) => {
        if (cacheKey.startsWith(path.join(projectRoot, 'server'))
            || cacheKey.startsWith(path.join(projectRoot, 'shared'))
            || cacheKey.startsWith(path.join(projectRoot, 'api'))) {
            delete require.cache[cacheKey];
        }
    });

    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === '@supabase/supabase-js') {
            return { createClient: createClientMock };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require(handlerPath);
    } finally {
        Module._load = originalLoad;
    }
}

export function createMockReq({ method = 'GET', headers = {}, body = null } = {}) {
    const listeners = new Map();
    let bodyScheduled = false;
    let bodyFlushed = false;

    const flushBody = () => {
        if (bodyFlushed || bodyScheduled || body == null) {
            return;
        }
        bodyScheduled = true;
        setTimeout(() => {
            bodyScheduled = false;
            if (bodyFlushed) return;
            bodyFlushed = true;
            const chunks = listeners.get('data') || [];
            chunks.forEach((callback) => callback(typeof body === 'string' ? body : JSON.stringify(body)));
            const endListeners = listeners.get('end') || [];
            endListeners.forEach((callback) => callback());
        }, 0);
    };

    const req = {
        method,
        headers,
        on(event, callback) {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(callback);
             flushBody();
            return req;
        }
    };

    return req;
}

export function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        end(payload) {
            this.body = payload;
        }
    };
}

export function createSupabaseClientMock({ getUser, resolveQuery, adminApi = {} } = {}) {
    return function createClient(_url, key) {
        const kind = String(key || '').startsWith('sb_secret_') ? 'service' : 'anon';
        return {
            auth: kind === 'anon'
                ? {
                    getUser: async (token) => getUser?.(token, kind) || { data: { user: null }, error: null }
                }
                : {
                    admin: {
                        updateUserById: async (...args) => {
                            if (typeof adminApi.updateUserById === 'function') return adminApi.updateUserById(...args);
                            return { data: null, error: null };
                        },
                        createUser: async (...args) => {
                            if (typeof adminApi.createUser === 'function') return adminApi.createUser(...args);
                            return { data: null, error: null };
                        }
                    }
                },
            from(table) {
                const state = {
                    table,
                    action: 'select',
                    filters: [],
                    payload: null,
                    selectColumns: '*'
                };

                const buildResult = (mode = 'default') => Promise.resolve(resolveQuery?.({
                    kind,
                    table,
                    mode,
                    action: state.action,
                    filters: [...state.filters],
                    payload: state.payload,
                    selectColumns: state.selectColumns
                }) || { data: null, error: null });

                const builder = {
                    select(columns = '*') {
                        if (state.action === 'select') {
                            state.action = 'select';
                        }
                        state.selectColumns = columns;
                        return builder;
                    },
                    insert(payload) {
                        state.action = 'insert';
                        state.payload = payload;
                        return builder;
                    },
                    update(payload) {
                        state.action = 'update';
                        state.payload = payload;
                        return builder;
                    },
                    upsert(payload) {
                        state.action = 'upsert';
                        state.payload = payload;
                        return builder;
                    },
                    delete() {
                        state.action = 'delete';
                        return builder;
                    },
                    eq(field, value) {
                        state.filters.push({ type: 'eq', field, value });
                        return builder;
                    },
                    in(field, value) {
                        state.filters.push({ type: 'in', field, value });
                        return builder;
                    },
                    is(field, value) {
                        state.filters.push({ type: 'is', field, value });
                        return builder;
                    },
                    order() {
                        return builder;
                    },
                    limit() {
                        return buildResult('limit');
                    },
                    single() {
                        return buildResult('single');
                    },
                    maybeSingle() {
                        return buildResult('maybeSingle');
                    },
                    then(resolve, reject) {
                        return buildResult('then').then(resolve, reject);
                    }
                };

                return builder;
            },
            storage: {
                from() {
                    return {
                        async download() {
                            return { data: Buffer.from(''), error: null };
                        }
                    };
                }
            }
        };
    };
}
