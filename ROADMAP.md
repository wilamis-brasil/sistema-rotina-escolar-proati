# Roadmap

Este roadmap lista melhorias futuras para o Sistema de Rotina Escolar PROATI.

## Prioridade alta

### Deploy automatico no GitHub Pages

Criar um workflow do GitHub Actions para:

- instalar dependencias;
- rodar typecheck;
- gerar build;
- publicar `dist/` no GitHub Pages.

### Limite para importacao JSON

Adicionar limite de tamanho antes de ler arquivos JSON.

Motivo: evitar travamento do navegador com arquivos grandes demais.

### Content Security Policy

Adicionar uma politica CSP no `index.html` e testar o build.

Motivo: reduzir impacto caso alguma mudanca futura introduza risco de XSS.

## Prioridade media

### Melhorar modo mobile

Revisar a experiencia em celulares, principalmente:

- formulario de rotina;
- listas de professores;
- visualizacao semanal;
- botoes de acao.

### Modo impressao

Criar CSS de impressao para gerar uma rotina semanal em papel quando necessario.

### Aviso de privacidade na interface

Adicionar um aviso claro explicando que os dados ficam no navegador.

## Prioridade baixa

### Tema escuro

Criar uma variacao visual para ambientes com pouca luz.

### Backup guiado

Melhorar a experiencia de exportacao e importacao com mensagens mais educativas.

### Tutorial para outros PROATIs

Criar um guia rapido com prints explicando como usar o sistema no dia a dia.

## Fora do escopo por enquanto

- Login.
- Banco remoto.
- Sincronizacao online.
- Painel administrativo.
- Controle por usuario.

Essas ideias podem ser uteis no futuro, mas aumentam a complexidade. O foco atual e manter o projeto simples, estatico e facil de publicar.

