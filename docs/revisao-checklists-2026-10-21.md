# Revisão de equipamentos e checklists — 21/10/2026

Foram revisados os 23 modelos cadastrados e seus documentos de referência.

O seletor de origem mostrava somente documentos já vinculados ao modelo, impedindo a primeira atribuição pelo equipamento. Agora o coordenador pode buscar todos os documentos disponíveis da categoria de checklists, importar os itens e salvar o vínculo na mesma operação. A gravação respeita a versão do checklist, registra histórico e atualiza a versão do documento para proteger revisões simultâneas. Selecionar ou visualizar uma origem não altera o cadastro.

O catálogo mostra a origem, a quantidade de itens e a situação do checklist, com busca por equipamento e filtro de disponibilidade. Rascunhos não são apresentados como listas disponíveis na OS. Documentos obsoletos ou arquivados não são oferecidos para novos vínculos.

## Correção confirmada

O arquivo `FPO-3-1D_Checklist iScan 3D.docx` estava ligado apenas ao iScan3D, mas identifica `iSCAN lite` no primeiro item da tabela. O rascunho vazio do iScan Lite foi recuperado com os nove itens da origem e status de referência importada, sem aprovação técnica automática e sem publicar o original. Uma cópia foi vinculada à OS aberta que seleciona esse equipamento. A versão anterior do rascunho e a correção ficaram registradas no histórico.

## Resultado do cadastro

12 modelos têm referências importadas disponíveis para conferência nas OS: Ballbar, CoreGAGE, PlusGAGE, ProGAGE, Radian Core, Radian Plus, Radian Pro, Spindle Analyzer, Swivelcheck, XD Laser, iScan3D e iScan Lite.

11 modelos permanecem sem checklist atribuído: Active Target (AT), Dynamic 9D LADAR, SMR, SmartTrack Sensor (STS), Tracker3, i360, iLT, iLTx, iScan Magic, iScan Nimble e vProbe. A compatibilidade da lista do Lite com Magic/Nimble não foi presumida. O documento relacionado ao vProbe é um certificado de calibração, e não uma lista de ida e volta.

Há documentos genéricos e de serviços específicos sem modelo associado (`CHECKLIST FINAL.pdf`, `Checklist 70768.pdf`, `Checklist Laser tracker - Aeris 75068+8583.docx` e `FPO-3-1D_Checklist de Equipamentos API.docx`). Eles precisam de escolha explícita de modelo e revisão dos itens; seus nomes não identificam com segurança todos os equipamentos compatíveis.

## Verificação

Foram validados os handlers reais com PostgreSQL local descartável: seleção de origem sem vínculo prévio, extração sem mutação, salvamento atômico de lista/vínculo/histórico, rejeição de edição desatualizada, bloqueio de origens indisponíveis, resumo do catálogo e permissões de colaboradores. Também passaram os testes unitários e a compilação de produção.

Para repetir o teste isolado, com PGlite instalado em `work/sql-runtime`, use `LOCAL_SQL_TEST=1 node tests/equipment-checklists-local.mjs`. O teste recusa execução sem essa opção e não utiliza `DATABASE_URL`.
