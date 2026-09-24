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
  minutes,
  duration,
  type Person,
  type Client,
  type Entry,
  type Rules,
  type State,
} from "@/lib/domain";
import { toast } from "sonner";
import { LoaderCircle, Save, UserRound } from "lucide-react";
export type Editor =
  | { kind: "entry"; data?: Entry }
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
          date: e?.date || today(),
          start: e?.start.slice(0, 5) || "08:00",
          end: e?.end?.slice(0, 5) || "",
          break_minutes: e?.break_minutes ?? 0,
          notes: e?.notes || "",
          holiday: e?.holiday || false,
        }
      : {
          name: p?.name || "",
          username: p?.username || "",
          email: p?.email || "",
          job: p?.job || "",
          phone: p?.phone || "",
          hourly_rate: p?.hourly_rate ?? 0,
          active: p?.active ?? true,
          can_edit: p?.can_edit ?? true,
          pin: "",
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
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
    setBusy(true);
    setError("");
    try {
      if (editor.kind === "entry")
        await api("/api/entries", {
          ...form,
          user_id: e?.user_id || state.me.id,
          client_id: e?.client_id || null,
          service: e?.service || "Serviço técnico",
          service_type: e?.service_type || "",
          end: form.end || null,
          break_minutes: Number(form.break_minutes),
          ...(e ? { id: e.id, version: e.version } : {}),
        });
      else
        await api("/api/manage", {
          entity: editor.kind,
          data: {
            ...form,
            pin: form.pin || undefined,
            hourly_rate: Number(form.hourly_rate || 0),
            ...(p ? { id: p.id } : {}),
          },
        });
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
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editor.kind === "entry"
              ? e
                ? "Ajustar marcação"
                : "Adicionar marcação manual"
              : editor.kind === "profile"
                ? "Meu acesso e valor-hora"
                : p
                  ? "Editar acesso"
                  : "Criar acesso do colaborador"}
          </DialogTitle>
          <DialogDescription>
            {editor.kind === "entry"
              ? "A pessoa é identificada automaticamente pelo login. Use esta tela apenas para correções ou marcações esquecidas."
              : editor.kind === "profile"
                ? "Seu valor-hora vale para os próximos serviços. As marcações antigas mantêm o valor anterior."
                : "Cada pessoa entra com seu próprio usuário e PIN. O valor-hora será configurado por ela."}
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
              {input("date", "Data", "date", true, { max: today() })}
              {input("break_minutes", "Pausa (minutos)", "number", true, {
                min: 0,
                max: 1439,
              })}
              {input("start", "Entrada", "time", true)}
              {input("end", "Saída (HH:MM)", "text", false, {
                placeholder: "18:00 ou 24:00",
                pattern: "([01][0-9]|2[0-3]):[0-5][0-9]|24:00",
                maxLength: 5,
              })}
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
                  placeholder="Ex.: esqueci de encerrar o serviço."
                />
              </label>
            </>
          ) : (
            <>
              {input("name", "Nome completo", "text", true, { maxLength: 120 })}
              {input("username", "Usuário de acesso", "text", true, {
                disabled: editor.kind === "profile",
                autoComplete: "username",
                pattern: "[a-z0-9._-]{3,40}",
                maxLength: 40,
              })}
              {editor.kind === "profile" &&
                input("hourly_rate", "Quanto vale sua hora?", "number", true, {
                  min: 0,
                  max: 100000,
                  step: ".01",
                })}
              {input(
                "pin",
                p
                  ? "Novo PIN (deixe vazio para manter)"
                  : "PIN inicial (6 números)",
                "password",
                !p,
                {
                  inputMode: "numeric",
                  pattern: "[0-9]{6}",
                  minLength: 6,
                  maxLength: 6,
                  autoComplete: "new-password",
                },
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
            <Button type="submit" className="action" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Save />}
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function SettingsForm({
  rules,
  onSaved,
  demo,
}: {
  rules: Rules;
  onSaved: () => Promise<void>;
  demo: boolean;
}) {
  const [f, setF] = useState(rules),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = (key: keyof Rules, value: string | number | boolean) =>
    setF((v) => ({ ...v, [key]: value }));
  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (demo) {
      toast.info("Configurações da demonstração não são salvas.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/manage", { entity: "settings", data: f });
      await onSaved();
      toast.success("Regras atualizadas para os próximos lançamentos.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="panel p-7 max-w-4xl">
      <h2>Regras de jornada e pagamento</h2>
      <p className="muted mt-2 mb-7 text-sm">
        Mudanças valem para novos registros. Lançamentos existentes conservam
        sua regra e valor-hora.
      </p>
      <div className="form-grid">
        {(
          [
            ["daily_minutes", "Jornada diária (minutos)"],
            ["weekday_bonus", "Adicional de dia útil (%)"],
            ["saturday_bonus", "Adicional de sábado (%)"],
            ["sunday_bonus", "Adicional de domingo (%)"],
            ["holiday_bonus", "Adicional de feriado (%)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              required
              min={key === "daily_minutes" ? 1 : 0}
              max={key === "daily_minutes" ? 1440 : 1000}
              step={key === "daily_minutes" ? 1 : 0.01}
              value={f[key]}
              onChange={(e) => change(key, Number(e.target.value))}
            />
          </label>
        ))}
        <label>
          Moeda
          <Pick
            label="Moeda"
            value={f.currency}
            onChange={(v) => change("currency", v)}
            items={[
              { value: "BRL", label: "Real (BRL)" },
              { value: "USD", label: "Dólar (USD)" },
              { value: "EUR", label: "Euro (EUR)" },
            ]}
          />
        </label>
        <label>
          Formato da data
          <Pick
            label="Formato de data"
            value={f.date_format}
            onChange={(v) => change("date_format", v)}
            items={[
              { value: "dd/MM/yyyy", label: "24/09/2026" },
              { value: "yyyy-MM-dd", label: "2026-09-24" },
            ]}
          />
        </label>
        <label>
          Formato da hora
          <Pick
            label="Formato de hora"
            value={f.time_format}
            onChange={(v) => change("time_format", v)}
            items={[
              { value: "24h", label: "24 horas" },
              { value: "12h", label: "12 horas" },
            ]}
          />
        </label>
        <label className="full flex-row! items-center justify-between border-t pt-5">
          Permitir lançamentos e edições retroativas
          <Switch
            checked={f.allow_retro}
            onCheckedChange={(v) => change("allow_retro", v)}
            aria-label="Permitir retroativos"
          />
        </label>
        <label className="full flex-row! items-center justify-between">
          Exigir aprovação do coordenador
          <Switch
            checked={f.approval_required}
            onCheckedChange={(v) => change("approval_required", v)}
            aria-label="Exigir aprovação"
          />
        </label>
      </div>
      <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        O valor estimado inclui a hora base + o adicional: 1h a R$ 30,00 no
        sábado (60%) = R$ 48,00. O adicional de dia útil começa em 50% por
        padrão, pois não foi especificado no briefing.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-red-700">
          {error}
        </p>
      )}
      <Button disabled={busy} className="action mt-6">
        {busy ? "Salvando…" : "Salvar configurações"}
      </Button>
    </form>
  );
}
