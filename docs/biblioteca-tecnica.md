# Biblioteca técnica privada

## Uso

O menu **Biblioteca técnica** reúne documentos e modelos, sem inventário físico, quantidade, disponibilidade ou reserva de equipamento. O catálogo não comprova que uma unidade está disponível para uma OS.

O coordenador acessa todo o material importado. Em **Modelos de equipamento**, confere os documentos de origem e valida os modelos. Em **Documentos**, abre o original, verifica revisão, informações pessoais/clientes e os vínculos sugeridos, e então libera o conteúdo para a equipe. Documentos liberados ficam acessíveis a todos os colaboradores ativos autenticados; não há segregação por cliente nesta versão. Arquivar revoga imediatamente novas consultas/downloads, mas não recolhe cópias já baixadas.

Uma OS pode selecionar modelos não arquivados, inclusive os ainda em revisão, e continuar usando o campo livre de materiais. Selecionar o modelo não libera seus documentos nem ativa checklists automaticamente. A equipe designada consulta somente os documentos liberados desses modelos dentro da OS. A biblioteca geral também permite busca no texto extraído, nome, tipo e modelo. Os documentos originais de checklist continuam como referência. A função de [checklists digitais por equipamento](checklists-equipamentos.md) acrescenta rascunhos para revisão do coordenador e cópias preenchíveis por OS, sem aprovação técnica automática.

## Importação e proveniência

1. Em computador confiável com acesso às fontes, execute `scripts/extract-library.py` com um ou mais argumentos `--source CATEGORIA CAMINHO` (`checklist`, `catalog`, `manual`) e `--output work/library`.
2. Use Python com `pypdf`, `python-docx` e `openpyxl`. O script não modifica os originais, não executa software e lê ZIPs com limites de expansão/profundidade. Nomes dentro de ZIPs são somente proveniência, nunca caminhos de extração.
3. Confira `work/library/manifest.json`: origens, SHA-256, texto por página/bloco/linha, advertências, exclusões e erros. Quatro formatos têm extração: PDF, DOCX, XLSX e TXT. DOC antigo é preservado sem extração. PDF digitalizado não recebe OCR nesta versão. Planilhas usam valores salvos, não recalculam fórmulas. Imagens, gráficos, assinaturas, caixas de texto e layout exigem o original.
4. Prepare o arquivo privado `work/library/models.json`: lista de objetos com `key`, `name`, `family`, `pattern`. O padrão é uma expressão regular aplicada ao nome dos documentos, que gera **sugestões**, nunca confirma propriedade/estoque ou compatibilidade técnica. Um modelo só é criado se houver documento não obsoleto correspondente.
5. Aplique as migrações com o procedimento normal (`db:migrate` já incorpora a biblioteca), ou `node --env-file=.env scripts/migrate-orders.mjs` em base existente.
6. Importe com `node --env-file=.env scripts/import-library.mjs work/library`. Nunca imprima nem versione o conteúdo de `.env`.

Reimportar a mesma cópia não duplica arquivos: o hash identifica os bytes. A importação pode ser retomada após falha, e só marca um documento como pronto depois de enviar todas as partes e trechos. Revisões/publicações já feitas não são substituídas pela sugestão de vínculos. Bytes diferentes entram como novo documento pendente, sem assumir automaticamente que substituem uma revisão anterior; o coordenador deve arquivar a revisão anterior quando cabível. Remoções na pasta não apagam a biblioteca. Cópia marcada como obsoleta mantém o conteúdo arquivado, inclusive se outra origem tiver os mesmos bytes.

**Não há sincronização contínua com unidades de rede.** A hospedagem não acessa as unidades do computador. Uma nova importação local é necessária para refletir novos arquivos/alterações. O resumo da última execução aparece apenas para o coordenador.

## Arquitetura e decisões

Fluxo: fontes locais → extração privada → revisão no banco → consulta autenticada → documentos relacionados aos modelos da OS.

- Os arquivos, manifestos e sugestões ficam em `work/`, ignorado pelo Git. `.vercelignore` também impede a inclusão dos originais e saídas em publicação por diretório. O repositório contém somente código e documentação genérica.
- O banco já utilizado pelo sistema armazena metadados, seções e originais em partes de 512 KiB (base64). Evita configurar outro fornecedor ou criar armazenamento público. Há custo de espaço e tráfego: base64 adiciona aproximadamente 33% aos bytes; acompanhar a cota do banco e migrar para armazenamento de objetos **privado** se o acervo crescer.
- As partes são entregues por rota autenticada, com autorização em cada requisição, `no-store` e MIME genérico. O cliente recompõe o arquivo e confere tamanho e SHA-256 antes de oferecer o download. Não há URLs públicas para documentos, nem arquivos no bundle/static assets.
- Há autenticação também na listagem, busca, detalhes, downloads e mutações. Materiais pendentes/arquivados/obsoletos não aparecem para funcionários nem são recuperáveis diretamente por ID. A demonstração não usa conteúdo interno. Caminhos da rede são exibidos somente ao coordenador.
- Revisões usam comparação de versão e mudança atômica com registro de auditoria. Obsoletos não podem ser publicados. Vínculos com uma OS não alteram as regras de acesso do documento.
- Busca de texto normalizado é adequada ao acervo inicial. Não é uma IA treinada, busca semântica ou validação técnica; resultados extraídos precisam ser conferidos no original. Para acervos maiores, medir latência e adicionar índice de busca dedicado.

## Verificação e publicação

`npm.cmd run build:vercel`, `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd test` verificam a base. Com servidor local em 5174 e banco migrado, `node --env-file=.env tests/library-smoke.mjs` e `node --env-file=.env tests/operations-smoke.mjs` usam registros descartáveis e removem suas próprias sessões/fixtures. Nunca execute o teste legado que exige base vazia contra produção.

Critérios antes de publicar: verificar anonimato bloqueado, pendentes invisíveis para funcionário, download íntegro, revogação imediata, modelo validado na OS, migração idempotente, ausência dos originais no Git e consulta mobile sem rolagem horizontal. Deploy pelo fluxo Git existente. Não houve revisão independente de código/CI além dos testes locais; não presumir aprovação de outra pessoa.

Rollback: se login, ponto, OS ou autorização da biblioteca falharem, retornar ao deployment anterior validado. As novas tabelas/coluna são aditivas e podem permanecer, preservando os dados importados. Não apagar documentos ou reverter registros de jornada como parte de rollback de interface. Downloads já entregues não são revogáveis retroativamente. Não foi configurado monitoramento contínuo nesta entrega.
