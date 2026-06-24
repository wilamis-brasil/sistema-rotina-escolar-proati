# MINHAS Decisões de Arquitetura

```txt
index.html
  └── js/main.js
        ├── persistence/store.js   → localStorage, import/export JSON
        ├── app/controller.js      → ações centralizadas, estado em memória, tipo Result
        ├── domain/                → regras de negócio, validação, migração (funções puras)
        └── ui/create-ui.js        → compõe as views, renderização e eventos DOM
```

`index.html` carrega `./css/main.css` e `./js/main.js`. O boot é:
`loadState()` → `createAppController()` → `createUI()` → `ui.init()`.

## Camadas

### `js/domain`

Regras de negócio e modelo de dados. Sem efeitos colaterais — funções puras. O
antigo `model.ts` foi dividido em módulos focados, reexportados por `model.js`:

- `model-utils.js` — texto, datas, IDs, helpers compartilhados (busca, ID único);
- `model-routine.js` — construção/validação, ordenação e filtro de rotinas;
- `model-catalog.js` — professores, turmas e equipamentos (normalização e dedup);
- `model-maintenance.js` — registros de manutenção, histórico e limites de campo;
- `model-state.js` — estado inicial, normalização e **migração de schema**;
- `validate.js` — validação estrutural do estado importado (substitui o Zod por
  guards explícitos);
- `notifications.js` — planejamento das notificações do dia;
- `limits.js`, `errors.js`, `types.js` — limites, tipo `Result` e definições/JSDoc.

### `js/persistence`

Leitura/escrita no `localStorage` e import/export JSON. Sem regras de negócio.
`loadState` migra a chave atual ou a chave legada e põe dados corrompidos em
quarentena. `saveState`/`exportState` projetam um conjunto canônico de campos
(`pickPersistedState`) para não vazar chaves desconhecidas.

### `js/app`

Controller — ponto único de acesso às ações (criar/editar/duplicar/excluir
rotina, desfazer exclusão, catálogos com propagação de renome, manutenção com
histórico, settings de aviso, log de notificações). Cada ação devolve um
`Result` (`{ ok: true, ... } | { ok: false, errors: [...] }`) e dispara a
persistência.

### `js/ui`

Renderização e eventos DOM, sem regras de negócio. Padrão de fábrica + injeção
de dependências: `create-ui.js` instancia cada view (`today`, `week`, catálogos,
`maintenance`, `notifications`, `settings`) passando `getState`/`actions` e
callbacks.

## Engine de notificações

`domain/notifications.js` planeja, sem servidor, as notificações do dia: gera
"sementes" (aviso antecipado com lead configurável, início e término), agrupa as
próximas dentro de uma janela, restaura status do log persistido e detecta
atrasos. Funciona enquanto a aba está aberta — sem Push API.

## Testes

Suíte com o runner nativo do Node (`node:test`), **sem dependências**:
`npm test` (`node --test`). Cobrem modelo, filtros, ordenação, migração,
notificações, persistência, ações do controller e views puras.

## Decisões de projeto

- **Sem build / sem dependências.** A UI é pequena o suficiente para a API DOM
  nativa; ES modules dispensam bundler. Menos custo, menos cadeia de suprimentos,
  publicação trivial.
- **Tipos como documentação.** `// @ts-check` + JSDoc dão checagem no editor sem
  TypeScript no caminho de execução.
- **Schema versionado.** Migração automática evita que dados antigos quebrem.
- **Dados locais.** Tudo fica no navegador (`localStorage`) — combina com a
  ferramenta local; `localStorage` não é armazenamento seguro para segredos.
