# HoraCerta Signature

Identidade aplicada ao aplicativo: verde floresta, superfícies claras e detalhes em dourado, com aparência escura opcional. Geist e IBM Plex Mono são servidas pelo próprio aplicativo por `next/font`.

- `app/globals.css` concentra os tokens de cor e seus equivalentes escuros; `app/signature.css` aplica a identidade à navegação e aos componentes compartilhados.
- O menu compacto preserva o acesso a todas as áreas pelo botão Recursos, pelo menu expandido e pela busca. As permissões continuam definidas pelo perfil conectado.
- O quadro usa a resposta autorizada de `/api/operations`. Preparar reúne OS abertas; Retorno reúne viagens abertas; Conferir reúne atendimentos vencidos e encerrados com pendências. Ausência de horas só é apontada para OS concluídas.
- Selecionar um cartão altera apenas a mesa de leitura. Os botões abrem a OS correspondente; criar uma OS usa o formulário e a API existentes. Nenhuma conferência física é marcada pelo quadro.
- Busca, lista e filtro usam o conjunto completo. A rolagem das colunas no PC mantém a mesa próxima sem remover atendimentos. No celular as etapas ficam empilhadas.
- Falha ao carregar operações mantém o estado não verificado; conferência dos pontos e fechamento mensal permanecem no painel.

## Verificação

`npm run verify` executa lint, tipos, testes e build. O build também confere as folhas de estilos efetivamente vinculadas ao HTML, incluindo a posição do link de salto, para detectar artefatos CSS incompletos ou antigos. `npm run test:isolated` exercita regras e permissões em bancos descartáveis.

Conferência visual realizada em PC e celular, nos dois temas: navegação completa, busca de OS e colaboradores, quadro/lista, mesa abrindo a OS exata, nova OS, formulário amplo, relatórios e catálogo de checklists. Sessões reais de colaborador e coordenador foram verificadas somente na homologação local.

Para reverter a apresentação, restaurar o commit anterior à implantação Signature e republicar. Esta entrega não contém migração de banco nem recálculo de registros históricos.
