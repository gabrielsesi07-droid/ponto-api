"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Eye,
  EyeOff,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { api } from "./editors";

type AccessOption = {
  name: string;
  access_code: string;
  job: string;
};

export function QuickLogin({
  setup,
  error,
  reload,
  demo,
  loading = false,
  connected = false,
}: {
  setup: boolean;
  error: string;
  reload: () => Promise<void>;
  demo: () => void;
  loading?: boolean;
  connected?: boolean;
}) {
  const [step, setStep] = useState<"name" | "pin">("name");
  const [searchName, setSearchName] = useState("");
  const [people, setPeople] = useState<AccessOption[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<AccessOption | null>(null);
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("0");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [paused, setPaused] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const pinInput = useRef<HTMLInputElement>(null);
  const hasAdvanced = useRef(false);

  useEffect(() => {
    if (step === "pin") pinInput.current?.focus();
    else if (hasAdvanced.current) nameInput.current?.focus();
  }, [step]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || loading) return;
    setIssue("");
    if (!setup && step === "name") {
      const query = searchName.trim();
      if (query.length < 2) {
        setIssue("Digite pelo menos 2 letras do seu nome.");
        nameInput.current?.focus();
        return;
      }
      setBusy(true);
      try {
        const result = await api<{ people: AccessOption[] }>(
          "/api/login?name=" + encodeURIComponent(query),
        );
        setPeople(result.people);
        setSearched(true);
        if (!result.people.length)
          setIssue("Nenhum colaborador encontrado com esse nome.");
      } catch (e) {
        setIssue((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await api(
        setup ? "/api/session" : "/api/login",
        setup
          ? { name, pin, hourly_rate: Number(rate) }
          : { access_code: selected?.access_code, pin, remember },
      );
      await reload();
    } catch (e) {
      setIssue((e as Error).message);
      pinInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setStep("name");
    setSelected(null);
    setPin("");
    setShowPin(false);
    setIssue("");
  }

  function choose(person: AccessOption) {
    setSelected(person);
    setIssue("");
    hasAdvanced.current = true;
    setStep("pin");
  }

  return (
    <main className="login-page" data-paused={paused}>
      <div className="login-scenery" aria-hidden="true">
        <div className="login-aurora login-aurora-blue" />
        <div className="login-aurora login-aurora-teal" />
        <div className="login-grid" />
        <div className="login-stars" />
        <div className="login-horizon" />
      </div>

      <header className="login-header">
        <Link
          href="/login"
          prefetch={false}
          onClick={back}
          className="login-brand"
          aria-label="HoraCerta, início do login"
        >
          <span className="login-brand-icon">
            <Clock3 size={24} strokeWidth={1.7} />
          </span>
          <span>
            HoraCerta<span className="login-brand-dot">.</span>
          </span>
        </Link>
        <span className="login-header-note">
          <span /> SEU TEMPO, NO LUGAR CERTO
        </span>
        <button
          className="login-motion-control"
          type="button"
          onClick={() => setPaused(!paused)}
          aria-label={
            paused ? "Ativar animações de fundo" : "Pausar animações de fundo"
          }
          aria-pressed={paused}
          title={paused ? "Ativar animações" : "Pausar animações"}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      </header>

      <div className="login-layout">
        <section className="login-story" aria-labelledby="login-story-title">
          <div className="login-kicker">
            <span /> PONTO EM SERVIÇO
          </div>
          <h1 id="login-story-title">
            Cada hora conta.
            <br />
            <span>A sua também.</span>
          </h1>
          <p className="login-story-copy">
            Seu trabalho tem valor. Registre seus serviços e acompanhe cada
            conquista do seu tempo.
          </p>

          <div className="login-orbit-scene" aria-hidden="true">
            <div className="login-orbit-halo" />
            <div className="login-orbit login-orbit-outer">
              <i />
            </div>
            <div className="login-orbit login-orbit-inner">
              <i />
            </div>
            <div className="login-clock">
              <div className="login-clock-rim" />
              <span className="login-clock-label">HORA CERTA</span>
              <span className="login-clock-twelve">12</span>
              <span className="login-clock-three">03</span>
              <span className="login-clock-six">06</span>
              <span className="login-clock-nine">09</span>
              <span className="login-hand login-hand-hour" />
              <span className="login-hand login-hand-minute" />
              <span className="login-hand login-hand-second" />
              <span className="login-clock-pivot" />
              <span className="login-clock-caption">CADA HORA CONTA</span>
            </div>
            <div className="login-float login-float-top">
              <span>
                <Check size={16} />
              </span>
              <div>
                Seu tempo registrado<small>Um toque. Tudo em dia.</small>
              </div>
            </div>
            <div className="login-float login-float-bottom">
              <span>
                <Sparkles size={17} />
              </span>
              <div>
                Mais clareza.<small>Para cada hora extra.</small>
              </div>
            </div>
          </div>

          <div className="login-benefits" aria-label="Recursos do HoraCerta">
            <span>
              <Check size={14} /> Ponto rápido
            </span>
            <span>
              <Check size={14} /> Suas horas extras
            </span>
            <span>
              <Check size={14} /> Tudo no seu celular
            </span>
          </div>
        </section>

        <section
          className="login-card"
          aria-labelledby="login-title"
          aria-busy={loading || busy}
        >
          <div className="login-card-topline">
            <span>SEU ESPAÇO</span>
            <ShieldCheck size={17} />
            <span>ACESSO PROTEGIDO</span>
          </div>
          <div className="login-card-content">
            <div className="login-welcome-icon">
              <Fingerprint size={32} strokeWidth={1.5} />
            </div>
            <div className="login-intro">
              <p className="login-card-eyebrow">BEM-VINDO AO HORACERTA</p>
              <h2 id="login-title">
                {setup
                  ? "Tudo começa aqui."
                  : step === "name"
                    ? "Encontre seu cadastro."
                    : "Só falta o seu PIN."}
              </h2>
              <p>
                {setup
                  ? "Crie o acesso do coordenador para começar a organizar sua equipe."
                  : step === "name"
                    ? "Digite seu nome e escolha o cadastro identificado pelo seu código."
                    : "Digite os 6 números para entrar no seu espaço."}
              </p>
            </div>

            {!setup && (
              <ol className="login-steps" aria-label="Etapas do login">
                <li
                  data-active={step === "name"}
                  data-done={step === "pin"}
                  aria-current={step === "name" ? "step" : undefined}
                >
                  <span>{step === "pin" ? <Check size={12} /> : "1"}</span> Seu
                  nome
                </li>
                <li className="login-step-line" aria-hidden="true" />
                <li
                  data-active={step === "pin"}
                  aria-current={step === "pin" ? "step" : undefined}
                >
                  <span>2</span> Seu PIN
                </li>
              </ol>
            )}

            {loading ? (
              <div className="login-loading" role="status">
                <LoaderCircle size={22} className="login-spinner" /> Preparando
                seu acesso…
              </div>
            ) : (
              <form className="login-form" onSubmit={submit}>
                <fieldset disabled={busy}>
                  {setup && (
                    <label className="login-field" htmlFor="login-full-name">
                      Seu nome completo
                      <input
                        id="login-full-name"
                        name="name"
                        required
                        minLength={2}
                        maxLength={120}
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Como podemos chamar você?"
                      />
                    </label>
                  )}

                  {!setup && step === "name" && (
                    <div className="login-step-content" key="name">
                      <label className="login-field" htmlFor="login-name">
                        Seu nome
                        <span className="login-input-wrap">
                          <UserRound size={19} aria-hidden="true" />
                          <input
                            ref={nameInput}
                            id="login-name"
                            name="name-search"
                            required
                            minLength={2}
                            maxLength={80}
                            autoComplete="name"
                            aria-describedby="login-name-hint"
                            placeholder="Ex.: Gabriel Souza"
                            value={searchName}
                            onChange={(e) => {
                              setSearchName(e.target.value);
                              setPeople([]);
                              setSearched(false);
                              setIssue("");
                            }}
                          />
                        </span>
                      </label>
                      <p className="login-field-hint" id="login-name-hint">
                        Pode digitar o nome completo ou apenas uma parte dele.
                      </p>
                      {searched && people.length > 0 && (
                        <div
                          className="login-results"
                          aria-label="Colaboradores encontrados"
                        >
                          <p>Selecione seu cadastro</p>
                          <ul>
                            {people.map((person) => (
                              <li key={person.access_code}>
                                <button
                                  type="button"
                                  onClick={() => choose(person)}
                                >
                                  <span className="login-result-avatar">
                                    {person.name
                                      .split(" ")
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .map((part) => part[0])
                                      .join("")
                                      .toUpperCase()}
                                  </span>
                                  <span className="login-result-person">
                                    <b>{person.name}</b>
                                    <small>
                                      {person.job || "Integrante da equipe"}
                                    </small>
                                  </span>
                                  <code>{person.access_code}</code>
                                  <ArrowRight size={16} aria-hidden="true" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {!setup && step === "pin" && (
                    <div className="login-identity">
                      <span className="login-identity-icon">
                        <UserRound size={18} />
                      </span>
                      <span className="login-identity-name">
                        {selected?.name}
                        <small>{selected?.access_code}</small>
                      </span>
                      <button
                        type="button"
                        onClick={back}
                        aria-label="Escolher outro cadastro"
                      >
                        <ArrowLeft size={13} /> Alterar
                      </button>
                      <input
                        type="text"
                        name="access_code"
                        value={selected?.access_code || ""}
                        autoComplete="username"
                        readOnly
                        hidden
                      />
                    </div>
                  )}

                  {(setup || step === "pin") && (
                    <div className="login-step-content" key="pin">
                      <div className="login-pin-label">
                        <label htmlFor="login-pin">
                          {setup
                            ? "Crie seu PIN de 6 números"
                            : "PIN de 6 números"}
                        </label>
                        <button
                          className="login-reveal"
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                          aria-pressed={showPin}
                        >
                          {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                      <div className="login-pin-control" data-invalid={!!issue}>
                        <input
                          ref={pinInput}
                          id="login-pin"
                          name="pin"
                          type={showPin ? "text" : "password"}
                          inputMode="numeric"
                          required
                          pattern="[0-9]{6}"
                          minLength={6}
                          maxLength={6}
                          autoComplete={
                            setup ? "new-password" : "current-password"
                          }
                          aria-describedby="login-pin-hint"
                          aria-invalid={!!issue}
                          value={pin}
                          onChange={(e) => {
                            setPin(
                              e.target.value.replace(/\D/g, "").slice(0, 6),
                            );
                            setIssue("");
                          }}
                        />
                        <div className="login-pin-slots" aria-hidden="true">
                          {Array.from({ length: 6 }, (_, i) => (
                            <span
                              key={i}
                              data-filled={i < pin.length}
                              data-cursor={i === pin.length}
                            >
                              {pin[i] ? (showPin ? pin[i] : "•") : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="login-field-hint" id="login-pin-hint">
                        <LockKeyhole size={12} /> Seu PIN é pessoal. Não
                        compartilhe.
                      </p>
                    </div>
                  )}

                  {setup && (
                    <label className="login-field" htmlFor="login-rate">
                      Seu valor-hora (R$)
                      <input
                        id="login-rate"
                        name="hourly_rate"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100000}
                        step="0.01"
                        required
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                      />
                    </label>
                  )}

                  {!setup && (
                    <label className="login-remember">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />{" "}
                      Manter conectado neste aparelho
                    </label>
                  )}

                  {(issue || error) && (
                    <p className="login-error" role="alert">
                      {issue || error}
                    </p>
                  )}

                  <button
                    className="login-submit"
                    type="submit"
                    disabled={busy}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle size={18} className="login-spinner" />{" "}
                        Entrando…
                      </>
                    ) : (
                      <>
                        {setup
                          ? "Criar meu acesso"
                          : step === "name"
                            ? "Buscar meu cadastro"
                            : "Entrar no meu espaço"}
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </fieldset>
              </form>
            )}

            <p className="login-help">
              {setup ? (
                "Depois, você poderá cadastrar todos os colaboradores da equipe."
              ) : (
                <>
                  Precisa de ajuda com seu acesso?
                  <br />
                  <span>Fale com o coordenador da sua equipe.</span>
                </>
              )}
            </p>
            {connected && (
              <Link
                className="login-connected"
                href="/?view=register"
                prefetch={false}
              >
                Você já está conectado. Voltar ao meu espaço{" "}
                <ArrowRight size={14} />
              </Link>
            )}
          </div>

          <div className="login-card-footer">
            <span>Quer conhecer primeiro?</span>
            <button type="button" onClick={demo} disabled={busy || loading}>
              Explorar demonstração <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>

      <footer className="login-footer">
        <span>
          HoraCerta <span className="login-footer-divider">/</span> Cada hora
          conta.
        </span>
        <span>
          <LockKeyhole size={12} /> Exclusivo para serviços técnicos
        </span>
      </footer>
    </main>
  );
}
