import { describe, expect, it, vi } from "vitest";
import { AiAdapter } from "./index";

describe("AiAdapter", () => {
  it("declares AI node actions including agent foundation", async () => {
    const adapter = new AiAdapter();
    const actions = await adapter.listActions();
    expect(actions.map((action) => action.key)).toEqual([
      "generateContent",
      "rewriteContent",
      "summarizeText",
      "summarizeUrl",
      "transformContent",
      "extractKeyPoints",
      "classifyText",
      "runAgent",
      "listAgentTools",
    ]);
  });

  it("runs generate and summarize actions", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    const generated = await adapter.runAction(
      "generateContent",
      {
        prompt: "Create a short creator workflow announcement",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    const summarized = await adapter.runAction(
      "summarizeText",
      {
        text: String(generated.output?.text || ""),
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(generated.success).toBe(true);
    expect(String(generated.output?.text || "").length).toBeGreaterThan(5);
    expect(summarized.success).toBe(true);
  });

  it("runs a lightweight goal-driven agent loop", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    const result = await adapter.runAction(
      "runAgent",
      {
        goal: "Summarize and rewrite this announcement for social channels",
        initialInput: "New automation release now supports creator workflows.",
        maxIterations: 2,
        tools: ["summarizeText", "rewriteContent"],
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    const output = (result.output || {}) as Record<string, unknown>;
    expect(output.iterations).toBe(2);
    expect(Array.isArray(output.steps)).toBe(true);
    expect(Array.isArray(output.usedToolIds)).toBe(true);
    const trace = (output.trace || {}) as Record<string, unknown>;
    expect(Array.isArray(trace.steps)).toBe(true);
    expect(String(output.finalOutput || "").length).toBeGreaterThan(5);
  });

  it("executes allowed non-AI tools inside runAgent", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    const result = await adapter.runAction(
      "runAgent",
      {
        goal: "Forward webhook payload for downstream checks",
        tools: ["webhook.forward_payload"],
        toolInputs: {
          "webhook.forward_payload": {
            payload: {
              hello: "world",
            },
          },
        },
        maxIterations: 1,
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    const output = (result.output || {}) as Record<string, unknown>;
    const steps = Array.isArray(output.steps) ? (output.steps as Array<Record<string, unknown>>) : [];
    expect(steps).toHaveLength(1);
    expect((steps[0].toolCall as Record<string, unknown>).toolId).toBe("webhook.forward_payload");
    expect((steps[0].toolCall as Record<string, unknown>).status).toBe("completed");
  });

  it("enforces allow-list permissions for agent tool usage", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    const result = await adapter.runAction(
      "runAgent",
      {
        goal: "Summarize this and keep it concise",
        initialInput: "This workflow now supports a stronger agent trace.",
        tools: ["ai.summarizeText", "ai.generateContent"],
        toolPermissions: {
          mode: "allow_list",
          allowedToolIds: ["ai.summarizeText"],
        },
        maxIterations: 1,
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    const output = (result.output || {}) as Record<string, unknown>;
    expect(output.usedToolIds).toEqual(["ai.summarizeText"]);
    const trace = (output.trace || {}) as Record<string, unknown>;
    expect(trace.allowedToolIds).toEqual(["ai.summarizeText"]);
  });

  it("rejects tools outside permission boundary", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    await expect(
      adapter.runAction(
        "runAgent",
        {
          goal: "Post to Slack",
          tools: ["slack.sendMessage"],
          toolPermissions: {
            mode: "allow_list",
            allowedToolIds: ["ai.summarizeText"],
          },
          maxIterations: 1,
        },
        {
          tenantId: "tenant",
          organizationId: "org",
          workspaceId: "ws",
        },
      ),
    ).rejects.toThrow(/no permitted tools/i);
  });

  it("enters awaiting-approval state for approval-required tools", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await adapter.runAction(
      "runAgent",
      {
        goal: "Send Slack update",
        tools: ["slack.sendMessage"],
        toolInputs: {
          "slack.sendMessage": {
            channel: "#ops",
            text: "hello",
          },
        },
        maxIterations: 1,
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    const output = (result.output || {}) as Record<string, unknown>;
    expect(output.awaitingApproval).toBe(true);
    expect(Array.isArray(output.pendingApprovals)).toBe(true);
    const trace = (output.trace || {}) as Record<string, unknown>;
    expect(trace.awaitingApproval).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("normalizes failed tool calls with error summaries", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    const result = await adapter.runAction(
      "runAgent",
      {
        goal: "Call HTTP endpoint",
        tools: ["http-api.httpRequest"],
        approvedToolIds: ["http-api.httpRequest"],
        toolInputs: {
          "http-api.httpRequest": {},
        },
        maxIterations: 1,
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    const output = (result.output || {}) as Record<string, unknown>;
    const steps = Array.isArray(output.steps) ? (output.steps as Array<Record<string, unknown>>) : [];
    const toolCall = (steps[0]?.toolCall || {}) as Record<string, unknown>;
    expect(toolCall.status).toBe("failed");
    expect(typeof toolCall.errorSummary).toBe("string");
    expect(String(toolCall.errorSummary).length).toBeGreaterThan(0);
  });

  it("returns typed tool metadata for trust UX", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    const result = await adapter.runAction(
      "listAgentTools",
      {},
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    const output = (result.output || {}) as Record<string, unknown>;
    expect(Array.isArray(output.tools)).toBe(true);
    expect((output.tools as Array<Record<string, unknown>>)[0]).toHaveProperty("safetyLevel");
    expect((output.tools as Array<Record<string, unknown>>).some((tool) => tool.id === "slack.sendMessage")).toBe(true);
  });

  it("uses summarizeUrl action with mocked fetch", async () => {
    const adapter = new AiAdapter();
    await adapter.init({});

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        "<html><head><title>Creator Notes</title></head><body><p>New integrations for YouTube and Reddit.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );

    const result = await adapter.runAction(
      "summarizeUrl",
      {
        url: "https://example.com/creator-notes",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output?.title).toBe("Creator Notes");
  });
});
