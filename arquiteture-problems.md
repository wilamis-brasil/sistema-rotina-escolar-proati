# Prompt para Claude Code: corrigir problemas de arquitetura e manutencao

Voce esta trabalhando no repositorio `sistema-rotina-escolar-proati`, um app web estatico Vite/TypeScript para rotina escolar PROATI. Sua tarefa e corrigir os problemas abaixo com profundidade tecnica, simplificando o sistema sem mudar o produto alem do necessario.

Importante: faca alteracoes pequenas, verificaveis e focadas. Nao reescreva o app inteiro, nao migre para React e nao remova funcionalidades sem decisao explicita.

## Baseline observado

Antes deste handoff, estes comandos passaram no estado atual do projeto:

```bash
npm run typecheck
npm test
npm run build
```

Resultado observado dos testes: 5 arquivos de teste, 45 testes passando.

O worktree ja possui mudancas pendentes. Nao reverta alteracoes existentes que nao sejam suas. Trabalhe com o estado atual.

## Forma atual do sistema

- Stack: Vite, TypeScript strict, DOM API, Vitest, Zod, Lucide, GitHub Pages.
- Entrada: `index.html` carrega um bootstrap JS que decide entre `src/main.ts` em dev e `assets/app.js` fora do Vite dev server.
- Composicao: `src/main.ts` cria controller, notification manager e UI.
- Dominio: `src/domain/model.ts` concentra validacao, normalizacao, migracao, catalogos, rotinas, settings e senhas.
- Tipos: `src/domain/types.ts` define estado persistido, payloads e adapters.
- Persistencia: `src/persistence/store.ts` le e salva `localStorage`, exporta/importa JSON e limpa estado.
- Controller: `src/app/controller.ts` centraliza mutacoes de estado e chama persistencia.
- Notificacoes: `src/notifications/notification-manager.ts` agenda alertas, emite notificacoes, persiste pending/acknowledged alerts e toca audio.
- UI: `src/ui/create-ui.ts` renderiza quase toda a aplicacao, registra eventos, gerencia filtros, formularios, senhas, export/import, alertas recentes e fila de alarmes.

## Regras de escopo

- Preserve a funcionalidade atual de senhas e os defaults atuais. O usuario decidiu manter essa feature.
- Nao remova nem substitua a area de senhas por cofre externo nesta tarefa.
- Nao altere valores literais de credenciais existentes sem decisao explicita. Tambem nao copie esses valores para logs, mensagens, docs ou relatorios.
- Corrija comportamento, arquitetura, testes e documentacao em volta da feature de senhas para deixar o risco claro e controlado.
- Mantenha DOM API. Nao introduza React, framework de estado global ou backend.
- Prefira reduzir complexidade: menos arquivos gerados versionados, menos estado global, menos casts, menos duplicacao e menos acoplamento entre UI e dominio.

## Findings prioritarios

### [P0] Credenciais reais em texto puro no bundle publicado

Evidencia:
- `src/domain/model.ts:41` declara `DEFAULT_PASSWORDS`.
- `src/domain/model.ts:195` injeta esses defaults em `createEmptyState()`.
- `src/domain/model.ts:407` e `src/domain/model.ts:597-601` normalizam/importam e re-semeiam os defaults.
- `index.html:86-90` e `index.html:412-449` expõem a area de "Senhas".
- `SECURITY.md:34-35` afirma que nao se deve colocar segredos no codigo nem armazenar senhas desnecessarias, o que contradiz o codigo atual.
- `README.md:99` e `README.md:244` tambem comunicam "sem segredo no codigo/repositorio".

Risco:
- Em GitHub Pages, qualquer valor empacotado no JS publico e publicamente recuperavel.
- Mesmo que o app seja local-first, credenciais hard-coded viram segredo distribuido.
- O risco foi aceito pelo usuario para esta tarefa, mas precisa ficar explicito e coerente.

Correcao esperada:
- Nao remover a feature nem mudar os defaults nesta tarefa.
- Atualizar documentacao e mensagens de seguranca para refletir a realidade: existe uma area local de senhas e existem credenciais default embarcadas.
- Adicionar aviso visivel na UI da tela de senhas/configuracoes informando que `localStorage` e JS estatico nao sao cofre seguro.
- Garantir que export/import e docs deixem claro que JSON pode conter senhas.
- Nao repetir os valores das credenciais em docs, testes, logs ou comentarios novos.

Testes esperados:
- Teste que `createEmptyState()` ainda inclui os defaults de senha enquanto a decisao de produto for manter.
- Teste/documentacao de comportamento de export/import com senhas.

### [P1] Senhas default deletadas podem voltar apos reload/import/normalizacao

Evidencia:
- `src/domain/model.ts:597-601` chama `normalizeAndSeedPasswords(raw.passwords)`.
- A funcao calcula defaults ausentes por ID e os adiciona novamente.
- `src/app/controller.ts:200-204` permite deletar senha, mas a delecao nao registra tombstone nem preferencia do usuario.

Risco:
- Usuario deleta uma credencial default, mas ela pode voltar quando o estado for normalizado, importado ou migrado.
- Isso quebra expectativa de delecao e pode reintroduzir uma credencial que o usuario tentou remover.

Correcao esperada:
- Preservar defaults atuais para novos estados, mas fazer delecoes sobreviverem.
- Opcoes aceitaveis:
  - modelar `settings`/`meta` com uma lista de IDs default removidos; ou
  - parar de re-seed em normalizacoes de estado existente e seedar apenas estado novo; ou
  - outra abordagem simples que preserve compatibilidade e o direito de remover.
- Evite solucao que dependa de comparar o texto da senha.
- Atualizar schema/normalizacao sem quebrar imports antigos.

Testes esperados:
- Criar estado, deletar senha default, salvar, carregar via `loadState()`/`normalizeState()` e confirmar que ela nao volta.
- Importar JSON sem uma senha default removida e confirmar comportamento definido.

### [P1] Mutacoes do controller acontecem antes da persistencia

Evidencia:
- `src/app/controller.ts:73-246` muta `state` diretamente antes de chamar `persist()`.
- Exemplos: `state.routines.push`, `splice`, atualizacao de catalogo, senhas e settings.
- `src/persistence/store.ts:54-74` pode falhar ao salvar por quota/permissao.

Risco:
- Se `localStorage.setItem` falhar, o controller pode retornar erro, mas o estado em memoria ja foi alterado.
- UI e memoria ficam divergentes do disco. Reload perde mudanca; usuario pode acreditar que salvou.
- Em import/reset, falha parcial pode deixar comportamento confuso.

Correcao esperada:
- Tornar persistencia transacional no nivel do controller:
  - calcular `nextState` sem mutar o estado atual;
  - tentar salvar `nextState`;
  - so trocar `state` e disparar `onStateChange` se salvar com sucesso.
- Para operacoes que precisam compor varias alteracoes, usar helpers puros e imutaveis.
- Reduzir casts `as never` quando possivel.

Testes esperados:
- Storage fake que falha em `setItem`.
- `addRoutine`, `deleteRoutine`, `updateSettings`, `addPassword/deletePassword` nao devem alterar `controller.getState()` quando persistencia falha.
- `onStateChange` nao deve disparar em falha de persistencia.

### [P1] Build/entrada duplicados e bundles versionados fora de `dist`

Evidencia:
- `index.html:14-26` cria bootstrap manual e importa dinamicamente `src/main.ts` ou `assets/app.js`.
- `vite.config.ts:12-25` configura entradas `index` e `app`, gerando `dist/assets/index.js` e `dist/assets/app.js`.
- `assets/app.js` e `assets/app.css` estao versionados, embora `.gitignore` ignore `dist/`.
- `src/main.ts:1` importa `../assets/css/styles.css`, enquanto o HTML de producao injeta `assets/app.css`.

Risco:
- Ha duas verdades de build: fonte Vite e bundle versionado.
- O build gera um bootstrap `index.js` que ainda importa `app.js`, aumentando complexidade sem necessidade.
- Arquivos gerados em `assets/` podem ficar stale e divergentes do codigo TypeScript.
- O setup dificulta manutencao, deploy e revisao.

Correcao esperada:
- Simplificar para fluxo Vite padrao:
  - `index.html` deve usar `<script type="module" src="/src/main.ts"></script>` ou caminho relativo adequado ao Vite.
  - remover bootstrap manual e `@vite-ignore`.
  - deixar Vite gerar assets somente em `dist/`.
  - decidir se `assets/app.js` e `assets/app.css` devem sair do versionamento; se forem gerados, remover do repo e confiar em `dist/`/workflow.
- Manter compatibilidade com GitHub Pages via `base: "./"` se necessario.
- Atualizar `GITHUB_PAGES.md` para refletir o fluxo real.

Testes esperados:
- `npm run build` gera HTML funcional.
- `npm run preview` carrega CSS, logo, audio e JS.
- `git status` nao mostra bundles gerados como mudanca permanente apos build.

### [P1] Filtro semanal de dispositivos esta hard-coded

Evidencia:
- `index.html:317-320` define apenas Notebook, Chromebook e Notebook/Chromebook.
- `src/ui/create-ui.ts:498` registra listeners apenas nos inputs existentes no HTML.
- `src/ui/create-ui.ts:981-985` filtra usando `#filter-device-chips input:checked`.
- `src/domain/types.ts:26-32` tem defaults com Tablet e Headset, mas eles nao aparecem no filtro hard-coded.

Risco:
- Dispositivos cadastrados pelo usuario nao aparecem como filtros.
- Defaults existentes podem ficar invisiveis no filtro.
- Cadastro e filtro nao usam a mesma fonte de verdade.

Correcao esperada:
- Renderizar chips de dispositivo dinamicamente a partir de `state.devices` e dos dispositivos usados em rotinas.
- Recriar listeners de forma robusta apos render, ou usar event delegation no container.
- Preservar selecoes validas quando a lista for rerenderizada.
- Remover duplicacao hard-coded do HTML, deixando no maximo um container vazio.

Testes esperados:
- Com estado contendo Tablet/Headset/Projetor, os chips aparecem.
- Filtrar por dispositivo dinamico mostra apenas rotinas esperadas.
- Se um dispositivo e removido do catalogo mas ainda existe em rotina, o filtro continua possivel se esta for a regra escolhida.

### [P1] Icones usados nao estao registrados no Lucide

Evidencia:
- `index.html:270` usa `data-lucide="search"`.
- `src/ui/create-ui.ts:1196` e `src/ui/create-ui.ts:1255` usam `detailLine("book-open-check", ...)`.
- `src/ui/icons.ts:1-35` e `src/ui/icons.ts:37-70` nao importam/registram `Search` nem `BookOpenCheck`.

Risco:
- Icones podem nao renderizar em runtime.
- Typecheck/testes nao detectam porque nomes de icone sao strings soltas.

Correcao esperada:
- Registrar todos os icones realmente usados.
- Criar um tipo/constante central para nomes de icones usados pela UI, reduzindo strings soltas.
- Adicionar teste ou verificacao estatica simples que falhe quando um `data-lucide`/`icon("...")` usado nao estiver registrado.

Testes esperados:
- Teste de integridade: lista de icones usados esta contida na lista de icones registrados.

### [P1] Alertas pendentes podem reaparecer com dados antigos apos edicao da rotina

Evidencia:
- `src/notifications/notification-manager.ts:226-234` reemite pending alerts persistidos se `routineId` ainda existe.
- `src/notifications/notification-manager.ts:444-445` cria chave apenas com `routineId`, data e `startTime`.
- O payload persistido (`record.alert`) contem professor, sala, dispositivos e detalhes antigos.

Risco:
- Usuario edita professor/sala/dispositivo/lead/notes, mas um alerta pendente antigo pode reaparecer com informacao desatualizada.
- Se o horario continua igual, a chave nao muda; o pending antigo vence a rotina atual.

Correcao esperada:
- Incluir uma versao/assinatura da rotina no dispatch key ou invalidar pending alerts quando a rotina muda.
- Preferir usar `routine.updatedAt` ou hash dos campos relevantes no key/record.
- Ao reemitir pending alert, reconstruir o alert a partir da rotina atual quando possivel.
- Garantir que acknowledged alert antigo nao bloqueie alerta novo depois de edicao relevante.

Testes esperados:
- Criar pending alert, editar rotina mantendo startTime, reschedule/reload e confirmar que o alerta mostra dados atualizados.
- Confirmar que acknowledged antigo nao bloqueia alerta depois de alteracao relevante.

### [P2] `src/ui/create-ui.ts` esta grande demais e mistura responsabilidades

Evidencia:
- Arquivo tem aproximadamente 1900 linhas.
- Ele contem helpers de tempo/inteligencia do painel, binding de refs, eventos, renderizacao de rotinas, filtros, catalogos, senhas, settings, import/export, clipboard, alertas, fila de alarmes e botoes genericos.

Risco:
- Alteracoes pequenas geram alto risco de regressao.
- Reuso/teste fica limitado: parte dos helpers puros esta no mesmo arquivo que DOM imperative.
- Responsabilidades de produto diferentes ficam acopladas.

Correcao esperada:
- Refatorar incrementalmente, sem mudar comportamento:
  - mover helpers puros do painel de hoje para `src/ui/smart-today.ts`;
  - mover filtros semanais para modulo proprio;
  - mover UI de senhas para modulo proprio;
  - mover renderizadores de rotina/card para modulo proprio se reduzir complexidade;
  - manter `createUI` como orquestrador fino.
- Evitar criar abstractions genericas demais. O objetivo e reduzir risco, nao parecer enterprise.

Testes esperados:
- Mover testes atuais de smart-today para o novo modulo.
- Adicionar testes para filtros dinamicos e renderizacao de chips.

### [P2] Dominio concentra modelos demais

Evidencia:
- `src/domain/model.ts` contem rotinas, catalogos, passwords, settings, migracao, normalizacao, formatacao, ID e datas.
- `RawStateSchema` valida pouco a forma interna e delega muito para normalizadores ad hoc.

Risco:
- Mudancas em senhas, rotina ou importacao exigem tocar no mesmo arquivo grande.
- Fica dificil razonar sobre compatibilidade de schema.
- Casts e validacoes flexiveis demais podem aceitar estado ruim silenciosamente.

Correcao esperada:
- Dividir de forma pragmatica:
  - `domain/routines.ts` para rotina, ordenacao/filtro e tempo;
  - `domain/catalogs.ts` para professor/sala/dispositivo;
  - `domain/passwords.ts` para senhas;
  - `domain/state.ts` ou `domain/migrations.ts` para `createEmptyState`, `normalizeState`, `migrateState`;
  - manter exports publicos estaveis se isso reduzir diffs.
- Nao transformar em arquitetura exagerada. O app continua pequeno.

Testes esperados:
- Testes existentes continuam passando.
- Adicionar testes para normalizacao de passwords e estado novo/importado.

### [P2] Tipos mortos/desnecessarios e contratos duplicados

Evidencia:
- `src/domain/types.ts:131` declara `ImportExportResult`, aparentemente nao usado.
- `src/domain/types.ts:149` declara `AudioAdapter`, aparentemente nao usado.
- `src/persistence/store.ts:5` duplica `ALERT_STORAGE_KEY`, enquanto `src/notifications/notification-manager.ts:5` exporta a mesma chave.

Risco:
- Tipos mortos confundem quem mantem.
- Chaves duplicadas podem divergir em refactors futuros.

Correcao esperada:
- Remover tipos mortos se realmente nao usados.
- Consolidar `ALERT_STORAGE_KEY` em um unico modulo de constantes, ou importar do local existente evitando ciclo.
- Preferir constantes de storage em um modulo neutro, por exemplo `src/domain/storage-keys.ts` ou `src/persistence/keys.ts`.

Testes esperados:
- Typecheck deve garantir ausencia de imports quebrados.

### [P2] Import JSON nao tem limite de tamanho nem validacao forte para senhas

Evidencia:
- `src/ui/create-ui.ts:1608-1639` le arquivo inteiro com `FileReader.readAsText(file)`.
- `src/persistence/store.ts:88-97` faz `JSON.parse` sem limite de tamanho.
- `src/domain/model.ts:604-625` normaliza senhas aceitando strings vazias para title/secret quando vindas de import.
- `validatePasswordPayload` exige title/secret, mas a normalizacao importada nao aplica a mesma regra.

Risco:
- Arquivo enorme pode travar a UI.
- Import pode introduzir registros de senha incompletos.
- O app comunica validacao, mas aceita formas inconsistentes.

Correcao esperada:
- Definir limite simples de tamanho para import JSON, por exemplo 1 MB ou 2 MB.
- Bloquear leitura antes do `FileReader` se `file.size` exceder limite.
- Normalizar ou rejeitar senhas importadas com title/secret vazios de forma consistente.
- Atualizar mensagem de erro para usuario.

Testes esperados:
- Import acima do limite falha sem chamar `readAsText`.
- Senha importada incompleta e rejeitada ou descartada conforme regra escolhida; documentar a escolha.

### [P2] Estado transitorio de filtro e persistido no estado principal

Evidencia:
- `src/domain/types.ts:81` inclui `Settings.filterText`.
- `src/app/controller.ts:220-226` persiste filtro/sort.
- `src/ui/create-ui.ts:483-489` grava `localStorage` a cada input/change de filtro.

Risco:
- Cada tecla no filtro gera escrita em `localStorage`.
- Estado de UI temporario polui schema persistido.
- Import/export passa a carregar preferencia efemera.

Correcao esperada:
- Remover `filterText` do estado persistido ou mover para estado local da UI.
- Manter `sortBy` persistido se for preferencia real do usuario.
- Se manter filtro persistido for decisao de produto, aplicar debounce e documentar. Preferencia recomendada: filtro textual nao persistido.

Testes esperados:
- Digitar no filtro nao chama persistencia.
- Ordenacao ainda persiste, se mantida como preferencia.

### [P3] Documentacao esta parcialmente desatualizada ou contraditoria

Evidencia:
- `GITHUB_PAGES.md:9-15` fala do antigo `<script type="module" src="./src/main.ts"></script>`, enquanto `index.html` usa bootstrap manual.
- `SECURITY.md:7-15` diz que o sistema nao possui senha, mas existe tela de senhas.
- `PRIVACY.md:17-27` nao lista senhas como dado armazenado; depois diz para evitar senhas nas observacoes.
- `README.md:99` e `README.md:244` dizem "sem segredo no codigo/repositorio", contradizendo `DEFAULT_PASSWORDS`.

Risco:
- Quem usa/publica o app recebe instrucao incorreta.
- Revisores podem confiar em garantias falsas de seguranca.

Correcao esperada:
- Atualizar docs apos corrigir o fluxo tecnico.
- Explicar claramente:
  - app e local-first, mas nao e cofre;
  - senhas ficam no `localStorage` e podem ir no export JSON;
  - credenciais default estao embarcadas por decisao do produto atual;
  - GitHub Pages/publicacao tornam JS e defaults recuperaveis.

## Sequencia recomendada de implementacao

1. Criar testes de regressao para os problemas P1 mais concretos:
   - persistencia transacional;
   - delecao/re-seed de senha default;
   - filtro dinamico de dispositivos;
   - icones usados registrados;
   - alerta pending apos edicao da rotina.
2. Corrigir P1 de baixo risco primeiro:
   - icones;
   - filtro dinamico;
   - persistencia transacional.
3. Corrigir comportamento de senhas default e importacao.
4. Simplificar build/entrada Vite e remover bundles gerados do versionamento se aplicavel.
5. Refatorar `create-ui.ts` e `domain/model.ts` em fatias pequenas, mantendo testes verdes entre cada fatia.
6. Atualizar documentacao no final, quando o comportamento real estiver estabilizado.

## Criterios de aceite

- `npm run typecheck` passa.
- `npm test` passa.
- `npm run build` passa.
- App abre em dev e preview.
- Cadastro, edicao, duplicacao, exclusao e desfazer rotina continuam funcionando.
- Filtro semanal inclui dispositivos cadastrados/usados, nao apenas os hard-coded.
- Todos os icones visiveis usados pela UI renderizam.
- Deletar senha default nao faz ela voltar indevidamente.
- Falha de `localStorage.setItem` nao deixa estado em memoria alterado como se tivesse salvo.
- Alertas pendentes nao exibem dados antigos apos edicao relevante da rotina.
- Documentacao nao promete "sem senhas/sem segredos" enquanto a feature atual existir.
- Build nao depende de bundles versionados fora de `dist/`.

## Comandos obrigatorios antes de finalizar

```bash
npm run typecheck
npm test
npm run build
```

Se mudar fluxo de build ou UI, tambem rode:

```bash
npm run preview
```

Depois valide manualmente no navegador:

- abrir app;
- navegar entre Home, Semana, Professores, Salas, Dispositivos, Senhas e Configuracoes;
- criar/editar/excluir rotina;
- usar filtros semanais;
- copiar/mostrar senha;
- exportar/importar JSON;
- resetar dados locais;
- verificar icones, logo, CSS e audio.

## Orientacao de commit/PR

- Agrupe commits por comportamento, nao por arquivo.
- Comece pelos testes que demonstram o problema.
- Em cada PR/commit, explique o risco removido.
- Nao inclua valores literais de credenciais em mensagens de commit, PR, logs ou docs.
- Se uma decisao de produto for necessaria para remover/alterar senhas default, pare e peça decisao explicita antes de fazer.
