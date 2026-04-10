type BlobProtectionPolicyInput = {
  contentType?: string | null;
  sizeBytes: number;
  encryption?: string | null;
  metadata: Record<string, unknown>;
};

type BlobProtectionPolicyResult = {
  encryption: string | null;
  metadata: Record<string, unknown>;
};

const DEFAULT_FILE_STORAGE_COMPRESSION_MIN_BYTES = 256 * 1024;
const DEFAULT_FILE_STORAGE_COMPRESSION_ALGORITHM = "gzip";
const DEFAULT_FILE_STORAGE_ENCRYPTION = "AES256-GCM";

const TEXT_LIKE_CONTENT_TYPE_MARKERS = [
  "text/",
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-typescript",
  "application/graphql",
  "application/x-yaml",
  "application/yaml",
  "application/x-ndjson",
  "application/sql",
  "application/csv",
  "application/x-www-form-urlencoded",
  "image/svg+xml",
];

function parseBooleanFlag(input: string | undefined, fallback: boolean): boolean {
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
  return fallback;
}

function parseNumberFlag(
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
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeNonEmptyString(input: string | null | undefined): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isTextLikeContentType(contentType: string | null | undefined): boolean {
  const normalized = normalizeNonEmptyString(contentType);
  if (!normalized) {
    return false;
  }
  const lowered = normalized.toLowerCase();
  return TEXT_LIKE_CONTENT_TYPE_MARKERS.some((marker) =>
    lowered.includes(marker),
  );
}

function resolveCompressionMinBytes(): number {
  return parseNumberFlag(
    process.env.FILE_STORAGE_COMPRESS_MIN_BYTES,
    DEFAULT_FILE_STORAGE_COMPRESSION_MIN_BYTES,
    1024,
    50_000_000,
  );
}

function resolveCompressionAlgorithm(): string {
  return (
    normalizeNonEmptyString(process.env.FILE_STORAGE_COMPRESSION_ALGORITHM) ||
    DEFAULT_FILE_STORAGE_COMPRESSION_ALGORITHM
  );
}

function resolveDefaultEncryption(): string {
  return (
    normalizeNonEmptyString(process.env.FILE_STORAGE_DEFAULT_ENCRYPTION) ||
    DEFAULT_FILE_STORAGE_ENCRYPTION
  );
}

function isCompressionEnabled(): boolean {
  return parseBooleanFlag(process.env.FILE_STORAGE_COMPRESS_ENABLED, true);
}

export function applyBlobProtectionPolicy(
  input: BlobProtectionPolicyInput,
): BlobProtectionPolicyResult {
  const sizeBytes = Math.max(0, Math.floor(input.sizeBytes || 0));
  const compressMinBytes = resolveCompressionMinBytes();
  const compressionAlgorithm = resolveCompressionAlgorithm();
  const compressionEnabled = isCompressionEnabled();
  const textLike = isTextLikeContentType(input.contentType);
  const shouldCompress = compressionEnabled && textLike && sizeBytes >= compressMinBytes;

  const resolvedEncryption =
    normalizeNonEmptyString(input.encryption) || resolveDefaultEncryption();
  const mergedMetadata: Record<string, unknown> = {
    ...input.metadata,
    protection: {
      version: 1,
      pipeline: "compress-then-encrypt",
      compression: {
        enabled: shouldCompress,
        algorithm: shouldCompress ? compressionAlgorithm : null,
        textLike,
        minBytes: compressMinBytes,
        sizeBytes,
      },
      encryption: {
        enabled: Boolean(resolvedEncryption),
        algorithm: resolvedEncryption,
      },
    },
  };

  return {
    encryption: resolvedEncryption,
    metadata: mergedMetadata,
  };
}
