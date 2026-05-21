# Privacidade e Dados Locais

Este sistema foi feito para funcionar sem backend.

Isso significa que os dados cadastrados não são enviados para nenhum servidor pelo app. Eles ficam salvos no navegador usado na escola.

## Onde os dados ficam

Os dados ficam em `localStorage`, na chave:

```txt
sistema-rotina-escolar-proati-state-v1
```

O navegador mantém esses dados entre sessões até que o usuário os apague pelo sistema ou limpe os dados do site manualmente no navegador.

## Que tipo de dado pode existir

Dependendo do uso, o sistema pode armazenar:

- nome de professor;
- sala ou turma;
- quantidade de alunos;
- horários de retirada e devolução;
- dispositivos usados;
- observações digitadas pelo usuário;
- registros de manutenção com descrição de problemas;
- credenciais de sistemas escolares (cofre de senhas local).

## O que evitar

Evite colocar nas observações e descrições:

- dados sensíveis de alunos;
- diagnósticos;
- documentos pessoais;
- telefones ou endereços;
- qualquer informação que não seja necessária para a rotina de equipamentos.

## Exportação JSON

Ao exportar os dados, o sistema gera um arquivo JSON com toda a rotina local.

Esse arquivo deve ser tratado como documento interno da escola — pode conter nomes, horários e detalhes da rotina. Guarde com cuidado e compartilhe apenas quando necessário.

## Importação JSON

Ao importar um JSON, os dados locais do navegador são substituídos após confirmação.

O sistema valida o arquivo antes de salvar, mas a origem do arquivo ainda importa. Use apenas arquivos de fontes confiáveis.

## GitHub Pages

Em GitHub Pages, o armazenamento local é separado por origem do site.

Para reduzir risco de mistura com outros projetos publicados no mesmo domínio, prefira publicar este sistema em domínio ou subdomínio próprio quando for usado em ambiente escolar real.

## Resumo

O app não envia dados para servidor, mas os dados ainda podem ser sensíveis. Use apenas as informações necessárias para organizar a rotina PROATI.
