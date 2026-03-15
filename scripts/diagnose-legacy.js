
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
    const envContent = fs.readFileSync('.env', 'utf8');
    const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
    
    // Service role ignora RLS
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('--- DIAGNÓSTICO DE DADOS ---');
    
    const { data: orgs } = await supabase.from('organizations').select('id, name, slug');
    console.log('Organizações encontradas:', orgs?.length);
    orgs.forEach(o => console.log(`- ${o.name} (${o.id}) [${o.slug}]`));

    const { data: clients } = await supabase.from('clients').select('*');
    console.log('\n--- LISTA DE CLIENTES ---');
    console.log(JSON.stringify(clients, null, 2));

    const { data: procs } = await supabase.from('processes').select('*');
    console.log('\n--- LISTA DE PROCESSOS ---');
    console.log(JSON.stringify(procs, null, 2));
}

run().catch(console.error);
