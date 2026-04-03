import { describe, expect, it, vi, afterEach } from "vitest";
import { HttpApiAdapter } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpApiAdapter", () => {
  it("declares httpRequest action", async () => {
    const adapter = new HttpApiAdapter();
    const actions = await adapter.listActions();
    expect(actions.map((action) => action.key)).toEqual(["httpRequest"]);
  });

  it("validates config fields", async () => {
    const adapter = new HttpApiAdapter();
    const valid = await adapter.validateConfig({
      baseUrl: "https://api.example.com",
      defaultHeaders: { "x-api-key": "abc" },
      timeoutMs: 15000,
    });
    expect(valid.valid).toBe(true);

    const invalid = await adapter.validateConfig({
      baseUrl: "not-a-url",
      timeoutMs: -1,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors?.length).toBeGreaterThan(0);
  });

  it("runs an outbound request and returns parsed response", async () => {
    const adapter = new HttpApiAdapter();
    await adapter.init({});

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const result = await adapter.runAction(
      "httpRequest",
      {
        method: "POST",
        url: "https://api.example.com/orders",
        headers: {
          "x-test": "1",
        },
        body: {
          id: 123,
        },
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output?.status).toBe(200);
    expect(result.output?.body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
