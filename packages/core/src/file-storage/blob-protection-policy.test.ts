import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBlobProtectionPolicy } from "./blob-protection-policy";

const ORIGINAL_ENV = {
  FILE_STORAGE_COMPRESS_ENABLED: process.env.FILE_STORAGE_COMPRESS_ENABLED,
  FILE_STORAGE_COMPRESS_MIN_BYTES: process.env.FILE_STORAGE_COMPRESS_MIN_BYTES,
  FILE_STORAGE_COMPRESSION_ALGORITHM: process.env.FILE_STORAGE_COMPRESSION_ALGORITHM,
  FILE_STORAGE_DEFAULT_ENCRYPTION: process.env.FILE_STORAGE_DEFAULT_ENCRYPTION,
};

describe("applyBlobProtectionPolicy", () => {
  beforeEach(() => {
    process.env.FILE_STORAGE_COMPRESS_ENABLED = "true";
    process.env.FILE_STORAGE_COMPRESS_MIN_BYTES = "262144";
    process.env.FILE_STORAGE_COMPRESSION_ALGORITHM = "gzip";
    process.env.FILE_STORAGE_DEFAULT_ENCRYPTION = "AES256-GCM";
  });

  afterEach(() => {
    process.env.FILE_STORAGE_COMPRESS_ENABLED = ORIGINAL_ENV.FILE_STORAGE_COMPRESS_ENABLED;
    process.env.FILE_STORAGE_COMPRESS_MIN_BYTES = ORIGINAL_ENV.FILE_STORAGE_COMPRESS_MIN_BYTES;
    process.env.FILE_STORAGE_COMPRESSION_ALGORITHM =
      ORIGINAL_ENV.FILE_STORAGE_COMPRESSION_ALGORITHM;
    process.env.FILE_STORAGE_DEFAULT_ENCRYPTION = ORIGINAL_ENV.FILE_STORAGE_DEFAULT_ENCRYPTION;
  });

  it("enables compression for large text-like blobs and enforces compress-then-encrypt pipeline", () => {
    const result = applyBlobProtectionPolicy({
      contentType: "application/json",
      sizeBytes: 500_000,
      encryption: null,
      metadata: {
        custom: "value",
      },
    });

    expect(result.encryption).toBe("AES256-GCM");
    expect(result.metadata).toMatchObject({
      custom: "value",
      protection: {
        pipeline: "compress-then-encrypt",
        compression: {
          enabled: true,
          algorithm: "gzip",
        },
        encryption: {
          enabled: true,
          algorithm: "AES256-GCM",
        },
      },
    });
  });

  it("disables compression for binary blobs while keeping encryption enabled", () => {
    const result = applyBlobProtectionPolicy({
      contentType: "image/png",
      sizeBytes: 5_000_000,
      encryption: "KMS-AES256",
      metadata: {},
    });

    expect(result.encryption).toBe("KMS-AES256");
    expect(result.metadata).toMatchObject({
      protection: {
        pipeline: "compress-then-encrypt",
        compression: {
          enabled: false,
          algorithm: null,
        },
        encryption: {
          enabled: true,
          algorithm: "KMS-AES256",
        },
      },
    });
  });

  it("disables compression for small text payloads", () => {
    const result = applyBlobProtectionPolicy({
      contentType: "text/plain",
      sizeBytes: 4_096,
      encryption: null,
      metadata: {},
    });

    expect(result.metadata).toMatchObject({
      protection: {
        compression: {
          enabled: false,
          algorithm: null,
          textLike: true,
        },
      },
    });
  });
});
