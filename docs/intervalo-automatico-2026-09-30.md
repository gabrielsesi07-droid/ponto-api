# Intervalo automático

- Novos lançamentos usam automaticamente a sobreposição com 12:00–13:00; se não houver, usam 19:00–20:00.
- Nunca somar as duas janelas no mesmo registro. 10:00–22:00 desconta 60 minutos, resultando em 11 horas líquidas.
- Sobreposição parcial desconta apenas a parte abrangida: 12:30–18:00 desconta 30 minutos. Fora das duas janelas, zero.
- Checkbox “Definir intervalo específico” revela duração em minutos, substituindo o automático. Zero é permitido para trabalho sem intervalo.
- API recalcula o automático; não confia no total enviado pela tela. Prévia e API compartilham a mesma função.
- Histórico não é recalculado. Ao editar, intervalo salvo fica no modo específico; desmarcar a caixa opta pelo recálculo padrão. O banco continua armazenando a duração aplicada, não o modo de origem.
- Compatibilidade: clientes antigos sem `break_mode` preservam a duração explícita enviada. Sem migração de banco.
- Regra é por registro, não uma dedução única entre múltiplas OS/turnos do dia. Não foram alteradas as regras de divisão por data.
- Verificação: 40 testes aprovados, TypeScript e lint aprovados. Casos incluem 10–22, segundo turno, limites exatos, sobreposição parcial e intervalo específico zero/90 minutos. Sem gravação de pontos reais para teste.
