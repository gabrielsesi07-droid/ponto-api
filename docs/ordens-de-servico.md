# Ordens de serviço e veículos

## Fluxo

1. O cadastro **prévio** de Clientes é opcional. Ao salvar a OS, o nome é comparado aos cadastros ativos ignorando acentos, maiúsculas e espaços repetidos. Se houver um correspondente, ele será vinculado; se não houver, o cliente será cadastrado na mesma transação. Falhar a OS desfaz também esse cadastro. Nomes parecidos são apenas sugestões, nunca fundidos automaticamente. Cadastros inativos exigem reativação; homônimos já existentes exigem seleção explícita. Para utilizar carro da empresa, cadastre o **Veículo** com a leitura inicial real do painel; depois, a quilometragem é atualizada por viagens.
2. Em **Ordens de serviço → Gerar OS**, informa o nome do cliente, serviço, equipe e período. Veículo, endereço, contato, equipamentos/materiais e PDF de até 3 MB são opcionais. O atalho de cliente cadastrado preenche os dados quando desejado.
3. Cada integrante vê somente as próprias OS. No dia previsto, a ficha abre automaticamente ao acessar o sistema (novamente em uma nova sessão ou quando a OS muda). A confirmação de leitura é visível à equipe.
4. **Ir · Google Maps** abre a navegação quando a OS possui endereço. Uma pessoa registra o km de saída e de retorno por viagem; não é preciso duplicar a leitura por colaborador. A frota mostra o último km informado e as viagens.
5. Cada integrante pode **Iniciar meu ponto nesta OS**, vinculando cliente, serviço e OS ao próprio ponto. O ponto continua sendo pausado/encerrado em **Meu ponto**. Iniciar atendimento ou registrar saída do veículo não inicia o ponto de todos.
6. A conclusão exige resultado do serviço e todos os pontos/viagens encerrados. O coordenador também pode cancelar com motivo. Só OS ainda não iniciadas podem ser reprogramadas.

Há numeração única e sequencial (`OS-000001`, `OS-000002`…), prioridade, contato, confirmação de leitura, histórico, alerta de km de revisão e prevenção de reservas simultâneas. A sequência é gerada pelo banco, não aleatória. Editar usa UPDATE, preserva o número e não consome a sequência. Números antigos não são alterados nem reutilizados; exclusões e falhas posteriores à alocação podem deixar lacunas. Os testes antigos também consumiam números reais; os testes transacionais novos usam sequência isolada e são totalmente revertidos.

Equipamentos selecionados ficam em `model_ids`; a API resolve seus nomes/famílias em `equipment_models`, exibidos no detalhe para coordenador e equipe. O campo textual é apenas para materiais adicionais: estar vazio não significa que nenhum modelo foi selecionado. OS 102 já tinha Radian Core e checklist persistidos; a correção é de exibição, sem regravar suas conferências. O catálogo representa modelos, não estoque físico.

A busca sugere cadastros e nomes de OS anteriores, prioriza correspondência exata/parcial e tolera até dois pequenos erros no nome completo (a partir de cinco caracteres). Selecionar um cadastro preenche endereço/contato/telefone somente onde o formulário está vazio. Salvar uma OS não altera silenciosamente o endereço de um cliente existente. Apenas novas gravações fazem o vínculo automático; não há cadastro retroativo em massa.

## Endereços e Google

O preenchimento manual e o botão de navegação funcionam sem chave. A pesquisa está preparada para **Places API (New)**, somente pelo servidor e somente para o coordenador. Sem chave, sem resultados ou em caso de falha, o formulário continua utilizável.

Para ativar posteriormente:

- Habilitar Places API (New) em um projeto Google Cloud e configurar faturamento, restrição de API, limites de uso e alertas de custo.
- Adicionar `GOOGLE_MAPS_API_KEY` como variável secreta no ambiente da aplicação/Vercel e publicar novamente. Não usar prefixo `NEXT_PUBLIC_`, não enviar a chave no chat e não versionar `.env`.
- Antes de ativar, publicar termos de uso e política de privacidade próprios da empresa, com as referências exigidas pelo Google. Consultar as políticas oficiais abaixo.
- Validar uma pesquisa, uma seleção e a navegação com a chave real. Não foi possível testar chamadas reais sem a chave.

As sugestões são transitórias, sem cache; apenas o endereço confirmado na OS e o identificador do lugar são persistidos. A pesquisa tem atraso de 450 ms e cancela a requisição anterior ao digitar; usa faturamento por requisição, sem sessão de Place Details. O destino pode ser editado manualmente e isso remove o identificador previamente selecionado.

Referências utilizadas:

- [Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete)
- [Google Maps URLs, sem necessidade de chave](https://developers.google.com/maps/documentation/urls/get-started)
- [Políticas e atribuição do Google Maps](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Campos e ciclo de atendimento no Microsoft Field Service](https://learn.microsoft.com/en-us/dynamics365/field-service/work-order-experience)

## Dados, segurança e publicação

- Migração: `npm run db:migrate`. Adiciona estruturas sem remover dados existentes. Para uma instalação já atualizada até o módulo de ponto: `node --env-file=.env scripts/migrate-orders.mjs`.
- PDF fica protegido por sessão e por vínculo à OS, armazenado no banco; não há URL pública. O limite de 3 MB evita exceder o corpo de requisição da hospedagem. Substituir o PDF remove a versão anterior do anexo, mas mantém o evento no histórico. Não há antivírus integrado.
- Alterações de agenda e km são serializadas em transação. Saída duplicada, redução de odômetro, retorno sem saída e edição com versão antiga são bloqueados.
- OS concluídas/canceladas ficam disponíveis no histórico e não aceitam novas viagens ou troca de anexo.
- Testes seguros desta alteração: `npm test`, `npm run test:order-workflow`, `npm run lint` e `npm run build:vercel`. O teste de fluxo cria um schema aleatório com suas próprias tabelas/sequências dentro de uma única transação e provoca rollback controlado; confirma que o schema desapareceu. Não consome números, clientes, usuários ou OS reais.
- Os testes HTTP `operations-smoke`, `checklists-smoke` e `library-smoke` agora exigem `TEST_DATABASE_URL`, apontando para banco de testes isolado; o servidor local também deve usar esse mesmo banco. Não definir essa variável com a conexão de produção. Nesta entrega, o fluxo SQL isolado e 16 testes unitários foram executados; a suíte HTTP mutante não foi rodada novamente por não haver banco de testes separado. As telas foram conferidas com acesso local somente leitura e sugestões não salvas. Não executar `tests/api-smoke.mjs` em banco com equipe cadastrada.
- Migração adicional `010-client-search.sql` seguida de `004-order-actions.sql`, incluída em `migrate-orders.mjs`. Em rollback por regressão em login/ponto/OS, reverter aplicativo e `order_action` juntos; preservar clientes criados e a função auxiliar aditiva. Não reiniciar/reduzir a sequência. Publicação via Git/Vercel, sem revisão independente; verificar os endpoints privados e logs após deploy, sem criar OS reais de teste. Monitoramento pontual, não contínuo.
- Rollback do aplicativo: reativar o deployment anterior. As tabelas e colunas adicionais podem permanecer; não apagar OS/viagens criadas. O ponto anterior continua compatível com a migração.

## Verificação visual

- Formulários em uma coluna em telas estreitas, controles com rótulos, foco visível e botões de ação explícitos.
- Mensagens de carregamento, vazio, indisponibilidade e validação.
- Conferir criação/edição, leitura da OS, acesso ao PDF, ida/retorno e encerramento em computador e celular antes de alterações futuras.
