# Ordens de serviço e veículos

## Fluxo

1. Coordenador cadastra **Clientes** e **Veículos**. Informe a leitura inicial real do painel; após o cadastro, a quilometragem é atualizada por viagens.
2. Em **Ordens de serviço → Gerar OS**, seleciona cliente, equipe, veículo opcional, período, endereço e equipamentos/materiais. Pode anexar um PDF de até 3 MB.
3. Cada integrante vê somente as próprias OS. No dia previsto, a ficha abre automaticamente ao acessar o sistema (novamente em uma nova sessão ou quando a OS muda). A confirmação de leitura é visível à equipe.
4. **Ir · Google Maps** abre a navegação. Uma pessoa registra o km de saída e de retorno por viagem; não é preciso duplicar a leitura por colaborador. A frota mostra o último km informado e as viagens.
5. Cada integrante pode **Iniciar meu ponto nesta OS**, vinculando cliente, serviço e OS ao próprio ponto. O ponto continua sendo pausado/encerrado em **Meu ponto**. Iniciar atendimento ou registrar saída do veículo não inicia o ponto de todos.
6. A conclusão exige resultado do serviço e todos os pontos/viagens encerrados. O coordenador também pode cancelar com motivo. Só OS ainda não iniciadas podem ser reprogramadas.

Há numeração única, prioridade, contato do cliente, confirmação de leitura, histórico de ações, alerta de km de revisão e prevenção de reservas simultâneas de pessoas ou veículo. Equipamentos são uma lista textual na OS, não um controle de estoque.

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
- Testes: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build:vercel` e, com servidor local na porta 5174, `node --env-file=.env tests/operations-smoke.mjs`.
- O teste de OS cria cadastros temporários identificados por UUID e remove somente esses cadastros/sessões no final. Não altera PINs existentes. Não executar o teste antigo `tests/api-smoke.mjs` em banco com equipe cadastrada.
- Rollback do aplicativo: reativar o deployment anterior. As tabelas e colunas adicionais podem permanecer; não apagar OS/viagens criadas. O ponto anterior continua compatível com a migração.

## Verificação visual

- Formulários em uma coluna em telas estreitas, controles com rótulos, foco visível e botões de ação explícitos.
- Mensagens de carregamento, vazio, indisponibilidade e validação.
- Conferir criação/edição, leitura da OS, acesso ao PDF, ida/retorno e encerramento em computador e celular antes de alterações futuras.
