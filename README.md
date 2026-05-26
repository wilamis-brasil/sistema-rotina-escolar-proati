# Sistema de Rotina Escolar PROATI

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-build-646cff?style=flat-square&logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/testes-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-publicado-222?style=flat-square&logo=github&logoColor=white)
![Local First](https://img.shields.io/badge/dados-localStorage-informational?style=flat-square)
![Sem Backend](https://img.shields.io/badge/backend-nenhum-success?style=flat-square)

Ferramenta web para PROATIs de escolas públicas organizarem a rotina de equipamentos — retiradas, devoluções, manutenção e notificações de horário — sem precisar de servidor, cadastro ou internet obrigatória.

**[→ Abrir o sistema publicado](https://wilamis-brasil.github.io/sistema-rotina-escolar-proati/)**

---

## Por que esse projeto existe

Na escola pública, o PROATI controla notebooks, chromebooks, tablets e headsets compartilhados entre professores e turmas ao longo da semana. Parece simples — até envolver múltiplos horários, salas e dispositivos no mesmo dia. Aí a memória, o papel e o grupo de mensagens deixam de funcionar.

Problemas reais antes desse sistema:

- esquecer que um professor vai retirar equipamento às 9h;
- não saber qual turma está com qual dispositivo agora;
- não ter onde registrar que um chromebook específico está com defeito aberto;
- não receber aviso quando um horário de devolução está chegando.

Este projeto nasceu dessa rotina real. Não é um exercício de CRUD — é uma ferramenta que eu mesmo uso.

---

## O que o sistema faz

**Rotina semanal**
- Cadastro por dia útil com horário de início e fim, professor, sala, dispositivos e observações.
- Visualização do dia atual com destaque inteligente ("hoje") e visualização semanal.
- Ordenação por dia, horário, professor, sala ou dispositivo. Filtro textual em tempo real.
- Edição, duplicação e exclusão com desfazer.

**Notificações internas**
- Popups automáticos: aviso antecipado (configurável), início e término da retirada.
- Agrupamento de notificações próximas para não poluir a tela.
- Snooze por item. Som configurável ou silencioso.
- Log persistido de notificações vistas, adiadas e ignoradas.
- Configuração global com override por rotina individual.

**Manutenção de equipamentos**
- Registro de ocorrências com 10 status: com problema, em análise, aguardando chamado, chamado aberto, em manutenção, aguardando peça, resolvido, sem conserto, descartado, entre outros.
- Prioridade: baixa, média, alta, urgente.
- Histórico automático de mudanças de status.
- Campos para número de chamado, contato responsável e ações tomadas.
- Exportação e importação separada dos registros de manutenção.

**Outros**
- Catálogos de professores, salas/turmas (com contagem de alunos) e dispositivos.
- Editar um item do catálogo reflete automaticamente em todas as rotinas vinculadas.
- Exportação e importação JSON com validação via Zod.
- Migração automática de dados salvos (schema v8, compatível com chaves legadas).

---

## Por que essa stack

| Tecnologia | Motivo da escolha |
|---|---|
| **TypeScript estrito** | O modelo de dados tem muitos estados e relacionamentos; TS elimina erros de manutenção sem custo de runtime. |
| **Vite** | Build estático rápido, caminhos relativos com `base: "./"`, compatível com GitHub Pages sem servidor. |
| **Zod** | Valida e normaliza JSON nos pontos de entrada (importação, formulários) — onde dados externos chegam ao estado local. |
| **DOM API (sem React)** | A app tem tamanho gerenciável; adicionar um framework aumentaria complexidade sem benefício real. |
| **localStorage** | Atende ao requisito de funcionar sem backend; os dados ficam privados no dispositivo do usuário. |
| **Lucide Icons** | SVGs consistentes, sem CDN obrigatória em runtime. |
| **Vitest** | Testes de domínio e controller sem overhead de configuração. |

---

## Destaques Importantes

| O que demonstra | Como aparece no projeto |
|---|---|
| **Entendimento do problema** | O sistema foi desenhado a partir de uma necessidade operacional real, não de uma especificação genérica. |
| **Modelagem de domínio** | Tipos explícitos para rotina, manutenção (10 status, histórico, prioridade) e notificação; schema versionado (v8) com migração de chaves legadas do `localStorage`. |
| **Validação de dados** | Zod nos pontos de entrada; `textContent` / DOM API em vez de `innerHTML` para dados do usuário; confirmação antes de reset ou importação. |
| **Lógica não trivial** | Engine de planejamento de notificações: agrupamento por janela de tempo, cálculo de lead, detecção de overdue, snooze e log de status persistido. |
| **Arquitetura em camadas** | Separação real entre domínio, persistência, controller e UI — responsabilidades definidas, não apenas pastas com nomes bonitos. |
| **Testes** | Domínio, controller, persistência e componentes de UI cobertos com Vitest. |
| **Deploy automatizado** | GitHub Actions faz typecheck → test → build → deploy ao GitHub Pages a cada push na `main`. |
| **Privacidade por design** | Sem backend, sem CDN obrigatória, sem dado pessoal de aluno necessário, sem segredo no repositório. |

---

## Arquitetura

```txt
src/
├── domain/        → tipos, regras de negócio, validação, migração de schema
├── persistence/   → localStorage, exportação e importação JSON
├── app/           → controller: ações centralizadas, estado em memória
└── ui/            → renderização e eventos DOM (sem framework)
```

**Fluxo de dados:**
```
Formulário / JSON importado
  → Controller (valida payload)
  → Domínio (normaliza, constrói entidade)
  → Estado em memória
  → localStorage (serializado)
  → UI re-renderizada
```

Documentação complementar:
[Arquitetura](ARCHITECTURE.md) · [GitHub Pages](GITHUB_PAGES.md) · [Privacidade](PRIVACY.md) · [Segurança](SECURITY.md) · [Roadmap](ROADMAP.md) · [Contribuição](CONTRIBUTING.md) · [Estudo de caso](PORTFOLIO_CASE_STUDY.md)

---

## Como rodar localmente

Requisitos: Node.js e npm.

```bash
git clone https://github.com/wilamis-brasil/sistema-rotina-escolar-proati.git
cd sistema-rotina-escolar-proati
npm ci
npm run dev
```

Abre em `http://localhost:5173`.

## Scripts

```bash
npm run dev        # servidor de desenvolvimento
npm test           # executa todos os testes (Vitest)
npm run typecheck  # valida TypeScript sem compilar
npm run build      # gera dist/ para deploy
npm run preview    # visualiza o build localmente
```

---

## Testes

Cobertura com **Vitest**:

- `src/domain/*.test.ts` — modelo, validação, filtros, ordenação e notificações;
- `src/app/controller.test.ts` — ações, persistência e importação de dados;
- `src/ui/*.test.ts` — visualização semanal e lógica do smart-today.

```bash
npm test
```

---

## Build e deploy

O deploy é automático: a cada push na `main`, o GitHub Actions roda typecheck → test → build → publica `dist/` no GitHub Pages.

Para gerar o build manualmente:

```bash
npm ci
npm run typecheck
npm run build
```

O build final fica em `dist/`. Mais detalhes em [GITHUB_PAGES.md](GITHUB_PAGES.md).

---

## Privacidade e segurança

Os dados ficam no navegador (`localStorage`). O app não faz requisições para servidor, não usa CDN obrigatória e não exige dados pessoais de alunos.

- JSON validado antes de persistir (Zod).
- Dados do usuário renderizados via DOM API, sem `innerHTML`.
- Sem cookies, sem login, sem segredos no repositório.

Leia [PRIVACY.md](PRIVACY.md) e [SECURITY.md](SECURITY.md) antes de usar em ambiente escolar real.

---

## Roadmap

Próximas melhorias: Content Security Policy, limite de tamanho para importação JSON, modo de impressão da rotina semanal, melhorias mobile, tutorial visual para outros PROATIs.

Veja o contexto completo em [ROADMAP.md](ROADMAP.md).

---

## Licença

MIT — veja [LICENSE](LICENSE).
