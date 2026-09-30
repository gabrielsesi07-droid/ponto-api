# Auditoria de clareza dos fluxos — HoraCerta

Data: 30/09/2026. Escopo: revisão do código dos fluxos operacionais, permissões, mensagens e testes de regressão. Não equivale a um teste manual de todas as telas nem a certificação de segurança.

## Diagnóstico principal

O sistema usava verbos semelhantes para efeitos diferentes: fechar uma janela, parar o ponto individual, finalizar a conferência do equipamento e concluir a OS de toda a equipe. Além disso, parte das exigências só era revelada após uma tentativa de conclusão.

## Correções implementadas nesta revisão

| Prioridade | Evidência / problema | Solução |
|---|---|---|
| Alta | `order_action` verificava relógios ativos, mas não registros manuais sem saída | Bloqueio no banco e inclusão dos registros manuais no contador de pendências |
| Alta | A OS não exibia antecipadamente as condições para concluir | Painel de etapas: início, pontos, viagens, checklists vinculados e resultado; dados ausentes não são tratados como aprovação |
| Alta | “Fechar OS” apenas fechava a janela | Renomeado para “Fechar janela” |
| Alta | “Encerrar serviço” apenas parava o relógio individual | “Encerrar meu ponto”, com confirmação de sucesso explicando que a OS permanece separada |
| Média | Finalizar checklist confundia-se com concluir atendimento | “Salvar e continuar depois” / “Finalizar checklist”, com instrução para ida e retorno |
| Média | Sincronizar checklists não atualizava imediatamente as pendências da OS | Atualização do resumo após vincular listas |
| Média | Início aparecia novamente mesmo com ponto próprio ativo | Atalho para ver/encerrar o ponto já aberto |
| Média | Início futuro só era recusado pelo servidor | Botões desabilitados antes do dia agendado, com explicação visível |
| Média | Erros ficavam no fim de uma janela longa | Rolagem e foco no alerta de erro |
| Média | Resultado e km digitados podiam ser descartados ao fechar | Confirmação antes de fechar a janela ou usar o novo atalho do ponto |
| Média | Concluir OS tinha consequências pouco claras | Confirmação explícita: vale para toda a equipe, move ao histórico, não aprova pontos |
| Baixa | Retorno do carro e início sem ponto tinham sucesso genérico | Mensagens específicas para cada efeito |

## Mapa operacional de referência

1. Coordenador prepara OS, equipe, equipamento e veículo quando utilizado.
2. Cada pessoa inicia seu próprio ponto vinculado à OS. Iniciar atendimento sem ponto não abre relógios da equipe.
3. Uma pessoa registra a viagem e um colaborador designado confere os equipamentos. Salvar a ida não exige antecipar a volta.
4. Cada pessoa encerra seu ponto; registros manuais recebem horário de saída. Uma pessoa registra o km real de retorno e finaliza as conferências aplicáveis.
5. Coordenador ou integrante designado descreve o resultado e conclui a OS. A aprovação dos pontos continua independente.
6. Cancelar impede novos inícios, mas preserva trabalho realizado e pendências de retorno/conferência. Excluir não substitui cancelar quando existe histórico.

## Outros fluxos examinados e próximos ajustes

| Área | Situação encontrada no código | Solução recomendada / limite desta entrega |
|---|---|---|
| OS agendadas e histórico | Separação entre abertas e encerradas já existe; “Todas” e “Abertas” são equivalentes na lista operacional | Mantida a opção solicitada pelo usuário. Futuramente remover redundância sem misturar histórico |
| Exclusão e cancelamento | Proteção de histórico e confirmação já existem | Preservadas; testes isolados cobrem cancelamento em viagem e exclusão protegida |
| Clientes | Excluir sem histórico; arquivar quando há vínculos; reativar disponível | Preservado. Arquivar não apaga OS antigas |
| Equipe de OS iniciada | Edição disponível apenas em agendadas; checklist exige colaborador, não coordenador | Precisa de fluxo dedicado de substituição com auditoria. Não liberar edição irrestrita de uma OS em execução |
| Equipamento sem lista | A regra de conclusão conta listas vinculadas, não modelos sem checklist | Aviso explícito no painel. Decidir se exigir checklist ou justificativa de dispensa por equipamento; não inventar itens nem conferir automaticamente |
| Conferência colaborativa | Versão e autor preservam rastreabilidade; um colaborador pode preencher | Evolução: exibir responsável atual e aviso de edição simultânea antes do conflito de versão |
| Histórico de pontos | Aprovar exige saída; aprovado restringe edição do colaborador | Evolução: legenda visível para Pendente / Revisado / Aprovado e motivo junto de ações indisponíveis, inclusive mobile |
| Relatórios | Botão depende de registros no filtro | Evolução: explicar filtro sem resultados e informar mês/pessoa/formato antes de exportar; conteúdo de arquivos não retestado nesta entrega |
| Catálogo e biblioteca | Modelo, documento e checklist têm validações distintas | Evolução: separar visualmente “modelo disponível”, “documento liberado” e “checklist pronto”; catálogo não representa estoque físico |
| Login, PIN e salário | Há testes de hash/sessão, cálculo salarial e preservação do valor histórico | Não foi feito novo teste ponta a ponta de recuperação de PIN nem revisão de todos os estados da tela de login |
| Navegação e rascunhos | Proteção adicionada na janela da OS; não cobre fechar navegador ou toda navegação externa | Evolução: rascunho recuperável por usuário, com expiração e cuidado com dados compartilhados |
| Listas grandes | API de operações carrega todas as OS acessíveis | Evolução: paginação e busca no servidor; medir volume antes de alterar o contrato da API |

## Verificação e limites

- 38 testes automatizados de funções/regras aprovados.
- Verificação TypeScript aprovada.
- Compilação de produção aprovada; 63 verificações HTTP locais aprovadas sem alterações em dados de negócio, com sessões temporárias revogadas.
- Fluxo SQL aprovado em esquema aleatório com reversão integral: cancelamento em viagem, permissões, versões, quilometragem, pontos, conferências, clientes e preservação histórica.
- Regressão nova: registro manual aberto impede conclusão e mantém a OS em andamento; registro excluído não bloqueia.
- Nenhuma OS real foi criada, concluída, cancelada ou excluída para testar.
- Não executado nesta revisão: teste visual completo desktop/mobile, concorrência real entre dois navegadores, todos os exports e testes HTTP de escrita em banco independente.

## Publicação e reversão

A mudança de banco é uma atualização da função `order_action` em `sql/004-order-actions.sql`, sem alteração ou exclusão de registros. Deve ser aplicada antes da nova interface. A interface antiga continua compatível, mas não explica antecipadamente a nova pendência manual.

Em caso de falha da interface, reverter a versão da aplicação para `fd2faab`; manter o bloqueio de pontos manuais no banco para preservar a consistência. Reavaliar a reversão se consulta de operações ou autenticação deixar de funcionar. Monitoramento contínuo e observabilidade externa não foram validados por esta auditoria.
