-- Adiciona a coluna para armazenar os IDs dos profissionais vinculados ao auxiliar
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assisted_professionals uuid[] DEFAULT '{}'::uuid[];

-- Essa coluna permitirá que um perfil com a permissão "auxiliar"
-- tenha uma matriz contendo o ID (da tabela auth.users, que é o mesmo de profiles.id e de professionals.user_id) 
-- dos profissionais (médicos/dentistas) para os quais eles prestarão auxílio.

-- Se necessário, atualize a política de segurança, mas como estamos checando com o cliente javascript que usa role 'authenticated', e as tabelas e views já permitem a leitura e atualização pelo usuário dono, as restrições foram definidas logicamente no front-end em auth.js, prontuario.js e pacientes.js.
