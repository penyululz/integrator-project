import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(plainTextPassword: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(plainTextPassword, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

function verifyLegacyPlainText(
  plainTextPassword: string,
  storedPasswordHash: string,
): boolean {
  return plainTextPassword === storedPasswordHash;
}

export async function verifyPassword(
  plainTextPassword: string,
  storedPasswordHash: string,
): Promise<boolean> {
  if (!storedPasswordHash.startsWith("scrypt$")) {
    return verifyLegacyPlainText(plainTextPassword, storedPasswordHash);
  }

  const parts = storedPasswordHash.split("$");
  if (parts.length !== 3) {
    return false;
  }

  const [, salt, storedHex] = parts;
  const derived = (await scrypt(plainTextPassword, salt, 64)) as Buffer;
  const stored = Buffer.from(storedHex, "hex");
  if (derived.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(derived, stored);
}
