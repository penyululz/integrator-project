const test = require("node:test");
const assert = require("node:assert/strict");
const TokenStore = require("../modules/auth/token-store");

test("TokenStore roundtrips token data", async () => {
  const store = new TokenStore({
    encryptionKey: "unit-test-key",
  });

  await store.setToken({
    provider: "salesforce",
    tenantId: "tenant-a",
    accessToken: "abc123",
    refreshToken: "refresh123",
    expiresInSeconds: 3600,
    scopes: ["api"],
  });

  const token = await store.getToken({
    provider: "salesforce",
    tenantId: "tenant-a",
  });

  assert.equal(token.accessToken, "abc123");
  assert.equal(token.refreshToken, "refresh123");
  assert.deepEqual(token.scopes, ["api"]);
});

test("TokenStore returns null for expired tokens", async () => {
  let now = 1_700_000_000_000;
  const store = new TokenStore({
    encryptionKey: "unit-test-key",
    clock: () => now,
  });

  await store.setToken({
    provider: "shopify",
    tenantId: "tenant-a",
    accessToken: "abc123",
    refreshToken: "refresh123",
    expiresInSeconds: 1,
  });

  now += 2_000;
  const token = await store.getToken({
    provider: "shopify",
    tenantId: "tenant-a",
  });

  assert.equal(token, null);
});
