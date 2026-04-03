import { describe, expect, it } from "vitest";
import type {
  ActionDefinition,
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";
import { PluginLoader } from "../engine/plugin-loader";
import { AgentToolRegistry } from "./tool-registry";
import { InternalMcpFoundation } from "./mcp-foundation";

class TestAdapter implements Adapter {
  constructor(
    readonly key: string,
    readonly version: string,
    private readonly actions: ActionDefinition[],
  ) {}

  async init(): Promise<void> {}
  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {};
  }
  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }
  async listActions(): Promise<ActionDefinition[]> {
    return this.actions;
  }
  async runTrigger(
    _triggerKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    return { events: [] };
  }
  async runAction(
    _actionKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    return { success: true };
  }
  async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
    return { valid: true };
  }
  async refreshToken(): Promise<AdapterTokenRefreshResult> {
    return { accessToken: "token" };
  }
}

describe("AgentToolRegistry", () => {
  it("builds typed tool metadata from registered adapter actions", async () => {
    const loader = new PluginLoader();
    loader.register(
      new TestAdapter("slack", "1.0.0", [
        {
          key: "sendMessage",
          name: "Send Message",
          description: "Send a message to Slack.",
          inputSchema: { type: "object", properties: { text: { type: "string" } } },
        },
      ]),
    );
    loader.register(
      new TestAdapter("code", "1.0.0", [
        {
          key: "executeJavaScript",
          name: "Execute JavaScript",
          description: "Run JavaScript.",
          inputSchema: { type: "object", properties: { script: { type: "string" } } },
        },
      ]),
    );

    const registry = new AgentToolRegistry(loader);
    const tools = await registry.listTools();

    expect(tools.map((tool) => tool.id)).toEqual([
      "code.executeJavaScript",
      "slack.sendMessage",
    ]);
    expect(tools.find((tool) => tool.id === "slack.sendMessage")?.category).toBe(
      "communication",
    );
    expect(tools.find((tool) => tool.id === "slack.sendMessage")?.safetyLevel).toBe("high");
    expect(tools.find((tool) => tool.id === "slack.sendMessage")?.requiresApproval).toBe(true);
    expect(tools.find((tool) => tool.id === "code.executeJavaScript")?.safetyLevel).toBe("high");
  });

  it("applies allow-list permissions for agent execution", async () => {
    const loader = new PluginLoader();
    loader.register(
      new TestAdapter("ai", "1.0.0", [
        {
          key: "runAgent",
          name: "Run Agent",
          description: "Run an AI agent.",
          inputSchema: { type: "object" },
        },
        {
          key: "summarizeText",
          name: "Summarize Text",
          description: "Summarize text.",
          inputSchema: { type: "object" },
        },
      ]),
    );

    const registry = new AgentToolRegistry(loader);
    const tools = await registry.listTools();
    const allowed = registry.resolveAllowedToolIds({
      availableTools: tools,
      requestedToolIds: ["ai.runAgent", "ai.summarizeText"],
      permission: {
        mode: "allow_list",
        allowedToolIds: ["ai.summarizeText"],
      },
    });

    expect(allowed).toEqual(["ai.summarizeText"]);
  });

  it("exposes an MCP-ready internal projection for tools and contexts", async () => {
    const loader = new PluginLoader();
    loader.register(
      new TestAdapter("webhook", "1.0.0", [
        {
          key: "emitEvent",
          name: "Emit Event",
          description: "Emit an event.",
          inputSchema: { type: "object" },
        },
      ]),
    );

    const foundation = new InternalMcpFoundation(new AgentToolRegistry(loader));
    const tools = await foundation.listTools();
    const contexts = foundation.listContexts();

    expect(tools[0]).toMatchObject({
      id: "webhook.emitEvent",
      source: "adapter_action",
    });
    expect(contexts.map((context) => context.id)).toEqual([
      "workspace",
      "workflow",
      "run",
    ]);
  });
});
