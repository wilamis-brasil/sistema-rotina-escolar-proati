# Arquitetura

Este projeto usa uma arquitetura frontend modular e estática. O objetivo não é parecer enterprise — é ser fácil de entender, manter e publicar no GitHub Pages.

## Visão geral

```txt
index.html
  └── src/main.ts
        ├── app/controller.ts      → ações centralizadas, estado em memória
        ├── domain/model.ts        → regras de negócio, validação, migração
        ├── persistence/store.ts   → localStorage, import/export JSON
        └── ui/create-ui.ts        → renderização e eventos DOM
```

## Camadas

### `src/domain`

Regras de negócio e modelo de dados. Sem efeitos colaterais — funções puras.

Responsabilidades:

- criar estado inicial;
- validar e construir entidades (rotina, manutenção, notificação);
- normalizar textos e payloads;
- ordenar e filtrar rotinas;
- migrar estado salvo para a versão atual do schema;
- preservar compatibilidade com chaves legadas de `localStorage`;
- planejar notificações do dia (agrupamento, lead, overdue).

### `src/persistence`

Leitura e escrita no `localStorage`. Sem regras de negócio.

Responsabilidades:

- ler e salvar o estado via chave pública;
- exportar estado como JSON;
- importar e validar JSON (via Zod) antes de aceitar;
- limpar dados locais.

### `src/app`

Controller principal. Único ponto de acesso às ações da aplicação.

Responsabilidades:

- centralizar todas as ações (adicionar, editar, duplicar, excluir);
- desfazer exclusão recente de rotina;
- atualizar catálogos e propagar renomeações para rotinas vinculadas;
- atualizar configurações de notificação;
- registrar log de status de notificações;
- disparar persistência após cada ação.

### `src/ui`

Renderização e eventos DOM. Sem regras de negócio.

Responsabilidades:

- conectar formulários e ações do controller;
- renderizar listas, cards e tabelas;
- exibir feedbacks via toasts;
- controlar diálogos e modais;
- renderizar popups de notificação;
- controlar navegação entre seções.

## Modelo de dados

Chave de armazenamento:

```txt
sistema-rotina-escolar-proati-state-v1
```

Versão atual do schema: `6`. O código migra automaticamente estados salvos em versões anteriores.

Chave legada suportada: `kickoff-proati-state-v1`.

Entidades principais:

- `Routine` — rotina semanal com horário, professor, sala, dispositivos e configuração de notificação;
- `MaintenanceRecord` — ocorrência de manutenção com status, prioridade e histórico automático;
- `NotificationLogEntry` — log persistido de notificações disparadas, vistas, adiadas ou ignoradas;
- `Teacher`, `Room`, `Device` — catálogos com consistência referencial;
- `Password` — cofre local de credenciais de sistemas escolares;
- `Settings` — preferências de UI e configurações globais de notificação.

## Engine de notificações

O módulo `src/domain/notifications.ts` planeja as notificações do dia sem servidor:

1. Para cada rotina do dia atual, gera "sementes" de notificação: aviso antecipado (com lead configurável), início e término.
2. Agrupa sementes próximas dentro de uma janela de tempo configurável.
3. Consulta o log persistido para restaurar status (pendente, exibida, adiada, ignorada).
4. Detecta notificações atrasadas ("overdue") para as que ainda não foram vistas.

Tudo funciona enquanto a aba está aberta, sem Push API nem servidor.

## Fluxo de dados

```txt
Formulário / JSON importado
  → Controller (valida payload)
  → Domínio (normaliza, constrói entidade)
  → Estado em memória
  → localStorage (serializado)
  → UI re-renderizada
```

## Testes

Cobertos com Vitest:

- `src/domain/*.test.ts` — modelo, filtros, ordenação, migração, notificações;
- `src/app/controller.test.ts` — ações, persistência e importação;
- `src/ui/*.test.ts` — visualização semanal e smart-today.

## Decisões de projeto

### Sem backend

O projeto não precisa de servidor. Isso reduz custo, complexidade e risco de operação. Se o uso escalar para múltiplos usuários, a decisão seria revisitada.

### Sem React nesta fase

A UI atual é pequena o suficiente para DOM API. Usar React aumentaria complexidade sem resolver nenhum problema real no tamanho atual.

### Build estático

O build Vite gera `dist/` com caminhos relativos (`base: "./"`), compatível com publicação em subpastas do GitHub Pages.

### Schema versionado

O modelo de dados evolui. Versionar o schema e manter migração automática evita que dados salvos em versões anteriores causem erros silenciosos.

### Dados locais

Os dados ficam no navegador. A decisão combina com o contexto de ferramenta local de rotina, mas exige cuidado com privacidade — veja [PRIVACY.md](PRIVACY.md).

## Riscos conhecidos

- `localStorage` não é cofre seguro — dados podem ser lidos por código na mesma origem.
- GitHub Pages precisa publicar `dist/`, não os arquivos-fonte (TypeScript não compila no Pages).
- Notificações param se a aba for fechada (sem Push API).
