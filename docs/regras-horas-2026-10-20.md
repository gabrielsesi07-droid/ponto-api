# Revisão de horas, turnos e datas — 20/10/2026

O cálculo anterior descontava 9 horas líquidas nos dias úteis e classificava todo sábado como extra. A revisão passa a usar 8 horas normais nos dias úteis e sábados, conforme confirmado, com aprovação automática e edição pessoal enquanto o mês estiver aberto (respeitando `can_edit` e a opção de retroativos).

## Regras e turnos

- Cada colaborador confirma e trava o próprio turno por OS. O turno é uma referência; nunca cria horas trabalhadas. O coordenador corrige com motivo e versão.
- Serviço: minutos fora do turno são extras. Minutos dentro do turno respeitam a carga diária. Exemplo 07h–18h, pausa 12h–13h, turno 08h–17h: 10h líquidas, 8h normais e 2h extras.
- Sábado: carga inicial de 8h, primeiras 3h extras com 60% e restante com 100%. Domingo: todas as horas com 100%. Feriado tem política própria e continua sendo marcado no lançamento.
- Configurações permitem carga e até 12 faixas progressivas por tipo de dia. Limites são cumulativos em minutos de extras, crescentes, com última faixa ilimitada.
- Deslocamento: registrar trechos reais como Deslocamento e atendimentos como Serviço, sem sobreposição. Por padrão, viagem e serviço compartilham uma carga diária; viagem não herda turno no destino e pode acontecer antes do dia previsto do atendimento. Também há opções de turno exclusivo de deslocamento ou todas as horas de viagem extras.
- Intervalo automático continua único por pessoa/dia (almoço ou noite). Intervalo específico com desconto precisa informar o início real para classificar corretamente minutos dentro/fora do turno. Para virada de dia, criar um registro por data.
- Valores incluem hora base e adicional. Cálculo e faixas usam o conjunto completo da pessoa/data antes dos filtros. O arredondamento v2 é cumulativo por pessoa/data/moeda/tarifa/adicional, distribuindo os centavos entre lançamentos.

## Histórico e correções

O histórico inicia agrupado por colaborador, com totais completos do período, filtro por pessoa, busca por nome e opção de lista por data. Ações ficam acessíveis na coluna fixa e em cartões no celular. Cada registro mostra as faixas e eventuais dados incompletos; taxa zero com extras é exibida como valor-hora não informado.

Pontos e cronômetros antigos preservam regras e tarifas históricas. Em Histórico de pontos, o coordenador pode gerar prévia por mês/pessoa e aplicar recálculo com motivo. Por padrão, troca somente as regras; taxas positivas e turnos históricos ficam preservados. Duas opções explícitas permitem preencher taxas zeradas com o cadastro atual ou usar turnos confirmados nas OS. A prévia mostra o efeito e deve ser refeita se registros/regras/salários/turnos mudarem. Registros sem turno histórico usam a carga diária, com aviso.

Mês fechado continua bloqueado no banco, incluindo criação, edição, exclusão, status e recálculo. Reabertura exige justificativa. Todas as alterações de cálculo guardam antes/depois e motivo em auditoria. Configurações, criação/edição de pontos, status, recálculo e fechamento usam a mesma trava transacional.

## Datas da OS e do veículo

Previsões de OS abertas podem ser alteradas inclusive durante o atendimento; verificam conflitos de equipe/veículo, versão e datas já registradas. A edição não altera pontos existentes. Datas reais de saída/retorno da viagem podem ser corrigidas também no histórico; preservam quilometragem, responsáveis e situação aberta/encerrada. A correção verifica a sequência das outras viagens e exige justificativa.

## Aplicação e validação

As migrações desta revisão são 024 (regras/turnos) e 025 (datas). Elas vêm depois das migrações 020 de identidade, 021 de designação de checklists, 022 de notificações e 023 de número oficial. O fluxo completo `npm run db:migrate` inclui todas; em instalações existentes, preserve o procedimento de segurança das migrações anteriores.

Para produção já atualizada até 023, faça a troca em duas fases. A preparação aplica as estruturas 024 e 025 numa única transação, mantendo as regras atuais. Publique a aplicação nova depois dessa preparação e ative as regras somente após conferir a publicação:

```powershell
node --env-file=.env scripts/release-work-rules.mjs --prepare
# Publicar e conferir a aplicação nova antes da próxima etapa.
node --env-file=.env scripts/release-work-rules.mjs --activate --actor=<UUID-do-coordenador> --reason="Ativação das regras revisadas e conferidas"
```

A ativação exige o UUID de um coordenador ativo e motivo; a configuração anterior e a nova ficam registradas na auditoria, sem imprimir credenciais ou dados pessoais. A migração 024 promove configurações uma vez e acrescenta tabelas/funções, sem reescrever pontos. Reexecuções preservam configurações já personalizadas. Migração 025 acrescenta as funções de alteração de datas, sem mudar datas existentes.

O script individual `migrate-work-rules.mjs` também aceita `--prepare` (somente estrutura) e `--activate` (somente ativação). Sem argumento, aplica ambas, adequado à instalação inicial ou a uma janela controlada. Para produção em uso, prefira `release-work-rules.mjs`, que agrupa a preparação e audita a ativação. A versão antiga da aplicação não interpreta os snapshots v2; não ative enquanto ela ainda estiver atendendo usuários.

Se a publicação falhar antes da ativação, restaure a versão anterior da aplicação e mantenha as estruturas aditivas e as configurações antigas. Depois da ativação, a configuração anterior pode ser recuperada do `before_value` da auditoria “Regras de horas ativadas”, com nova auditoria e a mesma trava transacional. Preserve pontos, turnos, tabelas, colunas e marcadores de migração. Havendo pontos v2, mantenha uma aplicação capaz de interpretá-los e faça uma correção da versão nova; voltar à versão antiga exibiria os cálculos incorretamente. Reverter recálculos de pontos é uma operação separada, por registro e versão, usando sua auditoria e preservando alterações posteriores.

```powershell
npm test
npm run typecheck
npm run lint
npm run build:vercel
```

Testes SQL usam exclusivamente `TEST_DATABASE_URL` (nunca fallback para `DATABASE_URL`), schema aleatório e transação revertida. Para executar sem banco externo, instalar PGlite temporariamente no diretório ignorado e usar o runtime efêmero:

```powershell
npm install --prefix work/sql-runtime --cache work/npm-cache --no-package-lock --no-save @electric-sql/pglite
$env:LOCAL_SQL_TEST='1'
node tests/work-rules-isolated.mjs
node tests/order-date-changes-isolated.mjs
node tests/work-rules-cutover-isolated.mjs
node tests/api-handlers-local.mjs
```

Esses testes verificam SQL real em PostgreSQL local/WASM: migração repetida, snapshots, autorização, turno, autoaprovação, meses fechados, concorrência otimista, recálculo e auditoria. A aplicação das migrações no ambiente publicado e o recálculo de dados reais são etapas distintas da validação local.

`api-handlers-local.mjs` exige o modo local, executa os handlers reais de pontos/turnos/recálculo e substitui somente as fronteiras de sessão e conexão pelo contexto efêmero. Cobre também respostas HTTP, 07h–18h = 2h extras, viagem anterior ao atendimento, atualizações concorrentes e dados retornados pela prévia. Não lê credenciais nem dados da aplicação.
