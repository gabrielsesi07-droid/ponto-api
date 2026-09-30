# Histórico de pontos e salário mensal — 30/09/2026

## Alterações

- No Histórico de pontos, “Registrar ponto” abre diretamente o diálogo de ponto esquecido com calendário em português; a página continua no histórico. Selecionar o dia fecha o calendário, que pode ser reaberto. Datas futuras ficam bloqueadas.
- A marcação continua pertencendo à pessoa conectada e exige sua OS. Empresa e serviço vêm da OS. As validações anteriores de retroatividade, sobreposição, versões e permissões não foram removidas.
- Meu acesso recebe salário bruto mensal e carga horária mensal ajustável, inicialmente 220 horas, conforme escolha do usuário. A interface mostra a divisão e o resultado; um gatilho PostgreSQL calcula o valor-hora autoritativo, em centavos, antes dos adicionais.
- Primeiro cadastro do coordenador e demonstração também usam os novos campos. O painel permite editar o salário pelo botão “Configurar meu salário”.
- Salário/carga não são expostos na lista da equipe: cada pessoa recebe apenas sua própria configuração. O coordenador mantém a visualização do valor-hora resultante já existente.
- O formulário antigo que tenta gravar apenas valor-hora recebe mensagem para atualizar a página. Contas sem salário continuam podendo atualizar seus dados/PIN sem inventar salário ou apagar a taxa existente. Corrigida também a validação de perfil de contas sem `username` legado.

## Preservação dos dados

Migração aditiva `014-monthly-salary.sql`, transacional e testada duas vezes para verificar idempotência. Não preenche salário de contas anteriores e não atualiza pontos ou relógios existentes. A taxa anterior permanece até o titular informar salário. Relógios ativos mantêm sua taxa ao encerrar; os registros históricos não são recalculados. Pontos novos, inclusive manuais, usam a taxa configurada no momento do lançamento.

## Evidências

- 36 testes Node aprovados: cálculo com 220 e outras bases, arredondamento, zero permitido no salário, entradas inválidas e preservação de valores antigos.
- Fluxo SQL executado em esquema temporário dentro de transação revertida: cálculo no banco, tentativa de adulterar a taxa, base zero, salário negativo, taxa do relógio e do ponto após mudança salarial. Sem consumir números de OS reais ou alterar dados de negócio.
- 64 verificações HTTP locais aprovadas: permissões, disponibilidade dos campos próprios, rejeição de salário/base inválidos e rejeição do valor-hora editável, além dos fluxos anteriores de OS.
- Interface de colaborador conferida em desktop e 390 × 844: abertura no histórico, seleção de dia, seleção de OS cancelada para ponto esquecido, preenchimento de empresa/serviço, salário 4.400 / 220 = 20 e 4.400 / 200 = 22. Ajustado campo de data mobile para não cortar o ano.
- Build Next.js e TypeScript aprovados. Lint sem erros, com três avisos antigos de imports não usados no dashboard.
- Nenhum salário ou ponto real foi alterado durante testes de interface; prévia de consulta bloqueia gravações e revoga a sessão temporária.

A suíte HTTP de gravação foi atualizada para a nova configuração e contas sem username, mas não foi executada: exige banco de homologação independente. Não se declara teste ponta a ponta de gravação em produção. Primeiro acesso novo foi revisado/compilado; não se recriou o coordenador existente para testá-lo. Monitoramento contínuo de 15 minutos e revisão por outra pessoa não foram realizados.

## Publicação e recuperação

Aplicar `node --env-file=.env scripts/migrate-compensation.mjs` antes de publicar a aplicação. Migração também integra o fluxo normal `db:migrate`. Não registrar a conexão em logs ou commits.

Se houver falha nova de login, leitura ou gravação, referência anterior: `524859e`. A migração aditiva pode permanecer, sem excluir dados. Atenção: o formulário antigo de valor-hora não é mais autoritativo para usuários que já configuraram salário; o gatilho continuará derivando a taxa. Preferir corrigir a aplicação e preservar as configurações, sem remover o gatilho ou reprecificar registros silenciosamente.

As skills de depuração e revisão orientaram rastrear a ação de histórico e validar o cálculo no servidor; a revisão React orientou compartilhar os campos entre perfil/primeiro acesso e manter a prévia derivada dos campos. O checklist de publicação separou as verificações aprovadas das lacunas acima.
