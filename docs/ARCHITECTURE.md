# Arquitetura

Este projeto usa uma arquitetura frontend simples, modular e estática.

O objetivo não é parecer enterprise. O objetivo é ser fácil de entender, manter e publicar no GitHub Pages.

## Visão Geral

```txt
index.html
  |
  +-- src/main.ts
        |
        +-- app/controller.ts
        +-- domain/model.ts
        +-- persistence/store.ts
        +-- notifications/notification-manager.ts
        +-- ui/create-ui.ts
```

## Camadas

### `src/domain`

Contém regras de negócio e modelo de dados.

Responsabilidades:

- criar estado inicial;
- validar rotina;
- normalizar textos;
- ordenar e filtrar rotinas;
- migrar estado salvo;
- validar catálogos;
- preservar compatibilidade com `kickoff-proati-state-v1`.

### `src/persistence`

Contém persistência local.

Responsabilidades:

- ler `localStorage`;
- salvar `localStorage`;
- exportar JSON;
- importar JSON;
- limpar dados locais.

### `src/app`

Contém o controller principal da aplicação.

Responsabilidades:

- centralizar ações;
- adicionar, editar, duplicar e excluir rotina;
- desfazer exclusão;
- atualizar cadastros;
- atualizar configurações;
- disparar persistência.

### `src/notifications`

Contém alertas e alarme.

Responsabilidades:

- pedir permissão de notificação;
- agendar alertas;
- emitir notificação do navegador;
- tocar o alarme local;
- lidar com bloqueio de autoplay.

### `src/ui`

Contém renderização e eventos da interface.

Responsabilidades:

- conectar formulários;
- renderizar listas;
- renderizar cards de rotina;
- exibir feedbacks;
- controlar diálogos;
- controlar toasts;
- atualizar ícones.

## Modelo de Dados

A chave pública de armazenamento é:

```txt
kickoff-proati-state-v1
```

Entidades principais:

- rotina;
- professor;
- sala/turma;
- dispositivo;
- configurações;
- metadados.

## Decisões de Projeto

### Sem backend

O projeto não precisa de servidor para cumprir o objetivo atual. Isso reduz custo, complexidade e risco de operação.

### Sem React nesta fase

A UI atual é pequena o suficiente para DOM API. Usar React agora aumentaria a complexidade sem necessidade clara.

### Build estático

O build Vite gera uma pasta `dist/` que pode ser publicada no GitHub Pages.

### Dados locais

Os dados ficam no navegador. Essa decisão combina com o contexto de uma ferramenta local de rotina, mas exige cuidado com privacidade.

## Fluxo de Dados

```txt
Formulário / Importação JSON
  -> Controller
  -> Domínio e validação
  -> Estado em memória
  -> localStorage
  -> UI renderizada
```

## Riscos Conhecidos

- `localStorage` não é cofre seguro.
- Notificações não funcionam com a página fechada.
- Alarme pode ser bloqueado por autoplay.
- GitHub Pages precisa publicar `dist/`, não os arquivos fonte.

## Por Que Essa Arquitetura Faz Sentido

Para um projeto de portfólio e uso real em escola, a arquitetura precisa mostrar maturidade sem exagero.

Este projeto evita backend, banco e autenticação porque não há necessidade comprovada para isso. A complexidade fica onde importa: modelo de dados, validação, persistência local e experiência de uso.

