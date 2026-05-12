# Contribuindo

Este projeto e um sistema simples para rotina PROATI. A prioridade e manter a ferramenta facil de usar, facil de publicar e segura para dados locais.

## Antes de alterar

Confira se a mudanca:

- ajuda a rotina real de um PROATI;
- nao exige backend sem necessidade;
- nao quebra o GitHub Pages;
- nao apaga dados ja salvos no navegador;
- nao muda a chave `sistema-rotina-escolar-proati-state-v1` sem migracao;
- nao adiciona dependencia desnecessaria.

## Rodar localmente

```bash
npm ci
npm run dev
```

## Validar antes de enviar

```bash
npm run typecheck
npm run build
```

## Padroes do projeto

- TypeScript estrito.
- UI com DOM API.
- Dados persistidos no navegador.
- Sem backend.
- Sem CDN obrigatoria em runtime.
- Build estatico via Vite.

## Areas do codigo

```txt
src/domain         regras de negocio e modelo de dados
src/persistence    localStorage, importacao e exportacao
src/app            controller da aplicacao
src/notifications  alertas e alarme
src/ui             renderizacao e interacao DOM
```

## Seguranca

Nao use `innerHTML` para renderizar dados digitados pelo usuario ou vindos de JSON.

Prefira sempre:

- `textContent`;
- `createTextNode`;
- validacao antes de persistir;
- mensagens de erro claras;
- confirmacao antes de reset/importacao.

## Ideias boas para contribuir

- Melhorar acessibilidade.
- Criar workflow de deploy para GitHub Pages.
- Adicionar limite de tamanho para importacao JSON.
- Adicionar modo de impressao da rotina semanal.
- Melhorar experiencia mobile.
- Criar tutorial visual para outros PROATIs.

