# Estudo de Caso: Sistema de Rotina Escolar PROATI

Este documento apresenta o projeto como estudo de caso de portfólio, com foco em entrevistas técnicas e análise de currículo.

## Contexto

O projeto foi criado por um PROATI, estagiário de TI em escola pública, para resolver uma necessidade real do trabalho: organizar a rotina de uso de equipamentos compartilhados.

Em uma escola, o PROATI pode precisar lidar com:

- professores pedindo equipamentos em horários diferentes;
- salas e turmas usando dispositivos ao longo do dia;
- necessidade de lembrar retiradas e devoluções;
- atendimentos paralelos de suporte;
- ausência de sistemas internos simples para esse fluxo.

O problema não é apenas técnico. É operacional.

## Problema

A rotina antes do sistema podia depender de:

- papel;
- memória;
- mensagens soltas;
- planilhas improvisadas;
- combinados verbais;
- alarmes configurados manualmente.

Isso gera risco de atraso, esquecimento e retrabalho.

## Solução

Foi criado um app web estático para registrar e visualizar a rotina PROATI.

Principais decisões:

- rodar no navegador;
- salvar dados localmente;
- funcionar sem backend;
- ser publicável no GitHub Pages;
- usar TypeScript para reduzir erro de manutenção;
- separar domínio, persistência e interface;
- preservar importação e exportação JSON.

## Decisões Técnicas

### Vite e TypeScript

Vite foi escolhido para entregar build estático simples e rápido. TypeScript foi usado para tornar o modelo de dados mais explícito e reduzir erros em regras de negócio.

### DOM API em vez de framework pesado

A aplicação não exige um framework complexo. A escolha por DOM API mantém o projeto menor, direto e compatível com o objetivo de simplicidade.

### localStorage

O `localStorage` atende ao requisito de funcionar sem backend. A decisão reduz custo e complexidade, mas exige cuidado com privacidade.

### Zod

Zod entra no limite de validação e normalização de dados, especialmente para importação JSON e estado salvo no navegador.

## Competências Demonstradas

| Área | Evidência |
| --- | --- |
| Produto | O projeto resolve uma dor real do ambiente escolar. |
| Frontend | Interface funcional com HTML, CSS, TypeScript e DOM API. |
| Arquitetura | Separação clara entre domínio, persistência, UI e notificações. |
| Dados | Compatibilidade com storage key legada e importação/exportação JSON. |
| Segurança | Sem backend desnecessário, sem segredos e com validação antes de persistir. |
| Deploy | Compatível com GitHub Pages e build estático. |
| Comunicação | Documentação voltada a uso, manutenção e análise técnica. |

## Resultado

O resultado é uma ferramenta prática para o dia a dia de um PROATI e, ao mesmo tempo, um projeto de portfólio que mostra capacidade de:

- entender o usuário;
- desenhar uma solução proporcional;
- tomar decisões técnicas simples;
- escrever código organizado;
- pensar em dados e privacidade;
- preparar um projeto para publicação.

## Como Eu Explicaria Em Uma Entrevista

> Eu criei um sistema para organizar a rotina de retirada de equipamentos na escola onde atuo como PROATI. Em vez de depender de papel ou memória, o app permite cadastrar professores, salas, dispositivos e horários, com alertas no navegador. Escolhi uma arquitetura estática com Vite e TypeScript para publicar facilmente no GitHub Pages, sem backend. Também me preocupei com persistência local, importação/exportação JSON, validação de dados e privacidade.

## Pontos de Evolução

Se o projeto crescer, próximos passos técnicos seriam:

- CI/CD com GitHub Actions;
- CodeQL no GitHub;
- testes automatizados reintroduzidos no repositório;
- Content Security Policy;
- modo PWA;
- impressão da rotina semanal;
- UX mobile mais refinada.

