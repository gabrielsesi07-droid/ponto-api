"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuickLogin } from "./quick-login";

export function LoginPage() {
  const router = useRouter();
  const [session, setSession] = useState({ setup: false, connected: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const clearError = useCallback(() => setError(""), []);

  useEffect(() => {
    const controller = new AbortController();
    async function checkSession() {
      try {
        let data: { setup?: boolean; me?: unknown } | null = null;
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch("/api/session", {
              signal: controller.signal,
              cache: "no-store",
            });
            if (!response.ok)
              throw new Error(
                "Não conseguimos acessar o sistema agora. Tente novamente em instantes.",
              );
            data = (await response.json()) as {
              setup?: boolean;
              me?: unknown;
            };
            break;
          } catch (requestError) {
            lastError = requestError;
            if (controller.signal.aborted) return;
            if (attempt < 2)
              await new Promise((resolve) =>
                window.setTimeout(resolve, 500 * (attempt + 1)),
              );
          }
        }
        if (!data) throw lastError;
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
      clearError={clearError}
      reload={async () => {
        router.replace("/?view=register");
      }}
      demo={() => router.push("/?demo=1")}
    />
  );
}
