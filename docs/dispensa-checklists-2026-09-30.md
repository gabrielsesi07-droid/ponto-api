# Dispensa de checklist de OS cancelada

O coordenador abre Histórico de OS → OS cancelada → Checklists dos equipamentos → Dispensar checklist. Justificativa de 10 a 500 caracteres e confirmação explícita são exigidas na interface. A API e o banco exigem coordenador ativo, OS cancelada, checklist aberto/vinculado e versão atual.

Não é conferência em nome do colaborador: a situação passa a `waived` (Dispensado), com autor, data e motivo. Itens, quantidades e observações anteriores não são alterados. Histórico guarda antes/depois e a OS recebe um evento. Consulta e impressão distinguem dispensa de conclusão. Checklists dispensados não podem ser apagados junto da OS nem editados como abertos.

Pontos e viagens não são encerrados nem dispensados. Apenas a pendência do checklist sai da contagem. OS agendadas/em andamento/concluídas não admitem dispensa; checklist já concluído não é reclassificado.

Migração: `node --env-file=.env scripts/migrate-checklist-waiver.mjs`. Adiciona campos/situação/função sem dispensar registros existentes. Incluída também na migração completa. Para reversão, não restaurar a restrição antiga nem apagar metadados após existir uma dispensa; preferir correção para frente, pois clientes antigos não conhecem `waived`.

Validação: fluxo SQL em esquema isolado e revertido, migração aplicada duas vezes; testa permissão, motivo, versão, duplicidade, OS não cancelada, preservação dos itens, autoria, histórico e contagem. Testes HTTP acrescentam negação para colaborador e motivo insuficiente. Nenhuma OS real deve ser dispensada nos testes de publicação.
