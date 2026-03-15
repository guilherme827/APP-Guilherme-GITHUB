
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
    const envContent = fs.readFileSync('.env', 'utf8');
    const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: clients } = await supabase.from('clients').select('name, cpf_cnpj');
    const { data: procs } = await supabase.from('processes').select('numero, titular, status');

    console.log('\n--- LISTA DE CLIENTES ---');
    if (!clients || clients.length === 0) {
        console.log('Nenhum cliente encontrado.');
    } else {
        clients.forEach(c => console.log(`Nome: ${c.name} | CPF/CNPJ: ${c.cpf_cnpj}`));
    }

    console.log('\n--- LISTA DE PROCESSOS ---');
    if (!procs || procs.length === 0) {
        console.log('Nenhum processo encontrado.');
    } else {
        procs.forEach(p => console.log(`Número: ${p.numero} | Titular: ${p.titular} | Status: ${p.status}`));
    }
}

run().catch(console.error);
