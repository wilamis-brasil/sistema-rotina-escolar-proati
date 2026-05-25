# Publicação no GitHub Pages

Este projeto é compatível com GitHub Pages, mas precisa ser publicado a partir do build gerado pelo Vite — não dos arquivos-fonte.

## Importante

Não publique os arquivos-fonte diretamente.

O `index.html` de desenvolvimento carrega:

```html
<script type="module" src="./src/main.ts"></script>
```

Isso funciona com Vite durante o desenvolvimento, mas o GitHub Pages não compila TypeScript. Para publicar, gere primeiro a pasta `dist/`.

## Gerar build

```bash
npm ci
npm run build
```

Saída esperada:

```txt
dist/
```

## O que vai para o Pages

Publique o conteúdo de `dist/`. Essa pasta contém JavaScript compilado, CSS e imagens prontos para o navegador.

## Configuração do Vite

O projeto usa:

```ts
base: "./"
```

Isso mantém os caminhos relativos e permite publicar em subpastas do GitHub Pages sem configuração adicional.

## Opções de deploy

### Opção 1: GitHub Actions (recomendada)

O projeto já inclui um workflow em `.github/workflows/pages.yml` que executa automaticamente a cada push na `main`:

1. `npm ci`
2. `npm run typecheck`
3. `npm run build`
4. Publica `dist/` no GitHub Pages.

### Opção 2: branch `gh-pages`

Gere o build localmente e publique somente a pasta `dist/` em uma branch separada chamada `gh-pages`.

### Opção 3: deploy manual

Também é possível subir os arquivos de `dist/` manualmente, mas essa opção é mais propensa a erro.

## Checklist antes de publicar manualmente

- Rodar `npm ci`.
- Rodar `npm run typecheck`.
- Rodar `npm run build`.
- Testar com `npm run preview`.
- Confirmar que logo e estilos carregam.
- Confirmar que importação/exportação JSON funciona.
- Confirmar que os dados continuam salvos em `localStorage`.

## Dados locais no Pages

Os dados ficam no navegador do usuário e são separados por origem.

Se o site for publicado em:

```txt
https://usuario.github.io/repositorio/
```

o `localStorage` pertence à origem:

```txt
https://usuario.github.io
```

Para uso mais isolado em escola, prefira um domínio ou subdomínio próprio.
