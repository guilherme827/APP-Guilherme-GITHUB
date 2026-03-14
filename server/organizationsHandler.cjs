const { createClient } = require('@supabase/supabase-js');

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

function getClients(env) {
    const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
    const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
        throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas no servidor.');
    }

    return {
        anonClient: createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
        serviceClient: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    };
}

function slugify(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^\w]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

async function authenticateSuperAdmin(req, env) {
    const { anonClient, serviceClient } = getClients(env);
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    if (!token) {
        return { error: { status: 401, message: 'Token de autenticação ausente.' } };
    }

    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !authData?.user) {
        return { error: { status: 401, message: authError?.message || 'Sessão inválida.' } };
    }

    const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

    if (profileError || !profile) {
        return { error: { status: 403, message: profileError?.message || 'Perfil não encontrado.' } };
    }

    if (profile.role !== 'super_admin') {
        return { error: { status: 403, message: 'Apenas o super admin pode gerenciar organizações.' } };
    }

    return { serviceClient, superAdminProfile: profile };
}

async function handleGet(req, res, env) {
    const auth = await authenticateSuperAdmin(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    const { data: organizations, error: organizationsError } = await auth.serviceClient
        .from('organizations')
        .select('*')
        .order('name', { ascending: true });

    if (organizationsError) {
        sendJson(res, 500, { error: organizationsError.message || 'Não foi possível carregar as organizações.' });
        return;
    }

    const { data: adminProfiles, error: adminProfilesError } = await auth.serviceClient
        .from('profiles')
        .select('id, email, full_name, organization_id, role')
        .eq('role', 'admin');

    if (adminProfilesError) {
        sendJson(res, 500, { error: adminProfilesError.message || 'Não foi possível carregar os administradores.' });
        return;
    }

    const normalized = (organizations || []).map((organization) => ({
        ...organization,
        admins: (adminProfiles || []).filter((profile) => String(profile.organization_id || '') === String(organization.id))
    }));

    sendJson(res, 200, { data: normalized });
}

async function handlePost(req, res, env) {
    const auth = await authenticateSuperAdmin(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    let body;
    try {
        body = await parseBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const organizationName = String(body.organization_name || '').trim();
    const organizationSlug = slugify(body.organization_slug || organizationName);
    const adminFullName = String(body.admin_full_name || '').trim();
    const adminEmail = String(body.admin_email || '').trim().toLowerCase();
    const adminPassword = String(body.admin_password || '');
    const adminGender = ['masculino', 'feminino', 'neutro'].includes(String(body.admin_gender || 'neutro'))
        ? String(body.admin_gender || 'neutro')
        : 'neutro';

    if (!organizationName || !organizationSlug || !adminFullName || !adminEmail || adminPassword.length < 6) {
        sendJson(res, 400, { error: 'Nome da organização, slug, dados do administrador e senha válida são obrigatórios.' });
        return;
    }

    const { data: organization, error: organizationError } = await auth.serviceClient
        .from('organizations')
        .insert({
            name: organizationName,
            slug: organizationSlug,
            created_by: auth.superAdminProfile.id
        })
        .select('*')
        .single();

    if (organizationError || !organization) {
        sendJson(res, 500, { error: organizationError?.message || 'Não foi possível criar a organização.' });
        return;
    }

    const { data: createdUserData, error: createUserError } = await auth.serviceClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
            full_name: adminFullName,
            gender: adminGender,
            role: 'admin',
            organization_id: organization.id
        }
    });

    if (createUserError || !createdUserData?.user) {
        sendJson(res, 500, { error: createUserError?.message || 'Organização criada, mas falhou ao criar o administrador.' });
        return;
    }

    const adminProfilePayload = {
        id: createdUserData.user.id,
        email: adminEmail,
        full_name: adminFullName,
        gender: adminGender,
        role: 'admin',
        organization_id: organization.id,
        permissions: { view: true, edit: true, delete: true },
        folder_access: ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'configuracoes']
    };

    const { data: adminProfile, error: adminProfileError } = await auth.serviceClient
        .from('profiles')
        .upsert(adminProfilePayload)
        .select('*')
        .single();

    if (adminProfileError) {
        sendJson(res, 500, { error: adminProfileError.message || 'Administrador criado no Auth, mas o perfil não foi salvo.' });
        return;
    }

    sendJson(res, 201, {
        data: {
            ...organization,
            admins: [adminProfile]
        }
    });
}

module.exports = async function organizationsHandler(req, res, env = process.env) {
    if (req.method === 'GET') {
        await handleGet(req, res, env);
        return;
    }

    if (req.method === 'POST') {
        await handlePost(req, res, env);
        return;
    }

    sendJson(res, 405, { error: 'Método não suportado.' });
};
