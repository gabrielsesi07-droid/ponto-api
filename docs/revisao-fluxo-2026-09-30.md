# Revisão do fluxo — 30/09/2026

Corrige inconsistências que sobraram da troca do cronômetro pelo registro de horas depois do trabalho.

## O que mudou

| Problema | Correção |
|---|---|
| O intervalo automático era calculado por registro. Dois registros no mesmo dia (ex.: 10h–14h e 14h–20h) descontavam almoço **e** jantar, 2h no total, e reduziam as extras. | Um único intervalo por pessoa/dia. A janela é 12h–13h se o dia passa pelo almoço (mesmo como intervalo não registrado); caso contrário, 19h–20h. O banco recalcula os registros automáticos da data a cada gravação ou exclusão, com auditoria. Registros com intervalo específico nunca são alterados. |
| A OS exigia clicar em "Marcar atendimento como iniciado" antes de concluir, porque o cronômetro, que fazia isso, deixou de existir. | O primeiro registro de horas (ou a saída do veículo) marca a OS como Em andamento. A conclusão vale a partir do dia agendado, sem etapa manual. O botão foi removido. A ação `begin` continua aceita pela API, para clientes antigos. |
| Concluir a OS não mostrava quem ainda não tinha registrado horas. | O painel de conclusão lista para o coordenador quem da equipe ainda não registrou horas; o colaborador vê a própria situação. Não bloqueia, porque as horas podem vir depois. Ao concluir, quem ativou as notificações recebe o lembrete "Registre suas horas", que não é enviado se a pessoa registrar antes. |
| A aprovação era um registro por vez, e meses já pagos continuavam editáveis. | Fechamento mensal em Histórico de pontos (período "Mês selecionado"): aprovação em lote do mês (equipe ou pessoa filtrada), fechamento e reabertura com motivo. Um gatilho no banco impede qualquer alteração em mês fechado. |
| A API do relógio validava o início e depois sempre recusava. | O código morto foi removido. Pausar, retomar e encerrar continuam funcionando para cronômetros antigos. |
| O README falava em Iniciar/Pausar e em 220h. | README e PROJETO.md foram atualizados. |

## Regras do fechamento

- Somente o coordenador aprova em lote, fecha ou reabre.
- Fechar exige mês já encerrado, nenhum registro sem saída, todos os registros aprovados e nenhum cronômetro antigo iniciado no mês.
- Em mês fechado não é possível criar, editar, mudar de data, aprovar ou excluir registros, em nenhum caminho (API, relógio legado, funções).
- A reabertura exige motivo de 10 a 500 caracteres e fica na auditoria (`Mês reaberto`), assim como o fechamento (`Mês fechado`).

## Dados existentes

- Migração aditiva `019-flow-fixes.sql`, aplicada por `scripts/migrate-flow.mjs`, que também reaplica `004-order-actions.sql`. Ela já está incluída em `npm run db:migrate`.
- Registros antigos ficam com `break_mode='custom'`: seus intervalos **não são recalculados**. Só registros novos ou editados com o intervalo automático seguem a regra por dia.
- Nenhum mês é fechado automaticamente.
- `push_jobs` ganhou a coluna `kind` (`assigned` ou `hours`), e a restrição única passou a incluir o tipo.

## Publicação

1. `node --env-file=.env scripts/migrate-flow.mjs` **antes** de publicar a aplicação. A nova API lê `break_mode` e `month_closings`.
2. Publicar pelo Git/Vercel.
3. Conferir login, registro de horas, conclusão de OS e o painel de fechamento.

Para reverter, volte a versão da aplicação. As estruturas aditivas podem permanecer. Não apague `month_closings`: para liberar um mês, use a reabertura justificada.

## Verificação

- 44 testes unitários, incluindo os casos de intervalo por dia (10–14 + 14–20 = 60 min; almoço fora dos registros = 0) e as etapas de conclusão sem início manual.
- Fluxo SQL isolado (esquema aleatório, transação desfeita), com a 019 aplicada duas vezes: recálculo, idempotência, auditoria, retorno a Pendente, fechamento, bloqueios do gatilho, reabertura, conclusão a partir de Agendada, bloqueio antes do dia e lembrete sem duplicidade.
- Checagem de tipos, lint (sem erros; os três avisos antigos continuam) e build de produção.
- Não executado: testes HTTP de gravação e conferência visual em banco de homologação, que continua não configurado.

## Conferência das demais áreas (uso só em campo, deslocamento contando como trabalho)

| Área | Situação | Ajuste |
|---|---|---|
| Visão da equipe | O quadro "Equipe agora" mostrava Em serviço/Em pausa a partir de cronômetros que não existem mais; todos apareciam "Fora de serviço". | Passou a "Equipe no período": dias de campo, horas, extras e registros a aprovar por pessoa. |
| Meu resumo | O convite dizia "Vai começar um serviço? Registre depois do trabalho". | "Voltou do campo? Registre a entrada, a saída e o intervalo na OS do dia." |
| Configurações | "Jornada diária" não deixava claro que é a franquia do dia de campo, e desativar retroativos conflitava sem aviso com o registro feito depois do trabalho. | Rótulo "Horas normais por dia de campo", com a explicação do que vira extra, e aviso ao desativar retroativos. |
| OS cancelada com a equipe em campo | Como o deslocamento conta, quem saiu tem horas a registrar, mas o lembrete só existia ao concluir. | Cancelar uma OS Em andamento também envia o lembrete. Cancelar antes de alguém sair, não. |
| Sem alteração | Login/PIN, salário e valor-hora, cálculo de extras (franquia de 9h compartilhada no dia, sábado, domingo, feriado), relatórios e exportações (já incluem OS e intervalo), histórico e permissões de edição, OS/frota/checklists/biblioteca/clientes. | Coerentes com o uso só em campo. |
