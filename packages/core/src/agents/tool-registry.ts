import type {
  AgentToolCategory,
  AgentToolDefinition,
  AgentToolPermissionPolicy,
  AgentToolSafetyLevel,
} from "@integration/shared";
import type { PluginLoader } from "../engine/plugin-loader";

function uniqueById(tools: AgentToolDefinition[]): AgentToolDefinition[] {
  const seen = new Set<string>();
  const next: AgentToolDefinition[] = [];
  for (const tool of tools) {
    if (seen.has(tool.id)) {
      continue;
    }
    seen.add(tool.id);
    next.push(tool);
  }
  return next;
}

function toCategory(adapterKey: string): AgentToolCategory {
  if (adapterKey === "ai") {
    return "ai";
  }
  if (adapterKey === "slack" || adapterKey === "telegram" || adapterKey === "whatsapp") {
    return "communication";
  }
  if (adapterKey === "reddit" || adapterKey === "youtube") {
    return "research";
  }
  if (adapterKey === "code") {
    return "developer";
  }
  if (adapterKey === "webhook" || adapterKey === "http-api" || adapterKey === "graphql") {
    return "integration";
  }
  return "operations";
}

function toSafetyLevel(adapterKey: string, actionKey: string): AgentToolSafetyLevel {
  const normalizedActionKey = actionKey.toLowerCase();
  if (adapterKey === "code" || normalizedActionKey.includes("executejavascript")) {
    return "high";
  }

  if (
    adapterKey === "http-api" ||
    adapterKey === "graphql" ||
    adapterKey === "slack" ||
    adapterKey === "telegram" ||
    adapterKey === "whatsapp"
  ) {
    return "high";
  }

  if (
    normalizedActionKey.includes("delete") ||
    normalizedActionKey.includes("write") ||
    normalizedActionKey.includes("update")
  ) {
    return "guarded";
  }

  return "low";
}

function requiresApproval(
  adapterKey: string,
  actionKey: string,
  safetyLevel: AgentToolSafetyLevel,
): boolean {
  if (safetyLevel === "high") {
    return true;
  }

  if (adapterKey === "webhook" && actionKey === "forward_payload") {
    return false;
  }

  return false;
}

export class AgentToolRegistry {
  constructor(private readonly pluginLoader: PluginLoader) {}

  async listTools(): Promise<AgentToolDefinition[]> {
    const metadata = this.pluginLoader.listMetadata();
    const collected: AgentToolDefinition[] = [];

    for (const adapterMeta of metadata) {
      const adapter = this.pluginLoader.get(adapterMeta.key);
      const actions = await adapter.listActions();
      for (const action of actions) {
        const safetyLevel = toSafetyLevel(adapterMeta.key, action.key);
        collected.push({
          id: `${adapterMeta.key}.${action.key}`,
          title: `${adapterMeta.displayName} - ${action.name}`,
          description: action.description,
          inputSchema: action.inputSchema || { type: "object" },
          category: toCategory(adapterMeta.key),
          safetyLevel,
          requiresApproval: requiresApproval(adapterMeta.key, action.key, safetyLevel),
          adapterKey: adapterMeta.key,
          actionKey: action.key,
          enabled: true,
          tags: [adapterMeta.key, action.key],
          mcp: {
            capability: "tool",
            contextTypes: ["workflow", "run", "workspace"],
          },
        });
      }
    }

    return uniqueById(collected.sort((left, right) => left.id.localeCompare(right.id)));
  }

  async listTopIntegrationTools(): Promise<AgentToolDefinition[]> {
    const allTools = await this.listTools();
    const topAdapterOrder = ["slack", "webhook", "email", "sheets", "shopify", "ai"];
    const priority = new Map(topAdapterOrder.map((key, index) => [key, index]));
    return allTools
      .filter((tool) => (tool.adapterKey ? priority.has(tool.adapterKey) : false))
      .sort((left, right) => {
        const leftPriority = priority.get(left.adapterKey || "") ?? Number.MAX_SAFE_INTEGER;
        const rightPriority = priority.get(right.adapterKey || "") ?? Number.MAX_SAFE_INTEGER;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        return left.id.localeCompare(right.id);
      });
  }

  resolveAllowedToolIds(input: {
    availableTools: AgentToolDefinition[];
    requestedToolIds?: string[];
    permission?: AgentToolPermissionPolicy;
  }): string[] {
    const availableIds = new Set(input.availableTools.map((tool) => tool.id));
    const requested = (input.requestedToolIds || []).filter((id) => availableIds.has(id));
    const permission = input.permission;

    if (!permission || permission.mode === "allow_all") {
      return requested.length > 0 ? requested : [...availableIds];
    }

    const allowedByPolicy = new Set(
      (permission.allowedToolIds || []).filter((id) => availableIds.has(id)),
    );
    if (requested.length === 0) {
      return [...allowedByPolicy];
    }
    return requested.filter((id) => allowedByPolicy.has(id));
  }
}
