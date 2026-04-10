import { createHash, randomBytes, randomInt } from "node:crypto";

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function generateSecureToken(byteLength = 32): string {
  return toBase64Url(randomBytes(Math.max(16, Math.min(byteLength, 128))));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateOtpCode(length = 6): string {
  const clampedLength = Math.max(4, Math.min(length, 10));
  const min = 10 ** (clampedLength - 1);
  const max = 10 ** clampedLength;
  return String(randomInt(min, max));
}

