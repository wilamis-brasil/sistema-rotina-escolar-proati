# Seguranca

Este projeto e um app estatico para GitHub Pages. Mesmo sem backend, seguranca ainda importa porque a rotina escolar pode conter dados sensiveis.

## Modelo de ameaca

O sistema nao possui:

- login;
- senha;
- banco remoto;
- API propria;
- servidor de aplicacao;
- cookies de sessao;
- upload para servidor.

As principais superficies sao:

- dados no `localStorage`;
- importacao de JSON;
- exportacao de JSON;
- renderizacao de dados digitados pelo usuario;
- notificacoes do navegador;
- audio local de alarme;
- supply chain npm.

## Regras de seguranca do projeto

- Nao renderizar dados do usuario com `innerHTML`.
- Validar JSON antes de salvar.
- Confirmar com o usuario antes de importar dados.
- Confirmar com o usuario antes de apagar dados.
- Nao adicionar CDN obrigatoria para codigo critico.
- Nao colocar segredos no codigo.
- Nao armazenar senhas ou dados pessoais desnecessarios.

## Dados locais

Os dados ficam em:

```txt
localStorage
```

Chave:

```txt
kickoff-proati-state-v1
```

Isso e suficiente para um app local de rotina, mas nao deve ser tratado como cofre seguro.

## Recomendacoes para uso real

- Usar HTTPS.
- Preferir dominio/subdominio proprio.
- Evitar dados sensiveis de alunos nas observacoes.
- Exportar JSON apenas quando necessario.
- Guardar arquivos exportados com cuidado.
- Limpar dados do navegador em computadores compartilhados quando apropriado.

## Antes de publicar

Rode:

```bash
npm ci
npm run typecheck
npm run build
npm audit --audit-level=low
```

## Melhorias futuras recomendadas

- Content Security Policy.
- Limite de tamanho para importacao JSON.
- Workflow de CodeQL no GitHub.
- Workflow automatizado de deploy para GitHub Pages.
- Aviso visivel de privacidade dentro da tela de configuracoes.

