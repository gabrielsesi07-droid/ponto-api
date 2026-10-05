"use client";
import { Pencil, Trash2, CheckCheck, SearchCheck, Lock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Blank, Status } from "./controls";
import { pointOrderNumber } from '@/lib/point-orders';
import { entryEditExplanation } from '@/lib/entry-access';
import {
  duration,
  money,
  initials,
  isClosedMonth,
  type State,
  type Calculated,
  type Entry,
} from "@/lib/domain";
export function EntriesTable({
  rows,
  state,
  onEdit,
  onDelete,
  onStatus,
  compact = false,
  busy = false,
}: {
  rows: Calculated[];
  state: State;
  onEdit: (e: Entry) => void;
  onDelete: (e: Entry) => void;
  onStatus: (e: Entry, s: Entry["status"]) => void;
  compact?: boolean;
  busy?: boolean;
}) {
  const admin = state.me.role === "coordinator";
  const date = (v: string) =>
    state.settings.date_format === "yyyy-MM-dd"
      ? v
      : v.split("-").reverse().join("/");
  const time = (v: string | null) =>
    !v
      ? "Em aberto"
      : state.settings.time_format === "24h"
        ? v.slice(0, 5)
        : new Date("2000-01-01T" + v).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
  const actions = (e: Calculated) => isClosedMonth(state, e.date) ? (
    <span className="inline-flex items-center gap-1 text-xs muted" title="Mês fechado. O coordenador pode reabri-lo com justificativa.">
      <Lock size={14} /> Mês fechado
    </span>
  ) : (
    <div className="flex gap-1">
      {entryEditExplanation(state.me, e, false) ? (
        <span className="max-w-64 text-xs leading-relaxed text-slate-600">
          <Lock size={14} className="mr-1 inline" />{entryEditExplanation(state.me, e, false)}
        </span>
      ) : (
        <Button
          disabled={busy}
          size="icon"
          variant="ghost"
          aria-label="Editar lançamento"
          title="Editar lançamento"
          onClick={() => onEdit(e)}
          className="action"
        >
          <Pencil size={16} />
        </Button>
      )}
      {admin && (
        <>
          <Button
            disabled={busy || !e.end || e.status === "Aprovado"}
            size="icon"
            variant="ghost"
            aria-label="Aprovar lançamento"
            title={!e.end ? 'Preencha a saída antes de aprovar' : e.status === 'Aprovado' ? 'Este lançamento já está aprovado' : 'Aprovar lançamento'}
            onClick={() => onStatus(e, "Aprovado")}
            className="action text-emerald-700"
          >
            <CheckCheck size={16} />
          </Button>
          <Button
            disabled={busy || e.status === "Revisado"}
            size="icon"
            variant="ghost"
            aria-label="Marcar como revisado"
            title="Marcar revisado"
            onClick={() => onStatus(e, "Revisado")}
            className="action"
          >
            <SearchCheck size={16} />
          </Button>
          <Button
            disabled={busy}
            size="icon"
            variant="ghost"
            aria-label="Excluir lançamento"
            title="Excluir"
            onClick={() => onDelete(e)}
            className="action text-red-600"
          >
            <Trash2 size={16} />
          </Button>
        </>
      )}
    </div>
  );
  if (!rows.length)
    return (
      <Blank description={admin ? 'Nenhum lançamento neste recorte. Ajuste o período, a pessoa ou o status para conferir os pontos da equipe.' : 'Nenhum lançamento neste recorte. Ajuste os filtros ou registre as horas realizadas em uma OS designada para você.'} />
    );
  return (
    <>
      <div className="md:hidden divide-y">
        {rows.map((e) => (
          <article key={e.id} className="p-4">
            <div className="flex justify-between items-center gap-3">
              <b className="text-sm">{date(e.date)}</b>
              <Status value={e.status} />
            </div>
            {admin && (
              <p className="text-sm font-medium mt-2">
                {state.users.find((u) => u.id === e.user_id)?.name}
              </p>
            )}
            <p className="text-sm muted mt-2">
              {time(e.start)} — {time(e.end)} · {e.break_minutes} min de pausa
            </p>
            <p className="mt-2 text-sm">
              <span className="block text-xs font-semibold text-blue-800">{e.order_number ? pointOrderNumber(e.order_number, e.order_official_number) : 'Histórico anterior · sem OS'}</span>
              <b>{e.company || "Empresa não informada"}</b>
              <span className="muted"> · {e.service}</span>
            </p>
            <div className="grid grid-cols-2 gap-3 my-4">
              <div>
                <span className="muted text-xs">TRABALHADAS</span>
                <b className="block num text-sm mt-1">{duration(e.worked)}</b>
              </div>
              <div>
                <span className="muted text-xs">EXTRAS</span>
                <b className="block text-amber-700 num text-sm mt-1">
                  {duration(e.extra)} · {money(e.amount, e.rules.currency)}
                </b>
              </div>
            </div>
            {!compact && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                <span className="text-xs muted">{e.kind}</span>
                {actions(e)}
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="hidden md:block">
        <Table className="report-table">
          <TableHeader>
            <TableRow>
              {[
                "Data",
                ...(admin ? ["Colaborador"] : []),
                "Entrada · saída",
                "Empresa · serviço",
                ...(!compact ? ["Intervalo", "Tipo"] : []),
                "Trabalhadas",
                "Extras",
                "Valor estimado",
                "Status",
                ...(!compact ? ["Ações"] : []),
              ].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => {
              const person = state.users.find((u) => u.id === e.user_id);
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {date(e.date)}
                  </TableCell>
                  {admin && (
                    <TableCell>
                      <span className="flex items-center gap-2.5 whitespace-nowrap">
                        <span className="avatar">
                          {initials(person?.name || "?")}
                        </span>
                        {person?.name}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap num">
                    {time(e.start)}
                    <span className="muted px-1">—</span>
                    <span className={!e.end ? "text-amber-700" : ""}>
                      {time(e.end)}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-52">
                    <span className="block text-xs font-semibold text-blue-800">{e.order_number ? pointOrderNumber(e.order_number, e.order_official_number) : 'Histórico anterior · sem OS'}</span>
                    <b className="block">{e.company || "Não informada"}</b>
                    <span className="muted block max-w-64 truncate text-xs">
                      {e.service}
                    </span>
                  </TableCell>
                  {!compact && (
                    <>
                      <TableCell>{e.break_minutes} min</TableCell>
                      <TableCell>
                        <span
                          className={
                            e.kind !== "Dia útil" ? "badge pending" : "muted"
                          }
                        >
                          {e.kind}
                        </span>
                      </TableCell>
                    </>
                  )}
                  <TableCell className="num">{duration(e.worked)}</TableCell>
                  <TableCell className="text-amber-700 font-semibold num">
                    {duration(e.extra)}
                  </TableCell>
                  <TableCell className="num">
                    {money(e.amount, e.rules.currency)}
                  </TableCell>
                  <TableCell>
                    <Status value={e.status} />
                  </TableCell>
                  {!compact && <TableCell>{actions(e)}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
