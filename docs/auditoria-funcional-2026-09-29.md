# Auditoria funcional — HoraCerta — 29/09/2026

## Resultado e limites

Revisão transversal de código, regras de negócio, permissões HTTP e interface, com correções de clientes e checklist. Não é uma certificação de ausência de defeitos nem um teste ponta a ponta de todas as combinações.

Nenhum cliente real foi excluído/arquivado, nenhum PIN foi alterado e nenhuma conferência física foi declarada em nome da equipe. As alterações de negócio dos testes SQL ocorreram em esquema aleatório dentro de uma única transação revertida integralmente, incluindo suas sequências. Sessões temporárias de leitura foram revogadas ao final.

## Falhas corrigidas

| Prioridade | Problema | Correção e evidência |
|---|---|---|
| Alta | A conclusão do checklist parecia não fazer nada: erro longe do botão e envio sem indicação | Validação antes de enviar; lista de pendências junto aos botões; atalhos para cada item; foco no aviso; indicação de salvamento/conclusão; proteção contra clique duplicado. Conferido em desktop e 390 × 844. |
| Alta | Falha ou demora na resposta podia manter o checklist aguardando indefinidamente | Limite de 30 segundos, mensagem de conexão/timeout/versão/conteúdo inválido e preservação dos campos. Sem repetição automática: resposta perdida pode significar gravação já realizada, então a mensagem orienta consultar a OS. Cinco testes de transporte aprovados. |
| Alta | Clientes só tinham edição | Coordenador pode excluir cadastro sem histórico, arquivar e reativar. Confirmação pelo nome na exclusão, validação também no banco e registro de auditoria. Testado em transação isolada. |
| Alta | Exclusão poderia romper rastreabilidade de vínculos antigos apenas por nome | Proteção inclui OS, pontos (também os removidos logicamente), serviços em andamento e nomes normalizados em registros legados sem client_id. Cliente com histórico deve ser arquivado. |
| Média | Cliente arquivado reaparecia na sugestão por meio de OS antiga | Histórico deixa de reintroduzir nomes já cadastrados e arquivados. Nova OS não usa cliente arquivado; edição de OS existente pode preservar seu vínculo anterior. |
| Média | Datas inexistentes, como 30/02, podiam chegar ao banco e produzir falha genérica | Validação real de calendário nos filtros de período e início do ponto. Testes de mês, ano bissexto e formato; HTTP 400 verificado. |
| Média | Corpo JSON inválido resultava em erro genérico; tamanho só dependia do cabeçalho | Erro 400 para JSON inválido; limite efetivo de bytes lidos; erro 409 compreensível para conflito de vínculo. JSON, limite e origem estrangeira verificados via HTTP. |
| Média | Teste de API com gravação usava DATABASE_URL por padrão | Agora exige TEST_DATABASE_URL, servidor local e banco vazio no teste de primeiro acesso. Não executar suítes de mutação contra dados reais. |

## Como usar as novas ações de clientes

Em **Clientes**, use busca e filtros **Ativos / Arquivados / Todos**.

- **Excluir cliente:** disponível somente para cadastro sem histórico. Exige digitar o nome atual; remoção permanente apenas desse cadastro.
- **Arquivar cliente:** retira das sugestões de novas OS, preservando OS e pontos anteriores. Útil para o cliente “teste” que já possui movimentações.
- **Reativar cliente:** disponível na lista de arquivados; recoloca o cadastro nas sugestões.
- Um cliente arquivado digitado manualmente não é duplicado nem reativado silenciosamente. Reative o cadastro antes de uma nova OS.
- Editar uma OS antiga não exige trocar seu cliente só porque ele foi arquivado depois.

## Cobertura efetivamente executada nesta revisão

| Área | Verificação executada | Cobertura restante |
|---|---|---|
| Login, PIN e sessão | Testes de hash/salt, PIN incorreto, cookie seguro, persistência/saída; consultas HTTP anônimas e autenticadas, busca sem resultado | Primeiro acesso, troca/recuperação e bloqueio por tentativas de ponta a ponta precisam de banco isolado |
| Ponto e cálculo | Testes unitários de horas e extras; início e encerramento em OS cancelada via SQL isolado; escopo individual e permissões HTTP | Ciclo completo de ponto manual, edição/aprovação e pausa pela interface em banco isolado |
| OS e histórico | Sequência sem reutilização, cliente automático, equipamentos/checklists persistidos, exclusão protegida, cancelamento em deslocamento, versão antiga, motivo obrigatório e ações duplicadas via SQL; filtros de ciclo de vida unitários | Concorrência real entre dois navegadores e calendário com mais combinações |
| Clientes | Exclusão sem histórico, confirmação errada, colaborador proibido, histórico protegido, arquivamento, reativação e edição de vínculo arquivado via SQL; ações e filtros na interface desktop/mobile | Exercício HTTP de todas as mutações em banco de homologação |
| Veículos | Retorno atualiza hodômetro inclusive na OS cancelada; quilometragem regressiva, retorno repetido e inativação com viagem pendente bloqueados via SQL | Cadastro/edição visual completa e reserva simultânea com várias equipes |
| Checklist | Regras, pendências por item, versões e transporte com sucesso/erro/timeout em testes; conclusão e reabertura via SQL; validação e navegação ao item pela interface desktop/mobile | Fluxo visual com conferência inteira e dois colaboradores simultâneos em banco isolado; impressão física |
| Biblioteca e equipamentos | Testes de catálogo; dois testes Python de extração com fixtures temporárias; leitura autorizada e bloqueios de documentos/templates via HTTP | Reimportação extensa, PDFs protegidos/corrompidos adicionais e novas famílias técnicas |
| Relatórios e resumo | Cálculos e período validados; tela de relatório demonstrativo aberta; botão CSV retornou “Relatório exportado”; código dos três formatos inclui Empresa atendida | Captura do download não confirmada pela ferramenta de navegador; conteúdo final dos três arquivos e paginação longa não foram revalidados ponta a ponta nesta rodada |
| Colaboradores, configurações e acesso | Revisão das rotas; colaborador proibido de alterar cadastros/regras; isolamento de dados e ações restritas ao coordenador via HTTP | Cadastro, desativação/reativação e troca de PIN pela interface em banco isolado |
| Entradas inválidas e rede | Datas impossíveis/período invertido, JSON inválido, corpo grande, origem estrangeira, resposta inválida, perda de conexão e timeout | Testes de carga, indisponibilidade prolongada, pentest independente e recuperação de backup |

Resultados locais: **29 testes Node aprovados**, **2 testes Python aprovados**, **fluxo SQL isolado aprovado**, **51 verificações HTTP aprovadas**. Compilação Next/TypeScript aprovada; lint sem erros, com três avisos antigos de variáveis não utilizadas em dashboard. A quantidade HTTP depende dos registros disponíveis: as verificações opcionais usam somente OS já existentes.

## Plano de regressão e critérios

1. Cada ação crítica deve ter pelo menos: sucesso, dados inválidos, permissão negada e tentativa repetida/versão antiga quando aplicável.
2. Exclusão deve sempre testar registro sem uso e registro com histórico; para este último, oferecer alternativa recuperável e preservar os vínculos.
3. Cada formulário longo deve tornar o erro visível perto da ação, indicar envio e manter os campos após falha.
4. A homologação deve executar os fluxos completos com dois perfis, a 390 × 844 e desktop. A aprovação exige zero falhas nos cenários críticos, não apenas build bem-sucedido.
5. Antes de publicar: testes, lint, build, migração compatível, verificação pós-publicação e inspeção de erros do servidor.

Comandos de regressão existentes:

```powershell
npm.cmd test
npm.cmd run test:order-workflow
npm.cmd run lint
npm.cmd run build:vercel
```

`test:order-workflow` usa conexão configurada para testar um esquema separado e reverte a transação completa. `test:api-readonly` exige `AUDIT_DATABASE_URL` explícita e `AUDIT_BASE_URL` local ou o domínio de produção verificado; cria apenas sessões temporárias e não modifica registros de negócio. Não incluir valores de conexão em documentação, commits ou logs.

As suítes `api-smoke.mjs`, `operations-smoke.mjs`, `checklists-smoke.mjs` e `library-smoke.mjs` fazem gravações e exigem **TEST_DATABASE_URL em banco separado**, com o servidor local usando esse mesmo banco. Não foram executadas nesta rodada porque esse ambiente independente não estava configurado. Não apontar TEST_DATABASE_URL para produção para contornar essa proteção.

## Riscos e próximos passos

- Preparar banco de homologação para concluir os fluxos de gravação HTTP/UI sem interferir nas operações reais.
- O PIN inicial compartilhado e a troca opcional permanecem como solicitados. Para produção, recomenda-se convite individual ou troca obrigatória; isso exige decisão sobre a política de acesso, não alteração silenciosa das contas.
- Definir tratamento de desligamento de colaborador com ponto/viagem ainda em andamento: preservar bloqueio de acesso e oferecer regularização auditada pelo coordenador.
- Busca automática do Google Maps depende da chave Places ainda não configurada. Endereço manual e link de navegação são o caminho de contingência.
- Ampliar testes de concorrência, exportações extensas, dispositivos reais, restauração de backup e monitoramento. Esta auditoria não substitui essas verificações.

As skills de depuração, revisão de código, estratégia de testes e boas práticas React orientaram a correção da causa, a proteção do histórico e a separação entre evidências verificadas e cenários ainda pendentes.

## Verificação de publicação

- [x] Testes locais, build e revisão do diff aprovados; migração SQL testada isoladamente antes de aplicada.
- [x] Migração compatível com a versão anterior: acrescenta função e ações, sem remover colunas ou registros.
- [x] Fluxos principais observados localmente e permissões verificadas por HTTP.
- [ ] Suíte completa de gravação em homologação: depende de banco independente.
- [ ] Revisão independente e aprovação de outra pessoa: não realizadas nesta rodada.
- [ ] Monitoramento contínuo de métricas: não configurado por esta auditoria.

Critério de rollback: falha nova de autenticação, leitura das OS, permissões ou gravação válida após a publicação. A versão de referência anterior é `5584e1f`; restaurar seu deployment na Vercel, mantendo a migração aditiva e os registros. Não apagar clientes, pontos ou OS para tentar recuperar o funcionamento. Reversão da aplicação não desfaz ações de negócio já confirmadas pelo usuário.
