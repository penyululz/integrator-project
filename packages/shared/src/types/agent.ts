export type AgentToolSafetyLevel = "low" | "guarded" | "high";

export type AgentToolCategory =
  | "ai"
  | "research"
  | "content"
  | "support"
  | "communication"
  | "integration"
  | "developer"
  | "operations"
  | "custom";

export type AgentToolDefinition = {
  id: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category: AgentToolCategory;
  safetyLevel: AgentToolSafetyLevel;
  requiresApproval?: boolean;
  adapterKey?: string;
  actionKey?: string;
  enabled?: boolean;
  tags?: string[];
  mcp?: {
    capability: "tool";
    contextTypes?: string[];
  };
};

export type AgentToolPermissionPolicy = {
  mode: "allow_all" | "allow_list";
  allowedToolIds?: string[];
};

export type AgentTraceToolCall = {
  toolId: string;
  title: string;
  category: AgentToolCategory;
  safetyLevel: AgentToolSafetyLevel;
  inputPreview: string;
  outputPreview: string;
  status: "completed" | "failed" | "blocked" | "awaiting_approval";
  errorSummary?: string;
};

export type AgentTraceStep = {
  iteration: number;
  decision: string;
  toolCall: AgentTraceToolCall;
};

export type AgentTrace = {
  goal: string;
  allowedToolIds: string[];
  iterations: number;
  steps: AgentTraceStep[];
  finalOutput: string;
  awaitingApproval?: boolean;
  pendingApprovals?: Array<{
    toolId: string;
    title: string;
    safetyLevel: AgentToolSafetyLevel;
    reason: string;
  }>;
};

export type McpToolDescriptor = {
  id: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category: AgentToolCategory;
  safetyLevel: AgentToolSafetyLevel;
  requiresApproval?: boolean;
  source: "adapter_action" | "agent_builtin";
  adapterKey?: string;
  actionKey?: string;
  enabled: boolean;
};

export type McpContextDescriptor = {
  id: string;
  title: string;
  description: string;
  source: "workflow" | "run" | "workspace";
};
