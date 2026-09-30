# Jornada informada pelo RH

- Regra padrão: 8 horas líquidas por dia útil (480 minutos), segunda a sexta, referência de 40 horas semanais.
- Divisor mensal para salário bruto: 200 horas, conforme orientação do usuário/RH.
- Mantida apuração diária das extras, sem compensação automática entre dias nem nova apuração de limite semanal.
- Mantidos adicionais existentes de dias úteis, sábado, domingo e feriado e intervalo automático configurado anteriormente.
- Migração 015 atualiza jornada da empresa, padrão de novos cadastros e carga mensal dos cadastros existentes. O gatilho já existente recalcula valor-hora de quem tem salário informado. Sem salário, não se inventa valor-hora.
- Não modifica regras/valores históricos em pontos ou cronômetros legados. Novos lançamentos, inclusive retroativos, usam as configurações atuais; ajustes de lançamentos antigos conservam suas regras e taxas salvas.
- Migração executada uma única vez, com trava e controle de aplicação. Reexecutá-la não sobrescreve alterações futuras de contrato/configuração.
- Verificação: 40 testes de regras, TypeScript, e teste isolado de migração com reversão integral, incluindo cadastros antigos/novos, cálculo salarial e preservação histórica.
- Reversão da interface pode usar 0b55b5d; reverter a aplicação não deve desfazer automaticamente a jornada solicitada pelo RH no banco.
