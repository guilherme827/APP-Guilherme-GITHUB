import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function syncStorage() {
  console.log('--- Diagnóstico de Storage ---');
  
  // 1. Listar Buckets
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error('Erro ao listar buckets:', listError.message);
    return;
  }
  
  console.log('Buckets existentes:', buckets.map(b => b.name));
  
  const bucketName = 'documentos';
  const hasBucket = buckets.some(b => b.name === bucketName);
  
  if (!hasBucket) {
    console.log(`Criando bucket "${bucketName}"...`);
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 52428800, // 50MB
    });
    
    if (createError) {
      console.error('Erro ao criar bucket:', createError.message);
    } else {
      console.log(`Bucket "${bucketName}" criado.`);
    }
  } else {
    console.log(`Bucket "${bucketName}" já existe.`);
  }

  // Nota: Políticas RLS de Storage não podem ser criadas via JS SDK,
  // apenas via SQL direto no dashboard ou migrações.
  console.log('\n--- Verificação Concluída ---');
  console.log('Certifique-se de que as políticas RLS para storage.objects permitam INSERT para authenticated users.');
}

syncStorage();
