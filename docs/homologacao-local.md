# Homologação local com PostgreSQL

Este ambiente usa somente dados fictícios. Não copie credenciais ou dados de produção. O PostgreSQL executa em loopback, sem criar serviço do sistema operacional.

## Preparar o banco portátil (opcional)

Na raiz do projeto, com Node 24:

```powershell
npm ci --ignore-scripts --no-fund
npm install --prefix work/local-postgres embedded-postgres@17.10.0-beta.17
npm run test:postgres
```

O launcher usa `work/local-postgres/data`, porta `55432`, usuário `postgres`, senha descartável local `horacerta_local_only` e banco `horacerta_qa`. A pasta `work` é ignorada pelo Git e pelo build/lint. O processo fica aberto até ser interrompido; os dados locais são preservados para inspeção. Não instale esses binários como dependência de produção.

Se a política local do npm bloquear o postinstall do pacote de binários, revise `@embedded-postgres/<plataforma>/scripts/hydrate-symlinks.js` antes de executá-lo no diretório do próprio pacote. No Windows usado nesta verificação, a lista de symlinks estava vazia.

Um PostgreSQL dedicado já existente também pode ser utilizado. `TEST_DATABASE_URL` nunca pode apontar para produção. Em localhost/127.0.0.1, a suíte usa o driver nativo `pg`; em destinos remotos, mantém Neon Pool/WebSocket.

## Concorrência e integridade

Em outro terminal:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres:horacerta_local_only@127.0.0.1:55432/horacerta_qa'
npm run test:security-db
```

A suíte cria um schema aleatório e o remove ao terminar. Ela não usa `DATABASE_URL` como fallback e rejeita o mesmo destino quando ambas as URLs estão configuradas. O teste verifica espera real de locks antes de liberar as transações concorrentes.

O workflow de CI contém um job separado `postgres-integrity` com serviço PostgreSQL 17, sem credenciais de produção.

## Migrações e HTTP

O aplicativo usa o driver HTTP Neon. Para homologar sem conta externa, os testes locais usam um transporte compatível com o protocolo Neon apontando ao PostgreSQL loopback. Essa camada é exclusiva de teste; não modifica `lib/server.ts`, nem valida a infraestrutura hospedada do Neon.

O banco precisa de encoding **UTF8**. O launcher configura UTF8 para um cluster novo; não reaproveite um banco WIN1252 para essas migrações.

Crie `.env.qa` local (ignorado pelo Git) com `DATABASE_URL` e `TEST_DATABASE_URL` iguais à URL descartável acima, `HORACERTA_LOCAL_NEON_TEST=1` e uma `HORACERTA_BOOTSTRAP_TOKEN` de teste com pelo menos 32 caracteres. Crie `.env.qa-smoke` com a mesma `TEST_DATABASE_URL`, token e opt-in, mais `TEST_BASE_URL=http://localhost:3001`, mas **sem DATABASE_URL**. Não use valores ou destinos de produção.

Em terminais separados, iniciar proxy e aplicativo:

```powershell
node --env-file=.env.qa-smoke tests/support/local-neon-proxy.mjs
npm run dev:qa
```

Com proxy ativo e banco dedicado vazio, executar sequencialmente:

```powershell
node --env-file=.env.qa --import ./tests/support/local-neon.mjs scripts/migrate.mjs
node --env-file=.env.qa-smoke --import ./tests/support/local-neon.mjs --test tests/local-neon.integration.mjs
node --env-file=.env.qa-smoke --import ./tests/support/local-neon.mjs --test tests/security-upgrade.integration.mjs
node --env-file=.env.qa-smoke --import ./tests/support/local-neon.mjs tests/api-smoke.mjs
```

Não execute smoke/upgrade em paralelo ou depois de cadastrar usuários manualmente: ambos exigem banco de QA vazio. Só liberar a jornada manual no navegador após o cleanup. Use `http://localhost:3001` para manter a origem coerente com o Next local. O launcher separa o build em `.next-qa` e carrega o env antes de iniciar o Next, evitando propagar `--env-file` por `NODE_OPTIONS`.

Verificação local concluída: migrações até 020, integridade 7/7, protocolo 5/5, upgrade/recuperação 1/1 e smoke HTTP com 29 verificações. Essas contagens incluem os testes principais das suítes. O roteiro de publicação real continua em [Segurança de acesso](seguranca-acesso.md).
