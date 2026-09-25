"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuickLogin } from "./quick-login";

export function LoginPage() {
  const router = useRouter();
  const [session, setSession] = useState({ setup: false, connected: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function checkSession() {
      try {
        const response = await fetch("/api/session", {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "Não foi possível verificar o acesso. Atualize a página e tente novamente.",
          );
        const data = (await response.json()) as {
          setup?: boolean;
          me?: unknown;
        };
        setSession({ setup: !!data.setup, connected: !!data.me });
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void checkSession();
    return () => controller.abort();
  }, []);

  return (
    <QuickLogin
      setup={session.setup}
      connected={session.connected}
      loading={loading}
      error={error}
      reload={async () => {
        router.replace("/?view=register");
      }}
      demo={() => router.push("/?demo=1")}
    />
  );
}
