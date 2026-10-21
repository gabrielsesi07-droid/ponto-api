# HoraCerta Signature

Identidade aplicada ao aplicativo: verde floresta, superfícies claras e detalhes em dourado, com aparência escura opcional. Geist e IBM Plex Mono são servidas pelo próprio aplicativo por `next/font`.

- `app/globals.css` concentra os tokens de cor e seus equivalentes escuros; `app/signature.css` aplica a identidade à navegação e aos componentes compartilhados.
- O menu compacto preserva o acesso a todas as áreas pelo botão Recursos, pelo menu expandido e pela busca. As permissões continuam definidas pelo perfil conectado.
- O quadro usa a resposta autorizada de `/api/operations`. Preparar reúne OS abertas; Retorno reúne viagens abertas; Conferir reúne atendimentos vencidos e encerrados com pendências. Ausência de horas só é apontada para OS concluídas.
- Selecionar um cartão altera apenas a mesa de leitura. Os botões abrem a OS correspondente; criar uma OS usa o formulário e a API existentes. Nenhuma conferência física é marcada pelo quadro.
- Busca, lista e filtro usam o conjunto completo. A rolagem das colunas no PC mantém a mesa próxima sem remover atendimentos. No celular as etapas ficam empilhadas.
- Falha ao carregar operações mantém o estado não verificado; conferência dos pontos e fechamento mensal permanecem no painel.
- A OS e o formulário de horas usam cabeçalho Signature e ações fixas, com rolagem no conteúdo. No PC, atendimento e horários ficam lado a lado; no celular os campos se empilham e o calendário se ajusta à largura. A edição do número oficial da OS fica recolhida até ser solicitada. As mudanças de apresentação preservam os formulários, validações e permissões existentes.

## Documentos e exportações

PDFs de jornada e planilhas usam a paleta clara Signature, independentemente do tema escolhido no aplicativo. As cores dos dois formatos ficam em `lib/export-document.ts`; período e emissão usam a apresentação brasileira, com horário de Brasília.

- O PDF agrupa campos relacionados em colunas legíveis, repete o cabeçalho nas páginas seguintes e inclui número de página. Faixas e observações opcionais ficam em um detalhamento com referências para os lançamentos correspondentes.
- O Excel mantém a tabela na aba Lançamentos, com filtros, identificação e cabeçalhos congelados. Datas, horários, durações e valores são células tipadas. Durações usam `[h]` para somar acima de 24 horas. Textos que ultrapassam a altura permitida pelo Excel também são apresentados em partes na aba Detalhes. As configurações de impressão repetem a identificação em tabelas largas.
- Data e colaborador continuam obrigatórios. Os resumos respeitam as seções selecionadas: horas só aparecem quando solicitadas. Estimativas financeiras e a moeda de cada registro exigem seleção explícita; valor-hora ausente continua sem estimativa.
- CSV mantém a estrutura tabular com BOM UTF-8, separador `;`, escape de aspas e proteção contra fórmulas em textos. O formato não comporta estilos visuais.
- A impressão dos checklists usa folha A4, cabeçalho Signature, metadados, ida e retorno, observações e campos manuais para responsáveis. Alertas de pendência, dispensa e documento obsoleto permanecem visíveis. A consulta continua exigindo acesso à OS.
- PDFs anexados às OS e documentos da biblioteca são os arquivos originais recebidos. Sua diagramação e seu conteúdo não são reescritos.

`createReportDocument` gera o arquivo sem acionar o navegador; `exportReport` faz o download. Isso permite testar os mesmos arquivos usados pelo aplicativo. As suítes de exportação verificam seleção, privacidade, moedas históricas, células tipadas, textos longos, paginação e proteção do CSV.

## Verificação

`npm run verify` executa lint, tipos, testes, build e a verificação das folhas de estilos efetivamente vinculadas ao HTML, incluindo a posição do link de salto. Depois da publicação, `npm run verify:built-styles -- --url=https://ponto-api-gold.vercel.app` confere o HTML e os estilos públicos do site, comparando-os com as classes autorais da versão publicada. Isso detecta artefatos CSS incompletos ou antigos sem depender dos diretórios internos da hospedagem. `npm run test:isolated` exercita regras e permissões em bancos descartáveis.

Conferência visual realizada em PC e celular, nos dois temas: navegação completa, busca de OS e colaboradores, quadro/lista, mesa abrindo a OS exata, nova OS, formulário amplo, relatórios e catálogo de checklists. Sessões reais de colaborador e coordenador foram verificadas somente na homologação local.

Para reverter a apresentação, restaurar o commit anterior à implantação Signature e republicar. Esta entrega não contém migração de banco nem recálculo de registros históricos.
