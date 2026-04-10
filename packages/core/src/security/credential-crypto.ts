import crypto from "node:crypto";
import zlib from "node:zlib";

export type CredentialEncryptionEnvelope = {
  encryptedData: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

type CredentialCryptoCompressionOptions = {
  enabled?: boolean;
  minBytes?: number;
  minSavingsRatio?: number;
  gzipLevel?: number;
};

type CredentialCryptoOptions = {
  compression?: CredentialCryptoCompressionOptions;
};

type ResolvedCredentialCryptoCompressionOptions = {
  enabled: boolean;
  minBytes: number;
  minSavingsRatio: number;
  gzipLevel: number;
};

const PAYLOAD_ENCODING_JSON = "j:";
const PAYLOAD_ENCODING_GZIP = "gz:";
const DEFAULT_COMPRESSION_MIN_BYTES = 4_096;
const DEFAULT_COMPRESSION_MIN_SAVINGS_RATIO = 0.95;
const DEFAULT_COMPRESSION_GZIP_LEVEL = 6;

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

function parseBooleanFlag(
  input: string | undefined,
  fallback: boolean,
  fieldName: string,
): boolean {
  if (input === undefined) {
    return fallback;
  }
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }
  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }
  throw new CredentialCryptoError(`${fieldName} must be a boolean value.`);
}

function parseNumberOption(
  input: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (input === undefined || !input.trim()) {
    return fallback;
  }
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function createDevFallbackKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update("integration-platform-dev-master-key")
    .digest();
}

export class CredentialCrypto {
  private readonly keyring = new Map<number, Buffer>();
  private readonly compressionOptions: ResolvedCredentialCryptoCompressionOptions;

  constructor(
    readonly currentKeyVersion: number,
    currentKey: Buffer,
    previousKeys: Array<{ version: number; key: Buffer }> = [],
    options: CredentialCryptoOptions = {},
  ) {
    this.keyring.set(currentKeyVersion, currentKey);
    for (const item of previousKeys) {
      this.keyring.set(item.version, item.key);
    }
    this.compressionOptions = {
      enabled: options.compression?.enabled !== false,
      minBytes: Math.max(
        256,
        Math.trunc(options.compression?.minBytes || DEFAULT_COMPRESSION_MIN_BYTES),
      ),
      minSavingsRatio: Math.max(
        0.5,
        Math.min(
          0.99,
          options.compression?.minSavingsRatio || DEFAULT_COMPRESSION_MIN_SAVINGS_RATIO,
        ),
      ),
      gzipLevel: Math.max(
        1,
        Math.min(
          9,
          Math.trunc(options.compression?.gzipLevel || DEFAULT_COMPRESSION_GZIP_LEVEL),
        ),
      ),
    };
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
    const encodedPayload = this.encodePayload(payload);
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
      return this.decodePayload(decrypted);
    } catch (error) {
      if (error instanceof CredentialCryptoError) {
        throw error;
      }
      throw new CredentialCryptoError(
        "Credential decryption failed. Verify key configuration and key versions.",
      );
    }
  }

  private encodePayload(payload: Record<string, unknown>): string {
    const jsonPayload = JSON.stringify(payload);
    const rawBuffer = Buffer.from(jsonPayload, "utf8");
    if (
      !this.compressionOptions.enabled ||
      rawBuffer.length < this.compressionOptions.minBytes
    ) {
      return `${PAYLOAD_ENCODING_JSON}${jsonPayload}`;
    }

    const compressed = zlib.gzipSync(rawBuffer, {
      level: this.compressionOptions.gzipLevel,
    });
    const savingsTarget = Math.floor(
      rawBuffer.length * this.compressionOptions.minSavingsRatio,
    );
    if (compressed.length >= rawBuffer.length || compressed.length > savingsTarget) {
      return `${PAYLOAD_ENCODING_JSON}${jsonPayload}`;
    }
    return `${PAYLOAD_ENCODING_GZIP}${compressed.toString("base64")}`;
  }

  private decodePayload(encodedPayload: string): Record<string, unknown> {
    let jsonPayload = encodedPayload;
    if (encodedPayload.startsWith(PAYLOAD_ENCODING_JSON)) {
      jsonPayload = encodedPayload.slice(PAYLOAD_ENCODING_JSON.length);
    } else if (encodedPayload.startsWith(PAYLOAD_ENCODING_GZIP)) {
      const compressedData = encodedPayload.slice(PAYLOAD_ENCODING_GZIP.length);
      try {
        jsonPayload = zlib
          .gunzipSync(Buffer.from(compressedData, "base64"))
          .toString("utf8");
      } catch {
        throw new CredentialCryptoError(
          "Credential decryption failed. Compressed payload is invalid.",
        );
      }
    }

    const parsed = JSON.parse(jsonPayload);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new CredentialCryptoError("Decrypted credential payload must be an object.");
    }
    return parsed as Record<string, unknown>;
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
  const compressionEnabled = parseBooleanFlag(
    env.MASTER_ENCRYPTION_COMPRESS_ENABLED,
    true,
    "MASTER_ENCRYPTION_COMPRESS_ENABLED",
  );
  const compressionMinBytes = Math.trunc(
    parseNumberOption(
      env.MASTER_ENCRYPTION_COMPRESS_MIN_BYTES,
      DEFAULT_COMPRESSION_MIN_BYTES,
      256,
      10_000_000,
    ),
  );
  const compressionMinSavingsRatio = parseNumberOption(
    env.MASTER_ENCRYPTION_COMPRESS_MIN_SAVINGS_RATIO,
    DEFAULT_COMPRESSION_MIN_SAVINGS_RATIO,
    0.5,
    0.99,
  );
  const compressionGzipLevel = Math.trunc(
    parseNumberOption(
      env.MASTER_ENCRYPTION_COMPRESS_GZIP_LEVEL,
      DEFAULT_COMPRESSION_GZIP_LEVEL,
      1,
      9,
    ),
  );

  return new CredentialCrypto(currentKeyVersion, currentKey, previousKeys, {
    compression: {
      enabled: compressionEnabled,
      minBytes: compressionMinBytes,
      minSavingsRatio: compressionMinSavingsRatio,
      gzipLevel: compressionGzipLevel,
    },
  });
}
