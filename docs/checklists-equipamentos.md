# Checklists de equipamentos por OS

## Uso e decisões

O catálogo representa **modelos**, não estoque físico. Em **Equipamentos → Configurar checklist**, o coordenador revisa a sugestão extraída do documento, ajusta descrições/quantidades e ativa o padrão. A ativação também valida o modelo para seleção na OS; não publica o documento original na biblioteca.

Ao gerar uma OS, o seletor pesquisável mostra todos os modelos não arquivados ao coordenador, inclusive os importados ainda em revisão. Selecionar um modelo não o publica nem libera documentos/checklists. Escolher um modelo com padrão ativo carrega sua prévia. O coordenador pode preparar descrições, quantidades previstas e itens extras, mas não marcar conferências. A API e a transação de criação limpam marcações, quantidades reais e observações de conferência enviadas no planejamento. A criação da OS e dos checklists é uma única transação. Sem padrão ativo, a OS pode ser criada normalmente; o coordenador configura o padrão dentro do próprio formulário ou cria uma lista exclusiva depois. Modelos arquivados já vinculados a uma OS continuam visíveis para preservar seu histórico.

Dentro da OS, um colaborador designado registra ida/entrega, volta/devolução, quantidades, identificação opcional da unidade e observações pelo próprio login. Havendo apenas um colaborador, ele já tem acesso; havendo vários, a equipe decide quem fará a conferência, sem atribuição obrigatória pelo coordenador nem bloqueio exclusivo para uma pessoa. O histórico identifica quem salvou cada revisão e quem concluiu. O coordenador acompanha e imprime, mas não pode salvar/concluir conferências, inclusive pela API e função SQL. Pode reabrir para que a equipe corrija. Divergências de quantidade e “não se aplica” exigem justificativa para concluir. Checklists vinculados pendentes impedem o encerramento da OS; serviços antigos sem checklist não são bloqueados. A impressão A4 dos dados salvos inclui cliente, serviço, equipe, veículo, datas, itens, autor da conclusão e campos de assinatura. O navegador permite salvar como PDF.

## Arquitetura

```text
Documento privado de referência
           │ extração conservadora + revisão humana
           ▼
Modelo do catálogo ── Checklist padrão (versão, rascunho/ativo)
                                │ cópia na criação/edição da OS
                                ▼
                           Checklist da OS
                           ├─ itens extras e identificação
                           ├─ conferência ida / volta
                           ├─ histórico de alterações
                           └─ impressão autenticada
```

`checklist_templates` guarda um padrão por modelo. `order_checklists` guarda uma cópia por par OS/modelo, com itens JSON, identificação, versão de origem, hash/nome do documento e versão do preenchimento. `checklist_history` registra autor, data, ação e cópia integral de cada revisão. Nenhum documento interno é incluído no Git ou nos arquivos públicos.

Atualizar o padrão nunca reescreve OS anteriores. Remover um modelo da OS mantém a conferência histórica em modo de consulta; selecioná-lo novamente reutiliza essa cópia. Concluir bloqueia a edição; apenas o coordenador reabre, com motivo, enquanto a OS estiver aberta. OS encerradas ficam somente para consulta e impressão.

**Rascunho e padrão ativo compartilham o mesmo registro.** Salvar como rascunho/desativar interrompe a associação automática para novas OS. A interface avisa isso. Não existe publicação paralela de rascunho e versão ativa nesta entrega.

## Contratos e segurança

| Rota | Acesso | Finalidade |
| --- | --- | --- |
| `GET/POST /api/checklists/templates` | Coordenador | Revisar origem e salvar/ativar padrão |
| `GET /api/checklists/preview` | Coordenador | Prévia dos modelos selecionados |
| `GET /api/checklists?order=…` | Coordenador ou equipe designada | Conferências e histórico da OS |
| `POST /api/checklists` | Conforme a ação | Colaborador designado salva/conclui; coordenador vincula/cria/reabre |
| `/checklists/[id]/print` | Coordenador ou equipe designada | Documento de impressão privado |

Validação de tipos e limites no servidor, checagem de origem, corpo limitado a 150 KB e respostas privadas sem cache. Cada lista aceita até 80 itens; uma OS aceita até 30 modelos. O limite total do corpo pode ser atingido antes ao personalizar muitas listas extensas.

Funções SQL compartilham o bloqueio transacional das operações de OS. Comparação de versão evita sobrescrever alterações de outro usuário; a edição concorrente retorna conflito para reabrir a tela. O mesmo vale para personalização de uma nova OS quando o padrão mudou enquanto o formulário estava aberto. Vincular novamente é idempotente.

Os rascunhos iniciais só usam tabelas de itens reconhecidas em documentos explicitamente associados a um único modelo. Não copiam marcações, observações, datas e números de série preenchidos. A extração é uma **sugestão**, não garantia de completude ou validação técnica. Documentos obsoletos não originam novos padrões ativos; cópias históricas exibem aviso caso a origem seja posteriormente marcada obsoleta. O formulário de impressão é uma adaptação operacional, não uma reprodução oficial do layout SGQ.

## Operação e limites

- Migrações `007` e `008` são aditivas e fazem parte de `scripts/migrate-orders.mjs`; a função `004` passa a vincular/verificar checklists. Rodar novamente é seguro.
- `node --env-file=.env scripts/seed-checklist-drafts.mjs` cria apenas rascunhos ausentes a partir da biblioteca já importada. Nunca substitui revisão humana existente nem ativa automaticamente.
- Sem filas, armazenamento extra, dependência de IA ou sincronização de rede em tempo real. O custo principal adicional é armazenamento do histórico JSON; medir crescimento antes de definir retenção com a empresa.
- O carregamento ocorre por OS/modelos selecionados, com consultas independentes em paralelo. Não há cache compartilhado de dados privados. A trava global simplifica a consistência, mas serializa mutações; medir contenção antes de migrar para travas por OS/modelo com ordem fixa.
- Pressuposto inicial: uma lista por modelo por OS, com identificação livre opcional. Várias unidades físicas do mesmo modelo não são inventário/reservas. Evoluir para múltiplas instâncias somente quando houver cadastro físico autorizado.
- Não há preenchimento offline, fotos de evidência, assinatura digital certificada, restauração de versões pela interface nem atualização ao vivo. São evoluções possíveis; salvar é explícito e conflitos não apagam dados.

## Verificação e publicação

`npm.cmd test` inclui horas e regras de checklist. `tests/checklists-smoke.mjs`, com servidor local em 5174 e banco migrado, cria fixtures identificadas e remove exclusivamente seus próprios registros/sessões. Cobre autorização, impressão, vínculo automático, personalização, versões, concorrência, conclusão e histórico. Também executar testes de operações/biblioteca, build, typecheck e lint. Não executar testes legados que exigem base vazia na produção.

Verificar visualmente no celular: caixas acessíveis, campos legíveis, lista sem rolagem horizontal e botões quebrando linha. Na impressão, verificar identificação e tabela; somente dados salvos entram no documento.

Publicação pelo Git integrado à Vercel, depois da migração aditiva. Conferir autenticação, ponto, OS, consultas de padrões e logs após publicar. Não presumir revisão independente ou aprovação de CI que não ocorreu. A separação de papéis também altera a função `008`: em rollback completo, avaliar essa definição junto da `004`. Conferências históricas, inclusive realizadas anteriormente por coordenadores, não são apagadas ou reatribuídas.

Se surgir falha de autorização, login/ponto ou erro persistente de OS, reverter o aplicativo ao deployment anterior validado. Preservar tabelas e histórico. Como o encerramento da OS ganhou uma regra SQL, um rollback completo exige restaurar a definição anterior de `order_action` (revisão anterior de `004`), sem apagar dados. Não basta reverter somente a interface. Não foi configurado monitoramento contínuo; a verificação pós-publicação é pontual.
