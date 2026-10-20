# HoraCerta

Ponto exclusivo dos serviços técnicos, com um coordenador e quantos colaboradores a empresa precisar. Não substitui o ponto diário da empresa.

## Primeiro acesso

1. Abra o aplicativo e crie o nome e PIN de seis números do coordenador. O código único é gerado automaticamente.
2. Em Colaboradores, cadastre o nome e PIN inicial de cada integrante; cada pessoa recebe um código diferente, mesmo quando os nomes são iguais.
3. Cada pessoa entra na própria conta e informa o salário bruto mensal e a carga mensal (padrão ajustável de 200 horas) em Meu acesso. O valor-hora é calculado automaticamente.
4. Depois do trabalho, em Meu ponto ou na própria OS, use Registrar horas trabalhadas: data, OS, entrada, saída e intervalo.
5. Cada colaborador confirma seu turno na OS. Registros completos são aprovados automaticamente; o coordenador confere os resumos e fecha o mês em Histórico de pontos.
6. Em Meu resumo, consulte extras por dia, calendário e comparativo dos últimos seis meses.

Em Histórico de pontos, “Registrar ponto” abre o calendário e o formulário do ponto esquecido, sem sair do histórico. A OS é obrigatória e fornece empresa e serviço. Alterar salário ou carga mensal não muda os valores dos pontos antigos nem de um serviço já iniciado. Contas anteriores conservam o valor-hora cadastrado até informarem seu salário; o sistema não presume salários.

A página `/login` apresenta o acesso em duas etapas: sugestões automáticas pelo nome, escolha do cadastro identificado pelo código único e PIN de seis números. Depois do primeiro login, o aparelho lembra somente o nome e o código para oferecer “Continuar como”; o PIN nunca é armazenado. Falhas transitórias são repetidas automaticamente e avisos antigos desaparecem quando a conexão volta. O fundo tem animações com opção de pausa e respeita a preferência de movimento reduzido.

O site está público, mas os dados continuam protegidos pelo login individual do aplicativo. Compartilhar o endereço não concede acesso aos pontos sem o código selecionado e o PIN. A prévia local usa o mesmo banco configurado no ambiente — não crie cadastros de teste manualmente durante o uso real.

## Desenvolvimento

Node.js 22.13+ e npm. Configure DATABASE_URL no ambiente do servidor conforme .env.example. Nunca exponha a credencial em variáveis públicas ou no navegador.

No Vercel, o projeto usa `npm run build:vercel`, definido em vercel.json, para gerar a saída nativa do Next.js. O build local e a publicação pelo Sites continuam usando Vinext.

```sh
npm install
npm run db:migrate
npm run dev
```

A demonstração em /?demo=1 usa dados fictícios e não salva alterações. A documentação detalhada está em [docs/PROJETO.md](docs/PROJETO.md).

## Verificação

```sh
npm run typecheck
npm test
npm run test:api
npm run build
```

test:api exige servidor local na porta 5173 e equipe vazia. Recusa-se a executar se já houver contas. Usa apenas seus próprios registros temporários e os remove ao terminar; não execute durante uso real.

## Recursos e limites

- Busca por nome, código individual imutável, PIN, sessão protegida e limite de tentativas.
- Registro de horas após o trabalho, sempre vinculado a uma OS. O deslocamento conta: entrada = saída de casa, saída = chegada em casa; o primeiro registro marca a OS como em andamento. Cronômetros antigos ainda abertos podem ser encerrados.
- Intervalo automático único por pessoa/dia (12h–13h ou 19h–20h), somando todos os registros da data.
- Fechamento mensal: aprovação em lote, bloqueio do mês no banco e reabertura com justificativa auditada.
- Marcações pessoais de serviço ou deslocamento, com turno confirmado na OS e correções enquanto o mês estiver aberto, conforme a permissão de edição.
- Valor-hora configurado pelo próprio colaborador, preservando valores de registros anteriores.
- Resumo pessoal, histórico responsivo, gráficos, calendário e exportações PDF, Excel e CSV.
- Coordenador: equipe sem limite de pessoas, troca de PIN, revisão/aprovação, cadastros, regras e relatórios.
- Carga normal inicial de 8h nos dias úteis e sábados. Turno pessoal por OS; trabalho fora do turno é extra. Sábado: primeiras 3h extras +60%, restante +100%; domingo integral +100%. Cargas e até 12 faixas por tipo de dia são configuráveis.
- Deslocamento separado do serviço, compartilhando a carga diária sem herdar o turno do destino; opções por turno próprio ou integralmente extra.
- Histórico agrupado por colaborador, detalhamento do cálculo, ações acessíveis e recálculo auditado com prévia.
- Datas previstas da OS e datas reais das viagens editáveis pelo coordenador, com justificativa e proteção contra conflitos.
- Adicional útil inicial de 50%, configurável. Não há folha de pagamento, adicional noturno ou homologação como sistema oficial de ponto.

Migrações idempotentes em scripts/migrate.mjs e scripts/migrate-quick.mjs; função transacional em sql/002-clock-function.sql. Somente o esquema horacerta é usado.

As mudanças de 20/10/2026 exigem as migrações `020-work-rules.sql` e `021-order-scheduling.sql`, incluídas em `npm run db:migrate`. Em banco já atualizado até 019, execute `node --env-file=.env scripts/migrate-work-rules.mjs` e `node --env-file=.env scripts/migrate-order-scheduling.mjs` antes de iniciar a nova versão. Os pontos antigos mantêm seus snapshots; para corrigir valores, use a prévia em Histórico de pontos → Conferir e corrigir o cálculo dos registros antigos. Detalhes e testes em [docs/regras-horas-2026-10-20.md](docs/regras-horas-2026-10-20.md).
