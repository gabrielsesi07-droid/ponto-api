"use client";
import { useState, type FormEvent } from "react";
import { Clock3, ArrowRight, ShieldCheck, Eye } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { api } from "./editors";
export function QuickLogin({
  setup,
  error,
  reload,
  demo,
}: {
  setup: boolean;
  error: string;
  reload: () => Promise<void>;
  demo: () => void;
}) {
  const [username, setUsername] = useState(""),
    [pin, setPin] = useState(""),
    [name, setName] = useState(""),
    [rate, setRate] = useState("0"),
    [remember, setRemember] = useState(true),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setIssue("");
    try {
      await api(
        setup ? "/api/session" : "/api/login",
        setup
          ? { name, username, pin, hourly_rate: Number(rate) }
          : { username, pin, remember },
      );
      await reload();
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-md mx-auto py-6 sm:py-12">
      <section className="panel p-7 sm:p-9">
        <span className="inline-flex p-3 rounded-xl bg-blue-50 text-blue-600">
          <Clock3 size={29} />
        </span>
        <h1 className="mt-5">
          {setup ? "Configure o primeiro acesso" : "Entre e bata seu ponto"}
        </h1>
        <p className="muted mt-3 text-sm leading-relaxed">
          {setup
            ? "Crie o acesso do coordenador. Depois, cadastre os três colaboradores."
            : "Seu serviço começa com um toque. Use seu usuário e PIN para continuar."}
        </p>
        <form className="form-grid mt-7" onSubmit={submit}>
          {setup && (
            <label className="full">
              Seu nome
              <input
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="full">
            Usuário
            <input
              required
              minLength={3}
              maxLength={40}
              pattern="[a-z0-9._-]{3,40}"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              placeholder="Ex.: gabriel"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
          </label>
          <label className="full">
            PIN de 6 números
            <input
              required
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              autoComplete={setup ? "new-password" : "current-password"}
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="tracking-[.3em] text-xl!"
            />
          </label>
          {setup && (
            <label className="full">
              Seu valor-hora (R$)
              <input
                type="number"
                min={0}
                max={100000}
                step=".01"
                required
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
          )}
          {!setup && (
            <label className="full flex-row! items-center gap-2! font-normal!">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
                aria-label="Manter conectado"
              />
              Manter conectado neste aparelho
            </label>
          )}
          {(issue || error) && (
            <p
              className="full text-sm text-red-700 bg-red-50 rounded-lg p-3"
              role="alert"
            >
              {issue || error}
            </p>
          )}
          <Button className="full action min-h-12!" disabled={busy}>
            {busy ? "Entrando…" : setup ? "Criar meu acesso" : "Entrar"}
            <ArrowRight size={18} />
          </Button>
        </form>
        <p className="text-xs muted mt-5 flex gap-2 items-start">
          <ShieldCheck size={15} className="shrink-0" />
          {setup
            ? "O primeiro acesso terá o perfil de coordenador."
            : "Esqueceu seu PIN? Peça ao coordenador para redefinir. Em aparelhos compartilhados, desmarque “Manter conectado”."}
        </p>
      </section>
      <div className="text-center mt-6">
        <Button className="action muted" variant="ghost" onClick={demo}>
          <Eye size={16} />
          Explorar demonstração
        </Button>
        <p className="muted text-xs mt-5">
          Somente para serviços técnicos.
          <br />O ponto diário continua no sistema da empresa.
        </p>
      </div>
    </div>
  );
}
