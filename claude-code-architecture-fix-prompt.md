# Prompt para Claude Code corrigir os problemas de arquitetura

Voce é um programador senior frontend trabalhando neste repositorio local:

`sistema-rotina-escolar-proati`

Sua tarefa e corrigir os problemas de arquitetura, manutencao, seguranca documentada, build, UI e persistencia listados em `arquiteture-problems.md`.

Leia `arquiteture-problems.md` inteiro antes de editar qualquer arquivo. Use esse arquivo como fonte de verdade para severidade, evidencias, escopo e criterios de aceite.

## Objetivo

Corrigir os problemas listados em `arquiteture-problems.md` com uma abordagem incremental, simples e verificavel, reduzindo complexidade sem mudar o produto alem do necessario.

O resultado esperado e um app mais facil de manter, com fluxo Vite mais limpo, estado mais seguro contra falhas de persistencia, filtros dinamicos corretos, icones renderizando, alertas sem dados antigos, importacao mais robusta e documentacao honesta sobre o comportamento real.

## Regras obrigatorias

- Preserve a funcionalidade atual de senhas.
- Preserve os defaults atuais de senhas, salvo decisao explicita posterior do usuario.
- Nao remova a tela de senhas.
- Nao substitua senhas por backend, cofre externo, autenticacao ou criptografia complexa.
- Nao copie valores literais de credenciais para logs, documentacao, mensagens de commit, comentarios novos ou resumo final.
- Nao migrar para React ou qualquer framework novo.
- Manter DOM API, TypeScript strict, Vite, Vitest, Zod e Lucide.
- Nao reverter mudancas existentes no worktree que nao foram feitas por voce.
- Nao fazer reescrita geral. Trabalhe em fatias pequenas e mantenha testes verdes.
- Prefira remover duplicacao e simplificar antes de criar novas abstracoes.

## Ordem de trabalho

1. Rode uma checagem inicial:

```bash
npm run typecheck
npm test
npm run build
git status --short
```

2. Crie ou ajuste testes para demonstrar os problemas P1 antes da correcao quando viavel:

- persistencia transacional no controller;
- delecao de senha default que nao deve voltar indevidamente;
- filtro semanal dinamico de dispositivos;
- integridade de icones usados vs registrados;
- alerta pendente apos edicao relevante da rotina;
- limite e validacao de import JSON.

3. Corrija primeiro os problemas P1 de menor acoplamento:

- registrar icones ausentes (`search`, `book-open-check`) e criar guarda contra novos icones nao registrados;
- tornar filtro de dispositivos dinamico;
- corrigir persistencia transacional no controller.

4. Corrija comportamento de senhas default e importacao:

- manter defaults em estado novo;
- impedir que uma senha default deletada reapareca sem decisao do usuario;
- validar ou descartar senhas importadas incompletas conforme regra simples e testada;
- limitar tamanho de arquivo JSON antes de ler com `FileReader`.

5. Corrija alertas pendentes:

- impedir que pending alerts persistidos exibam professor/sala/dispositivos antigos apos edicao;
- garantir que edicao relevante da rotina nao seja bloqueada por acknowledged antigo.

6. Simplifique build e entrada:

- substituir bootstrap manual de `index.html` pelo fluxo Vite padrao;
- remover dependencia de bundles versionados `assets/app.js` e `assets/app.css` se forem artefatos gerados;
- manter GitHub Pages funcionando com `base: "./"` se ainda necessario;
- atualizar docs de deploy.

7. Refatore em fatias pequenas:

- extrair helpers puros de `src/ui/create-ui.ts` para modulos menores;
- separar partes do dominio de `src/domain/model.ts` sem mudar comportamento;
- remover tipos mortos e consolidar chaves duplicadas.

8. Atualize documentacao no final:

- `SECURITY.md`;
- `PRIVACY.md`;
- `README.md`;
- `GITHUB_PAGES.md`;
- qualquer outro documento que prometa algo diferente do codigo real.

## Problemas que devem ser resolvidos

Resolva todos os itens de `arquiteture-problems.md`, com prioridade nesta ordem:

1. P0/P1 de seguranca documentada e senhas default.
2. P1 de persistencia transacional.
3. P1 de build duplicado e bundles versionados.
4. P1 de filtro dinamico de dispositivos.
5. P1 de icones ausentes.
6. P1 de alertas pendentes com dados antigos.
7. P2 de modularizacao da UI.
8. P2 de separacao do dominio.
9. P2 de tipos mortos e constantes duplicadas.
10. P2 de limite/validacao de import JSON.
11. P2 de `Settings.filterText` como estado transitorio persistido.
12. P3 de documentacao contraditoria.

Se algum item for grande demais para terminar com seguranca em uma unica rodada, conclua primeiro os P1 e deixe um TODO tecnico claro no resumo final, mas nao pare antes de tentar corrigir os riscos principais.

## Criterios tecnicos de qualidade

- Toda mudanca comportamental deve ter teste automatizado quando o comportamento for testavel sem browser real.
- Use funcoes puras para transformar estado antes de persistir.
- Evite mutar `state` antes de confirmar que `saveState` funcionou.
- Evite `as never` e casts amplos; se algum cast ficar, justifique pelo limite do TypeScript local.
- Evite novos singletons globais.
- Evite strings soltas para nomes de icones quando for simples centralizar.
- Nao aumente o acoplamento entre `ui`, `domain`, `persistence` e `notifications`.
- Nao adicione dependencias novas sem necessidade forte.

## Validacao obrigatoria

Antes de finalizar, rode:

```bash
npm run typecheck
npm test
npm run build
```

Se alterar build, assets, HTML ou UI principal, rode tambem:

```bash
npm run preview
```

Valide manualmente no navegador quando possivel:

- app abre sem erros de console;
- menu navega entre Home, Semana, Professores, Salas, Dispositivos, Senhas e Configuracoes;
- criar, editar, duplicar, excluir e desfazer rotina funciona;
- filtros semanais incluem dispositivos cadastrados/usados;
- icones visiveis renderizam;
- tela de senhas continua funcionando;
- export/import JSON funciona;
- reset de dados funciona;
- alertas nao mostram dados antigos apos edicao relevante.

## Entrega esperada

No final, responda com:

1. Resumo curto do que mudou.
2. Lista de arquivos principais alterados.
3. Testes/comandos executados e resultado.
4. Riscos restantes ou itens que exigem decisao do usuario.
5. Confirmacao explicita de que a funcionalidade de senhas foi preservada.

Nao inclua valores literais de credenciais no resumo final.
