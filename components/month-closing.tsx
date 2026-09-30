"use client";
import { useState } from "react";
import { CheckCheck, Lock, LockOpen, LoaderCircle } from "lucide-react";
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
              Para fechar: todos os registros com saída e aprovados, depois do último dia do mês. Fechar trava o período para o pagamento das extras.
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
                  if (window.confirm(`Aprovar ${pendingScoped} registro(s) com saída de ${person ?? "toda a equipe"} em ${monthLabel(month)}? Registros sem saída não são aprovados.`))
                    void run("approve");
                }}
              >
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCheck size={16} />}
                Aprovar {pendingScoped} pendente(s){person ? ` de ${person}` : ""}
              </Button>
              <Button
                disabled={busy || !monthEnded || open > 0 || pendingAll > 0 || !inMonth.length}
                onClick={() => {
                  if (window.confirm(`Fechar ${monthLabel(month)}? Os registros de toda a equipe ficarão somente para consulta até uma reabertura justificada.`))
                    void run("close");
                }}
              >
                <Lock size={16} /> Fechar mês
              </Button>
            </>
          )}
        </div>
      </div>
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
