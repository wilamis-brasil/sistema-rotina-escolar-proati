# Sistema de Rotina Escolar PROATI
<img width="1600" height="900" alt="image" src="https://github.com/user-attachments/assets/85b72399-9847-43ee-a54f-a58a61c28a3a" />



Preview: [https://wilamis-brasil.github.io/sistema-rotina-escolar-proati/](https://wilamis-brasil.github.io/sistema-rotina-escolar-proati/)

Aplicação local para organizar retirada, uso, devolução e manutenção de
equipamentos escolares.

O foco é simples: a escola consegue saber quem está usando cada equipamento,
em qual horário, em qual turma, e o que precisa de manutenção. Tudo roda no
navegador, sem servidor e sem build.

## Entrega

- Agenda do dia, com rotinas pendentes, em andamento e concluídas.
- Grade semanal por equipamento, horário, professor e turma.
- Cadastro de professores, turmas e dispositivos reutilizáveis.
- Controle de manutenção com status, prioridade, histórico e exportação CSV.
- Avisos internos para início, término e lembrete antecipado das rotinas.
- Backup e restauração por JSON.
- Exportação da agenda em `.ics` para Google, Outlook ou Apple Calendar.

## Stack

- HTML, CSS e JavaScript puro.


## Estrutura

```txt
index.html          # shell da aplicação
css/                # estilos por base, layout, componentes e features
js/
  domain/           # regras de negócio e validações
  persistence/      # localStorage, importação e exportação
  app/              # controller e fluxo de estado
  ui/               # views, eventos e helpers de DOM
tests/              # testes com node:test
```

Veja mais em: [ARCHITECTURE.md](https://github.com/wilamis-brasil/sistema-rotina-escolar-proati/blob/903ad3c81a0977cf2516e7b3aa85e61f16ec1532/ARCHITECTURE.md)

## Decisões

- Usei JavaScript puro porque o projeto precisava ser fácil (tanto para mim quanto para outros estagiários que queiram entender, modificar ou contribuir com este projeto) de publicar e
manter, sem depender de pipeline de build.
- Separei domínio, persistência e UI para reduzir acoplamento e facilitar teste.
- Mantive os dados no navegador para preservar privacidade, segurança e evitar backend
desnecessário.
- Validei importações e migrações para não quebrar dados antigos salvos pelo
usuário.

## Privacidade

Os dados ficam somente no navegador do usuário. Não há envio para servidor.

Antes de limpar o navegador ou trocar de máquina, exporte um backup pela própria
aplicação.

## Licença

[MIT](https://github.com/wilamis-brasil/sistema-rotina-escolar-proati/blob/7c48103359d6ccb1937322720c19797910be584a/LICENSE)
