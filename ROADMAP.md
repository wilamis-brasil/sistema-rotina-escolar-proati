# Roadmap

Este roadmap lista melhorias futuras para o Sistema de Rotina Escolar PROATI.

## Prioridade alta

### Content Security Policy

Adicionar uma política CSP no `index.html` e validar o build.

Motivo: reduzir impacto caso alguma mudança futura introduza risco de XSS.

### Limite para importação JSON

Adicionar verificação de tamanho antes de processar arquivos JSON importados.

Motivo: evitar travamento do navegador com arquivos grandes demais.

### Testes no CI

Incluir `npm test` no workflow do GitHub Actions (hoje o CI só roda typecheck e build).

Motivo: garantir que os testes de domínio e controller sejam executados automaticamente a cada push.

## Prioridade média

### Melhorar modo mobile

Revisar a experiência em celulares, principalmente:

- formulário de rotina;
- listas de professores;
- visualização semanal;
- botões de ação.

### Modo impressão

Criar CSS de impressão para gerar a rotina semanal em papel quando necessário.

### Aviso de privacidade na interface

Adicionar um aviso claro na tela de configurações explicando que os dados ficam no navegador.

## Prioridade baixa

### Tema escuro

Criar uma variação visual para ambientes com pouca luz.

### Backup guiado

Melhorar a experiência de exportação e importação com mensagens mais educativas.

### Tutorial para outros PROATIs

Criar um guia rápido com prints explicando como usar o sistema no dia a dia.

## Fora do escopo por enquanto

- Login e controle por usuário.
- Banco remoto e sincronização online.
- Painel administrativo.

Essas funcionalidades podem ser úteis no futuro, mas aumentam a complexidade. O foco atual é manter o projeto simples, estático e fácil de publicar.

## Concluído

- ✅ Workflow automático de deploy no GitHub Pages (`.github/workflows/pages.yml`).
