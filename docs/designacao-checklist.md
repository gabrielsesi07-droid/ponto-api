# Designação de checklist pendente

O coordenador pode designar um colaborador ativo para assumir um checklist pendente de OS **Em andamento**, com motivo de 10 a 500 caracteres. A designação pertence ao checklist e não altera `orders.members`, pontos existentes, reservas ou os lembretes de horas da equipe original. O coordenador continua sem permissão para conferir; a conclusão da OS continua bloqueada enquanto houver checklist pendente. Não há dispensa automática.

## Contrato

`POST /api/checklists` recebe `{action:"assign",id,version,assignee_id,reason}`. A versão deve ser a recém-lida. Somente checklists `open` de equipamento ainda vinculado à OS podem ser designados. Um checklist legado vazio também pode receber responsável; ele deverá cadastrar e conferir os itens para concluir. Não se transfere um checklist resolvido. O mesmo responsável atual não pode ser novamente designado sem mudança.

A resposta é `{ok:true,id,version,assignee_id}`. Validação de formato retorna 400; papel inadequado, 403; conflito de versão, estado ou elegibilidade, 409. A UI deve preservar o motivo em erro e reler o checklist antes de tentar novamente; nunca repetir automaticamente uma mutação.

O GET de checklists traz `assigned_to`, `assigned_to_name`, `assigned_by_name`, `assigned_at`, `assignment_reason` e `can_edit`. Apenas o coordenador recebe `assignees:[{id,name,access_code,in_team}]`. `history.detail` expõe o motivo da designação, registrado também em snapshot antes/depois e evento da OS.

Após transferência, somente o responsável atual, ativo e com papel `employee`, pode salvar/concluir esse checklist. Checklists sem designação conservam a permissão da equipe original. Uma reatribuição revoga o acesso do responsável anterior que não integra a equipe; preserva os itens, notas e registros anteriores. Desativação não apaga a atribuição ou as conferências históricas: impede novos usos, e o coordenador pode transferir a pendência a outro colaborador ativo.

Quem recebe checklist fora da equipe encontra a OS em `GET /api/operations` com `checklist_only:true`. A resposta redige equipe, pontos, viagens, eventos, documentos e contato; mostra apenas os equipamentos atribuídos. O GET de checklists retorna apenas os seus checklists. Essa consulta não concede ciência, início de atendimento, ponto, viagem ou conclusão da OS. O histórico de um checklist resolvido continua consultável pelo responsável atual.

## Migração e validação

Requer a estrutura até **020**. A migração **021** acrescenta quatro colunas inicialmente nulas e um índice; não cria designações, não redefine equipes e não recalcula trabalho. `scripts/migrate-checklist-assignment.mjs` aplica 021, reaplica `008-checklist-actions.sql` e as funções de ciclo de vida `011` na mesma transação/advisory lock. A cadeia de `scripts/migrate.mjs` chega a esse runner após a revisão de segurança. Usar o runner completo, não somente o arquivo 021: a autorização e a preservação de histórico dependem das funções reaplicadas.

Em produção, o coordenador da publicação deve cumprir o runbook de [acesso seguro](seguranca-acesso.md): backup/restauração verificada e manutenção antes da migração, código compatível publicado mantendo manutenção, validação controlada antes de liberar tráfego. A homologação desta mudança não executou migração ou acesso a produção.

Teste SQL explícito, sempre com `TEST_DATABASE_URL` de banco isolado e sem fallback de produção:

```powershell
node --env-file=.env.qa-smoke --test tests/checklist-assignment.integration.mjs
node --env-file=.env.qa-smoke --test tests/logout-push.integration.mjs
```

A suíte de atribuição cria e remove um schema aleatório; verifica preservação, estados, exclusividade, bloqueio de conclusão e corridas nas duas ordens de commit. Observa a espera real em `pg_locks` antes de liberar a transação; a análise usa isolamento PostgreSQL padrão `READ COMMITTED`. O runner legado `tests/order-workflow-isolated.mjs` também aplica 021 no seu schema descartável.

O logout aceita `DELETE /api/login` com corpo opcional `{push_endpoint}`. Endpoint explícito é limitado à allowlist de provedores e a 2048 caracteres, e só é revogado com prova de sessão vigente, versão de credencial atual, usuário ativo e dono correspondente. A proveniência exata do token pode ser limpa mesmo após expiração. Na mesma transação, o logout primeiro bloqueia a linha do usuário com `FOR UPDATE`, depois exclui a inscrição e a sessão. O registro de aparelho bloqueia o usuário e a sessão com `FOR SHARE`, nessa ordem, antes de revalidar a autorização. Isso permite ao logout observar e revogar uma inscrição concorrente que acabou de confirmar, e impede uma inscrição posterior de usar a sessão removida. Logout não depende de trocar o PIN obrigatório. A política de dispositivos depende também da migração 022; a expiração da sessão, por si só, não equivale a logout.
