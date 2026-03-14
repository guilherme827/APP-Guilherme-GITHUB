import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas.');
}

const SUPER_ADMIN_EMAIL = 'guilherme.a.florestal@gmail.com';
const SUPER_ADMIN_PASSWORD = 'admin123';
const PARA_ADMIN_EMAIL = 'guilherme@geoconsultpa.com';
const PARA_ORGANIZATION_NAME = 'GEOCONSULT Pará';
const PARA_ORGANIZATION_SLUG = 'geoconsult-para';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

async function ensureOrganization() {
    const { data, error } = await supabase
        .from('organizations')
        .upsert({
            name: PARA_ORGANIZATION_NAME,
            slug: PARA_ORGANIZATION_SLUG
        }, { onConflict: 'slug' })
        .select('*')
        .single();

    if (error) throw error;
    return data;
}

async function listUsersByEmail(email) {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    return (data?.users || []).filter((user) => String(user.email || '').toLowerCase() === String(email).toLowerCase());
}

async function ensureSuperAdmin() {
    const existing = await listUsersByEmail(SUPER_ADMIN_EMAIL);
    if (existing[0]) return existing[0];

    const { data, error } = await supabase.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: {
            full_name: 'Administrador Geral',
            role: 'super_admin',
            gender: 'neutro'
        }
    });

    if (error) throw error;
    return data.user;
}

async function run() {
    const organization = await ensureOrganization();
    const superAdmin = await ensureSuperAdmin();

    const { error: superAdminProfileError } = await supabase
        .from('profiles')
        .upsert({
            id: superAdmin.id,
            email: SUPER_ADMIN_EMAIL,
            full_name: 'Administrador Geral',
            role: 'super_admin',
            organization_id: null,
            gender: 'neutro',
            permissions: { view: true, edit: true, delete: true },
            folder_access: ['organizacoes', 'configuracoes']
        });

    if (superAdminProfileError) throw superAdminProfileError;

    const paraAdmins = await listUsersByEmail(PARA_ADMIN_EMAIL);
    if (!paraAdmins[0]) {
        throw new Error(`Usuário administrador do Pará não encontrado: ${PARA_ADMIN_EMAIL}`);
    }

    const paraAdmin = paraAdmins[0];

    const { error: paraAdminMetadataError } = await supabase.auth.admin.updateUserById(paraAdmin.id, {
        user_metadata: {
            ...(paraAdmin.user_metadata || {}),
            role: 'admin',
            organization_id: organization.id
        }
    });

    if (paraAdminMetadataError) throw paraAdminMetadataError;

    const { error: paraAdminProfileError } = await supabase
        .from('profiles')
        .update({
            role: 'admin',
            organization_id: organization.id,
            permissions: { view: true, edit: true, delete: true },
            folder_access: ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'configuracoes']
        })
        .eq('id', paraAdmin.id);

    if (paraAdminProfileError) throw paraAdminProfileError;

    const { error: clientsError } = await supabase
        .from('clients')
        .update({ organization_id: organization.id })
        .is('organization_id', null);

    if (clientsError) throw clientsError;

    const { error: processesError } = await supabase
        .from('processes')
        .update({ organization_id: organization.id })
        .is('organization_id', null);

    if (processesError) throw processesError;

    console.log(JSON.stringify({
        organizationId: organization.id,
        superAdminId: superAdmin.id,
        paraAdminId: paraAdmin.id
    }, null, 2));
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
