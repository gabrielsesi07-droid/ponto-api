# Revisão geral do HoraCerta — 21/10/2026

## Resultado

Revisão dos fluxos de coordenador e colaborador, pesquisa de referências de mercado, testes unitários, handlers reais, banco em memória, concorrência em PostgreSQL nativo e navegação em computador e celular. Os testes de alteração usaram exclusivamente dados fictícios em ambientes isolados. A publicação não exige migração de banco nem recálculo de registros.

O objetivo foi reduzir acompanhamento manual: reunir exceções, antecipar preparação, abrir o registro certo e reaproveitar planejamento com execução nova.

## Mudanças implementadas

| Área | Resultado |
|---|---|
| Central do coordenador | Conferência por exceção quando a aprovação é automática; avisos agrupados por colaborador |
| Preparação | Turnos e checklists pendentes das OS dos próximos sete dias na central |
| Prioridades | Impedimentos reunidos por OS, fila filtrável por assunto e horário da atualização |
| Navegação | Grupos Operação, Meu trabalho, Equipe e recursos, Preferências |
| Busca global | OS, cliente, colaborador e áreas; Ctrl/Cmd K; operação por teclado |
| OS semelhante | Reaproveita planejamento; novo número, novas datas, anexo e execução em branco; recursos inativos/arquivados excluídos quando identificados |
| Identidade da OS | Endereço passa a representar a OS recém-salva |
| Interrupções | OS pendente deixa de abrir automaticamente por cima de Relatórios e outras telas |
| Fechamento | Central considera cronômetros legados, inclusive os iniciados no mês anterior, como o servidor já fazia |
| Dados inválidos | JSON não objeto e nome de PDF mal codificado retornam 400 sem gravar |
| Verificação contínua | `npm run test:isolated` reúne oito suítes; CI inclui atribuição de checklist e logout por dispositivo |

Avisos de jornadas com 16h ou mais são triagem operacional, sem alterar cálculos ou rejeitar horas. Valor-hora ausente continua como estimativa pendente. Não foi presumido salário para Gabriel Gamas.

## Pesquisa e comparação

Fontes oficiais consultadas em 21/10/2026. A aplicação dos padrões ao HoraCerta é nossa análise, e não uma reprodução integral dos produtos.

| Fonte | Padrão observado | Decisão para o HoraCerta |
|---|---|---|
| [Jobber: recursos](https://www.getjobber.com/features/) e [agenda](https://www.getjobber.com/features/scheduling/) | Integração de agenda, serviço, equipe e formulários de campo | Atalhos às OS e reaproveitamento do planejamento; agenda de capacidade como evolução |
| [Clockify: recursos](https://clockify.me/features/) | Timesheets, modelos de atividades, filtros, relatórios e lembretes | Preservar aprovação automática escolhida pela empresa e destacar exceções |
| [Mitti, da SafetyCulture: schedules](https://help.mitti.com/005645) | Inspeções recorrentes com modelo, responsável, frequência e acompanhamento | Central de preparação; recorrência futura com regras explícitas |
| [Nielsen Norman Group: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Opções secundárias sem competir com a tarefa principal | Navegação agrupada, busca e detalhes sob demanda |
| [W3C: tamanho dos alvos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Dimensão e espaçamento adequados para acionamento | Controles maiores, foco visível e salto ao conteúdo; sem alegação de certificação WCAG |

Conclusão de produto: o maior ganho está em o coordenador tratar exceções e preparar atendimentos a partir de uma central confiável. As automações devem indicar responsável e motivo, preservar histórico e permitir revisão das decisões operacionais.

## Matriz de verificação

| Área | Evidência | Resultado |
|---|---|---|
| Regras e domínio | 150 testes unitários: horas, turnos, sábado/domingo, intervalos, deslocamento, snapshots, arredondamento, relatórios, permissões e filas | Passou |
| Handlers de ponto/turno/recálculo/leitura/fechamento | 20 cenários com funções e SQL reais em PGlite | Passou |
| Segurança | 10 cenários de login, bloqueio, sessão, PIN temporário, origem, tamanho, arquivos e Biblioteca | Passou |
| HTTP | 32 verificações contra servidor Next e PostgreSQL locais, incluindo turno, aprovação automática e edição concorrente | Passou |
| Workflow OS | Clientes, números, equipamentos, viagens, km, cancelamento, proteção de histórico, checklists, encerramento e fechamento | Passou |
| Migrações | Jornada antiga, regras atuais, datas, preparação/ativação idempotente e snapshots | Passou |
| Equipamentos | Seleção sem vínculo prévio, importação, salvamento atômico, auditoria e isolamento por perfil | Passou |
| Concorrência nativa | 7 verificações de identidade/fechamento; 11 de atribuição/número oficial; 1 de logout | Passou |
| Push e transporte | 22 verificações locais com SQL real e provedor fictício | Passou |
| Extração documental | 2 testes Python de extração e casos adversos | Passou |
| Navegador coordenador | Login, pendências da massa fictícia, busca sem acentos, abertura e criação de OS semelhante | Passou |
| Navegador colaborador em 390px | Login, OS, turno, 07h–18h → 10h trabalhadas e 2h extras, aprovação e relatório | Passou |
| Exportação no navegador | Download CSV fictício, cabeçalho e linha sem valores monetários | Passou |
| Compilação | TypeScript, ESLint e build Next.js de produção | Passou |

As contagens não equivalem a cobertura integral: há sobreposição entre suítes e cenários. Foram testados os fluxos e limites descritos, sem alegação de todas as combinações possíveis.

## Evoluções priorizadas

| Prioridade | Evolução | Ganho e definição necessária |
|---|---|---|
| Alta | Agenda semanal por equipe e veículo | Capacidade e conflitos antes de preencher a OS; incluir deslocamentos |
| Alta | Serviços recorrentes por modelo | Frequência, vigência e limite de repetições definidos antes de criar planejamento em massa |
| Alta | Lembretes recorrentes configuráveis | Escolher responsáveis, canal, horário e frequência; respeitar consentimento e evitar duplicação |
| Média | Recuperação de formulário | Rascunho por usuário, com descarte claro para aparelhos compartilhados |
| Média | Conexão instável | Rascunhos locais e sincronização explícita, com proteção contra duplicação e conflitos |
| Média | Saúde do catálogo | Completar listas específicas e revisões periódicas dos documentos |
| Média | Evidências de campo | Fotos por ocorrência/equipamento com limites, retenção e acesso definidos |
| Média | Indicadores por serviço | Previsto versus realizado e motivos de desvio; valores financeiros quando cadastrados e autorizados |
| Técnica | Paginação e capacidade | Medir volume e latência antes de alterar consultas ou prometer capacidade |

## Limites e decisões preservadas

Push foi testado com provedor fictício. Entrega real depende de permissão, aparelho, provedor e configuração; nenhuma mensagem de teste foi enviada a colaboradores reais. A fila tem tentativas e proteção contra duplicação, mas não foi configurado agendamento independente de recuperação nesta revisão.

Mapas externos e condições reais de rede de campo não foram certificados. PDF tem validação de assinatura/tamanho e download protegido, sem análise antimalware integral. Limitação de login por conta foi verificada; limitação por IP na infraestrutura não foi medida. Não houve ensaio de carga.

Cada iScan mantém lista específica: o documento que identifica iSCAN lite fica em uso no Lite; o uso automático no cadastro iScan3D foi desativado após a confirmação do usuário. Magic e Nimble aguardam listas próprias. Histórico preservado.

## Repetir

`npm run verify`: lint, tipos, testes unitários e build. `npm run test:isolated`: oito suítes com banco em memória, esvaziando as variáveis de conexão nos subprocessos. Runtime opcional: `npm install --prefix work/sql-runtime @electric-sql/pglite`.

O roteiro HTTP/PostgreSQL está em [homologacao-local.md](homologacao-local.md). Testes de alteração nunca devem apontar para produção.
