# HoraCerta — produto e operação

## Objetivo e perfis

Controle de pontos durante serviços técnicos, separado do sistema diário da empresa. Há um coordenador e não existe limite de colaboradores. Cada pessoa recebe um código único, usa seu próprio PIN e informa o próprio salário bruto mensal e carga mensal para calcular o valor-hora. Nomes alternativos considerados: Jornada360 e TempoEquipe.

| Área            | Colaborador                                               | Coordenador                                                                             |
| --------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Meu ponto       | Iniciar, pausar, retomar e encerrar o próprio serviço     | O mesmo, apenas para si                                                                 |
| Meu resumo      | Extras por dia, seis meses, calendário e valores pessoais | O próprio resumo, separado da equipe                                                    |
| Histórico       | Somente seus pontos; ajustes conforme permissão           | Pontos de todos, revisão, aprovação e exclusão lógica                                   |
| Relatórios      | Somente dados pessoais                                    | Consolidação da equipe e filtros por pessoa                                             |
| Meu acesso      | Nome, cargo, telefone, PIN, salário e horas mensais próprios | O mesmo para si                                                                      |
| Visão da equipe | Sem acesso                                                | Relógios em serviço/pausa, horas, extras, valores e pendências                          |
| Colaboradores   | Sem acesso                                                | Criar quantos acessos forem necessários, consultar códigos, trocar PIN, ativar/desativar e permitir ajustes |
| Configurações   | Sem acesso                                                | Jornada, adicionais, retroatividade e aprovação                                         |

Rotas de interface: ?view=register, insights, entries, reports, profile, dashboard, people e settings. A página inicial abre Meu ponto para quem já está conectado e o login para quem está desconectado. /login é uma página dedicada: sugere cadastros após duas letras, identifica cada pessoa pelo código único e solicita o PIN após a escolha. O aparelho pode lembrar apenas nome/código para oferecer “Continuar como”, nunca o PIN. Falhas transitórias de sessão recebem até duas novas tentativas e um sucesso limpa o erro anterior. O fundo tem animação, pausa de efeitos e suporte a movimento reduzido. ?demo=1 apresenta exemplos fictícios claramente identificados e sem gravação.

## Fluxos e interface

Colaborador: buscar nome → escolher seu código → informar PIN → configurar salário e horas mensais → abrir a OS do dia → viagem e checklist, quando houver → depois do trabalho, registrar entrada/saída/intervalo na OS → consultar Meu resumo ou Histórico. A pessoa é identificada pelo login; empresa e serviço vêm da OS. “Registrar ponto”, no Histórico, abre diretamente um calendário e formulário com OS obrigatória, entrada/saída, pausa, feriado e observação opcional, sem navegar para Meu ponto.

Coordenador: criar primeiro acesso → cadastrar os colaboradores → gerar OS → acompanhar equipe → concluir OS (vê quem ainda não registrou horas) → conferir resumos por pessoa → fechar o mês → exportar relatórios. Aprovação automática é o padrão; a aprovação em lote permanece para pendências antigas ou operação com aprovação manual. Cada colaborador configura seu salário e carga mensal; o coordenador pode visualizar o valor-hora resultante, mas a edição do cadastro da equipe não o altera. Salário bruto e carga mensal são retornados somente para o próprio usuário, não na lista de pessoas.

No celular há navegação inferior fixa com Ponto, Resumo, Histórico e Meu acesso. O menu lateral reúne as áreas adicionais. Indicadores adaptam-se à largura; gráficos ocupam uma coluna em telas estreitas; o histórico vira cartões. O calendário permite selecionar uma data e conferir as marcações daquele dia. O resumo mensal compara seis meses de dados próprios.

Visual: azul-marinho, azul de ação, âmbar para extras e verde para aprovação; superfícies claras e controles de toque. As skills Corporate e Emil Design Engineering da pasta indicada orientaram hierarquia e estados; as orientações React ajudaram a manter os cálculos fora da atualização do relógio a cada segundo. Empty states, validação, foco, diálogo acessível e movimento reduzido são preservados.

## Regras de cálculo

- Valor-hora = salário bruto mensal ÷ horas mensais do contrato, arredondado em centavos. Base inicial de 200 horas ajustável (1 a 744, até duas casas decimais), não uma determinação legal do contrato. Salário de 0 a 1.000.000, até duas casas decimais. O servidor calcula; não aceita valor-hora editável. A configuração não é folha de pagamento.
- Migração aditiva `014-monthly-salary.sql`: contas anteriores ficam com salário não informado e valor-hora inalterado. Não se deduz salário multiplicando a taxa antiga por 220. Atualizações valem para novos pontos; pontos existentes e relógios em andamento preservam seus valores.
- Intervalo automático: um único por pessoa/dia. Se o dia (primeira entrada até a última saída, somando todos os registros) passa por 12h–13h, essa é a janela, mesmo que o almoço tenha ficado fora dos registros; senão, 19h–20h. Cada registro automático desconta só o trecho trabalhado dentro da janela. O banco recalcula os registros automáticos do dia a cada gravação/exclusão (`recompute_auto_breaks`), com auditoria; se um valor aprovado muda, volta a Pendente. Intervalo específico nunca é recalculado.
- O sistema é usado em serviços técnicos, separado do ponto do escritório. Deslocamento conta como trabalho; registre trechos de viagem e serviço separadamente quando ambos ocorrerem no mesmo dia, sem sobreposição. A carga normal é compartilhada e a viagem, por padrão, não herda o turno no destino.
- Trabalhadas = saída − entrada − pausas, em minutos. Relógio ao vivo mostra segundos; registros e pausas são consolidados na precisão do minuto.
- Cálculo v2: carga inicial de 480 minutos nos dias úteis e sábados, com turno pessoal confirmado por OS. Minutos fora do turno são extras; os minutos dentro dele também respeitam a carga diária. Snapshots sem v2 preservam o cálculo anterior até recálculo explícito.
- Vários serviços e deslocamentos compartilham a franquia diária por pessoa. O cálculo acontece antes dos filtros de OS, pessoa, tipo e status.
- Sábado: mesma carga normal dos dias úteis; primeiras 3h extras com 60%, restante com 100%. Domingo integralmente extra a 100%. Cada tipo de dia permite carga e até 12 faixas próprias.
- Adicional útil inicial: 50%, configurável, pois o briefing não especificou esse percentual.
- Valor estimado = soma das faixas de extras em horas × valor-hora × (1 + adicional/100). Inclui a hora-base. No v2, os centavos são acumulados por pessoa/data/moeda/tarifa/adicional para evitar diferença ao dividir registros. Tarifa ausente é sinalizada, sem inventar valor.
- Exemplo: 07h–18h com 1h de intervalo e turno 08h–17h → 8h normais e 2h extras; a R$30/h com 50%, extras = R$90.
- O relógio captura valor-hora e regras no início do serviço. Alterações posteriores não reprecificam o histórico nem o serviço já iniciado.
- Serviços atravessando meia-noite são divididos por data no horário de Brasília. Ajustes manuais permitem 24:00 como fim do dia.
- Marcações em aberto ficam fora dos totais e não podem ser aprovadas.
- Sobreposição é recusada; versões evitam sobrescrever alterações concorrentes; exclusão é lógica e auditada.
- Totais incluem pendências, claramente identificadas como estimativas. Relatórios também distinguem valores aprovados.
- O mês corrente é parcial; a comparação exibe os totais registrados, não uma projeção.
- Fechamento mensal: exige mês encerrado, nenhum registro sem saída e todos aprovados (há aprovação em lote por mês e pessoa). Um gatilho no banco impede criar, editar, aprovar ou excluir registros de mês fechado por qualquer caminho. Reabrir exige motivo (10+ caracteres) e fica na auditoria.
- Sem adicional noturno, folha salarial, banco de horas, feriados automáticos ou certificação como registrador oficial.
- Datas previstas da OS aberta e datas reais da viagem são corrigíveis pelo coordenador, com motivo, versão/estado anterior, verificação de conflitos e auditoria. Ver [revisão de 20/10/2026](regras-horas-2026-10-20.md).

## Estrutura técnica

React 19, TypeScript, Vinext/Vite e Cloudflare Workers; Tailwind, Radix/shadcn, Lucide, Recharts e Sonner. PostgreSQL Neon via HTTP, consultas parametrizadas e operações transacionais. ExcelJS, jsPDF/AutoTable e CSV protegido contra fórmulas injetadas.

app/api contém sessão, login, estado, relógio, cadastros e CRUD de pontos. lib/domain.ts contém cálculos compartilhados; lib/pin.ts protege PINs e tokens; components concentra interface; sql e scripts contêm migrações; tests contém verificações.

| Tabela no esquema horacerta | Finalidade                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| users                       | Código único, PIN protegido, nome, papel, valor-hora, ativo e permissão de ajuste             |
| sessions                    | Hash do token, usuário e expiração                                                            |
| timers                      | Um serviço ativo por pessoa, início, pausas e valor/regras históricos                         |
| entries                     | Pessoa, data, horários, pausas, feriado, observação, status, versão e valor/regras históricos |
| settings                    | Regras compartilhadas para próximos serviços                                                  |
| audit                       | Ator, ponto, ação e valores anteriores/posteriores                                            |
| month_closings              | Meses fechados, autor, data e resumo                                                          |
| clients                     | Legado compatível, opcional e fora da interface atual                                         |

## Segurança e operação

DATABASE_URL fica somente no servidor. .env é ignorado pelo Git; .env.example não contém credenciais. Hospedagem usa segredo separado.

PINs usam PBKDF2 com salt individual. Tokens aleatórios são armazenados por hash; cookies HttpOnly, SameSite=Lax e Secure em HTTPS. Até cinco tentativas por conta a cada 15 minutos; sessão lembrada dura até 30 dias. Sem lembrar, o cookie é de sessão e expira no servidor após 12 horas. Sair revoga a sessão; redefinir PIN revoga as sessões da conta.

Todas as rotas verificam a conta ativa e suas permissões. O servidor determina o usuário dos registros do relógio e restringe novos registros manuais à pessoa conectada. Somente o coordenador recebe os dados da equipe; o colaborador recebe apenas seus próprios dados. Alterações conferem a origem da requisição.

Enquanto a equipe está vazia, a tela pública permite criar o primeiro coordenador. A criação é protegida por bloqueio transacional, verificação de equipe vazia e índice único; depois da primeira conta, o cadastro inicial é encerrado automaticamente. Os dados permanecem protegidos pelo login interno: sem usuário e PIN não há acesso aos pontos. Recuperação de PIN do coordenador não tem fluxo público nesta versão e exige manutenção administrativa autorizada.

## Verificação e evolução

Testes de cálculo cobrem dias úteis, finais de semana, feriado, intervalos, vários serviços/dia, contas diferentes e pontos abertos. Testes de API cobrem login/PIN, autorização, horas individuais, persistência, duplicidade, pausas, meia-noite, aprovação, concorrência e auditoria. Fixtures são removidos no finally e os testes recusam banco com equipe já cadastrada.

Conferência visual inclui celular de 320 e 390px, calendário, navegação inferior e histórico em cartões. Exportações verificadas em CSV, Excel e PDF. Compilação e checagem de tipos complementam os testes.

Possíveis evoluções, não implementadas: recuperação autônoma do PIN do coordenador (ou segundo coordenador) e tela de auditoria.
