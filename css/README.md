# Estrutura CSS Modular - Bim Benefícios

Este diretório contém os arquivos CSS organizados de forma modular para facilitar manutenção e desenvolvimento.

## 📁 Estrutura de Diretórios

```
/css
├── components/          # Componentes reutilizáveis
│   ├── _buttons.css    # Estilos de botões
│   ├── _cards.css      # Estilos de cards
│   └── _tables.css     # Estilos de tabelas
├── pages/              # Estilos específicos de páginas
│   ├── _login.css      # Página de login
│   ├── _sidebar.css    # Sidebar de navegação
│   ├── _pacientes.css  # Página de pacientes
│   ├── _status.css     # Página de status WhatsApp
│   ├── _recepcao.css   # Página de recepção
│   ├── _agenda.css     # Página de agenda
│   └── _disparos.css   # Página de disparos
├── base.css            # Variáveis CSS, resets e estilos base
├── style.css           # Arquivo principal (importa todos os outros)
└── README.md           # Esta documentação
```

## 🎨 Arquivos

### `base.css`
- **Função**: Estilos base do sistema
- **Conteúdo**:
  - Variáveis CSS (cores, sombras, etc.)
  - Reset CSS
  - Estilos base do body e container
  - Animações globais
  - Formulários base

### `components/_buttons.css`
- **Função**: Estilos de botões reutilizáveis
- **Conteúdo**:
  - Botões primários e secundários
  - Botões de ação (editar, excluir)
  - Botões de atendimento
  - Estados hover e active

### `components/_cards.css`
- **Função**: Estilos de cards e containers
- **Conteúdo**:
  - Cards padrão
  - Cards de pacientes
  - Cards de informação
  - Efeitos hover

### `components/_tables.css`
- **Função**: Estilos de tabelas
- **Conteúdo**:
  - Tabelas padrão
  - Status tags
  - Ações de tabela
  - Estados hover

### `pages/_login.css`
- **Função**: Estilos da página de login
- **Conteúdo**:
  - Container de login
  - Formulário de autenticação
  - Logo e título
  - Animações de entrada

### `pages/_sidebar.css`
- **Função**: Estilos da sidebar de navegação
- **Conteúdo**:
  - Menu lateral
  - Logo da empresa
  - Itens de menu e submenu
  - Estados ativos

### `pages/_pacientes.css`
- **Função**: Estilos da página de pacientes
- **Conteúdo**:
  - Layout de 3 colunas
  - Fila de atendimento
  - Informações do paciente
  - Área de atendimento

### `pages/_status.css`
- **Função**: Estilos da página de status WhatsApp
- **Conteúdo**:
  - Status de conexão
  - QR Code container
  - Spinner de carregamento
  - Animações

### `pages/_recepcao.css`
- **Função**: Estilos da página de recepção
- **Conteúdo**:
  - Grid de cards de pacientes
  - Layout responsivo

### `pages/_agenda.css`
- **Função**: Estilos da página de agenda
- **Conteúdo**:
  - Placeholder para futura implementação

### `pages/_disparos.css`
- **Função**: Estilos da página de disparos
- **Conteúdo**:
  - Formulário de envio
  - Botões de ação

## 🚀 Como Usar

1. **Desenvolvimento**: Edite os arquivos específicos em suas respectivas pastas
2. **Adição de novos componentes**: Crie arquivos em `components/`
3. **Adição de novas páginas**: Crie arquivos em `pages/`
4. **Importação**: Adicione o import no `style.css`

## 📋 Convenções

- **Nomenclatura**: Use `_` no início para arquivos parciais
- **Organização**: Agrupe estilos relacionados
- **Comentários**: Use cabeçalhos descritivos
- **Variáveis**: Use sempre as variáveis CSS definidas em `base.css`

## 🎯 Benefícios

- **Manutenibilidade**: Fácil localização de estilos
- **Reutilização**: Componentes podem ser reutilizados
- **Organização**: Estrutura clara e lógica
- **Performance**: Carregamento otimizado
- **Colaboração**: Múltiplos desenvolvedores podem trabalhar simultaneamente

## 🔧 Manutenção

Para adicionar novos estilos:
1. Identifique se é um componente reutilizável ou específico de página
2. Crie ou edite o arquivo apropriado
3. Se necessário, adicione o import no `style.css`
4. Teste em todas as páginas afetadas 