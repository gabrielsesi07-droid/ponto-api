import { neon } from "@neondatabase/serverless";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { cookies } from "next/headers";
import { digest, pinAccessAllowed } from "./pin";
import { z } from "zod";
import type { Person } from "./domain";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export function db() {
  const url =
    (env as unknown as Record<string, string>).DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!url)
    throw new ApiError(
      503,
      "Não conseguimos acessar o sistema agora. Tente novamente em instantes.",
    );
  return neon(url);
}
export function runtimeEnv(name: string) {
  return (env as unknown as Record<string, string | undefined>)[name] || process.env[name];
}
export async function identity() {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Entre com sua conta para continuar.");
  return user;
}
export async function member(options: { allowPinChange?: boolean } = {}) {
  const token=(await cookies()).get('hc_session')?.value;
  if(!token)throw new ApiError(401,'Entre com seu login para continuar.');
  const sql=db();
  const rows=await sql`SELECT u.id,u.name,u.access_code,u.username,u.email,u.role,u.job,u.phone,u.hourly_rate,u.monthly_salary,u.monthly_hours,u.active,u.can_edit,u.pin_change_required,u.pin_change_prompted,u.credential_version FROM horacerta.users u JOIN horacerta.sessions s ON s.user_id=u.id AND s.credential_version=u.credential_version WHERE s.token_hash=${await digest(token)} AND s.expires_at>now() AND u.active=true`;
  if (!rows[0])
    throw new ApiError(
      403,
      "Sua conta ainda não foi cadastrada ou está desativada. Fale com o coordenador.",
    );
  const u = rows[0] as Person & { credential_version: number };
  if (!pinAccessAllowed(u.pin_change_required, options.allowPinChange))
    throw new ApiError(403, "Troque seu PIN temporário antes de continuar.", "PIN_CHANGE_REQUIRED");
  return u;
}
export function coordinator(p: Person) {
  if (p.role !== "coordinator")
    throw new ApiError(403, "Esta ação é exclusiva do coordenador.");
}
export async function payload(req: Request, options: { allowEmpty?: boolean } = {}) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new ApiError(403, "Origem de requisição inválida.");
  if (Number(req.headers.get("content-length") || 0) > 30000)
    throw new ApiError(413, "Conteúdo muito grande.");
  const reader = req.body?.getReader();
  if (!reader) {
    if (options.allowEmpty) return {};
    throw new ApiError(400, 'Informe os dados.');
  }
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 30000) { await reader.cancel(); throw new ApiError(413, 'Conteúdo muito grande.'); }
    parts.push(value);
  }
  const source = Buffer.concat(parts).toString('utf8');
  if (options.allowEmpty && source.length === 0) return {};
  return z.record(z.unknown()).parse(JSON.parse(source));
}
export function failure(err: unknown) {
  if (err instanceof SyntaxError) return Response.json({ error: 'Dados inválidos. Confira o formulário e tente novamente.' }, { status: 400 });
  if (err instanceof ApiError)
    return Response.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, { status: err.status });
  if (err instanceof z.ZodError)
    return Response.json(
      { error: err.issues[0]?.message || "Dados inválidos." },
      { status: 400 },
    );
  const code = (err as { code?: string })?.code;
  if (code === '23503') return Response.json({ error: 'Este cadastro possui registros vinculados. Atualize a lista e preserve o histórico.' }, { status: 409 });
  if (code === "23505")
    return Response.json(
      { error: "Já existe um cadastro com estes dados." },
      { status: 409 },
    );
  console.error("HoraCerta request failure", code || "unavailable");
  return Response.json(
    { error: "Não foi possível concluir. Tente novamente." },
    { status: 503 },
  );
}
export const personSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  username:z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/,'Use 3 a 40 letras minúsculas, números, ponto ou hífen no login.').optional(),
  pin:z.string().regex(/^\d{6}$/,'Use um PIN de 6 números.').optional(),
  email: z
    .string()
    .email("E-mail inválido.")
    .transform((s) => s.toLowerCase().trim()),
  job: z.string().max(100).default(""),
  phone: z.string().max(30).default(""),
  active: z.boolean().default(true),
  can_edit: z.boolean().default(true),
});
export const clientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o cliente.").max(150),
  city: z.string().max(100).default(""),
  state: z.string().max(2).default(""),
  service_type: z.string().max(120).default(""),
  notes: z.string().max(2000).default(""),
  active: z.boolean().default(true),
});
export const rulesSchema = z.object({
  daily_minutes: z.coerce.number().int().min(1).max(1440),
  weekday_bonus: z.coerce.number().min(0).max(1000),
  saturday_bonus: z.coerce.number().min(0).max(1000),
  sunday_bonus: z.coerce.number().min(0).max(1000),
  holiday_bonus: z.coerce.number().min(0).max(1000),
  allow_retro: z.boolean(),
  approval_required: z.boolean(),
  currency: z.enum(["BRL", "USD", "EUR"]),
  date_format: z.enum(["dd/MM/yyyy", "yyyy-MM-dd"]),
  time_format: z.enum(["24h", "12h"]),
});
