// Mensagem de formulário para horários já bem formatados que não formam uma jornada.
// Não cria regra nova: espelha a recusa de POST /api/entries ("saída após a entrada,
// com intervalo menor que a jornada"). Formato inválido continua com a validação nativa.
const validStart = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const validEnd = (s: string) => /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(s);
const toMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export function entryTimeIssue(start: string, end: string, pause: number): string | null {
  if (!validStart(start) || !validEnd(end)) return null;
  if (toMinutes(end) <= toMinutes(start))
    return "A saída deve ser depois da entrada. Se o trabalho passou da meia-noite, registre cada data separadamente: até 24:00 no primeiro dia e a partir de 00:00 no seguinte.";
  if (Number.isInteger(pause) && pause >= 0 && toMinutes(end) - toMinutes(start) <= pause)
    return "O intervalo deve ser menor que o tempo entre a entrada e a saída.";
  return null;
}
