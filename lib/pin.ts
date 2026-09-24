export const pinPattern = /^\d{6}$/;
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
