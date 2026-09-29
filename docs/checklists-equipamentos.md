# Checklists de equipamentos por OS

## Uso e decisões

O catálogo representa **modelos**, não estoque físico. Listas extraídas de documentos vinculados entram como **importadas** e acompanham automaticamente o equipamento na OS, com aviso de que são referências sem aprovação técnica do procedimento. Em **Equipamentos → Configurar checklist**, o coordenador pode revisar a sugestão, ajustar descrições/quantidades e ativar o padrão revisado. A ativação também valida o modelo; não publica o documento original na biblioteca.

Ao gerar uma OS, o seletor pesquisável mostra todos os modelos não arquivados ao coordenador, inclusive os importados ainda em revisão. Selecionar um modelo não o publica nem libera seus documentos originais. Escolher um modelo com lista importada ou padrão ativo carrega sua prévia e cria uma cópia para a equipe. O coordenador pode preparar descrições, quantidades previstas e itens extras, mas não marcar conferências. A API e a transação de criação limpam marcações, quantidades reais e observações de conferência enviadas no planejamento. A criação da OS e dos checklists é uma única transação. Sem lista disponível, a OS pode ser criada normalmente, com aviso explícito para preparar os itens; não se inventa uma lista nem se cria um checklist vazio. Modelos arquivados já vinculados a uma OS continuam visíveis para preservar seu histórico.

Dentro da OS, um colaborador designado registra ida/entrega, volta/devolução, quantidades, identificação opcional da unidade e observações pelo próprio login. Havendo apenas um colaborador, ele já tem acesso; havendo vários, a equipe decide quem fará a conferência, sem atribuição obrigatória pelo coordenador nem bloqueio exclusivo para uma pessoa. O histórico identifica quem salvou cada revisão e quem concluiu. O coordenador acompanha e imprime, mas não pode salvar/concluir conferências, inclusive pela API e função SQL. Pode reabrir para que a equipe corrija. Divergências de quantidade e “não se aplica” exigem justificativa para concluir. Checklists vinculados pendentes impedem o encerramento da OS; serviços antigos sem checklist não são bloqueados. A impressão A4 dos dados salvos inclui cliente, serviço, equipe, veículo, datas, itens, autor da conclusão e campos de assinatura. O navegador permite salvar como PDF.

## Arquitetura

```text
Documento privado de referência
           │ extração conservadora + revisão humana
           ▼
Modelo do catálogo ── Checklist padrão (versão, importado/rascunho/ativo)
                                │ cópia na criação/edição da OS
                                ▼
                           Checklist da OS
                           ├─ itens extras e identificação
                           ├─ conferência ida / volta
                           ├─ histórico de alterações
                           └─ impressão autenticada
```

`checklist_templates` guarda um padrão por modelo. Seus estados são `imported` (referência automática ainda não revisada), `active` (revisado), `draft` (edição humana não liberada) e `archived`. `order_checklists` guarda uma cópia por par OS/modelo, com itens JSON, identificação, versão de origem, hash/nome do documento, versão do preenchimento e `source_review_pending` para distinguir referências importadas. `checklist_history` registra autor, data, ação e cópia integral de cada revisão. Nenhum documento interno é incluído no Git ou nos arquivos públicos.

Atualizar o padrão nunca reescreve OS anteriores. Remover um modelo da OS mantém a conferência histórica em modo de consulta; selecioná-lo novamente reutiliza essa cópia. Concluir bloqueia a edição; apenas o coordenador reabre, com motivo, enquanto a OS estiver aberta. OS encerradas ficam somente para consulta e impressão.

Exceção de reparação: vincular itens pode recuperar uma lista legada vazia apenas se aberta, versão 1, sem padrão vinculado, observações ou identificação. O reparo preserva o ID, incrementa a versão e gera auditoria. Listas preenchidas, editadas, encerradas ou sem uma referência válida nunca são substituídas. Operações novas de criação/personalização/preenchimento rejeitam listas vazias. A interface alerta quando não existe colaborador ativo designado na OS; não altera o perfil de ninguém nem escolhe automaticamente uma pessoa para a equipe.

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

As listas importadas só usam tabelas de itens reconhecidas e um documento de checklist não obsoleto identificado para cada modelo; um mesmo documento pode servir a vários modelos associados. Não copiam marcações, observações, datas e números de série preenchidos. A extração é uma **sugestão**, não garantia de completude ou validação técnica. Documentos obsoletos não originam novos vínculos; cópias históricas exibem aviso caso a origem seja posteriormente marcada obsoleta. O formulário de impressão é uma adaptação operacional, não uma reprodução oficial do layout SGQ.

## Operação e limites

- Migrações `007`, `009` (estado importado e proveniência) e `008` fazem parte de `scripts/migrate-orders.mjs`; a função `004` vincula/verifica checklists. Rodar novamente é seguro. A `009` reclassifica somente rascunhos iniciais intactos (versão 1, sem editor humano, origem pronta não obsoleta e itens existentes) como referências importadas. Rascunhos humanos e padrões desativados não são liberados.
- `node --env-file=.env scripts/seed-checklist-drafts.mjs` cria somente listas importadas ausentes a partir da biblioteca. Nunca substitui revisão humana, publica o documento original ou declara aprovação técnica.
- Sem filas, armazenamento extra, dependência de IA ou sincronização de rede em tempo real. O custo principal adicional é armazenamento do histórico JSON; medir crescimento antes de definir retenção com a empresa.
- O carregamento ocorre por OS/modelos selecionados, com consultas independentes em paralelo. Não há cache compartilhado de dados privados. A trava global simplifica a consistência, mas serializa mutações; medir contenção antes de migrar para travas por OS/modelo com ordem fixa.
- Pressuposto inicial: uma lista por modelo por OS, com identificação livre opcional. Várias unidades físicas do mesmo modelo não são inventário/reservas. Evoluir para múltiplas instâncias somente quando houver cadastro físico autorizado.
- Não há preenchimento offline, fotos de evidência, assinatura digital certificada, restauração de versões pela interface nem atualização ao vivo. São evoluções possíveis; salvar é explícito e conflitos não apagam dados.

## Verificação e publicação

`npm.cmd test` inclui horas e regras de checklist. `tests/checklists-smoke.mjs`, com servidor local em 5174 e banco migrado, cria fixtures identificadas e remove exclusivamente seus próprios registros/sessões. Cobre autorização, impressão, vínculo automático, personalização, versões, concorrência, conclusão e histórico. Também executar testes de operações/biblioteca, build, typecheck e lint. Não executar testes legados que exigem base vazia na produção.

Verificar visualmente no celular: caixas acessíveis, campos legíveis, lista sem rolagem horizontal e botões quebrando linha. Na impressão, verificar identificação e tabela; somente dados salvos entram no documento.

Publicação pelo Git integrado à Vercel, depois da migração aditiva. Conferir autenticação, ponto, OS, consultas de padrões e logs após publicar. Não presumir revisão independente ou aprovação de CI que não ocorreu. A separação de papéis também altera a função `008`: em rollback completo, avaliar essa definição junto da `004`. Conferências históricas, inclusive realizadas anteriormente por coordenadores, não são apagadas ou reatribuídas.

Se surgir falha de autorização, login/ponto ou erro persistente de OS, reverter o aplicativo ao deployment anterior validado. Preservar tabelas e histórico. Como o encerramento da OS ganhou uma regra SQL, um rollback completo exige restaurar a definição anterior de `order_action` (revisão anterior de `004`), sem apagar dados. A mudança de referências importadas também altera a função de vínculo de `007`; preservar a coluna/estado aditivos de `009` e as cópias recuperadas, avaliando as funções junto do aplicativo. Não basta reverter somente a interface. Não foi configurado monitoramento contínuo; a verificação pós-publicação é pontual.
