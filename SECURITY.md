# Segurança

Este projeto é um app estático para GitHub Pages. Mesmo sem backend, segurança ainda importa porque a rotina escolar pode conter dados sensíveis de contexto.

## Modelo de ameaça

O sistema não possui:

- login ou senha;
- banco remoto;
- API própria;
- servidor de aplicação;
- cookies de sessão;
- upload para servidor.

As principais superfícies de risco são:

- dados no `localStorage` (acessíveis por qualquer script na mesma origem);
- importação de JSON (arquivo externo que entra no estado da aplicação);
- exportação de JSON (arquivo com dados da rotina que sai do navegador);
- renderização de dados digitados pelo usuário;
- dependências npm (supply chain).

## Regras de segurança do projeto

- Não renderizar dados do usuário com `innerHTML` — use `textContent` ou `createTextNode`.
- Validar JSON importado com Zod antes de salvar no estado.
- Confirmar com o usuário antes de importar ou apagar dados.
- Não adicionar CDN obrigatória para código crítico.
- Não colocar segredos no código ou no repositório.
- Não armazenar senhas de alunos ou dados pessoais desnecessários.

## Dados locais

Os dados ficam em:

```txt
localStorage — chave: sistema-rotina-escolar-proati-state-v1
```

Isso é suficiente para um app local de rotina, mas não deve ser usado para guardar segredos ou credenciais. Qualquer script rodando na mesma origem pode acessar esses dados.

## Recomendações para uso real

- Use HTTPS (o GitHub Pages já fornece).
- Prefira domínio ou subdomínio próprio para isolamento do `localStorage`.
- Evite dados sensíveis de alunos nas observações das rotinas.
- Exporte o JSON apenas quando necessário e guarde o arquivo com cuidado.
- Limpe os dados do navegador em computadores compartilhados quando apropriado.

## Antes de publicar uma nova versão

```bash
npm ci
npm run typecheck
npm run build
npm audit --audit-level=low
```

## Melhorias futuras recomendadas

- Content Security Policy no `index.html`.
- Limite de tamanho para importação JSON.
- Workflow de CodeQL no GitHub Actions.
- Aviso visível de privacidade na tela de configurações.
- Ampliar cobertura de testes de integração no CI.
