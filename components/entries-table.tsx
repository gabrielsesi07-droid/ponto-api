"use client";
import { Pencil, Trash2, CheckCheck, SearchCheck, Lock, MoreHorizontal, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Blank, Status } from "./controls";
import { pointOrderNumber } from '@/lib/point-orders';
import {
  duration,
  money,
  initials,
  totals,
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
  groupedByPerson = false,
  hidePerson = false,
}: {
  rows: Calculated[];
  state: State;
  onEdit: (e: Entry) => void;
  onDelete: (e: Entry) => void;
  onStatus: (e: Entry, s: Entry["status"]) => void;
  compact?: boolean;
  busy?: boolean;
  groupedByPerson?: boolean;
  hidePerson?: boolean;
}) {
  const admin = state.me.role === "coordinator";
  const approvalRequired = state.settings.approval_required;
  const showPerson = admin && !hidePerson;
  const people = new Map(state.users.map((person) => [person.id, person]));
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
    <div className="flex items-center gap-1">
      {(admin || (e.user_id === state.me.id && state.me.can_edit && (!approvalRequired || e.status !== "Aprovado"))) && (
        <Button
          disabled={busy}
          size="sm"
          variant="ghost"
          aria-label={`Editar lançamento de ${date(e.date)}`}
          title="Editar lançamento"
          onClick={() => onEdit(e)}
          className="action"
        >
          <Pencil size={16} />
          Editar
        </Button>
      )}
      {admin && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={busy} size="icon" variant="ghost" aria-label={`Mais ações para ${date(e.date)}`} className="action">
              <MoreHorizontal size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {approvalRequired && (
              <>
                <DropdownMenuItem disabled={busy || !e.end || e.status === "Aprovado"} onSelect={() => onStatus(e, "Aprovado")}>
                  <CheckCheck /> Aprovar lançamento
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy || e.status === "Revisado"} onSelect={() => onStatus(e, "Revisado")}>
                  <SearchCheck /> Marcar como revisado
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem disabled={busy} variant="destructive" onSelect={() => onDelete(e)}>
              <Trash2 /> Excluir lançamento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
  if (!rows.length)
    return (
      <Blank description="Ajuste os filtros ou registre uma nova jornada." />
    );
  if (groupedByPerson && admin) {
    const grouped = new Map<string, Calculated[]>();
    for (const entry of rows) {
      const matches = grouped.get(entry.user_id);
      if (matches) matches.push(entry);
      else grouped.set(entry.user_id, [entry]);
    }
    const groups = [...grouped].sort(([a], [b]) =>
      (people.get(a)?.name || "Colaborador").localeCompare(people.get(b)?.name || "Colaborador", "pt-BR"),
    );
    return (
      <div>
        {groups.map(([personId, entries]) => {
          const person = people.get(personId);
          const total = totals(entries);
          const unpriced = entries.filter((entry) => entry.extra > 0 && entry.missing_rate).length;
          const hasPricedExtras = entries.some((entry) => entry.extra > 0 && !entry.missing_rate);
          return (
            <details key={personId} className="group border-t" open={groups.length === 1}>
              <summary className="grid cursor-pointer list-none gap-4 bg-slate-50 px-5 py-5 focus-visible:outline-2 focus-visible:outline-blue-600 sm:grid-cols-[minmax(12rem,1fr)_auto] lg:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(8rem,auto))]">
                <span className="flex items-center gap-3">
                  <ChevronRight size={18} className="shrink-0 transition-transform group-open:rotate-90" />
                  <span className="avatar shrink-0">{initials(person?.name || "?")}</span>
                  <span><b className="block text-sm">{person?.name || "Colaborador"}</b><span className="muted text-xs">{entries.length} lançamentos · ver detalhes</span></span>
                </span>
                <span className="text-sm"><span className="muted block text-xs">Trabalhadas no período</span><b className="num">{duration(total.worked)}</b></span>
                <span className="text-sm"><span className="muted block text-xs">Horas extras</span><b className="num text-amber-700">{duration(total.extra)}</b></span>
                <span className="text-sm">
                  <span className="muted block text-xs">Valor estimado{unpriced > 0 && hasPricedExtras ? " (parcial)" : ""}</span>
                  <b className="num">{unpriced > 0 && !hasPricedExtras ? "Valor-hora não informado" : money(total.amount, state.settings.currency)}</b>
                  {unpriced > 0 && <span className="mt-1 block text-xs text-amber-800">{unpriced} lançamentos com extras sem valor-hora</span>}
                </span>
              </summary>
              <EntriesTable rows={entries} state={state} onEdit={onEdit} onDelete={onDelete} onStatus={onStatus} compact={compact} busy={busy} hidePerson />
            </details>
          );
        })}
      </div>
    );
  }
  return (
    <>
      <div className="md:hidden divide-y">
        {rows.map((e) => (
          <article key={e.id} className="p-4">
            <div className="flex justify-between items-center gap-3">
              <b className="text-sm">{date(e.date)}</b>
              <Status value={e.status} />
            </div>
            {showPerson && (
              <p className="text-sm font-medium mt-2">
                {people.get(e.user_id)?.name}
              </p>
            )}
            <p className="text-sm muted mt-2">
              {time(e.start)} — {time(e.end)} · {e.break_minutes} min de pausa
            </p>
            <p className="mt-2 text-sm">
              <span className="block text-xs font-semibold text-blue-800">{e.order_number ? pointOrderNumber(e.order_number) : 'Histórico anterior · sem OS'}</span>
              <span className="block text-xs muted">{e.work_type === "travel" ? "Deslocamento" : "Serviço"}</span>
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
                  {duration(e.extra)}
                </b>
                <EntryEstimate entry={e} />
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
                ...(showPerson ? ["Colaborador"] : []),
                "Entrada · saída",
                "Empresa · serviço",
                ...(!compact ? ["Intervalo", "Tipo"] : []),
                "Trabalhadas",
                "Extras",
                "Valor estimado",
                "Status",
                ...(!compact ? ["Ações"] : []),
              ].map((h) => (
                <TableHead key={h} className={h === "Ações" ? "sticky right-0 z-10 border-l shadow-[-6px_0_10px_-8px_rgba(15,23,42,0.4)]" : undefined}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => {
              const person = people.get(e.user_id);
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {date(e.date)}
                  </TableCell>
                  {showPerson && (
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
                    <span className="block text-xs font-semibold text-blue-800">{e.order_number ? pointOrderNumber(e.order_number) : 'Histórico anterior · sem OS'}</span>
                    <span className="block text-xs muted">{e.work_type === "travel" ? "Deslocamento" : "Serviço"}</span>
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
                    <EntryEstimate entry={e} />
                  </TableCell>
                  <TableCell>
                    <Status value={e.status} />
                  </TableCell>
                  {!compact && <TableCell className="sticky right-0 z-10 border-l bg-white shadow-[-6px_0_10px_-8px_rgba(15,23,42,0.4)]">{actions(e)}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function EntryEstimate({ entry }: { entry: Calculated }) {
  const unpriced = entry.extra > 0 && entry.missing_rate;
  return (
    <div className="max-w-56 whitespace-normal text-sm">
      {unpriced ? <span className="text-xs font-medium text-amber-800">Valor-hora não informado</span> : money(entry.amount, entry.rules.currency)}
      {entry.calculation_warning && <p className="mt-1 text-xs text-amber-800">{entry.calculation_warning}</p>}
      {!!entry.breakdown?.length && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="link" className="mt-1 h-auto p-0 text-xs" aria-label={`Ver cálculo das horas extras de ${entry.date.split("-").reverse().join("/")}`}>
              Ver cálculo
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
            <p className="text-sm font-semibold">Cálculo das horas extras</p>
            <p className="muted mt-1 text-xs">{unpriced ? "Informe o valor-hora para estimar o pagamento." : `Hora-base: ${money(Number(entry.rate), entry.rules.currency)}`}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {entry.breakdown.map((tier, index) => (
                <li key={index} className="flex justify-between gap-3 border-t pt-2">
                  <span>{duration(tier.minutes)} com +{tier.bonus}%</span>
                  <b>{unpriced ? "A calcular" : money(tier.amount, entry.rules.currency)}</b>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
