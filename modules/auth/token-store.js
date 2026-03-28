const crypto = require("node:crypto");

function normalizeKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey)).digest();
}

function encrypt(secretKey, plainText) {
  if (!plainText) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString(
    "base64",
  )}`;
}

function decrypt(secretKey, payload) {
  if (!payload) {
    return null;
  }

  const [ivB64, tagB64, encryptedB64] = payload.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey, iv);

  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

class TokenStore {
  constructor({ encryptionKey, clock = () => Date.now() }) {
    this.clock = clock;
    this.secretKey = normalizeKey(encryptionKey);
    this.records = new Map();
  }

  static createRecordKey(provider, tenantId) {
    return `${provider}:${tenantId}`;
  }

  async setToken({
    provider,
    tenantId,
    accessToken,
    refreshToken,
    expiresInSeconds,
    scopes = [],
  }) {
    const now = this.clock();
    const expiresAt = expiresInSeconds ? now + expiresInSeconds * 1_000 : null;
    const key = TokenStore.createRecordKey(provider, tenantId);

    this.records.set(key, {
      provider,
      tenantId,
      accessToken: encrypt(this.secretKey, accessToken),
      refreshToken: encrypt(this.secretKey, refreshToken || ""),
      expiresAt,
      scopes,
      updatedAt: now,
    });
  }

  async getToken({ provider, tenantId, allowExpired = false }) {
    const key = TokenStore.createRecordKey(provider, tenantId);
    const record = this.records.get(key);

    if (!record) {
      return null;
    }

    if (!allowExpired && record.expiresAt && record.expiresAt <= this.clock()) {
      return null;
    }

    return {
      provider: record.provider,
      tenantId: record.tenantId,
      accessToken: decrypt(this.secretKey, record.accessToken),
      refreshToken: decrypt(this.secretKey, record.refreshToken),
      expiresAt: record.expiresAt,
      scopes: record.scopes,
    };
  }

  async rotateToken(payload) {
    await this.setToken(payload);
    return this.getToken({
      provider: payload.provider,
      tenantId: payload.tenantId,
    });
  }

  async clearToken({ provider, tenantId }) {
    const key = TokenStore.createRecordKey(provider, tenantId);
    this.records.delete(key);
  }
}

module.exports = TokenStore;
