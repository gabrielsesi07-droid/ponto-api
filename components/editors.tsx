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
import { PointOrderPicker } from './point-order-picker';
import { PointDatePicker } from './point-date-picker';
import { CompensationFields } from './compensation-fields';
import { compensationSchema, DEFAULT_MONTHLY_HOURS } from '@/lib/compensation';
import { automaticBreakForDay, workedMinutes } from '@/lib/manual-work';
import { OrderShiftPanel } from './order-shift-panel';
import { entryTimeIssue } from '@/lib/entry-time-feedback';
import { requestApi } from '@/lib/api-client';
import './entry-editor.css';
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
  return requestApi<T>(path, data, method);
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
          pin: "",
          reset_pin: false,
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [issuedAccess, setIssuedAccess] = useState<{ person: { name: string; access_code: string }; temporary_pin: string; temporary_pin_expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
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
  const timeIssue = editor.kind === 'entry' ? entryTimeIssue(String(form.start), String(form.end), breakMinutes) : null;
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
        const result = await api<{ person?: { name: string; access_code: string }; temporary_pin?: string; temporary_pin_expires_at?: string }>("/api/manage", {
          entity: editor.kind,
          data: {
            ...form,
            pin: form.pin || undefined,
            ...(editor.kind === 'profile' ? { monthly_salary: pay?.monthly_salary ?? null, monthly_hours: pay?.monthly_hours ?? DEFAULT_MONTHLY_HOURS } : {}),
            ...(p ? { id: p.id } : {}),
          },
        });
        if (result.person && result.temporary_pin && result.temporary_pin_expires_at) {
          setIssuedAccess({ person: result.person, temporary_pin: result.temporary_pin, temporary_pin_expires_at: result.temporary_pin_expires_at });
          return;
        }
      }
      await onSaved();
      toast.success(
        form.pin
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
  if (issuedAccess) return (
    <Dialog open onOpenChange={open => { if (!open) { void onSaved(); onClose(); } }}>
      <DialogContent className="bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Acesso pronto para entregar</DialogTitle>
          <DialogDescription>Envie estes dados diretamente para {issuedAccess.person.name}. O PIN é exibido somente agora e será substituído no primeiro acesso.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-4 rounded-xl border bg-slate-50 p-5">
          <div><dt className="text-sm text-slate-600">Código de acesso</dt><dd className="mt-1 font-mono text-xl font-semibold">{issuedAccess.person.access_code}</dd></div>
          <div><dt className="text-sm text-slate-600">PIN temporário</dt><dd className="mt-1 font-mono text-2xl font-semibold tracking-widest">{issuedAccess.temporary_pin}</dd></div>
        </dl>
        <p className="text-sm text-slate-600">Válido para um único acesso até {new Date(issuedAccess.temporary_pin_expires_at).toLocaleString('pt-BR')}. Se expirar ou for perdido, gere outro em Colaboradores.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={async () => {
            try {
              await navigator.clipboard.writeText(`Olá, ${issuedAccess.person.name}! Seu acesso ao HoraCerta:\nCódigo: ${issuedAccess.person.access_code}\nPIN temporário: ${issuedAccess.temporary_pin}\nTroque o PIN no primeiro acesso. Válido até ${new Date(issuedAccess.temporary_pin_expires_at).toLocaleString('pt-BR')}.`);
              setCopied(true);
            } catch { toast.error('Não foi possível copiar. Selecione os dados para copiá-los manualmente.'); }
          }}>{copied ? 'Copiado' : 'Copiar acesso'}</Button>
          <Button onClick={() => { void onSaved(); onClose(); }}>Concluir</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={editor.kind === "entry" ? "entry-dialog" : "max-h-[90svh] overflow-y-auto bg-white sm:max-w-lg"}>
        <DialogHeader className={editor.kind === "entry" ? "entry-header" : undefined}>
          {editor.kind === "entry" && <div className="entry-masthead"><span className="entry-monogram" aria-hidden="true">API</span><span className="entry-wordmark">HoraCerta<span>.</span></span><span className="entry-document-label">Jornada na OS</span></div>}
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
                  ? "Atualize os dados ou gere um PIN temporário para recuperar o acesso. A recuperação encerra as sessões abertas dessa pessoa."
                  : "Ao salvar, você receberá o código e um PIN temporário para entregar ao colaborador. Ele deverá criar seu PIN pessoal no primeiro acesso."}
          </DialogDescription>
          {editor.kind === "entry" && <div className="entry-person"><UserRound size={16} aria-hidden="true" /><span>Colaborador</span><b>{state.users.find(user => user.id === entryOwner)?.name}</b></div>}
        </DialogHeader>
        <form onSubmit={submit} className={editor.kind === "entry" ? "form-grid entry-form" : "form-grid mt-2"}>
          {editor.kind === "entry" ? (
            <div className="entry-body"><div className="entry-columns">
              <div className="entry-column"><section className="entry-section" aria-labelledby="entry-service-title">
              <h3 id="entry-service-title" className="entry-section-title"><span>01</span>Atendimento</h3>
              <div className="entry-fields">
              <PointDatePicker value={String(form.date)} onChange={date => change('date', date)} initiallyOpen={!e} disabled={busy} />
              <PointOrderPicker value={String(form.order_id || '')} date={String(form.date)} demo={demo} disabled={busy} entryId={e?.id} existingOrderId={e?.order_id} workType={form.work_type === 'travel' ? 'travel' : 'work'}
                onChange={order => setForm(f => ({...f,order_id:order?.id || '',company:order?.client_name || e?.company || '',service:order?.title || e?.service || ''}))} />
              {closedMonth && <p className="full rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">O mês desta data está fechado. Registros e ajustes ficam bloqueados até o coordenador reabri-lo.</p>}
              {e && !e.order_id && <p className="full text-sm text-amber-900">Registro anterior à obrigatoriedade de OS. Você pode preservar o histórico ou vinculá-lo à OS correta; o sistema não escolherá uma por conta própria.</p>}
              <label className="full">Tipo de jornada<Pick label="Tipo de jornada" value={String(form.work_type)} onChange={v => change('work_type',v)} items={[{value:'work',label:'Serviço no local'},{value:'travel',label:'Deslocamento'}]}/></label>
              <div className="full entry-service-fields">
                {input("company", "Empresa atendida", "text", true, { readOnly: true, minLength: 2, maxLength: 160, placeholder: "Preenchida pela OS" })}
                {input("service", "Serviço realizado", "text", true, { readOnly: true, minLength: 2, maxLength: 500, placeholder: "Preenchido pela OS" })}
              </div>
              </div></section>
              {form.order_id && (!e || e.rules.calculation_version === 2) && <div className="entry-shift"><OrderShiftPanel key={String(form.order_id) + form.work_type} orderId={String(form.order_id)} meId={state.me.id} userId={entryOwner} admin={state.me.role === 'coordinator'} demo={demo} workType={form.work_type === 'travel' ? 'travel' : 'work'}/></div>}
              </div>
              <div className="entry-column"><section className="entry-section" aria-labelledby="entry-hours-title">
              <h3 id="entry-hours-title" className="entry-section-title"><span>02</span>Horários realizados</h3>
              <div className="entry-fields">
              {input("start", "Entrada", "time", true)}
              {input("end", "Saída (HH:MM)", "text", true, {
                placeholder: "18:00 ou 24:00",
                pattern: "([01][0-9]|2[0-3]):[0-5][0-9]|24:00",
                maxLength: 5,
                "aria-invalid": !!timeIssue || undefined,
                "aria-describedby": timeIssue ? "entry-time-issue" : undefined,
              })}
              <div className="full entry-break space-y-2 rounded-lg border p-3">
                <label className="flex-row! items-center gap-3! cursor-pointer"><input type="checkbox" className="h-5! w-5! shrink-0" checked={customBreak} disabled={busy} onChange={event => setCustomBreak(event.target.checked)} />Definir intervalo específico</label>
                {customBreak ? <>
                  {input('break_minutes', 'Intervalo total (minutos)', 'number', true, {min:0,max:1439})}
                  {Number(form.break_minutes) > 0 && input('break_start','Início real do intervalo','time',(!e ? state.settings : e.rules).calculation_version === 2)}
                  <p className="text-xs muted">Substitui o intervalo automático, não soma. Informe 0 se não houve intervalo.{e ? ' O valor salvo foi preservado; desmarque para recalcular pelo padrão.' : ''}</p>
                </> : <p className="text-xs muted">Um único intervalo por dia, somando todos os seus registros da data: 12h–13h se o dia passa pelo almoço (mesmo que o almoço tenha ficado fora dos registros); caso contrário, 19h–20h. Das 10h às 22h, o desconto é de 60 minutos.{sameDay.length ? ` Considerando ${sameDay.length} outro(s) registro(s) seu(s) nesta data.` : ''}</p>}
                <p className="text-sm" aria-live="polite">Intervalo {customBreak ? 'específico' : 'automático'}: {breakMinutes} minutos.</p>
              </div>
              {timeIssue ? <p id="entry-time-issue" role="alert" className="full rounded-lg bg-red-50 p-3 text-sm text-red-800">{timeIssue}</p> :
              <p className="full rounded-lg bg-blue-50 p-3 text-sm" aria-live="polite">{workMinutes === null ? 'Informe entrada, saída e intervalo para conferir a duração. Se o trabalho passou da meia-noite, registre cada data separadamente: até 24:00 no primeiro dia e a partir de 00:00 no seguinte.' : `Tempo de trabalho: ${Math.floor(workMinutes / 60)}h ${String(workMinutes % 60).padStart(2,'0')}min, descontado o intervalo. As horas extras são calculadas ao salvar, somando os serviços do dia.`}</p>}
              </div></section>
              <section className="entry-section" aria-labelledby="entry-notes-title">
              <h3 id="entry-notes-title" className="entry-section-title"><span>03</span>Detalhes do registro</h3>
              <div className="entry-fields">
              <label className="full entry-holiday flex-row! justify-between items-center">
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
              </div></section></div>
            </div></div>
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
                    Acesso individual e temporário
                  </span>
                  <span className="mt-1 block text-blue-800">
                    O PIN será gerado ao salvar, terá validade de 24 horas e deverá ser trocado no primeiro acesso.
                  </span>
                </div>
              ) : editor.kind === 'user' ? (
                <label className="full flex-row! items-start gap-3! rounded-lg border p-4">
                  <input type="checkbox" className="h-5! w-5! shrink-0" checked={!!form.reset_pin} onChange={event => change('reset_pin', event.target.checked)} />
                  <span>Gerar novo PIN temporário<small className="mt-1 block text-slate-500">Encerra as sessões atuais. O novo acesso será exibido após salvar.</small></span>
                </label>
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
              className={`full rounded-lg bg-red-50 p-3 text-red-700 text-sm${editor.kind === "entry" ? " entry-error" : ""}`}
            >
              {error}
            </p>
          )}
          <div className={editor.kind === "entry" ? "entry-footer" : "full flex flex-col-reverse gap-3 pt-4 border-t sm:flex-row sm:justify-end"}>
            <Button
              type="button"
              variant="outline"
              className="action max-sm:w-full"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button type="submit" className="action max-sm:w-full" disabled={busy || (editor.kind === 'entry' && ((!e && !form.order_id) || workMinutes === null))}>
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
