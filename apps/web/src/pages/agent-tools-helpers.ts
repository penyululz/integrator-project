import type { AgentToolRecord, RunRecord } from "../api";

const SUPPORTED_AGENT_TOOL_IDS = new Set<string>([
  "ai.generateContent",
  "ai.rewriteContent",
  "ai.summarizeText",
  "ai.summarizeUrl",
  "ai.transformContent",
  "ai.extractKeyPoints",
  "ai.classifyText",
  "http-api.httpRequest",
  "graphql.executeQuery",
  "slack.sendMessage",
  "telegram.sendMessage",
  "whatsapp.sendMessage",
  "webhook.forward_payload",
]);

export type AgentToolPermissionMode = "allow_all" | "allow_list";

export type AgentToolPermissionState = {
  mode: AgentToolPermissionMode;
  allowedToolIds: string[];
};

export type AgentTraceCall = {
  toolId: string;
  title: string;
  category: string;
  safetyLevel: string;
  inputPreview: string;
  outputPreview: string;
  status: string;
  errorSummary?: string;
};

export type AgentTraceStepView = {
  iteration: number;
  decision: string;
  toolCall: AgentTraceCall;
};

export type AgentTraceView = {
  stepId: string;
  stepPath: string;
  goal: string;
  allowedToolIds: string[];
  iterations: number;
  finalOutput: string;
  steps: AgentTraceStepView[];
  awaitingApproval: boolean;
  pendingApprovals: Array<{
    toolId: string;
    title: string;
    safetyLevel: string;
    reason: string;
  }>;
};

export type AgentReasoningBlockKind =
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "decision";

export type AgentReasoningStreamState = "completed" | "active" | "pending";

export type AgentReasoningBlock = {
  id: string;
  iteration: number;
  kind: AgentReasoningBlockKind;
  title: string;
  status: string;
  intent: string;
  action: string;
  resultSummary: string;
  details: string;
  confidence: number;
  fallbackNote: string | null;
  streamState: AgentReasoningStreamState;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeToolId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes(".")) {
    return trimmed;
  }
  return `ai.${trimmed}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function defaultAgentPermissionState(): AgentToolPermissionState {
  return {
    mode: "allow_all",
    allowedToolIds: [],
  };
}

export function extractAgentPermissionState(config: Record<string, unknown>): AgentToolPermissionState {
  const rawMode = asString(config.agentToolPermissionMode);
  const rawIds = asStringArray(config.agentAllowedToolIds).map(normalizeToolId).filter(Boolean);
  if (rawMode === "allow_list") {
    return {
      mode: "allow_list",
      allowedToolIds: unique(rawIds),
    };
  }
  return defaultAgentPermissionState();
}

export function applyAgentPermissionState(
  config: Record<string, unknown>,
  permission: AgentToolPermissionState,
): Record<string, unknown> {
  const next = {
    ...config,
  };

  if (permission.mode === "allow_all") {
    delete next.agentToolPermissionMode;
    delete next.agentAllowedToolIds;
    return next;
  }

  next.agentToolPermissionMode = "allow_list";
  next.agentAllowedToolIds = unique(permission.allowedToolIds.map(normalizeToolId).filter(Boolean));
  return next;
}

export function getAgentPermissionOptions(
  tools: AgentToolRecord[],
): Array<{ id: string; label: string; hint: string; requiresApproval: boolean }> {
  return tools
    .filter((tool) => SUPPORTED_AGENT_TOOL_IDS.has(tool.id))
    .map((tool) => ({
      id: tool.id,
      label: tool.title,
      hint: `${tool.category} | safety ${tool.safetyLevel}`,
      requiresApproval: Boolean(tool.requiresApproval) || tool.safetyLevel === "high",
    }));
}

function toTraceCall(input: Record<string, unknown>): AgentTraceCall {
  return {
    toolId: asString(input.toolId),
    title: asString(input.title),
    category: asString(input.category),
    safetyLevel: asString(input.safetyLevel),
    inputPreview: asString(input.inputPreview),
    outputPreview: asString(input.outputPreview),
    status: asString(input.status),
    errorSummary: asString(input.errorSummary) || undefined,
  };
}

function toTraceSteps(value: unknown): AgentTraceStepView[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const toolCall = isRecord(entry.toolCall) ? toTraceCall(entry.toolCall) : null;
      return {
        iteration: typeof entry.iteration === "number" ? entry.iteration : 0,
        decision: asString(entry.decision),
        toolCall:
          toolCall ||
          ({
            toolId: "",
            title: "",
            category: "",
            safetyLevel: "",
            inputPreview: "",
            outputPreview: "",
            status: "",
          } satisfies AgentTraceCall),
      } satisfies AgentTraceStepView;
    })
    .filter((entry): entry is AgentTraceStepView => Boolean(entry));
}

function toPendingApprovals(
  value: unknown,
): Array<{ toolId: string; title: string; safetyLevel: string; reason: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      return {
        toolId: asString(entry.toolId),
        title: asString(entry.title),
        safetyLevel: asString(entry.safetyLevel),
        reason: asString(entry.reason),
      };
    })
    .filter(
      (entry): entry is { toolId: string; title: string; safetyLevel: string; reason: string } =>
        Boolean(entry),
    );
}

export function extractAgentTracesFromRun(run: RunRecord | null): AgentTraceView[] {
  if (!run || !isRecord(run.result_json)) {
    return [];
  }
  const rawSteps = Array.isArray(run.result_json.steps) ? run.result_json.steps : [];
  const traces: AgentTraceView[] = [];

  for (const rawStep of rawSteps) {
    if (!isRecord(rawStep)) {
      continue;
    }
    const output = isRecord(rawStep.output) ? rawStep.output : null;
    const trace = output && isRecord(output.trace) ? output.trace : null;
    if (!trace) {
      continue;
    }

    traces.push({
      stepId: asString(rawStep.stepId) || "unknown",
      stepPath: asString(rawStep.stepPath) || "unknown",
      goal: asString(trace.goal),
      allowedToolIds: asStringArray(trace.allowedToolIds).map(normalizeToolId).filter(Boolean),
      iterations:
        typeof trace.iterations === "number"
          ? trace.iterations
          : toTraceSteps(trace.steps).length,
      finalOutput: asString(trace.finalOutput),
      steps: toTraceSteps(trace.steps),
      awaitingApproval: Boolean(trace.awaitingApproval),
      pendingApprovals: toPendingApprovals(trace.pendingApprovals),
    });
  }

  return traces;
}

export function explainToolSelection(step: AgentTraceStepView): {
  why: string;
  confidence: number;
  fallbackNote: string | null;
} {
  const decision = step.decision || `Selected ${step.toolCall.toolId} for this iteration.`;
  if (step.toolCall.status === "completed") {
    return {
      why: decision,
      confidence: 0.88,
      fallbackNote: null,
    };
  }
  if (step.toolCall.status === "awaiting_approval") {
    return {
      why: decision,
      confidence: 0.72,
      fallbackNote: "Execution paused until a human approves this tool call.",
    };
  }
  if (step.toolCall.status === "blocked") {
    return {
      why: decision,
      confidence: 0.45,
      fallbackNote: "Tool was blocked by the current permission boundary.",
    };
  }
  return {
    why: decision,
    confidence: 0.42,
    fallbackNote: "Agent can retry with another tool or continue with existing context.",
  };
}

export function formatAgentReasoningSteps(trace: AgentTraceView): Array<{
  iteration: number;
  intent: string;
  action: string;
  resultSummary: string;
  status: string;
  toolId: string;
  toolTitle: string;
  inputPreview: string;
  outputPreview: string;
  errorSummary?: string;
  confidence: number;
  fallbackNote: string | null;
}> {
  return trace.steps.map((step) => {
    const explanation = explainToolSelection(step);
    return {
      iteration: step.iteration,
      intent: explanation.why,
      action: step.toolCall.title || step.toolCall.toolId,
      resultSummary: step.toolCall.outputPreview || "No output preview available.",
      status: step.toolCall.status || "unknown",
      toolId: step.toolCall.toolId,
      toolTitle: step.toolCall.title || step.toolCall.toolId,
      inputPreview: step.toolCall.inputPreview || "{}",
      outputPreview: step.toolCall.outputPreview || "",
      errorSummary: step.toolCall.errorSummary,
      confidence: explanation.confidence,
      fallbackNote: explanation.fallbackNote,
    };
  });
}

export function groupTraceIntoReasoningBlocks(trace: AgentTraceView): AgentReasoningBlock[] {
  const blocks: AgentReasoningBlock[] = [];
  const formatted = formatAgentReasoningSteps(trace);

  for (const step of formatted) {
    blocks.push(
      {
        id: `${trace.stepPath}:${step.iteration}:thinking`,
        iteration: step.iteration,
        kind: "thinking",
        title: "Thinking",
        status: step.status,
        intent: step.intent,
        action: step.action,
        resultSummary: "Planning next action.",
        details: step.intent,
        confidence: step.confidence,
        fallbackNote: step.fallbackNote,
        streamState: "completed",
      },
      {
        id: `${trace.stepPath}:${step.iteration}:tool_call`,
        iteration: step.iteration,
        kind: "tool_call",
        title: "Tool Call",
        status: step.status,
        intent: step.intent,
        action: step.action,
        resultSummary: "Calling selected tool.",
        details: step.inputPreview,
        confidence: step.confidence,
        fallbackNote: step.fallbackNote,
        streamState: "completed",
      },
      {
        id: `${trace.stepPath}:${step.iteration}:tool_result`,
        iteration: step.iteration,
        kind: "tool_result",
        title: "Tool Result",
        status: step.status,
        intent: step.intent,
        action: step.action,
        resultSummary: step.resultSummary,
        details: step.errorSummary || step.outputPreview || "No detailed output.",
        confidence: step.confidence,
        fallbackNote: step.fallbackNote,
        streamState: "completed",
      },
      {
        id: `${trace.stepPath}:${step.iteration}:decision`,
        iteration: step.iteration,
        kind: "decision",
        title: "Decision",
        status: step.status,
        intent: step.intent,
        action: step.action,
        resultSummary: step.fallbackNote || "Proceeding with current plan.",
        details: step.intent,
        confidence: step.confidence,
        fallbackNote: step.fallbackNote,
        streamState: "completed",
      },
    );
  }

  return blocks;
}

export function streamAgentExecution(
  trace: AgentTraceView,
  runStatus: string,
): AgentReasoningBlock[] {
  const blocks = groupTraceIntoReasoningBlocks(trace);
  if (blocks.length === 0) {
    return blocks;
  }

  const isLive =
    runStatus === "running" || runStatus === "retrying" || runStatus === "waiting";
  if (!isLive) {
    return blocks;
  }

  const lastIteration = Math.max(...blocks.map((block) => block.iteration));
  return blocks.map((block) => {
    if (block.iteration < lastIteration) {
      return {
        ...block,
        streamState: "completed",
      };
    }
    if (block.kind === "tool_result" || block.kind === "decision") {
      return {
        ...block,
        streamState: "active",
      };
    }
    return {
      ...block,
      streamState: "pending",
    };
  });
}
