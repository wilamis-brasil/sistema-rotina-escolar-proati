# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

O formato segue, de forma simplificada, [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adota versionamento semântico quando aplicável.

## [Unreleased]

### Removido
- Painel "Configurações locais" deixou de envolver os controles de
  exportar/importar/apagar em `<form id="settings-form">`. O botão
  "Salvar configurações" não tinha efeito (apenas `event.preventDefault()`)
  e foi removido junto com o elemento `<form>` e a referência
  `refs.settingsForm`. Os controles continuam funcionando normalmente
  como botões individuais com `addEventListener("click", ...)`.

### Corrigido
- `URL.revokeObjectURL()` agora é deferido com `setTimeout(..., 0)` após
  `link.click()` nas exportações JSON de Configurações e nas exportações
  CSV/JSON de Manutenção. Evita downloads vazios em navegadores que
  iniciam o download de blob fora da call stack atual (notadamente Firefox).
- Importação de dados em Configurações deixou de renderizar como
  sucesso quando o JSON é inválido — `onImported()` só é chamado em
  `result.ok`.
- `describeMaintenanceChanges` não gera mais a linha redundante
  "Marcado como resolvido." quando o status muda para `resolvido`.
- `markAllNotificationsAsSeen` perdeu código morto que mantinha um
  `Set` local sem efeito.
- Nome do arquivo de exportação geral passou de `kickoff-proati-*.json`
  para `sistema-rotina-escolar-proati-*.json`. A chave legada de
  `localStorage` (`kickoff-proati-state-v1`) permanece em
  `LEGACY_STORAGE_KEYS` para compatibilidade.

### Manutenção
- Import de `../dom` em `src/ui/routines/routine-form.ts` movido para o
  bloco de imports no topo do arquivo.
