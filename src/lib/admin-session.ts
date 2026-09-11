import { createHash, createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "admin_session";
const SESSION_PAYLOAD = "farmacia-viva-admin";

function getSecret(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD não configurada em .env.local.");
  }
  return password;
}

/** Gera o token de sessão assinado a partir da senha do admin (não guarda a senha em si). */
export function createAdminSessionToken(): string {
  return createHmac("sha256", getSecret()).update(SESSION_PAYLOAD).digest("hex");
}

export function verifyAdminSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  let expected: Buffer;
  let received: Buffer;
  try {
    expected = Buffer.from(createAdminSessionToken(), "hex");
    received = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function checkAdminPassword(password: string): boolean {
  // Compara hashes de tamanho fixo (32 bytes) em vez das strings originais:
  // evita o early-return por tamanho diferente que uma comparação direta com
  // timingSafeEqual exigiria, o que vazaria o comprimento da senha real.
  const expectedHash = createHash("sha256").update(getSecret()).digest();
  const receivedHash = createHash("sha256").update(password).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}
