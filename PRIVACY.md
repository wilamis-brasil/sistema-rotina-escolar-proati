# Privacidade e Dados Locais

Este sistema foi feito para funcionar sem backend.

Isso significa que os dados cadastrados nao sao enviados para servidor pelo app. Eles ficam salvos no navegador usado pela escola.

## Onde os dados ficam

Os dados ficam em `localStorage`, na chave:

```txt
sistema-rotina-escolar-proati-state-v1
```

O navegador mantem esses dados entre sessoes, ate que o usuario apague os dados pelo sistema ou limpe os dados do site no navegador.

## Que tipo de dado pode existir

Dependendo do uso, o sistema pode armazenar:

- nome de professor;
- sala ou turma;
- quantidade de alunos;
- horarios de retirada;
- dispositivos usados;
- observacoes digitadas pelo usuario;
- configuracoes de alerta.

## O que evitar

Evite colocar nas observacoes:

- dados sensiveis de alunos;
- diagnosticos;
- documentos pessoais;
- telefones;
- enderecos;
- senhas;
- qualquer informacao que nao seja necessaria para a rotina de equipamentos.

## Exportacao JSON

Ao exportar os dados, o sistema gera um arquivo JSON com a rotina local.

Esse arquivo deve ser tratado como documento interno da escola, porque pode conter nomes, horarios e detalhes da rotina.

## Importacao JSON

Ao importar um JSON, os dados locais do navegador sao substituidos depois de confirmacao.

O sistema valida o arquivo antes de salvar, mas a origem do arquivo ainda importa. Use apenas arquivos de fontes confiaveis.

## GitHub Pages

Em GitHub Pages, o armazenamento local e separado por origem do site.

Para reduzir risco de mistura com outros projetos publicados no mesmo dominio, prefira publicar este sistema em dominio ou subdominio proprio quando for usado em ambiente escolar real.

## Resumo

O app nao envia dados para servidor, mas os dados ainda podem ser sensiveis. Use somente as informacoes necessarias para organizar a rotina PROATI.

