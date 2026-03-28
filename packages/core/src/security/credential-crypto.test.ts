import { describe, expect, it } from "vitest";
import { CredentialCrypto, CredentialCryptoError } from "./credential-crypto";

function hexKey(seed: string): Buffer {
  return Buffer.from(seed.repeat(64).slice(0, 64), "hex");
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
});
