import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CredentialCrypto,
  CredentialCryptoError,
  type CredentialEncryptionEnvelope,
} from "./credential-crypto";

function hexKey(seed: string): Buffer {
  return Buffer.from(seed.repeat(64).slice(0, 64), "hex");
}

function decryptRawPayload(
  envelope: CredentialEncryptionEnvelope,
  key: Buffer,
): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.encryptedData, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

describe("CredentialCrypto", () => {
  it("encrypts and decrypts credential payloads", () => {
    const crypto = new CredentialCrypto(1, hexKey("a1"));
    const envelope = crypto.encrypt({
      accessToken: "token-value",
      refreshToken: "refresh-value",
      apiKey: "api-key-value",
    });

    const decrypted = crypto.decrypt(envelope);
    expect(decrypted).toMatchObject({
      accessToken: "token-value",
      refreshToken: "refresh-value",
      apiKey: "api-key-value",
    });
  });

  it("fails safely when decrypting with the wrong key", () => {
    const encryptor = new CredentialCrypto(1, hexKey("b2"));
    const wrongDecryptor = new CredentialCrypto(1, hexKey("c3"));

    const envelope = encryptor.encrypt({
      accessToken: "token-value",
    });

    expect(() => wrongDecryptor.decrypt(envelope)).toThrow(CredentialCryptoError);
  });

  it("supports key version fallback for rotation", () => {
    const keyV1 = hexKey("d4");
    const keyV2 = hexKey("e5");
    const original = new CredentialCrypto(1, keyV1);
    const rotated = new CredentialCrypto(2, keyV2, [{ version: 1, key: keyV1 }]);

    const envelope = original.encrypt({
      accessToken: "token-v1",
    });
    const decrypted = rotated.decrypt(envelope);

    expect(decrypted.accessToken).toBe("token-v1");
  });

  it("compresses large payloads before encryption", () => {
    const key = hexKey("f6");
    const secureCrypto = new CredentialCrypto(1, key, [], {
      compression: {
        enabled: true,
        minBytes: 64,
      },
    });

    const envelope = secureCrypto.encrypt({
      accessToken: "token",
      metadata: {
        note: "a".repeat(8000),
      },
    });

    const rawPayload = decryptRawPayload(envelope, key);
    expect(rawPayload.startsWith("gz:")).toBe(true);

    const decrypted = secureCrypto.decrypt(envelope);
    expect(decrypted).toMatchObject({
      accessToken: "token",
    });
  });

  it("decrypts legacy uncompressed payloads without encoding prefix", () => {
    const key = hexKey("a7");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const legacyPayload = JSON.stringify({
      accessToken: "legacy-token",
      metadata: { legacy: true },
    });
    const encrypted = Buffer.concat([
      cipher.update(legacyPayload, "utf8"),
      cipher.final(),
    ]);
    const envelope: CredentialEncryptionEnvelope = {
      encryptedData: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: 1,
    };

    const secureCrypto = new CredentialCrypto(1, key);
    const decrypted = secureCrypto.decrypt(envelope);
    expect(decrypted).toMatchObject({
      accessToken: "legacy-token",
      metadata: { legacy: true },
    });
  });
});
