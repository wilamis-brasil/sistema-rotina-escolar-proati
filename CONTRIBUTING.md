# Contribuindo

Este projeto é uma ferramenta simples para rotina PROATI. A prioridade é manter o sistema fácil de usar, fácil de publicar e seguro para dados locais.

## Antes de alterar

Verifique se a mudança:

- ajuda a rotina real de um PROATI;
- não exige backend sem necessidade;
- não quebra o GitHub Pages;
- não apaga dados já salvos no navegador;
- não muda a chave `sistema-rotina-escolar-proati-state-v1` sem migração;
- não adiciona dependência desnecessária.

## Rodar localmente

```bash
npm ci
npm run dev
```

## Validar antes de enviar

```bash
npm run typecheck
npm test
npm run build
```

## Padrões do projeto

- TypeScript estrito.
- UI com DOM API (sem framework).
- Dados persistidos no navegador via `localStorage`.
- Sem backend.
- Sem CDN obrigatória em runtime.
- Build estático via Vite.

## Áreas do código

```txt
src/domain         regras de negócio, tipos, validação, migração de schema
src/persistence    localStorage, importação e exportação JSON
src/app            controller: ações centralizadas, estado em memória
src/ui             renderização e eventos DOM
```

## Segurança

Não use `innerHTML` para renderizar dados digitados pelo usuário ou vindos de JSON.

Use sempre:

- `textContent` ou `createTextNode` para texto;
- validação Zod antes de persistir;
- confirmação do usuário antes de reset ou importação;
- mensagens de erro claras.

## Ideias boas para contribuir

- Melhorar acessibilidade.
- Adicionar limite de tamanho para importação JSON.
- Adicionar modo de impressão da rotina semanal.
- Melhorar experiência mobile.
- Criar tutorial visual para outros PROATIs.
- Adicionar Content Security Policy no `index.html`.
