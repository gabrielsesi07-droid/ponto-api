import { orderLabel } from "./order-label.mjs";
export const PUSH_MAX_AGE_HOURS = 24;
export const PUSH_MAX_ATTEMPTS = 4;
export const PUSH_LEASE_SECONDS = 120;
export const PUSH_RETRY_SECONDS = 300;
export const PUSH_BUDGET_MS = 40000;

export type PushJob = {
  id: string; order_id: string; user_id: string; subscription_id: string;
  kind: 'assigned' | 'hours'; attempts: number; created_at: string; lease_token: string;
};
export type PushKeys = { public_key: string; private_key: string };
export type PushRecipient = {
  endpoint: string; p256dh: string; auth: string; updated_at: string; number: number; official_number?: string | null; status: string;
};
export type PushEligibility = { recipient: PushRecipient; reason?: never } | { recipient?: never; reason: string };
export type PushFinalization = { status: 'sent' | 'pending' | 'failed' | 'skipped'; reason: string; code: number | null };
export type PushStore = {
  configuration: () => Promise<PushKeys | null>;
  expire: () => Promise<{ expired: number; exhausted: number }>;
  claim: (limit: number) => Promise<PushJob[]>;
  recipient: (job: PushJob) => Promise<PushEligibility>;
  finalize: (job: PushJob, result: PushFinalization) => Promise<boolean>;
  revoke: (job: PushJob, recipient: PushRecipient) => Promise<boolean>;
};
export type PushSender = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string,
  options: { TTL: number; timeout: number; vapidDetails: { subject: string; publicKey: string; privateKey: string } }) => Promise<void>;
export type PushReport = {
  configMissing: boolean; claimed: number; sent: number; retried: number; failed: number; skipped: number;
  expired: number; revokedDevices: number; leaseLost: number; durationMs: number; reasons: Record<string, number>;
};

export function pushTtl(createdAt: string, now: number) {
  return Math.max(0, Math.min(86400, Math.floor((new Date(createdAt).getTime() + PUSH_MAX_AGE_HOURS * 3600000 - now) / 1000))) || 0;
}

export function pushFailure(code: number, attempts: number): PushFinalization {
  if (code === 404 || code === 410) return { status: 'failed', reason: 'endpoint_expired', code };
  if (code >= 400 && code < 500 && ![408, 429].includes(code)) return { status: 'failed', reason: 'provider_rejected', code };
  return { status: attempts >= PUSH_MAX_ATTEMPTS ? 'failed' : 'pending',
    reason: attempts >= PUSH_MAX_ATTEMPTS ? 'attempt_limit' : 'provider_retry', code };
}

export function pushPayload(job: Pick<PushJob, 'kind' | 'order_id'>, recipient: Pick<PushRecipient, 'number' | 'official_number' | 'status'>) {
  const number = orderLabel(recipient.number, recipient.official_number);
  return JSON.stringify({
    ...(job.kind === 'hours'
      ? { title: 'Registre suas horas', body: `A ${number} foi ${recipient.status === 'Cancelada' ? 'cancelada' : 'concluída'} e ainda não há horas suas nela.`, tag: `horas-${job.order_id}` }
      : { title: 'Nova ordem de serviço', body: `Você foi designado para a ${number}. Abra para conferir.`, tag: `os-${job.order_id}` }),
    url: `/?view=orders&order=${job.order_id}`,
  });
}

/** Authorization is independent of deployment headers, cookies and caller identity. */
export function pushCronAuthorized(secret: string | undefined, authorization: string | null) {
  return !!secret && secret.length >= 16 && authorization === `Bearer ${secret}`;
}

export function createPushCronHandler({ secret, dispatch, onError }: {
  secret: () => string | undefined; dispatch: () => Promise<PushReport>; onError: () => void;
}) {
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'no-store' };
    if (!pushCronAuthorized(secret(), request.headers.get('authorization')))
      return Response.json({ error: 'Não autorizado.' }, { status: 401, headers });
    try {
      const report = await dispatch();
      return Response.json({ ok: !report.configMissing, ...report }, { status: report.configMissing ? 503 : 200, headers });
    } catch {
      onError();
      return Response.json({ ok: false, error: 'Não foi possível processar os avisos. A fila será retomada em uma próxima execução.' }, { status: 503, headers });
    }
  };
}

/** No network or connection is created here. Tests inject the real SQL store and a fake sender. */
export async function runPushDispatch({ store, send, endpointAllowed, now = Date.now }: {
  store: PushStore; send: PushSender; endpointAllowed: (endpoint: string) => boolean; now?: () => number;
}): Promise<PushReport> {
  const started = now(), report: PushReport = { configMissing: false, claimed: 0, sent: 0, retried: 0,
    failed: 0, skipped: 0, expired: 0, revokedDevices: 0, leaseLost: 0, durationMs: 0, reasons: {} };
  const reason = (value: string, amount = 1) => { report.reasons[value] = (report.reasons[value] || 0) + amount; };
  const keys = await store.configuration();
  const expired = await store.expire();
  report.expired = expired.expired; report.skipped = expired.expired; report.failed = expired.exhausted;
  if (expired.expired) reason('expired', expired.expired);
  if (expired.exhausted) reason('attempt_limit', expired.exhausted);
  if (!keys) { report.configMissing = true; reason('vapid_missing'); report.durationMs = now() - started; return report; }
  async function finish(job: PushJob, result: PushFinalization) {
    if (!(await store.finalize(job, result))) { report.leaseLost++; reason('lease_lost'); return false; }
    const field = result.status === 'pending' ? 'retried' : result.status;
    report[field]++; reason(result.reason); return true;
  }
  const deadline = started + PUSH_BUDGET_MS;
  for (let batch = 0; batch < 10 && now() < deadline; batch++) {
    const jobs = await store.claim(20);
    if (!jobs.length) break;
    report.claimed += jobs.length;
    await Promise.all(jobs.map(async job => {
      const eligibility = await store.recipient(job);
      if (!eligibility.recipient) { await finish(job, { status: 'skipped', reason: eligibility.reason, code: null }); return; }
      const recipient = eligibility.recipient;
      if (!endpointAllowed(recipient.endpoint)) { await finish(job, { status: 'skipped', reason: 'endpoint_unsupported', code: null }); return; }
      const ttl = pushTtl(job.created_at, now());
      if (!ttl) {
        if (await finish(job, { status: 'skipped', reason: 'expired', code: null })) report.expired++;
        return;
      }
      // Limit the catch to the provider call: a database failure is not another provider attempt.
      let providerError: unknown, providerRejected = false;
      try {
        await send({ endpoint: recipient.endpoint, keys: { p256dh: recipient.p256dh, auth: recipient.auth } }, pushPayload(job, recipient), {
          TTL: ttl, timeout: 4000, vapidDetails: { subject: 'https://ponto-api-gold.vercel.app', publicKey: keys.public_key, privateKey: keys.private_key },
        });
      } catch (error) { providerError = error; providerRejected = true; }
      if (!providerRejected) { await finish(job, { status: 'sent', reason: 'provider_accepted', code: 201 }); return; }
      const rawCode = Number((providerError as { statusCode?: number } | null)?.statusCode);
      const code = Number.isFinite(rawCode) && rawCode >= 100 && rawCode <= 599 ? rawCode : 0;
      const result = pushFailure(code, job.attempts);
      if (await finish(job, result) && result.reason === 'endpoint_expired') {
        if (await store.revoke(job, recipient)) report.revokedDevices++;
      }
    }));
  }
  report.durationMs = now() - started;
  return report;
}
