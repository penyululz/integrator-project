import {
  splitSensitiveFields,
  sanitizeSensitiveMessage,
} from "@integration/shared";
import { getPostgresPool, closePostgresPool } from "../db/postgres";
import { CredentialRepository } from "../repositories/credential-repository";
import { createCredentialCryptoFromEnv } from "./credential-crypto";

function hasAnyValue(input: Record<string, unknown>): boolean {
  return Object.values(input).some((value) => {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "string") {
      return value.length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object") {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }
    return true;
  });
}

async function run(): Promise<void> {
  const pool = getPostgresPool();
  const repository = new CredentialRepository(pool);
  const crypto = createCredentialCryptoFromEnv();

  const rows = await repository.listForReencryption();
  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    try {
      const metadata = row.metadata_json || {};
      const { publicData, sensitiveData } = splitSensitiveFields(metadata);
      let decryptedSecrets: Record<string, unknown> = {};

      if (row.encrypted_data && row.iv && row.auth_tag) {
        decryptedSecrets = crypto.decrypt({
          encryptedData: row.encrypted_data,
          iv: row.iv,
          authTag: row.auth_tag,
          keyVersion: row.key_version,
        });
      }

      if (row.access_token) {
        decryptedSecrets.accessToken = row.access_token;
      }
      if (row.refresh_token) {
        decryptedSecrets.refreshToken = row.refresh_token;
      }
      if (Object.keys(sensitiveData).length > 0) {
        const existingEncryptedMetadata =
          typeof decryptedSecrets.metadata === "object" &&
          decryptedSecrets.metadata !== null &&
          !Array.isArray(decryptedSecrets.metadata)
            ? (decryptedSecrets.metadata as Record<string, unknown>)
            : {};
        decryptedSecrets.metadata = {
          ...existingEncryptedMetadata,
          ...sensitiveData,
        };
      }

      const alreadyCurrentKey =
        row.key_version === crypto.currentKeyVersion &&
        !row.access_token &&
        !row.refresh_token &&
        Object.keys(sensitiveData).length === 0;

      if (!hasAnyValue(decryptedSecrets) && !row.encrypted_data) {
        skippedCount += 1;
        continue;
      }

      if (alreadyCurrentKey) {
        skippedCount += 1;
        continue;
      }

      const envelope = hasAnyValue(decryptedSecrets)
        ? crypto.encrypt(decryptedSecrets)
        : null;

      await repository.updateEncryptedPayload({
        id: row.id,
        encryptedData: envelope?.encryptedData || null,
        iv: envelope?.iv || null,
        authTag: envelope?.authTag || null,
        keyVersion: envelope?.keyVersion || crypto.currentKeyVersion,
        metadata: publicData,
      });

      migratedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(
        `[credential-reencrypt] failed credential ${row.id}: ${sanitizeSensitiveMessage(
          error instanceof Error ? error.message : "unknown error",
        )}`,
      );
    }
  }

  console.log(
    `[credential-reencrypt] completed. migrated=${migratedCount} skipped=${skippedCount} failed=${failedCount}`,
  );
}

run()
  .then(async () => {
    await closePostgresPool();
  })
  .catch(async (error) => {
    console.error(
      `[credential-reencrypt] fatal: ${sanitizeSensitiveMessage(
        error instanceof Error ? error.message : "unknown error",
      )}`,
    );
    await closePostgresPool();
    process.exit(1);
  });
