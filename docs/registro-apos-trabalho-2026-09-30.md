# Registro de horas após o trabalho

## Estratégia implementada

O fluxo principal deixa de medir tempo ao vivo e passa a registrar o trabalho realizado: data → OS → entrada/saída/intervalo → prévia da duração → salvar. Não se presume que a previsão da OS represente horas reais.

- Tela Meu ponto: ação principal “Registrar horas trabalhadas”, totais registrados hoje, histórico, resumo e configuração salarial.
- Formulário: horários vazios para novos registros, data editável e calendário, OS obrigatória e dados do cliente/serviço vinculados à ordem.
- Prévia: duração líquida; a apuração das extras continua diária, considerando todos os registros e regras existentes.
- Acesso pela OS: formulário com OS e data agendada preenchidas (revisáveis), inclusive em OS concluída/cancelada para horas efetivamente trabalhadas. Não reabre o atendimento.
- Concluir OS não comprova que todos já lançaram horas. O painel verifica somente registros incompletos e cronômetros legados.
- Novos cronômetros rejeitados pela API. Entrada/saída obrigatórias no registro manual, inclusive em ajustes; validações existentes de sobreposição e permissões permanecem.
- Não alterados salário, adicionais, aprovação, retroatividade ou registros históricos. Retroatividade desabilitada pela empresa continua impedindo registro de outro dia.

## Transição

Cronômetros já abertos não são apagados nem encerrados automaticamente. Apenas esses usuários veem o controle antigo na tela Meu ponto. Encerrar usa a hora atual, como antes; a interface orienta corrigir o histórico ou solicitar ajuste ao coordenador caso o trabalho tenha terminado antes. Isso é uma limitação de transição, não um horário real inferido pelo sistema.

Virada de dia usa registros separados, encerrando o primeiro em 24:00 e iniciando o seguinte em 00:00. Não há divisão automática nem conversão silenciosa de horários.

## Verificação

- TypeScript e compilação de produção aprovados.
- 39 testes unitários/regras (38 existentes mais duração manual).
- 64 verificações HTTP locais sem mutações de negócio; sessões de teste revogadas.
- Interface do colaborador: abertura do formulário, campos sem horário inventado, prévia 08:00–18:00 menos 60min = 9h; inspeção em 390px.
- Fluxo de gravação real não exercitado com OS de produção. Sem banco independente para teste HTTP de escrita integral. Cronômetro legado não foi encerrado para teste.

Sem migração de banco nesta entrega. Reversão: versão anterior d017ff0, sem restaurar ou apagar dados.
