# Estudo de Caso: Sistema de Rotina Escolar PROATI

Este documento complementa o README com foco em entrevista técnica — explica as decisões de design, as trocas feitas e como eu explicaria o projeto em conversa.

---

## Contexto

Sou PROATI (estagiário de TI) em escola pública. Uma das principais responsabilidades é controlar o uso de equipamentos compartilhados: notebooks, chromebooks, tablets e headsets que professores retiram e devolvem ao longo da semana.

Antes desse sistema, o controle dependia de papel, memória, grupos de mensagem e planilhas improvisadas. O risco era real: esquecer uma retirada, não saber onde estava um equipamento, não ter histórico quando um dispositivo apresentava defeito repetido.

O sistema foi construído para resolver isso — não para ser um projeto de portfolio, mas para ser usado de verdade. O portfolio é consequência.

---

## Decisões técnicas e por que as tomei

### Sem backend

Não há necessidade comprovada de servidor. A ferramenta é pessoal, local e opera sem internet obrigatória. Adicionar backend aumentaria custo, complexidade e superfície de ataque sem entregar nada que o `localStorage` já não resolve para esse caso de uso.

Se o uso escalar (múltiplos usuários, sincronização entre dispositivos), backend faria sentido. Por enquanto, não.

### TypeScript estrito em vez de JavaScript

O modelo de dados é complexo: rotinas com múltiplos campos, manutenção com 10 status, notificações com 3 tipos e log de status, schema versionado para migração. TypeScript evita erros de manutenção sem custo de runtime — especialmente útil quando o estado do `localStorage` precisa sobreviver a versões futuras do código.

### DOM API em vez de React ou Vue

A app tem escopo definido. React aumentaria o bundle, adicionaria complexidade de estado e introduziria uma camada de abstração que não resolve nenhum problema real no tamanho atual. Se a app crescer para múltiplos usuários ou sincronização, revisitaria essa decisão.

### Zod nos pontos de entrada

O `localStorage` pode conter dados salvos por versões anteriores do código. JSON importado pelo usuário pode estar malformado ou corrompido. Zod entra exatamente nesses dois pontos — não em todo o código, apenas onde dados externos entram no estado da aplicação.

### Schema versionado com migração

O estado local tem `schemaVersion: 8`. Toda vez que o modelo de dados muda de forma incompatível, o código sabe migrar o estado salvo para a versão atual. Também há suporte a uma chave legada de `localStorage` (`kickoff-proati-state-v1`) para não perder dados de instalações anteriores.

Essa foi uma decisão não óbvia para um projeto pessoal — mas é o tipo de coisa que distingue um app que funciona de um que quebra silenciosamente após uma atualização.

### Engine de notificações própria

O sistema calcula automaticamente quando disparar notificações com base no horário de início de cada rotina. Há agrupamento de notificações próximas (janela configurável em minutos), detecção de notificações atrasadas ("overdue"), snooze com tempo configurável e log persistido de status (vista, adiada, ignorada).

Tudo isso sem Push API nem servidor — funciona enquanto a aba está aberta.

---

## Competências demonstradas por módulo

| Módulo | O que mostra |
|---|---|
| Rotina semanal | CRUD completo com validação, desfazer exclusão, filtros e ordenação. |
| Notificações | Lógica de negócio não trivial: planejamento, agrupamento, snooze, log, overdue. |
| Manutenção | Modelagem de domínio: workflow de status, histórico automático, prioridade, exportação separada. |
| Persistência | Schema versionado, migração de dados legados, importação com validação Zod. |
| Catálogos | Consistência referencial: editar um professor atualiza todas as rotinas vinculadas. |
| Testes | Domínio, controller e UI cobertos com Vitest. |
| Deploy | GitHub Actions: typecheck → build → GitHub Pages automático. |

---

## Como eu explicaria em uma entrevista

> Criei um sistema para organizar a rotina de equipamentos na escola onde trabalho como PROATI. Em vez de depender de papel ou memória, o app permite cadastrar professores, salas, dispositivos e horários, receber notificações antes de cada retirada, e registrar ocorrências de manutenção com histórico de status.
>
> Escolhi uma arquitetura estática com Vite e TypeScript porque o projeto não precisa de servidor — os dados ficam no navegador, o deploy é no GitHub Pages e funciona sem internet obrigatória. Usei Zod só nos pontos de entrada, onde dados externos chegam, e separei o código em domain, persistence, app e ui com responsabilidades bem definidas. A parte mais interessante tecnicamente foi o sistema de notificações: precisei calcular horários de disparo, agrupar notificações próximas, detectar atrasos e persistir o log de status no localStorage.

---

## O que eu faria diferente hoje

- Adicionaria Content Security Policy desde o início.
- Colocaria `npm test` no workflow de CI (hoje o Actions só roda typecheck e build).
- Investiria mais cedo na experiência mobile — o desktop-first foi uma escolha de prazo, não de design.

---

## Próximos passos técnicos

- Content Security Policy no `index.html`.
- Testes no CI (hoje apenas typecheck + build).
- Modo de impressão da rotina semanal.
- UX mobile mais refinada.
- Tutorial visual para outros PROATIs que queiram usar o sistema.
