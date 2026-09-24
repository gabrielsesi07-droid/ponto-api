# HoraCerta

Ponto exclusivo dos serviços técnicos de uma equipe de quatro pessoas (um coordenador e três colaboradores). Não substitui o ponto diário da empresa.

## Primeiro acesso

1. Abra o aplicativo e crie o usuário e PIN de seis números do coordenador.
2. Em Colaboradores, cadastre o usuário e PIN inicial de cada integrante.
3. Cada pessoa entra na própria conta e configura seu valor-hora em Meu acesso.
4. Em Meu ponto, use Iniciar serviço, Pausar/Retomar e Encerrar serviço.
5. Em Meu resumo, consulte extras por dia, calendário e comparativo dos últimos seis meses.

O site permanece privado. Para acesso remoto da equipe, conceda também a permissão de visualização na plataforma de hospedagem; o login do aplicativo é separado. O primeiro cadastro em produção exige o acesso privado do proprietário. A prévia local permite configurar a equipe conectada ao mesmo banco — não crie cadastros de teste manualmente durante o uso real.

## Desenvolvimento

Node.js 22.13+ e npm. Configure DATABASE_URL no ambiente do servidor conforme .env.example. Nunca exponha a credencial em variáveis públicas ou no navegador.

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

- Login individual por usuário e PIN, sessão protegida e limite de tentativas.
- Relógio persistente, pausas e divisão automática quando o serviço atravessa a meia-noite.
- Marcações manuais para esquecimento, sem escolher colaborador ou local.
- Valor-hora configurado pelo próprio colaborador, preservando valores de registros anteriores.
- Resumo pessoal, histórico responsivo, gráficos, calendário e exportações PDF, Excel e CSV.
- Coordenador: visão da equipe, revisão/aprovação, cadastros, regras e relatórios.
- Extras após 9h em serviços por dia útil. Sábados +60%, domingos +100%.
- Adicional útil inicial de 50%, configurável. Não há folha de pagamento, adicional noturno ou homologação como sistema oficial de ponto.

Migrações idempotentes em scripts/migrate.mjs e scripts/migrate-quick.mjs; função transacional em sql/002-clock-function.sql. Somente o esquema horacerta é usado.
