# Publicacao no GitHub Pages

Este projeto e compativel com GitHub Pages, mas precisa ser publicado a partir do build gerado pelo Vite.

## Importante

Nao publique os arquivos fonte diretamente.

O arquivo `index.html` de desenvolvimento carrega:

```html
<script type="module" src="./src/main.ts"></script>
```

Isso funciona com Vite durante o desenvolvimento, mas o GitHub Pages nao compila TypeScript sozinho. Para publicar, gere primeiro a pasta `dist/`.

## Gerar build

Na raiz do projeto:

```bash
npm ci
npm run build
```

Saida esperada:

```txt
dist/
```

## O que vai para o Pages

Publique o conteudo de:

```txt
dist/
```

Essa pasta contem JavaScript compilado, CSS, imagens e audio prontos para navegador.

## Configuracao do Vite

O projeto usa:

```ts
base: "./"
```

Isso deixa os caminhos relativos e facilita publicar em subpastas do GitHub Pages.

## Opcoes de deploy

### Opcao 1: GitHub Actions

Crie um workflow que execute:

```bash
npm ci
npm run build
```

Depois publique `dist/` como artefato do GitHub Pages.

### Opcao 2: branch `gh-pages`

Outra opcao e gerar o build localmente e publicar somente a pasta `dist/` em uma branch separada chamada `gh-pages`.

### Opcao 3: deploy manual

Tambem e possivel subir os arquivos de `dist/` manualmente, mas essa opcao e mais propensa a erro.

## Checklist antes de publicar

- Rodar `npm ci`.
- Rodar `npm run typecheck`.
- Rodar `npm run build`.
- Testar com `npm run preview`.
- Confirmar que logo e alarme carregam.
- Confirmar que importacao/exportacao JSON funciona.
- Confirmar que os dados continuam salvos em `localStorage`.

## Dados locais no Pages

Os dados ficam no navegador do usuario e sao separados por origem.

Se o site for publicado em:

```txt
https://usuario.github.io/repositorio/
```

o `localStorage` pertence a origem:

```txt
https://usuario.github.io
```

Para uso mais isolado em escola, prefira um dominio ou subdominio proprio.

