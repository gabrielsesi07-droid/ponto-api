# Segurança de acesso e rollout da migração 020

Este runbook descreve código preparado em 01/10/2026. Nenhum banco real, migração ou deploy foi executado durante a implementação. Validar em PostgreSQL isolado antes da publicação.

## Contrato de acesso

- Login por código `HC-XXXXXX` e PIN de 6 dígitos. A API pública não pesquisa pessoas pelo nome.
- Criação e reset de colaborador geram PIN aleatório, válido por 24h e por um único login. A resposta ao coordenador contém `person`, `temporary_pin` e `temporary_pin_expires_at`, com `Cache-Control: no-store`.
- Reset usa `/api/manage`, `entity: user`, `data.reset_pin: true`. `data.pin` preenchido também indica reset por compatibilidade, mas o servidor gera a credencial.
- O primeiro login temporário concede sessão restrita de até 12h. APIs operacionais respondem 403 com `code: PIN_CHANGE_REQUIRED` até trocar o PIN. Sessão, troca própria e logout permanecem acessíveis.
- A troca usa `/api/manage`, `entity: profile`, `data.pin`, e exige PIN diferente do atual e de `123456`. Campos de perfil omitidos são preservados. Todas as sessões são revogadas; entrar novamente com o PIN pessoal.
- Se a sessão temporária for perdida antes da troca, emitir novo convite. PIN consumido não funciona novamente.
- PINs não são armazenados em texto. A versão da credencial é copiada à sessão e conferida na autenticação; alteração de PIN e desativação incrementam a versão e revogam sessões atomicamente.

## Bootstrap de uma instalação nova

Configurar `HORACERTA_BOOTSTRAP_TOKEN` no servidor com um segredo aleatório de pelo menos 32 caracteres. Cloudflare env e `process.env` são aceitos. Nunca usar variável `NEXT_PUBLIC_*`.

Somente banco vazio permite `POST /api/session`, com `bootstrap_token`, `pin` pessoal, `name` e demais campos do cadastro. PIN deve ter 6 dígitos e ser diferente de `123456`. O primeiro coordenador já recebe PIN definitivo. Usuário e sessão são criados na mesma transação. Sem segredo configurado, a tela de setup não é anunciada e a criação é recusada. Remover o segredo após configurar a instalação quando não houver mais necessidade de bootstrap.

## Atualizar uma instalação existente

1. Validar primeiro o código, a migração e os testes abaixo em PostgreSQL isolado. Na instalação alvo, fazer backup verificado e reservar janela de manutenção, impedindo tráfego da versão antiga durante a migração e publicação. Não migrar concorrentemente com usuários fazendo login/reset.
2. Confirmar migrações até 019, incluindo o acesso rápido. Usar Node >=22.13 para os scripts que importam TypeScript.
3. Executar explicitamente, com `DATABASE_URL` do alvo:

   ```powershell
   node --env-file=.env scripts/migrate-security.mjs
   ```

   O migrador geral `node --env-file=.env scripts/migrate.mjs` também executa esse runner via `migrate-flow.mjs`. Ele aplica 020 e reaplica `sql/002-clock-function.sql` atualizado na mesma transação. Quem aplicar SQL manualmente precisa dos **dois** arquivos, para manter a ordem de locks do cronômetro legado.
4. A etapa de saneamento verifica hashes PBKDF2 existentes, inclusive contas que adiaram a troca. Credenciais `123456` e onboarding legado sem expiração são substituídos por hashes aleatórios já expirados e têm sessões revogadas. Nenhum PIN é impresso. O saneamento usa comparação do hash anterior, pode ser reexecutado e não sobrescreve uma troca concorrente. Se houver interrupção, manter manutenção e concluir a reexecução antes de publicar.
5. Publicar backend e UI compatíveis juntos **mantendo a manutenção**. Usar acesso controlado de validação para a versão nova; a versão antiga não suporta o contrato novo.
6. Recuperar o coordenador afetado com o script abaixo. Na versão nova, entrar, trocar o PIN e reemitir convites dos colaboradores afetados. Verificar convite, consumo único, gate, troca, relogin, reset e logout. Não declarar removida a exposição do PIN universal antes de o runner concluir.
7. Encerrar manutenção e abrir tráfego somente depois de confirmar o funcionamento do coordenador, o smoke controlado e a recuperação dos usuários previstos.

A migração é aditiva; versões existentes começam em 1. PIN/reset/desativação passam a incrementar a versão. A proteção de fechamento mantém a advisory lock global existente para operações de pontos, status e fechamento, incluindo o stop legado; isso preserva integridade, sem prometer maior throughput.

Preferir corrigir adiante. Voltar à aplicação antiga reintroduz o PIN inseguro e a autenticação sem versão. Não remover colunas/triggers para destravar uma publicação; manter manutenção e restaurar/corrigir conforme o plano operacional de backup.

## Recuperação administrativa fora da aplicação

Disponível para operador autorizado com acesso direto ao banco, após a migração 020. Não é rota pública e não é executada automaticamente. Informar a identidade do operador em `HORACERTA_RECOVERY_OPERATOR` (3–120 caracteres) e o código **real da conta ativa** no argumento:

```powershell
$env:HORACERTA_RECOVERY_OPERATOR = 'Nome do operador autorizado'
node --env-file=.env scripts/reset-pin.mjs HC-001001
```

O exemplo de código deve ser substituído pelo código a recuperar. O script imprime código, PIN temporário e prazo apenas nessa execução. Entregar por canal privado; não salvar em logs compartilhados/CI. A gravação, a revogação de sessões e o evento de auditoria são atômicos. A pessoa entra e troca o PIN antes de acessar o sistema.

Auditoria registra operador informado, origem `operator_cli`, conta e versão, sem PIN/hash. A tabela atual exige `actor_id` de usuário: a conta recuperada ocupa esse campo, mas a ação identifica explicitamente recuperação fora da aplicação. A prova da identidade humana do operador depende do acesso e da trilha operacional do banco; o nome informado no env é metadado declarativo.

## Validação isolada

`npm test` executa apenas `*.test.mjs`, sem mutações no banco. `npm run typecheck` e lint validam o aplicativo.

Para a suíte SQL/concorrência, configurar **somente um banco dedicado** em `TEST_DATABASE_URL` e executar:

```powershell
npm run test:security-db
```

O teste cria e remove um schema aleatório. Sem `TEST_DATABASE_URL`, falha com instrução; nunca usa `DATABASE_URL` como fallback e rejeita o mesmo host/banco quando ambas estiverem configuradas. Cobre reaplicação da 020, expiração/consumo único, reset/login em ambas as ordens, fechamento/status em ambas as ordens e locks do encerramento legado. URLs `localhost`/`127.0.0.1` usam o driver `pg` nativo por import dinâmico; alvos remotos mantêm Neon Pool/WebSocket.

O smoke HTTP `tests/api-smoke.mjs` exige `TEST_DATABASE_URL` isolada e vazia, `HORACERTA_BOOTSTRAP_TOKEN` e servidor localhost cujo `DATABASE_URL` aponta **exatamente para esse banco de teste**. O processo do smoke deve usar um arquivo de env separado do servidor: não deve definir `DATABASE_URL` igual a `TEST_DATABASE_URL`. O teste rejeita alvo não local e banco não vazio; não consegue provar sozinho a configuração do servidor antes do primeiro request mutante. Nunca apontar o servidor local usado pelo smoke para produção.

```powershell
node --env-file=.env.test-smoke tests/api-smoke.mjs
```

O smoke atual verifica bootstrap autorizado/negado, convite, gate, preservação de sessão para troca, consumo único, reset, logout, OS atribuída, horas manuais completas, sobreposição, aprovação e versão obsoleta. Não espera novos cronômetros nem registros com saída ausente. Os dados criados são removidos no `finally`; interrupção forçada pode exigir limpeza do banco de teste.

## Homologação em PostgreSQL local

O banco descartável deve usar **UTF8**. O embedded PostgreSQL no Windows pode herdar WIN1252; nesse caso a função de normalização de nomes da migração 010 falha com `22P05`. Criar `horacerta_qa` com `ENCODING 'UTF8' TEMPLATE template0` e locale compatível; não alterar a função de produção para contornar encoding incorreto do banco de teste.

O aplicativo mantém `lib/server.db()` e o cliente Neon oficiais. Para usar seu transporte HTTP com PostgreSQL local, há tooling exclusivo de QA:

- `tests/support/local-neon-proxy.mjs`: adaptador HTTP na porta **55433**, bind `127.0.0.1`, alvo PostgreSQL fixado na URL QA. Usa `pg`, linhas em array e parsers de texto cru com OIDs; batches usam uma única conexão e transação. Preserva códigos e mensagens de erro PostgreSQL.
- `tests/support/local-neon.mjs`: preload Node `--import`; intercepta apenas requisições com header Neon, exigindo a URL QA exata. Redireciona ao adaptador, inclusive quando o cliente foi incluído no bundle Next. Nunca faz fallback para outro banco.
- Ambos exigem `HORACERTA_LOCAL_NEON_TEST=1` e `TEST_DATABASE_URL` PostgreSQL com host loopback, porta explícita e banco exatamente `horacerta_qa`; recusam `NODE_ENV=production` e `VERCEL_ENV=production`. O preload também recusa `DATABASE_URL` diferente da URL QA, quando presente.

Nos processos de migração/aplicativo de QA, `DATABASE_URL` e `TEST_DATABASE_URL` devem coincidir. No processo de testes SQL/smoke, omitir `DATABASE_URL`. Definir `HORACERTA_LOCAL_NEON_TEST=1` somente nesses processos e nunca no deploy. Nenhum arquivo de runtime de produção precisa ser modificado.

Com env de QA já configurado, os comandos são:

```powershell
node --env-file=.env.qa-smoke tests/support/local-neon-proxy.mjs
node --env-file=.env.qa --import ./tests/support/local-neon.mjs scripts/migrate.mjs
node --env-file=.env.qa-smoke --import ./tests/support/local-neon.mjs --test tests/local-neon.integration.mjs
node --env-file=.env.qa-smoke --test tests/security-integrity.integration.mjs
node --env-file=.env.qa-smoke --import ./tests/support/local-neon.mjs --test tests/security-upgrade.integration.mjs
node --env-file=.env.qa-smoke --import ./tests/support/local-neon.mjs tests/api-smoke.mjs
```

O proxy é processo persistente, portanto usar outro terminal para os demais comandos. A suíte de protocolo verifica bool/JSON/arrays/números, rollback integral de batch, commit, códigos PostgreSQL e bloqueio de alvo diverso. O Next de QA deve usar porta e diretório de build separados da demo. Quando o CLI Next propaga opções a workers, carregar env no launcher com `process.loadEnvFile` e aplicar somente o preload em `NODE_OPTIONS`; não propagar `--env-file` por `NODE_OPTIONS`, que não aceita essa flag.

A suíte de upgrade exige banco QA migrado e **equipe vazia**. Cria fixtures para PIN universal com aviso adiado, onboarding legado e credencial pessoal válida; executa o runner real e sua reaplicação, depois a recuperação CLI real. Captura o PIN de recuperação somente em memória e verifica validade, consumo único e auditoria sem segredo. Remove as fixtures no `finally`. Reservar exclusividade do banco durante essa suíte e o smoke; não executar simultaneamente com homologação UI.

O Next de QA configura `serverExternalPackages` para Neon somente sob o guard local, permitindo que o preload compartilhe a instância oficial e configure `fetchEndpoint` válido antes do wrapper fetch do Next. Nenhuma conexão sem o header Neon é redirecionada; qualquer header Neon com URL diferente da QA exata é recusado. Usar `TEST_BASE_URL=http://localhost:3001` no smoke para corresponder à origem canônica do Next local.

Nesta homologação, PostgreSQL e requests HTTP do aplicativo são reais; o transporte HTTP Neon é emulado pelo adaptador local. Isso não valida o endpoint Neon remoto, Cloudflare ou o ambiente de deploy. Parar os processos de QA e remover os dados descartáveis conforme a gestão do cluster ao terminar.

### Evidência executada em 01/10/2026

| Verificação | Resultado |
| --- | --- |
| Migração completa desde banco UTF8 vazio | `scripts/migrate.mjs` chegou à 020 com sucesso |
| Concorrência com `pg` nativo e duas conexões | 7/7 testes passaram, incluindo as quatro esperas observadas antes do commit e a ordem de locks do stop legado |
| Protocolo Neon HTTP emulado para PostgreSQL real | 5/5 testes passaram |
| Upgrade e recuperação CLI reais no banco QA | 1/1 passou, cobrindo runner, reaplicação, PIN legado, revogação e auditoria |
| Smoke HTTP Next local | 29 verificações passaram |
| Unitários compartilhados | 71/71 passaram |
| TypeScript e lint do escopo alterado | Passaram; lint sem avisos |
| Cleanup antes de liberar banco à QA UI | Zero usuários, sessões, OS, entradas, auditorias, clientes e schemas descartáveis das suítes |

A execução real detectou um erro no parâmetro do operador da recuperação CLI dentro de `jsonb_build_object`: ele precisava de tipo explícito. A correção `${operator}::text` em `scripts/reset-pin.mjs` preserva a operação atômica e foi verificada pela suíte de upgrade. A revisão anterior sem banco não havia detectado esse erro. O ambiente continua exclusivamente local; a evidência não representa deploy ou homologação do transporte Neon remoto.
