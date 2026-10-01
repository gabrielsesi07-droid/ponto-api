export const pinPattern = /^\d{6}$/;
export const TEMPORARY_PIN_HOURS = 24;
export function randomTemporaryPin() {
  // Rejection sampling avoids bias in mapping random integers to six digits.
  const range = 1_000_000, limit = Math.floor(2 ** 32 / range) * range;
  let value: number;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit || value % range === 123456);
  return String(value % range).padStart(6, "0");
}
export function pinAccessAllowed(required: boolean, allowPinChange = false) {
  return !required || allowPinChange;
}
export function bootstrapConfigured(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}
export async function validBootstrapToken(provided: unknown, secret: string | undefined) {
  if (!bootstrapConfigured(secret) || typeof provided !== "string" || provided.length > 1024) return false;
  const a = await digest(provided), b = await digest(secret);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
export async function digest(s: string) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
  );
}
export async function hashPin(pin: string, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return salt + ":" + hex(bits);
}
export async function verifyPin(pin: string, stored: string) {
  const expected = await hashPin(pin, stored.split(":")[0]);
  if (expected.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}
export function sessionCookie(token: string, req: Request, days = 30) {
  return (
    "hc_session=" +
    token +
    "; Path=/; HttpOnly; SameSite=Lax" +
    (days >= 1 || days === 0 ? "; Max-Age=" + Math.round(days * 86400) : "") +
    (new URL(req.url).protocol === "https:" ? "; Secure" : "")
  );
}
