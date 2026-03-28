const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRuntime } = require("../src/index");

async function startServer() {
  const runtime = buildRuntime({
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "0",
      SECRETS_ENCRYPTION_KEY: "test-encryption-key",
      QUEUE_BACKEND: "memory",
      TOKEN_STORE_BACKEND: "memory",
      IDEMPOTENCY_BACKEND: "memory",
    },
  });

  await runtime.initialize();
  const server = runtime.app.listen(0);
  return { runtime, server };
}

test("GET /health returns service status", async (context) => {
  const { runtime, server } = await startServer();
  context.after(async () => {
    server.close();
    await runtime.close();
  });

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
});

test("POST /api/v1/sync/:workflow is forbidden for viewer role", async (context) => {
  const { runtime, server } = await startServer();
  context.after(async () => {
    server.close();
    await runtime.close();
  });

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/v1/sync/salesforce-contacts-to-snowflake`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-role": "viewer",
        "x-tenant-id": "tenant-a",
      },
      body: JSON.stringify({
        since: "2026-01-01T00:00:00.000Z",
      }),
    },
  );

  assert.equal(response.status, 403);
});

test("GET /api/v1/plugins returns plugin metadata", async (context) => {
  const { runtime, server } = await startServer();
  context.after(async () => {
    server.close();
    await runtime.close();
  });

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/plugins`, {
    headers: {
      "x-user-role": "admin",
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.plugins));
  assert.ok(body.plugins.length >= 6);
});
