// Designação de responsável por checklist pendente (OS em andamento).
// Regras de interface; o servidor revalida autorização, estado e versão.
export type Assignee = { id: string; name: string; access_code?: string; in_team?: boolean };
export type AssignmentFields = {
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  assigned_by_name?: string | null;
  assigned_at?: string | null;
  assignment_reason?: string | null;
};
export const ASSIGNMENT_REASON_MIN = 10;
export const ASSIGNMENT_REASON_MAX = 500;

/** A ação só aparece para o coordenador, em OS em andamento, num checklist aberto e quando o servidor informa os elegíveis. Checklist sem itens não é excluído: a designação não pode perpetuar um bloqueio legado. */
export function canAssignChecklist(input: {
  admin: boolean;
  running: boolean;
  checklist: { status: string; detached: boolean };
  assignees?: Assignee[];
}) {
  const { admin, running, checklist, assignees } = input;
  return admin && running && checklist.status === "open" && !checklist.detached && Array.isArray(assignees);
}

/** Elegíveis exceto o responsável atual; quem já está na equipe aparece primeiro. */
export function assignmentCandidates(assignees: Assignee[], current?: string | null) {
  return assignees
    .filter((a) => a.id !== current)
    .sort((a, b) => Number(!!b.in_team) - Number(!!a.in_team) || a.name.localeCompare(b.name, "pt-BR"));
}

export function assignmentIssue(assigneeId: string, reason: string, current?: string | null) {
  if (!assigneeId) return "Escolha o colaborador que vai assumir a conferência.";
  if (assigneeId === current) return "Escolha uma pessoa diferente do responsável atual.";
  const size = reason.trim().length;
  if (size < ASSIGNMENT_REASON_MIN) return `Informe o motivo com pelo menos ${ASSIGNMENT_REASON_MIN} caracteres.`;
  if (size > ASSIGNMENT_REASON_MAX) return `O motivo pode ter no máximo ${ASSIGNMENT_REASON_MAX} caracteres.`;
  return null;
}
