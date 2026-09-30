# Notificações de novas OS

## Ativação

Somente em Meu acesso, cada pessoa toca em **Ativar notificações neste aparelho** e aceita a permissão do navegador. No iPhone/iPad (16.4+), adicionar o site à Tela de Início, abrir pelo ícone e entrar antes de ativar. Android usa navegador compatível atualizado. Instalar/autorizar não pode ser feito pelo servidor.

## Fluxo e segurança

- Inserção de uma OS gera fila na mesma transação para os aparelhos dos integrantes designados que tenham sessão válida. Falha de entrega externa não desfaz a OS.
- Após salvar, o servidor tenta enviar em segundo plano. O aviso contém somente o número da OS; não inclui nome, endereço, cliente ou valores.
- Tocar abre a OS pelo identificador. Login e autorização continuam obrigatórios. O acesso direto não marca ciência automaticamente.
- Editar uma OS não repete o aviso de criação. Equipamentos/documentos não são enviados ao provedor push.
- Sair da conta remove a inscrição daquela sessão e seus trabalhos pendentes. Ao entrar novamente, inscrição já autorizada pode ser associada à sessão atual ao abrir Meu acesso. Desativar remove o aparelho.
- VAPID: par gerado uma vez, armazenado em tabela privada do banco, nunca no bundle cliente ou logs. API expõe somente chave pública. Preservar o par nos backups; trocar a chave exige reinscrição dos aparelhos.
- Endpoint de entrega restrito a provedores compatíveis Apple, Google, Mozilla e Windows; HTTPS obrigatório, sem credenciais/porta alternativa. Autenticação e proteção de origem nas inscrições.

## Entrega e limites

- Permissão e inscrição devem existir **antes** da criação da OS. Não há disparo retroativo em massa ao ativar.
- Aceitação pelo provedor não comprova exibição, recebimento humano ou leitura. TTL de até 24h permite ao provedor aguardar aparelho offline; sistema operacional pode suprimir avisos.
- Fila com trava, lease e tentativas limitadas. Duplicidade em recuperação de processo é possível; tag da OS substitui o aviso anterior no aparelho.
- Falha transitória fica pendente por 5 minutos e é retomada no próximo salvamento de OS. Coordenador também pode tocar **Tentar avisos pendentes novamente** em Meu acesso. Não há cron independente: se ninguém usar o sistema após uma falha de envio, a nova tentativa depende desse comando/novo salvamento. Limite de execução de 40s/200 trabalhos por chamada; restante é mantido para próxima tentativa.
- HTTP 404/410 remove inscrição expirada. Avisos com mais de 24h expiram; ordens canceladas/concluídas e pessoas removidas da equipe não recebem tentativas pendentes.
- Notificação já aceita pelo provedor não pode ser recolhida pelo servidor após logout/cancelamento. A abertura permanece protegida por login/permissões.
- Sistema não envia WhatsApp, SMS nem cria agendamento do Codex.

## Verificação

- Testes de destinatário designado, sessão expirada, edição sem duplicar, revogação no logout, destino permitido e abertura somente na origem do sistema.
- Migração testada duas vezes em esquema isolado com reversão integral. Nenhuma notificação real disparada nos testes.
- Compilação de produção concluída. Entrega física em Android/iPhone ainda depende da ativação e validação no aparelho real.
- Validação local: 42 testes unitários e 70 verificações HTTP passaram; lint e TypeScript sem erros. Service worker, manifesto e ícone responderam HTTP 200. Não houve teste visual nem entrega em aparelho físico nesta etapa.

## Operação

Executar `scripts/migrate-push.mjs` antes de publicar. Alteração aditiva, sem migrar pontos antigos. Reversão da aplicação: commit 72eadb9; preservar tabelas/chaves. Avisos já aceitos pelos provedores podem chegar até expirar o TTL. Consultar `push_jobs` sem imprimir endpoints/chaves; `sent` indica apenas aceitação pelo provedor. Expansão recomendada para maior escala: worker agendado independente com observabilidade de fila.
