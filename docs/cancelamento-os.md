# Cancelamento com retorno pendente — 29/09/2026

## Comportamento

- Coordenador cancela uma OS Agendada ou Em andamento com motivo obrigatório. Alteração de versão entre abrir e confirmar exige atualizar a ficha. Cancelamento repetido é rejeitado.
- Cancelar interrompe o atendimento, não apaga execução nem inventa horários/quilometragem. Pontos continuam até cada pessoa encerrar em Meu ponto. A contagem inclui o tempo real até esse encerramento, conforme as regras de ponto já existentes.
- Pessoas designadas podem registrar retorno da viagem existente, com validação de km e atualização automática da frota, e concluir checklists já vinculados. Coordenador acompanha ou reabre conferência com justificativa; não preenche a conferência pelo colaborador.
- Não permite novas saídas, início de atendimento/ponto na OS ou novos vínculos de checklist após cancelar. O cadastro geral de ponto continua independente.
- Canceladas com pontos, viagens ou conferências iniciadas pendentes permanecem visíveis em Abertas e Pendências, além do histórico Cancelada/Todas. Uma cópia de checklist nunca utilizada não força uma conferência fictícia. Salvar uma conferência atualiza os indicadores da OS.
- Veículo não pode ser desativado enquanto houver uma viagem sem retorno, mesmo de uma OS cancelada.
- Exclusão permanece restrita às OS sem execução. O botão usa a mesma regra do servidor e explica a alternativa de cancelamento.

## Verificações

19 testes unitários e fluxo SQL em schema aleatório, inteiramente revertido: cliente automático, normalização/homônimos/inativos, sequência, equipamentos, proteção de exclusão, cancelamento em viagem, permissões, motivo, versão antiga, repetição, odômetro, encerramento do ponto e devolução/reabertura do checklist. Nenhuma OS real é usada para testes de alteração e nenhum número real é consumido.

Build/TypeScript e lint são requisitos de publicação. A revisão React verifica controles acessíveis, estado de processamento, mensagens e atualização da lista. A conferência visual usa uma ponte local somente leitura; confirmar cancelamento em produção não faz parte do teste.

Esta revisão é focada no ciclo OS/ponto/frota/checklist, não uma auditoria completa de todo o sistema. Suítes HTTP mutantes exigem banco de testes separado, ainda não configurado. Testes de concorrência com carga e validação física dos procedimentos não foram realizados. Não houve revisão independente.

## Publicação e recuperação

Aplicar `scripts/migrate-orders.mjs`: adiciona funções de consulta `011-order-lifecycle.sql` e atualiza funções de OS/checklist, sem modificar registros operacionais. Publicar pelo Git/Vercel; verificar rotas autenticadas, indicadores e logs de erro. Observação pós-deploy pontual, não monitoramento contínuo.

Se houver regressão de autorização ou falha nas rotas principais, reverter a aplicação para a última versão estável e corrigir as funções afetadas. Não restaurar cegamente as antigas regras que bloqueiam retorno de canceladas: cancelamentos legítimos feitos depois da publicação devem continuar podendo resolver suas pendências. As funções novas de consulta são aditivas e podem permanecer no banco durante rollback de interface. Nunca apagar histórico para recuperar o serviço.
