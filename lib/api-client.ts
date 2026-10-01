export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Do not automatically retry mutations: a lost response may hide a successful save. */
export async function requestApi<T>(path: string, data?: unknown, method = 'POST', options: { timeoutMs?: number; fetcher?: typeof fetch } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const reading = data === undefined;
  try {
    const response = await (options.fetcher ?? fetch)(path, {
      method: reading ? 'GET' : method,
      headers: reading ? {} : { 'Content-Type': 'application/json' },
      body: reading ? undefined : JSON.stringify(data),
      signal: controller.signal,
      cache: 'no-store',
    });
    const raw = await response.text();
    let out: { error?: string; code?: string };
    try { out = JSON.parse(raw); }
    catch {
      throw new ApiError(reading
        ? 'O servidor não retornou os dados esperados. Tente atualizar em instantes.'
        : 'Não foi possível confirmar a operação. Atualize os dados e confira antes de tentar novamente.', response.status);
    }
    if (!response.ok) throw new ApiError(out?.error || 'Não foi possível concluir a operação.', response.status, out?.code);
    return out as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError(reading
      ? 'A consulta demorou mais que o esperado. Tente atualizar os dados.'
      : 'A resposta demorou mais que o esperado. A operação pode ter sido concluída; atualize os dados antes de tentar novamente.', 0, 'TIMEOUT');
    throw new ApiError(reading
      ? 'Não foi possível conectar. Confira sua conexão e tente atualizar os dados.'
      : 'A conexão foi interrompida. Confira os dados antes de repetir a operação.', 0, 'CONNECTION_ERROR');
  } finally { clearTimeout(timer); }
}
