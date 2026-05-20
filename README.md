# Sistema de Rotina Escolar PROATI

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-static_build-646cff?style=flat-square&logo=vite&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-ready-222?style=flat-square&logo=github&logoColor=white)
![No Backend](https://img.shields.io/badge/backend-none-success?style=flat-square)
![Local First](https://img.shields.io/badge/data-localStorage-informational?style=flat-square)

Aplicação web estática para ajudar PROATIs e estagiários de TI de escolas públicas a organizar a rotina de retirada, uso e devolução de equipamentos.

Este projeto foi criado a partir de uma dor real de trabalho: controlar horários, professores, salas, turmas e dispositivos compartilhados sem depender de papel, memória, planilhas improvisadas ou servidor externo.

## Site Online

> **Acesse o sistema publicado:** [wilamis-brasil.github.io/sistema-rotina-escolar-proati](https://wilamis-brasil.github.io/sistema-rotina-escolar-proati/)

## Visão Geral

O Sistema de Rotina Escolar PROATI é um site local-first, compatível com GitHub Pages, que permite registrar e consultar rotinas semanais de uso de equipamentos escolares.

Ele foi pensado para o cotidiano de um PROATI: uma pessoa que precisa atender chamados, apoiar professores, organizar dispositivos, lidar com salas diferentes e ainda manter a rotina funcionando sem perder horário.

## Demonstração

A versão pública fica disponível em:

[https://wilamis-brasil.github.io/sistema-rotina-escolar-proati/](https://wilamis-brasil.github.io/sistema-rotina-escolar-proati/)

Para rodar localmente:

```bash
npm ci
npm run dev
```

## Por Que Este Projeto Existe

Na rotina escolar, o controle de equipamentos pode parecer simples até começar a envolver vários professores, turmas, horários e dispositivos no mesmo dia.

Problemas comuns:

- esquecer uma retirada;
- perder o horário de devolução;
- não saber qual turma está usando determinado equipamento;
- depender de bilhetes, grupos de mensagem ou memória;
- repetir o mesmo cadastro manualmente;
- não ter um backup simples da rotina.

Este projeto resolve esse problema com uma ferramenta simples, visual e feita para o contexto real da escola.

## Funcionalidades

### Rotina Escolar

- Cadastro de rotinas por dia útil.
- Visualização da rotina do dia.
- Visualização semanal.
- Edição, duplicação e exclusão de rotinas.
- Desfazer exclusão recente.
- Ordenação por dia, horário, professor, sala ou dispositivo.
- Filtro textual por professor, sala, horário, dispositivo ou observação.

### Cadastros de Apoio

- Professores.
- Salas e turmas.
- Quantidade padrão de alunos por sala.
- Dispositivos disponíveis.

### Dados

- Persistência em `localStorage`.
- Exportação JSON.
- Importação JSON com validação.
- Reset dos dados locais.
- Chave do `localStorage`:

```txt
sistema-rotina-escolar-proati-state-v1
```

## Destaques Técnicos Para Entrevistadores

Este projeto demonstra mais do que uma interface bonita. Ele mostra decisões práticas de engenharia aplicadas a um problema real.

| Competência | Como aparece no projeto |
| --- | --- |
| Entendimento de negócio | A aplicação foi desenhada a partir da rotina real de um PROATI em escola pública. |
| Frontend moderno | Vite, TypeScript estrito, módulos separados e build estático. |
| Arquitetura simples | Separação entre domínio, persistência, controller e UI. |
| Preservação de dados | Migração de dados e normalização do estado local. |
| Segurança básica | Sem backend, sem segredo no código, validação de JSON e renderização segura via DOM API. |
| Deploy barato | Compatível com GitHub Pages, sem servidor próprio e sem banco remoto. |
| Produto real | Foco em produtividade, rotina operacional e usabilidade para ambiente escolar. |

## Stack

- TypeScript
- Vite
- HTML
- CSS
- DOM API
- Zod
- Lucide Icons
- GitHub Pages
- localStorage

O projeto não usa backend, autenticação, banco remoto ou servidor próprio.

## Arquitetura

```txt
src/
+-- app/             coordenação do estado e ações da aplicação
+-- domain/          regras de negócio, tipos e normalização de dados
+-- persistence/     localStorage, importação e exportação
+-- ui/              renderização e eventos de interface
```

Documentação complementar:

- [Arquitetura](ARCHITECTURE.md)
- [Estudo de caso para portfólio](PORTFOLIO_CASE_STUDY.md)
- [Deploy no GitHub Pages](GITHUB_PAGES.md)
- [Privacidade e dados locais](PRIVACY.md)
- [Segurança](SECURITY.md)
- [Roadmap](ROADMAP.md)
- [Contribuição](CONTRIBUTING.md)

## Estrutura do Repositório

```txt
.
+-- index.html
+-- assets/
|   +-- css/
|   +-- img/
+-- src/
|   +-- app/
|   +-- domain/
|   +-- persistence/
|   +-- ui/
+-- public/
+-- ARCHITECTURE.md
+-- GITHUB_PAGES.md
+-- package.json
+-- tsconfig.json
+-- vite.config.ts
```

## Rodando Localmente

Requisitos:

- Node.js
- npm

Instale as dependências:

```bash
npm ci
```

Inicie o servidor local:

```bash
npm run dev
```

Abra a URL exibida pelo Vite. Normalmente:

```txt
http://localhost:5173
```

## Scripts

```bash
npm run dev        # ambiente de desenvolvimento
npm run build      # gera a versão estática em dist/
npm run preview    # visualiza o build localmente
npm run typecheck  # valida TypeScript
```

## Build

```bash
npm ci
npm run build
```

O build final será gerado em:

```txt
dist/
```

Essa é a pasta que deve ser publicada no GitHub Pages.

## GitHub Pages

Este projeto é compatível com GitHub Pages, mas o Pages deve publicar o build gerado pelo Vite.

Fluxo correto:

```bash
npm ci
npm run build
```

Depois publique o conteúdo de:

```txt
dist/
```

Mais detalhes em [GITHUB_PAGES.md](GITHUB_PAGES.md).

## Privacidade

Os dados ficam no navegador do usuário, usando `localStorage`. O app não envia dados para servidor.

Mesmo assim, a rotina escolar pode conter informações sensíveis de contexto, como nomes de professores, salas, horários e observações. Por isso, o sistema evita backend e mantém os dados sob controle local.

Leia [PRIVACY.md](PRIVACY.md) antes de usar em ambiente real.

## Segurança

Resumo das decisões atuais:

- sem backend;
- sem banco remoto;
- sem autenticação;
- sem segredo no repositório;
- sem CDN obrigatória em runtime para o código principal;
- validação de JSON antes de persistir;
- renderização de dados via DOM API, sem `innerHTML` para dados do usuário.

Notas e melhorias recomendadas estão em [SECURITY.md](SECURITY.md).

## Roadmap

Próximas melhorias planejadas:

- workflow automático de deploy no GitHub Pages;
- limite de tamanho para importação JSON;
- Content Security Policy;
- modo de impressão da rotina semanal;
- melhorias mobile;
- tutorial visual para outros PROATIs.

Veja [ROADMAP.md](ROADMAP.md).

## Valor Como Portfólio

Este projeto demonstra que eu consigo:

- identificar um problema real no ambiente onde trabalho;
- transformar uma rotina manual em uma ferramenta web;
- escolher uma stack simples e adequada;
- pensar em deploy, privacidade e manutenção;
- organizar código em módulos;
- entregar algo útil para outras pessoas na mesma função.

É um projeto de portfólio porque mostra tecnologia aplicada a um problema concreto, não apenas uma tela genérica.

## Licença

Este projeto é distribuído sob a licença MIT.

Veja o arquivo [LICENSE](LICENSE) para os termos completos.
