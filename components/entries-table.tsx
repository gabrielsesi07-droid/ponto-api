"use client";
import { Pencil, Trash2, CheckCheck, SearchCheck } from "lucide-react";
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
import {
  duration,
  money,
  initials,
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
  const actions = (e: Calculated) => (
    <div className="flex gap-1">
      {(admin || (state.me.can_edit && e.status !== "Aprovado")) && (
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
            title="Aprovar"
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
      <Blank description="Ajuste os filtros ou registre uma nova jornada." />
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
