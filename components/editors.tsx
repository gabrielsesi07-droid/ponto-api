"use client";
import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Pick } from "./controls";
import {
  today,
  isClosedMonth,
  type Person,
  type Client,
  type Entry,
  type State,
} from "@/lib/domain";
import { toast } from "sonner";
import { LoaderCircle, Save, UserRound } from "lucide-react";
import { DEFAULT_INITIAL_PIN } from "@/lib/pin";
import { PointOrderPicker } from './point-order-picker';
import { PointDatePicker } from './point-date-picker';
import { CompensationFields } from './compensation-fields';
import { compensationSchema, DEFAULT_MONTHLY_HOURS } from '@/lib/compensation';
import { automaticBreakForDay, workedMinutes } from '@/lib/manual-work';
import { OrderShiftPanel } from './order-shift-panel';
export type Editor =
  | { kind: "entry"; data?: Entry; order?: {id:string; date:string; company:string; service:string} }
  | { kind: "user"; data?: Person }
  | { kind: "client"; data?: Client }
  | { kind: "profile"; data: Person };
export async function api<T = { ok: boolean }>(
  path: string,
  data?: unknown,
  method = "POST",
) {
  const res = await fetch(path, {
    method: data === undefined ? "GET" : method,
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const out = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(out.error || "Não foi possível concluir.");
  return out as T;
}
export function EditDialog({
  editor,
  state,
  onClose,
  onSaved,
  demo,
}: {
  editor: Editor;
  state: State;
  onClose: () => void;
  onSaved: () => Promise<void>;
  demo: boolean;
}) {
  const e = editor.kind === "entry" ? editor.data : undefined,
    p =
      editor.kind === "user" || editor.kind === "profile"
        ? editor.data
        : undefined;
  const [form, setForm] = useState<
    Record<string, string | number | boolean | undefined>
  >(() =>
    editor.kind === "entry"
      ? {
          order_id: e?.order_id || editor.order?.id || '',
          date: e?.date || (editor.order?.date && editor.order.date <= today() ? editor.order.date : today()),
          start: e?.start.slice(0, 5) || "",
          end: e?.end?.slice(0, 5) || "",
          break_minutes: e?.break_minutes ?? 0,
          break_start: e?.break_start?.slice(0,5) || '',
          work_type: e?.work_type || 'work',
          company: e?.company || editor.order?.company || "",
          service: e?.service || editor.order?.service || "",
          notes: e?.notes || "",
          holiday: e?.holiday || false,
        }
      : {
          name: p?.name || "",
          email: p?.email || "",
          job: p?.job || "",
          phone: p?.phone || "",
          monthly_salary: p?.monthly_salary ?? '',
          monthly_hours: p?.monthly_hours ?? DEFAULT_MONTHLY_HOURS,
          active: p?.active ?? true,
          can_edit: p?.can_edit ?? true,
          pin:
            editor.kind === "user" && !p ? DEFAULT_INITIAL_PIN : "",
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  // Legacy records have no stored mode and keep their saved break as a specific value.
  const [customBreak, setCustomBreak] = useState(!!e && e.break_mode !== 'automatic');
  const change = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
  const entryOwner = e?.user_id || state.me.id;
  const sameDay = editor.kind === 'entry'
    ? state.entries.filter(x => x.user_id === entryOwner && x.date === form.date && x.id !== e?.id)
    : [];
  const breakMinutes = customBreak ? Number(form.break_minutes) : automaticBreakForDay(String(form.start), String(form.end), sameDay);
  const closedMonth = editor.kind === 'entry' && isClosedMonth(state, String(form.date));
  const workMinutes = editor.kind === 'entry' ? workedMinutes(String(form.start), String(form.end), breakMinutes) : null;
  const input = (
    key: string,
    label: string,
    type = "text",
    required = false,
    extra = {},
  ) => (
    <label>
      {label}
      <input
        value={String(form[key] ?? "")}
        type={type}
        required={required}
        onChange={(ev) => change(key, ev.target.value)}
        {...extra}
      />
    </label>
  );
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (demo) {
      toast.info(
        "A demonstração não altera dados reais. Entre com seu login para salvar.",
      );
      return;
    }
    if (closedMonth) {
      setError('Este mês está fechado. Peça ao coordenador para reabri-lo antes de registrar ou ajustar horas nele.');
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editor.kind === "entry")
        await api("/api/entries", {
          ...form,
          order_id: form.order_id || null,
          user_id: e?.user_id || state.me.id,
          client_id: e?.client_id || null,
          service_type: e?.service_type || "",
          end: form.end || null,
          break_minutes: breakMinutes,
          break_mode: customBreak ? 'custom' : 'automatic',
          break_start: customBreak && breakMinutes > 0 ? form.break_start || null : null,
          ...(e ? { id: e.id, version: e.version } : {}),
        });
      else {
        const checked = editor.kind === 'profile' && String(form.monthly_salary).trim() !== ''
          ? compensationSchema.safeParse({ monthly_salary: Number(form.monthly_salary), monthly_hours: Number(form.monthly_hours) }) : null;
        if (checked && !checked.success) throw new Error(checked.error.issues[0].message);
        const pay = checked?.success ? checked.data : null;
        await api("/api/manage", {
          entity: editor.kind,
          data: {
            ...form,
            pin: form.pin || undefined,
            ...(editor.kind === 'profile' ? { monthly_salary: pay?.monthly_salary ?? null, monthly_hours: pay?.monthly_hours ?? DEFAULT_MONTHLY_HOURS } : {}),
            ...(p ? { id: p.id } : {}),
          },
        });
      }
      await onSaved();
      toast.success(
        editor.kind === "user" && !p
          ? `Acesso criado. O PIN inicial é ${DEFAULT_INITIAL_PIN}.`
          : form.pin
            ? "Dados salvos. Use o novo PIN no próximo acesso."
            : "Dados salvos.",
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editor.kind === "entry"
              ? e
                ? "Ajustar marcação"
                : "Registrar horas trabalhadas"
              : editor.kind === "profile"
                ? "Meu acesso e salário"
                : p
                  ? "Editar acesso e PIN"
                  : "Criar acesso do colaborador"}
          </DialogTitle>
          <DialogDescription>
            {editor.kind === "entry"
              ? "Informe os horários reais do trabalho, mesmo após chegar em casa. A data é a do serviço, não a do preenchimento. Salvar não conclui a OS."
              : editor.kind === "profile"
                ? "O valor-hora é calculado pelo salário bruto mensal dividido pelas horas mensais. Pontos antigos e serviços já iniciados mantêm o valor anterior."
                : p
                  ? "Altere os dados ou defina um novo PIN de 6 números. Ao trocar o PIN, as sessões abertas dessa pessoa serão encerradas."
                  : `Cada pessoa recebe um código único e começa com o PIN ${DEFAULT_INITIAL_PIN}. No primeiro acesso, ela será orientada a criar um PIN pessoal.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="form-grid mt-2">
          {editor.kind === "entry" ? (
            <>
              <div className="full flex gap-2 items-center rounded-lg bg-blue-50 text-blue-800 px-4 py-3 text-sm">
                <UserRound size={18} />
                <b>
                  {
                    state.users.find(
                      (u) => u.id === (e?.user_id || state.me.id),
                    )?.name
                  }
                </b>
              </div>
              <PointDatePicker value={String(form.date)} onChange={date => change('date', date)} initiallyOpen={!e} disabled={busy} />
              <PointOrderPicker value={String(form.order_id || '')} date={String(form.date)} demo={demo} disabled={busy} entryId={e?.id} existingOrderId={e?.order_id} workType={form.work_type === 'travel' ? 'travel' : 'work'}
                onChange={order => setForm(f => ({...f,order_id:order?.id || '',company:order?.client_name || e?.company || '',service:order?.title || e?.service || ''}))} />
              {closedMonth && <p className="full rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">O mês desta data está fechado. Registros e ajustes ficam bloqueados até o coordenador reabri-lo.</p>}
              {e && !e.order_id && <p className="full text-sm text-amber-900">Registro anterior à obrigatoriedade de OS. Você pode preservar o histórico ou vinculá-lo à OS correta; o sistema não escolherá uma por conta própria.</p>}
              <label className="full">Tipo de jornada<Pick label="Tipo de jornada" value={String(form.work_type)} onChange={v => change('work_type',v)} items={[{value:'work',label:'Serviço no local'},{value:'travel',label:'Deslocamento'}]}/></label>
              {form.order_id && (!e || e.rules.calculation_version === 2) && <OrderShiftPanel key={String(form.order_id) + form.work_type} orderId={String(form.order_id)} meId={state.me.id} userId={entryOwner} admin={state.me.role === 'coordinator'} demo={demo} workType={form.work_type === 'travel' ? 'travel' : 'work'}/>}
              {input("start", "Entrada", "time", true)}
              {input("end", "Saída (HH:MM)", "text", true, {
                placeholder: "18:00 ou 24:00",
                pattern: "([01][0-9]|2[0-3]):[0-5][0-9]|24:00",
                maxLength: 5,
              })}
              <div className="full space-y-2 rounded-lg border p-3">
                <label className="flex-row! items-center gap-3! cursor-pointer"><input type="checkbox" className="h-5! w-5! shrink-0" checked={customBreak} disabled={busy} onChange={event => setCustomBreak(event.target.checked)} />Definir intervalo específico</label>
                {customBreak ? <>
                  {input('break_minutes', 'Intervalo total (minutos)', 'number', true, {min:0,max:1439})}
                  {Number(form.break_minutes) > 0 && input('break_start','Início real do intervalo','time',(!e ? state.settings : e.rules).calculation_version === 2)}
                  <p className="text-xs muted">Substitui o intervalo automático, não soma. Informe 0 se não houve intervalo.{e ? ' O valor salvo foi preservado; desmarque para recalcular pelo padrão.' : ''}</p>
                </> : <p className="text-xs muted">Um único intervalo por dia, somando todos os seus registros da data: 12h–13h se o dia passa pelo almoço (mesmo que o almoço tenha ficado fora dos registros); caso contrário, 19h–20h. Das 10h às 22h, o desconto é de 60 minutos.{sameDay.length ? ` Considerando ${sameDay.length} outro(s) registro(s) seu(s) nesta data.` : ''}</p>}
                <p className="text-sm" aria-live="polite">Intervalo {customBreak ? 'específico' : 'automático'}: {breakMinutes} minutos.</p>
              </div>
              <p className="full rounded-lg bg-blue-50 p-3 text-sm" aria-live="polite">{workMinutes === null ? 'Informe entrada, saída e intervalo para conferir a duração. Se o trabalho passou da meia-noite, registre cada data separadamente: até 24:00 no primeiro dia e a partir de 00:00 no seguinte.' : `Tempo de trabalho: ${Math.floor(workMinutes / 60)}h ${String(workMinutes % 60).padStart(2,'0')}min, descontado o intervalo. As horas extras são calculadas ao salvar, somando os serviços do dia.`}</p>
              <div className="full">
                {input("company", "Empresa atendida", "text", true, {
                  readOnly: true,
                  minLength: 2,
                  maxLength: 160,
                  placeholder: "Ex.: Empresa Nova Era",
                })}
              </div>
              <div className="full">
                {input("service", "Serviço realizado", "text", true, {
                  readOnly: true,
                  minLength: 2,
                  maxLength: 500,
                })}
              </div>
              <label className="full flex-row! justify-between items-center">
                Foi feriado?
                <Switch
                  checked={!!form.holiday}
                  onCheckedChange={(v) => change("holiday", v)}
                  aria-label="Feriado"
                />
              </label>
              <label className="full">
                Observação (opcional)
                <textarea
                  value={String(form.notes)}
                  maxLength={2000}
                  onChange={(ev) => change("notes", ev.target.value)}
                  placeholder="Detalhes do trabalho ou motivo de uma correção."
                />
              </label>
            </>
          ) : (
            <>
              {input("name", "Nome completo", "text", true, { maxLength: 120 })}
              {p ? (
                <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
                  <span className="muted block text-xs">CÓDIGO DE ACESSO</span>
                  <b className="mt-1 block tracking-wide">{p.access_code}</b>
                </div>
              ) : (
                <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  O código único será criado automaticamente ao salvar.
                </p>
              )}
              {editor.kind === "profile" && <CompensationFields salary={String(form.monthly_salary)} hours={String(form.monthly_hours)}
                onSalary={v => change('monthly_salary', v)} onHours={v => change('monthly_hours', v)}
                currency={state.settings.currency} legacyRate={Number(p?.hourly_rate || 0)} required={p?.monthly_salary != null} />}
              {editor.kind === "user" && !p ? (
                <div className="full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-blue-700">
                    PIN inicial padrão
                  </span>
                  <code className="mt-1 block text-lg font-bold tracking-[.25em]">
                    {DEFAULT_INITIAL_PIN}
                  </code>
                  <span className="mt-1 block text-blue-800">
                    A pessoa poderá trocar esse PIN no primeiro acesso ou em
                    “Meu acesso”.
                  </span>
                </div>
              ) : (
                input(
                  "pin",
                  "Novo PIN (deixe vazio para manter)",
                  "password",
                  false,
                  {
                    inputMode: "numeric",
                    pattern: "[0-9]{6}",
                    minLength: 6,
                    maxLength: 6,
                    autoComplete: "new-password",
                  },
                )
              )}
              {input("job", "Cargo (opcional)")}
              {input("phone", "Telefone (opcional)", "tel")}
              {editor.kind === "user" && (
                <>
                  <label className="full flex-row! justify-between">
                    Acesso ativo
                    <Switch
                      aria-label="Acesso ativo"
                      disabled={p?.role === "coordinator"}
                      checked={!!form.active}
                      onCheckedChange={(v) => change("active", v)}
                    />
                  </label>
                  <label className="full flex-row! justify-between">
                    Permitir ajustes nas próprias marcações
                    <Switch
                      aria-label="Permitir ajustes"
                      checked={!!form.can_edit}
                      onCheckedChange={(v) => change("can_edit", v)}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {error && (
            <p
              role="alert"
              className="full rounded-lg bg-red-50 p-3 text-red-700 text-sm"
            >
              {error}
            </p>
          )}
          <div className="full flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              className="action"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button type="submit" className="action" disabled={busy || (editor.kind === 'entry' && ((!e && !form.order_id) || workMinutes === null))}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Save />}
              {busy ? "Salvando…" : editor.kind === 'entry' ? 'Salvar horas trabalhadas' : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export { SettingsForm } from './work-rules-form';
