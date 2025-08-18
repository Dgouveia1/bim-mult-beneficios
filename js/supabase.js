// =================================================================================
// CONFIGURAÇÃO E EXPORTAÇÃO DO CLIENTE SUPABASE
// =================================================================================

const SUPABASE_URL = 'https://gaduingceclcfuuihmnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhZHVpbmdjZWNsY2Z1dWlobW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTk5MTMsImV4cCI6MjA2OTAzNTkxM30.DPayP6qBI6pIMwedAWuuVXtJLcGlH51MXXgdDWtILWY';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('Supabase client inicializado.');

// Exporta a instância do cliente para ser usada em outros arquivos
export { _supabase };
