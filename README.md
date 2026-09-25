# HoraCerta

Ponto exclusivo dos serviços técnicos, com um coordenador e quantos colaboradores a empresa precisar. Não substitui o ponto diário da empresa.

## Primeiro acesso

1. Abra o aplicativo e crie o nome e PIN de seis números do coordenador. O código único é gerado automaticamente.
2. Em Colaboradores, cadastre o nome e PIN inicial de cada integrante; cada pessoa recebe um código diferente, mesmo quando os nomes são iguais.
3. Cada pessoa entra na própria conta e configura seu valor-hora em Meu acesso.
4. Em Meu ponto, use Iniciar serviço, Pausar/Retomar e Encerrar serviço.
5. Em Meu resumo, consulte extras por dia, calendário e comparativo dos últimos seis meses.

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
- Relógio persistente, pausas e divisão automática quando o serviço atravessa a meia-noite.
- Marcações manuais para esquecimento, sem escolher colaborador ou local.
- Valor-hora configurado pelo próprio colaborador, preservando valores de registros anteriores.
- Resumo pessoal, histórico responsivo, gráficos, calendário e exportações PDF, Excel e CSV.
- Coordenador: equipe sem limite de pessoas, troca de PIN, revisão/aprovação, cadastros, regras e relatórios.
- Extras após 9h em serviços por dia útil. Sábados +60%, domingos +100%.
- Adicional útil inicial de 50%, configurável. Não há folha de pagamento, adicional noturno ou homologação como sistema oficial de ponto.

Migrações idempotentes em scripts/migrate.mjs e scripts/migrate-quick.mjs; função transacional em sql/002-clock-function.sql. Somente o esquema horacerta é usado.
