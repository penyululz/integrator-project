import type { McpContextDescriptor, McpToolDescriptor } from "@integration/shared";
import { AgentToolRegistry } from "./tool-registry";

const DEFAULT_CONTEXTS: McpContextDescriptor[] = [
  {
    id: "workspace",
    title: "Workspace Context",
    description: "Tenant-safe workspace metadata and scoped integration capability.",
    source: "workspace",
  },
  {
    id: "workflow",
    title: "Workflow Context",
    description: "Current workflow definition, trigger payload, and mapped references.",
    source: "workflow",
  },
  {
    id: "run",
    title: "Run Context",
    description: "Execution status, retries, delays, and event timeline for current run.",
    source: "run",
  },
];

export class InternalMcpFoundation {
  constructor(private readonly toolRegistry: AgentToolRegistry) {}

  async listTools(): Promise<McpToolDescriptor[]> {
    const tools = await this.toolRegistry.listTools();
    return tools.map((tool) => ({
      id: tool.id,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      category: tool.category,
      safetyLevel: tool.safetyLevel,
      requiresApproval: tool.requiresApproval,
      source: tool.adapterKey ? "adapter_action" : "agent_builtin",
      adapterKey: tool.adapterKey,
      actionKey: tool.actionKey,
      enabled: tool.enabled !== false,
    }));
  }

  listContexts(): McpContextDescriptor[] {
    return DEFAULT_CONTEXTS;
  }
}
