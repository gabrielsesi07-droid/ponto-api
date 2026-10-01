"use client";
import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Save, Upload } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { api } from "./editors";
import { toast } from "sonner";
import {
  localDateTime,
  type Order,
  type OperationsData,
  type ServiceClient,
  type Vehicle,
} from "@/lib/orders";
import { today } from "@/lib/domain";
import { ModelPicker } from "./technical-library";
import { clientNameKey, searchClients, type ClientSuggestion } from '@/lib/client-search';

export async function uploadOrderPdf(id: string, file: File) {
  if (file.size > 3 * 1024 * 1024)
    throw new Error("Selecione um PDF de até 3 MB.");
  const res = await fetch(`/api/operations/${id}/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!res.ok)
    throw new Error(
      ((await res.json()) as { error?: string }).error ||
        "Não foi possível anexar o PDF.",
    );
}

function AddressInput({
  value,
  onChange,
  demo,
}: {
  value: string;
  onChange: (address: string, placeId: string) => void;
  demo: boolean;
}) {
  const [search, setSearch] = useState(""),
    [suggestions, setSuggestions] = useState<{ id: string; text: string }[]>(
      [],
    ),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (search.length < 3 || demo) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/places?q=" + encodeURIComponent(search), {
          signal: controller.signal,
        });
        const out = (await res.json()) as {
          suggestions?: { id: string; text: string }[];
          message?: string;
          error?: string;
        };
        if (!controller.signal.aborted) {
          setSuggestions(out.suggestions || []);
          setMessage(out.message || out.error || "");
        }
      } catch {
        if (!controller.signal.aborted)
          setMessage("Busca indisponível. Preencha o endereço manualmente.");
      }
    }, 450);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search, demo]);
  return (
    <div className="ops-field full">
      <label htmlFor="os-address">Endereço do atendimento (opcional)</label>
      <input
        id="os-address"
        maxLength={500}
        autoComplete="off"
        value={value}
        placeholder="Rua, número, bairro e cidade"
        onChange={(e) => {
          onChange(e.target.value, "");
          setSearch(e.target.value);
          setSuggestions([]);
          setMessage("");
        }}
      />
      {!!suggestions.length && (
        <div
          className="rounded-xl border bg-white p-2 shadow-sm"
          aria-label="Sugestões de endereço"
        >
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.id}
              className="block w-full rounded-lg p-3 text-left text-sm hover:bg-blue-50 focus-visible:bg-blue-50"
              onClick={() => {
                onChange(s.text, s.id);
                setSearch("");
                setSuggestions([]);
                setMessage(
                  "Endereço selecionado. Confira o número e o complemento.",
                );
              }}
            >
              {s.text}
            </button>
          ))}
          <p
            translate="no"
            className="px-3 pt-2 text-xs font-normal whitespace-nowrap text-[#5e5e5e]"
          >
            Google Maps
          </p>
        </div>
      )}
      <p role="status" className="text-xs muted">
        {message ||
          "Preencha se quiser liberar o botão Ir no Google Maps. A OS pode ser salva sem endereço."}
      </p>
    </div>
  );
}

export function OrderEditor({
  order,
  data,
  demo,
  onClose,
  onSaved,
}: {
  order?: Order;
  data: OperationsData;
  demo: boolean;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState(() => ({
    title: order?.title || "",
    client_id: order?.client_id || "",
    client_name: order?.client_name || "",
    address: order?.address || "",
    place_id: order?.place_id || "",
    contact: order?.contact || "",
    phone: order?.phone || "",
    starts_at: order ? localDateTime(order.starts_at) : today() + "T08:00",
    ends_at: order ? localDateTime(order.ends_at) : today() + "T18:00",
    members: order?.members || [],
    vehicle_id: order?.vehicle_id || "",
    equipment: order?.equipment || "",
    model_ids: order?.model_ids || [],
    instructions: order?.instructions || "",
    priority: order?.priority || "Normal",
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState<File | null>(null);
  // Retain a created OS if only attachment upload fails, so retry cannot create a duplicate.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [showClients, setShowClients] = useState(false);
  const change = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const activeClients = data.clients.filter(c => c.active);
  const knownNames = new Set(data.clients.map(c => clientNameKey(c.name)));
  const clientOptions: ClientSuggestion[] = activeClients.map(c => ({ id: c.id, name: c.name, detail: c.address || c.contact || 'Cliente cadastrado' }));
  for (const previous of data.orders) {
    const key = clientNameKey(previous.client_name);
    if (!knownNames.has(key)) { knownNames.add(key); clientOptions.push({ id: null, name: previous.client_name, detail: 'Usado em OS anterior · cadastrar ao salvar' }); }
  }
  const clientSuggestions = searchClients(clientOptions, form.client_name);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (demo) {
      setError("Demonstração: entre com seu login para salvar uma OS.");
      return;
    }
    if (!form.members.length) {
      setError("Selecione ao menos um colaborador.");
      return;
    }
    if (file && file.size > 3 * 1024 * 1024) {
      setError("O PDF deve ter até 3 MB.");
      return;
    }
    setBusy(true);
    try {
      let id = savedId;
      if (!id) {
        const result = await api<{ id: string }>("/api/operations", {
          action: "save_order",
          data: {
            ...form,
            client_id: form.client_id || null,
            vehicle_id: form.vehicle_id || null,
            starts_at: new Date(form.starts_at + ":00-03:00").toISOString(),
            ends_at: new Date(form.ends_at + ":00-03:00").toISOString(),
            ...(order ? { id: order.id, version: order.version } : {}),
          },
        });
        id = result.id;
        setSavedId(id);
      }
      if (file) await uploadOrderPdf(id, file);
      await onSaved(id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="ops-dialog max-h-[92svh] overflow-y-auto bg-white sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {order ? "Editar OS" : "Gerar ordem de serviço"}
          </DialogTitle>
          <DialogDescription>
            Defina cliente, equipe e recursos. A equipe receberá a OS no dia
            agendado. Horários de Brasília.
          </DialogDescription>
        </DialogHeader>
        <form className="ops-form" onSubmit={submit}>
          {savedId && (
            <p className="full rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              A OS já está salva. Reenvie o PDF ou remova o arquivo selecionado
              para continuar.
            </p>
          )}
          <fieldset disabled={busy || !!savedId} className="contents">
            <label className="full">
              Serviço / título
              <input
                required
                minLength={2}
                maxLength={160}
                value={form.title}
                onChange={(e) => change("title", e.target.value)}
                placeholder="Ex.: manutenção preventiva dos painéis"
              />
            </label>
            <div className="ops-field">
              <label htmlFor="os-client-name">Nome do cliente</label>
              <input
                id="os-client-name"
                required
                minLength={2}
                maxLength={160}
                autoComplete="off"
                onFocus={() => setShowClients(true)}
                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShowClients(false); } }}
                value={form.client_name}
                placeholder="Digite o nome da empresa ou pessoa"
                onChange={(e) => {
                  setShowClients(true);
                  setForm((f) => ({
                    ...f,
                    client_name: e.target.value,
                    client_id: "",
                  }));
                }}
              />
              {showClients && clientSuggestions.length > 0 && <div className="max-h-52 overflow-y-auto rounded-xl border bg-white p-1 shadow-sm" aria-label="Clientes encontrados">
                {clientSuggestions.map(option => <button key={option.id || option.name} type="button" className="block w-full rounded-lg p-3 text-left text-sm hover:bg-blue-50 focus-visible:bg-blue-50" onClick={() => {
                  const client = activeClients.find(c => c.id === option.id);
                  setForm(f => ({ ...f, client_name: option.name, client_id: option.id || '', address: f.address || client?.address || '', contact: f.contact || client?.contact || '', phone: f.phone || client?.phone || '' }));
                  setShowClients(false);
                }}><b className="block">{option.name}</b><span className="block text-xs text-slate-500">{option.detail}</span></button>)}
              </div>}
              <p className="text-xs muted" role="status">{form.client_id ? 'Cliente selecionado. Confira o endereço deste atendimento.' : 'Busque pelo nome, mesmo sem acentos. Se ainda não existir, o cliente será cadastrado automaticamente ao salvar a OS.'}</p>
            </div>
            <label>
              Prioridade
              <select
                value={form.priority}
                onChange={(e) => change("priority", e.target.value)}
              >
                {["Normal", "Alta", "Urgente"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {!!data.clients.filter((c) => c.active || c.id === order?.client_id).length && (
              <details className="full rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Usar dados de um cliente cadastrado (opcional)
                </summary>
                <label className="mt-3">
                  Preencher a partir do cadastro
                  <select
                    value={form.client_id}
                    onChange={(e) => {
                      const c = data.clients.find(
                        (c) => c.id === e.target.value,
                      );
                      if (c)
                        setForm((f) => ({
                          ...f,
                          client_id: c.id,
                          client_name: c.name,
                          address: c.address,
                          place_id: "",
                          contact: c.contact,
                          phone: c.phone,
                        }));
                      else setForm((f) => ({ ...f, client_id: "" }));
                    }}
                  >
                    <option value="">Somente o nome informado acima</option>
                    {data.clients
                      .filter((c) => c.active || c.id === order?.client_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{!c.active ? ' (arquivado · vínculo existente)' : ''}
                        </option>
                      ))}
                  </select>
                </label>
              </details>
            )}
            <label>
              Início previsto
              <input
                required
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => change("starts_at", e.target.value)}
              />
            </label>
            <label>
              Término previsto
              <input
                required
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => change("ends_at", e.target.value)}
              />
            </label>
            <AddressInput
              key={form.client_id}
              value={form.address}
              onChange={(address, place_id) =>
                setForm((f) => ({ ...f, address, place_id }))
              }
              demo={demo}
            />
            <label>
              Contato no cliente (opcional)
              <input
                maxLength={160}
                value={form.contact}
                onChange={(e) => change("contact", e.target.value)}
              />
            </label>
            <label>
              Telefone do contato (opcional)
              <input
                type="tel"
                maxLength={40}
                value={form.phone}
                onChange={(e) => change("phone", e.target.value)}
              />
            </label>
            <fieldset className="full rounded-xl border p-4">
              <legend className="px-1 text-sm font-semibold">
                Equipe designada ({form.members.length})
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.people
                  .filter((p) => p.active)
                  .map((p) => (
                    <label
                      className="flex flex-row! items-center gap-3 rounded-lg bg-slate-50 p-3"
                      key={p.id}
                    >
                      <input
                        className="size-4! w-4!"
                        type="checkbox"
                        checked={form.members.includes(p.id)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            members: e.target.checked
                              ? [...f.members, p.id]
                              : f.members.filter((id) => id !== p.id),
                          }))
                        }
                      />
                      <span>
                        {p.name}
                        {p.access_code && (
                          <small className="block muted">{p.access_code}</small>
                        )}
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
            <label className="full">
              Veículo
              <select
                value={form.vehicle_id}
                onChange={(e) => change("vehicle_id", e.target.value)}
              >
                <option value="">Sem veículo da empresa</option>
                {data.vehicles
                  .filter((v) => v.active)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.model} ·{" "}
                      {Number(v.odometer).toLocaleString("pt-BR")} km
                    </option>
                  ))}
              </select>
            </label>
            <ModelPicker value={form.model_ids} onChange={ids => setForm(f => ({ ...f, model_ids: ids }))} demo={demo} />
            <label className="full">
              Outros equipamentos e materiais (opcional)
              <textarea
                maxLength={3000}
                value={form.equipment}
                onChange={(e) => change("equipment", e.target.value)}
                placeholder="Adicione ferramentas ou materiais que não estão na seleção do catálogo."
              />
            </label>
            <label className="full">
              Instruções e cuidados no atendimento
              <textarea
                maxLength={5000}
                value={form.instructions}
                onChange={(e) => change("instructions", e.target.value)}
                placeholder="Acesso ao local, atividades previstas, EPIs e orientações para a equipe."
              />
            </label>
          </fieldset>
          <label className="full rounded-xl border border-dashed bg-slate-50 p-4">
            <span className="flex items-center gap-2">
              <Upload size={18} />
              PDF da OS (opcional, até 3 MB)
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {order?.pdf_name && (
              <span className="text-xs muted">
                Atual: {order.pdf_name}. Um novo arquivo substitui o anexo
                atual.
              </span>
            )}
          </label>
          {error && (
            <p
              role="alert"
              className="full rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <div className="full flex flex-wrap justify-end gap-3 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Fechar
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? <LoaderCircle className="animate-spin" /> : <Save />}
              {savedId
                ? "Concluir anexo"
                : order
                  ? "Salvar alterações"
                  : "Gerar OS"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResourceEditor({
  kind,
  resource,
  demo,
  onClose,
  onSaved,
}: {
  kind: "client" | "vehicle";
  resource?: ServiceClient | Vehicle;
  demo: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const value = (key: string) =>
    String((resource as unknown as Record<string, unknown>)?.[key] ?? "");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (demo) {
      setError("Demonstração: entre para salvar.");
      return;
    }
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      data = Object.fromEntries(f.entries());
    try {
      await api("/api/operations", {
        action: kind === "client" ? "save_client" : "save_vehicle",
        data: {
          ...data,
          active: f.has("active"),
          ...(resource ? { id: resource.id } : {}),
          ...(kind === "vehicle"
            ? {
                odometer: Number(data.odometer),
                maintenance_km: data.maintenance_km
                  ? Number(data.maintenance_km)
                  : null,
                ...(resource ? { version: (resource as Vehicle).version } : {}),
              }
            : {}),
        },
      });
      await onSaved();
      toast.success(
        kind === "client"
          ? resource ? "Cliente atualizado." : "Cliente cadastrado."
          : resource ? "Veículo atualizado." : "Veículo cadastrado.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="ops-dialog max-h-[90svh] overflow-y-auto bg-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {resource ? "Editar" : "Cadastrar"}{" "}
            {kind === "client" ? "cliente" : "veículo"}
          </DialogTitle>
          <DialogDescription>
            {kind === "client"
              ? "Os dados do cliente poderão preencher a OS automaticamente."
              : "O km será atualizado automaticamente a cada saída e retorno registrados nas OS."}
          </DialogDescription>
        </DialogHeader>
        <form className="ops-form" onSubmit={submit}>
          {kind === "client" ? (
            <>
              <label className="full">
                Nome / razão social
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={value("name")}
                />
              </label>
              <label className="full">
                Endereço padrão
                <input
                  name="address"
                  maxLength={500}
                  defaultValue={value("address")}
                />
              </label>
              <label>
                Contato
                <input
                  name="contact"
                  maxLength={160}
                  defaultValue={value("contact")}
                />
              </label>
              <label>
                Telefone
                <input
                  name="phone"
                  type="tel"
                  maxLength={40}
                  defaultValue={value("phone")}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Placa
                <input
                  name="plate"
                  required
                  maxLength={8}
                  defaultValue={value("plate")}
                  placeholder="ABC1D23"
                />
              </label>
              <label>
                Modelo / identificação
                <input
                  name="model"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={value("model")}
                />
              </label>
              <label>
                {resource ? "Km atual (pelas viagens)" : "Km inicial do painel"}
                <input
                  name="odometer"
                  type="number"
                  required
                  min={0}
                  max={9999999}
                  step={1}
                  readOnly={!!resource}
                  defaultValue={value("odometer") || 0}
                />
              </label>
              <label>
                Próxima revisão (km, opcional)
                <input
                  name="maintenance_km"
                  type="number"
                  min={0}
                  max={9999999}
                  step={1}
                  defaultValue={value("maintenance_km")}
                />
              </label>
            </>
          )}
          <label className="full">
            Observações
            <textarea
              name="notes"
              maxLength={2000}
              defaultValue={value("notes")}
            />
          </label>
          <label className="full flex-row! items-center gap-3">
            <input
              type="checkbox"
              name="active"
              className="w-4! size-4!"
              defaultChecked={resource?.active ?? true}
            />
            Cadastro ativo
          </label>
          {error && (
            <p role="alert" className="full text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="full flex justify-end gap-3 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
