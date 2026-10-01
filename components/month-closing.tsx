"use client";
import { useState } from "react";
import { CheckCheck, Lock, LockOpen, LoaderCircle, CircleCheck, Circle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "./editors";
import { today, type Entry, type State } from "@/lib/domain";

const monthLabel = (month: string) => month.split("-").reverse().join("/");

/** Fechamento do mês: aprovação em lote, fechamento e reabertura auditada. */
export function MonthClosing({
  state,
  month,
  userId,
  entries,
  demo,
  onChanged,
}: {
  state: State;
  month: string;
  userId: string;
  entries: Entry[];
  demo: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [reopening, setReopening] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const admin = state.me.role === "coordinator";
  const closing = state.closedMonths?.find((c) => c.month === month);
  const inMonth = entries.filter((e) => e.date.slice(0, 7) === month);
  const scoped = userId === "all" ? inMonth : inMonth.filter((e) => e.user_id === userId);
  const open = inMonth.filter((e) => !e.end).length,
    pendingAll = inMonth.filter((e) => e.end && e.status !== "Aprovado").length,
    pendingScoped = scoped.filter((e) => e.end && e.status !== "Aprovado").length;
  const monthEnded = month < today().slice(0, 7);
  const person = state.users.find((u) => u.id === userId)?.name;
  const zeroRate = inMonth.filter(e => Number(e.rate) === 0).length;
  const reviewed = scoped.filter(e => e.end && e.status === 'Revisado').length;
  const readiness = [
    { label: 'Período encerrado', done: monthEnded, detail: monthEnded ? 'O último dia do mês já passou.' : 'Disponível após o último dia do mês.' },
    { label: 'Horários completos', done: inMonth.length > 0 && open === 0, detail: !inMonth.length ? 'Nenhum registro neste mês.' : open ? `${open} registro(s) sem saída.` : `${inMonth.length} registro(s) com saída.` },
    { label: 'Registros aprovados', done: inMonth.length > 0 && pendingAll === 0, detail: pendingAll ? `${pendingAll} aguardando decisão.` : inMonth.length ? 'Todos os registros foram aprovados.' : 'Aguardando registros.' },
  ];

  async function run(action: "approve" | "close" | "reopen") {
    if (demo) {
      toast.info("A demonstração não altera dados.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ approved?: number }>("/api/closings", {
        action,
        month,
        user_id: action === "approve" && userId !== "all" ? userId : null,
        reason: action === "reopen" ? reason : "",
      });
      await onChanged();
      setReopening(false);
      setReason("");
      toast.success(
        action === "approve"
          ? `${result.approved ?? 0} registro(s) aprovado(s).`
          : action === "close"
            ? `Mês ${monthLabel(month)} fechado. Os registros ficaram somente para consulta.`
            : `Mês ${monthLabel(month)} reaberto. O motivo foi registrado na auditoria.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!admin)
    return closing ? (
      <p className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <Lock size={16} /> O mês {monthLabel(month)} foi fechado pelo coordenador. Os registros dele ficam somente para consulta.
      </p>
    ) : null;

  return (
    <section className="panel mb-6 p-5" aria-label="Fechamento do mês">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2">
            {closing ? <Lock size={18} /> : <LockOpen size={18} />}
            Fechamento de {monthLabel(month)}
          </h2>
          <p className="muted mt-1 text-sm">
            {closing
              ? `Fechado por ${closing.closed_by} em ${new Date(closing.closed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Nenhum registro do mês pode ser criado, alterado, aprovado ou excluído.`
              : `${inMonth.length} registro(s) no mês · ${pendingAll} aguardando aprovação · ${open} sem saída.`}
          </p>
          {!closing && (
            <p className="muted mt-1 text-xs">
              O fechamento protege os registros de toda a equipe, mesmo quando a tela está filtrada por uma pessoa. Os valores apresentados são estimativas.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {closing ? (
            <Button variant="outline" disabled={busy} onClick={() => setReopening((v) => !v)}>
              <LockOpen size={16} /> Reabrir mês
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy || !pendingScoped}
                onClick={() => {
                  if (window.confirm(`Aprovar ${pendingScoped} registro(s) com saída de ${person ?? "toda a equipe"} em ${monthLabel(month)}? Registros sem saída não são aprovados.${reviewed ? ` Inclui ${reviewed} registro(s) marcado(s) como Revisado, que passarão a Aprovado.` : ''}`))
                    void run("approve");
                }}
              >
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCheck size={16} />}
                Aprovar {pendingScoped} pendente(s){person ? ` de ${person}` : ""}
              </Button>
              <Button
                disabled={busy || !monthEnded || open > 0 || pendingAll > 0 || !inMonth.length}
                onClick={() => {
                  if (window.confirm(`Fechar ${monthLabel(month)}? Os registros de toda a equipe ficarão somente para consulta até uma reabertura justificada. Confira se todos os serviços realizados tiveram suas horas registradas.${zeroRate ? ` Atenção: ${zeroRate} registro(s) têm valor-hora zero. Configurar o salário depois não altera esses registros.` : ''}`))
                    void run("close");
                }}
              >
                <Lock size={16} /> Fechar mês
              </Button>
            </>
          )}
        </div>
      </div>
      {!closing && (
        <div className="mt-5 space-y-3">
          <ol className="grid gap-3 md:grid-cols-3" aria-label="Conferência para fechar o mês">
            {readiness.map((step, index) => (
              <li key={step.label} className={`flex gap-3 rounded-xl border p-3 ${step.done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                {step.done ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" /> : <Circle size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />}
                <div><p className="text-sm font-semibold">{index + 1}. {step.label}<span className="sr-only"> — {step.done ? 'Concluído' : 'Pendente'}</span></p><p className="mt-1 text-xs text-slate-600">{step.detail}</p></div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-600">Antes de fechar, confira também as OS: esta verificação considera os pontos existentes e não confirma se todos os colaboradores já lançaram suas horas.</p>
          {zeroRate > 0 && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="note"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><p><strong>{zeroRate} registro(s) com valor-hora zero.</strong> Confira os valores antes de usar o relatório. Alterar o salário atual não recalcula pontos antigos.</p></div>}
        </div>
      )}
      {reopening && (
        <div className="mt-4 space-y-2">
          <label className="block text-sm">
            Motivo da reabertura (mínimo de 10 caracteres)
            <textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: correção de horário solicitada pelo RH." />
          </label>
          <Button disabled={busy || reason.trim().length < 10} onClick={() => void run("reopen")}>
            Confirmar reabertura
          </Button>
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
