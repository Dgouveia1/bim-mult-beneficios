# Estrutura de Arquivos JavaScript

Este diretório contém os arquivos JavaScript organizados por funcionalidade para o sistema Bim Benefícios.

## Arquivos

### `main.js`
- **Função**: Inicialização principal do sistema
- **Responsabilidades**: 
  - Verificação de autenticação
  - Carregamento inicial da aplicação
  - Funções placeholder para carregamento de dados

### `auth.js`
- **Função**: Autenticação e controle de sessão
- **Responsabilidades**:
  - Login/logout
  - Controle de visualização (dashboard/login)
  - Configuração de permissões por role

### `navigation.js`
- **Função**: Navegação entre páginas
- **Responsabilidades**:
  - Controle de navegação
  - Carregamento de dados específicos por página
  - Gerenciamento de estados ativos

### `usuarios.js`
- **Função**: Gestão de usuários
- **Responsabilidades**:
  - Carregamento de lista de usuários
  - Edição/exclusão de usuários
  - Controle de permissões

### `recepcao.js`
- **Função**: Sistema de recepção
- **Responsabilidades**:
  - Fila de espera
  - Marcação de chegada
  - Registro de pagamentos

### `agenda.js`
- **Função**: Sistema de agenda
- **Responsabilidades**:
  - Visualização de agenda
  - Criação de agendamentos
  - Gerenciamento de horários

### `pacientes.js`
- **Função**: Sistema de pacientes
- **Responsabilidades**:
  - Seleção de pacientes
  - Informações do paciente
  - Finalização de consultas
  - Controle de abas (conduta/receita/exames)

### `clientes.js`
- **Função**: Gestão de clientes
- **Responsabilidades**:
  - Listagem de clientes
  - Edição/exclusão
  - Visualização financeira
  - Visualização de cartão

### `laboratorio.js`
- **Função**: Sistema de laboratório
- **Responsabilidades**:
  - Gestão de exames
  - Criação/edição de exames
  - Controle de preços

### `produtos.js`
- **Função**: Gestão de produtos
- **Responsabilidades**:
  - Listagem de produtos
  - Criação/edição/exclusão
  - Controle de estoque

### `financeiro.js`
- **Função**: Sistema financeiro
- **Responsabilidades**:
  - Relatórios financeiros
  - Transações
  - Exportação de dados

### `disparos.js`
- **Função**: Sistema de disparos
- **Responsabilidades**:
  - Envio de mensagens
  - Preview de mensagens
  - Controle de grupos

### `whatsapp.js`
- **Função**: Integração WhatsApp
- **Responsabilidades**:
  - Status de conexão
  - QR Code para conexão
  - Desconexão

### `events.js`
- **Função**: Configuração de eventos
- **Responsabilidades**:
  - Event listeners
  - Delegação de eventos
  - Controle de modais

## Ordem de Carregamento

Os arquivos devem ser carregados na seguinte ordem (já configurada no HTML):

1. `auth.js` - Funções de autenticação
2. `navigation.js` - Navegação
3. `usuarios.js` - Usuários
4. `recepcao.js` - Recepção
5. `agenda.js` - Agenda
6. `pacientes.js` - Pacientes
7. `clientes.js` - Clientes
8. `laboratorio.js` - Laboratório
9. `produtos.js` - Produtos
10. `financeiro.js` - Financeiro
11. `disparos.js` - Disparos
12. `whatsapp.js` - WhatsApp
13. `events.js` - Eventos
14. `main.js` - Inicialização principal

## Benefícios da Separação

- **Manutenibilidade**: Cada arquivo tem uma responsabilidade específica
- **Organização**: Fácil localização de funcionalidades
- **Reutilização**: Funções podem ser reutilizadas entre módulos
- **Debugging**: Mais fácil identificar problemas
- **Colaboração**: Múltiplos desenvolvedores podem trabalhar em arquivos diferentes
- **Performance**: Carregamento otimizado por funcionalidade

## Convenções

- Cada arquivo deve ter um comentário de cabeçalho indicando sua função
- Funções devem ser nomeadas de forma descritiva
- Usar async/await para operações assíncronas
- Implementar tratamento de erros adequado
- Documentar funções complexas 