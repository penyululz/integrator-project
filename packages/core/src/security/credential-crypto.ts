import crypto from "node:crypto";

export type CredentialEncryptionEnvelope = {
  encryptedData: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

export class CredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

function isHexKey(input: string): boolean {
  return /^[A-Fa-f0-9]{64}$/.test(input);
}

function decodeKeyMaterial(input: string): Buffer {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new CredentialCryptoError("Master encryption key material cannot be empty.");
  }

  if (isHexKey(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const fromBase64 = Buffer.from(trimmed, "base64");
    if (fromBase64.length === 32) {
      return fromBase64;
    }
  } catch {
    // no-op
  }

  const fromUtf8 = Buffer.from(trimmed, "utf8");
  if (fromUtf8.length === 32) {
    return fromUtf8;
  }

  throw new CredentialCryptoError(
    "Master encryption key must be 32-byte material (hex, base64, or raw 32-char string).",
  );
}

function parseKeyVersion(input: string | undefined, fallback = 1): number {
  const parsed = Number.parseInt(input || `${fallback}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CredentialCryptoError("MASTER_ENCRYPTION_KEY_VERSION must be a positive integer.");
  }
  return parsed;
}

function parsePreviousKeys(input: string | undefined): Array<{ version: number; key: Buffer }> {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator <= 0) {
        throw new CredentialCryptoError(
          "PREVIOUS_MASTER_ENCRYPTION_KEYS entries must be formatted as <version>:<key>.",
        );
      }
      const version = parseKeyVersion(entry.slice(0, separator));
      const key = decodeKeyMaterial(entry.slice(separator + 1));
      return {
        version,
        key,
      };
    });
}

function createDevFallbackKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update("integration-platform-dev-master-key")
    .digest();
}

export class CredentialCrypto {
  private readonly keyring = new Map<number, Buffer>();

  constructor(
    readonly currentKeyVersion: number,
    currentKey: Buffer,
    previousKeys: Array<{ version: number; key: Buffer }> = [],
  ) {
    this.keyring.set(currentKeyVersion, currentKey);
    for (const item of previousKeys) {
      this.keyring.set(item.version, item.key);
    }
  }

  encrypt(payload: Record<string, unknown>): CredentialEncryptionEnvelope {
    const key = this.keyring.get(this.currentKeyVersion);
    if (!key) {
      throw new CredentialCryptoError(
        `Current key version "${this.currentKeyVersion}" is not configured.`,
      );
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encodedPayload = JSON.stringify(payload);
    const encrypted = Buffer.concat([
      cipher.update(encodedPayload, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      keyVersion: this.currentKeyVersion,
    };
  }

  decrypt(envelope: CredentialEncryptionEnvelope): Record<string, unknown> {
    const key = this.keyring.get(envelope.keyVersion);
    if (!key) {
      throw new CredentialCryptoError(
        `No encryption key available for version "${envelope.keyVersion}".`,
      );
    }

    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(envelope.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(envelope.encryptedData, "base64")),
        decipher.final(),
      ]).toString("utf8");
      const parsed = JSON.parse(decrypted);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new CredentialCryptoError("Decrypted credential payload must be an object.");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof CredentialCryptoError) {
        throw error;
      }
      throw new CredentialCryptoError(
        "Credential decryption failed. Verify key configuration and key versions.",
      );
    }
  }
}

export function createCredentialCryptoFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CredentialCrypto {
  const appEnv = env.APP_ENV || "development";
  const currentKeyVersion = parseKeyVersion(env.MASTER_ENCRYPTION_KEY_VERSION, 1);
  const keyMaterial =
    env.MASTER_ENCRYPTION_KEY ||
    (appEnv === "production" ? "" : createDevFallbackKey().toString("base64"));

  if (!keyMaterial) {
    throw new CredentialCryptoError(
      "MASTER_ENCRYPTION_KEY is required in production.",
    );
  }

  const currentKey = decodeKeyMaterial(keyMaterial);
  const previousKeys = parsePreviousKeys(env.PREVIOUS_MASTER_ENCRYPTION_KEYS);
  return new CredentialCrypto(currentKeyVersion, currentKey, previousKeys);
}
