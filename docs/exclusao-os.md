# Exclusão de OS sem execução

No detalhe da OS, o coordenador encontra **Excluir OS**. A confirmação identifica cliente e número, explica a remoção permanente e exige digitar o número completo, por exemplo `OS-000054`. O foco inicial fica em **Voltar sem excluir**; o envio fica bloqueado enquanto processa. Colaboradores não veem a ação e recebem 403 pela API.

Somente OS agendadas ou canceladas **sem execução registrada** podem ser excluídas. Pontos (inclusive registros anteriormente excluídos), temporizadores, viagens, início/conclusão de atendimento e qualquer conferência salva/concluída/reaberta bloqueiam a exclusão. Cancelar uma OS iniciada não contorna essa proteção. A marcação atual e o histórico dos checklists são verificados, incluindo equipamentos removidos da seleção. Uma lista apenas planejada ou recuperada, sem conferência, não impede excluir uma OS criada por engano.

A transação `order_action` usa a mesma trava das operações de ponto/OS/checklists, verifica coordenador ativo, ID, versão e confirmação e só então remove a OS, PDF, ciência de leitura e cópias de checklist ainda não conferidas. Clientes, veículos, modelos, documentos originais e padrões do catálogo não são removidos. O número da OS não é reutilizado. A auditoria mantém autor, data, identificação da OS e cliente; não é uma cópia de recuperação. Não há restauração pela interface.

API: `POST /api/operations`, ação `delete_order`, dados `{ id, version, confirmation }`. Autenticação, validação de origem e corpo limitado são compartilhados com as demais ações. A checagem de permissão também existe na função SQL. Uma exclusão concorrente só é aplicada uma vez. Uma edição/PDF com versão mais recente exige reabrir a OS antes de excluir.

## Verificação e publicação

- Build e TypeScript aprovados; lint sem erros, três avisos já existentes no dashboard.
- 63 verificações de operações, 58 de checklists, 33 de biblioteca e 13 testes unitários aprovados com dados descartáveis. Cobrem autorização em API/SQL, confirmação, versão, concorrência, auditoria, remoção de anexos e preservação de padrões/conferências.
- Confirmação visual conferida no modo demonstração, sem excluir uma OS real.
- Migração: executar `scripts/migrate-orders.mjs`, que reaplica `004-order-actions.sql`; não cria tabelas nem exclui dados por conta própria.
- Publicação via Git/Vercel após testes locais. Não houve revisão independente nem ambiente separado de homologação. Conferir sessão, ponto, OS, biblioteca, bloqueio de exclusão anônima e logs depois da publicação.
- Reverter aplicativo e função `order_action` para a revisão anterior se houver falha de autorização ou regressão em login/ponto/OS. Preservar a auditoria. Rollback de código não recupera uma OS que o usuário já tenha confirmado excluir; a interface avisa antes da ação.
- Verificação de logs pontual; não há monitoramento contínuo configurado por esta entrega.
