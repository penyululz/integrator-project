import type { AdapterMetadata, WorkflowTemplate, WorkflowTemplateSummary } from "../api";
import {
  collectStepIds,
  createEmptyActionStep,
  isBranchStep,
  isDelayStep,
  type WorkflowDefinition,
  type WorkflowStep,
} from "../types/workflow";

type SessionScope = {
  workspaceId: string;
  organizationId: string;
};

export type GoalToolSuggestion = {
  toolId: string;
  title: string;
  reason: string;
  confidence: number;
};

export type SubAgentConfig = {
  id: string;
  label: string;
  goal: string;
  tools: string[];
  maxIterations: number;
};

export function buildDefaultWorkflow(
  adapters: AdapterMetadata[],
  scope?: SessionScope,
): WorkflowDefinition {
  const triggerAdapter =
    adapters.find((adapter) => adapter.supportedTriggers.length > 0) || adapters[0];
  const triggerKey = triggerAdapter?.supportedTriggers[0] || "http_post";
  const fallbackActionAdapter = adapters.find((adapter) => adapter.supportedActions.length > 0);
  const firstAction = createEmptyActionStep(
    "step_action_1",
    fallbackActionAdapter?.key || triggerAdapter?.key || "webhook",
  );
  firstAction.action = fallbackActionAdapter?.supportedActions[0] || "";

  return {
    id: "wf_new_workflow",
    name: "New Workflow",
    workspaceId: scope?.workspaceId,
    organizationId: scope?.organizationId,
    trigger: {
      adapter: triggerAdapter?.key || "webhook",
      trigger: triggerKey,
      config: {},
    },
    context: {},
    steps: [firstAction],
    enabled: true,
  };
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildReferenceHints(definition: WorkflowDefinition): string[] {
  const stepIds = collectStepIds(definition.steps);
  const refs = ["trigger", "trigger.payload", "context"];
  for (const stepId of stepIds) {
    refs.push(`steps.${stepId}.output`);
  }
  return refs;
}

function normalizeWorkflowIdSeed(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "");
  return normalized || "workflow";
}

export function buildWorkflowFromTemplate(
  template: WorkflowTemplate,
  scope?: SessionScope,
  seed = Date.now(),
): WorkflowDefinition {
  const clone = JSON.parse(JSON.stringify(template.workflow)) as WorkflowDefinition;
  return {
    ...clone,
    id: `wf_${normalizeWorkflowIdSeed(template.id)}_${seed}`,
    name: template.title,
    workspaceId: scope?.workspaceId || clone.workspaceId,
    organizationId: scope?.organizationId || clone.organizationId,
    metadata: {
      ...(clone.metadata || {}),
      templateId: template.id,
      createdFromTemplateAt: new Date(seed).toISOString(),
    },
  };
}

function hasAdapterAction(
  adapters: AdapterMetadata[],
  adapterKey: string,
  actionKey: string,
): boolean {
  return adapters.some(
    (adapter) =>
      adapter.key === adapterKey && adapter.supportedActions.includes(actionKey),
  );
}

function toWorkflowNameFromGoal(goal: string): string {
  const trimmed = goal.trim();
  if (!trimmed) {
    return "Goal Agent Automation";
  }
  const normalized = trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed;
  return normalized
    .replace(/^[a-z]/, (value) => value.toUpperCase())
    .replace(/\.$/, "");
}

export function suggestToolsForGoal(goal: string): GoalToolSuggestion[] {
  const normalized = goal.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const suggestions: GoalToolSuggestion[] = [];

  if (/summar|digest|brief|recap|research/.test(normalized)) {
    suggestions.push({
      toolId: "ai.summarizeText",
      title: "AI Summarize",
      reason: "Goal asks for synthesis or concise output.",
      confidence: 0.9,
    });
  }
  if (/rewrite|polish|tone|repurpose|content/.test(normalized)) {
    suggestions.push({
      toolId: "ai.rewriteContent",
      title: "AI Rewrite",
      reason: "Goal mentions rewriting or content adaptation.",
      confidence: 0.86,
    });
  }
  if (/notify|slack|announce|alert/.test(normalized)) {
    suggestions.push({
      toolId: "slack.sendMessage",
      title: "Slack Send Message",
      reason: "Goal requires posting updates to a team channel.",
      confidence: 0.8,
    });
  }
  if (/telegram|bot/.test(normalized)) {
    suggestions.push({
      toolId: "telegram.sendMessage",
      title: "Telegram Send Message",
      reason: "Goal references Telegram delivery.",
      confidence: 0.8,
    });
  }
  if (/whatsapp/.test(normalized)) {
    suggestions.push({
      toolId: "whatsapp.sendMessage",
      title: "WhatsApp Send Message",
      reason: "Goal references WhatsApp delivery.",
      confidence: 0.8,
    });
  }
  if (/http|api|post|webhook|endpoint/.test(normalized)) {
    suggestions.push({
      toolId: "http-api.httpRequest",
      title: "HTTP Request",
      reason: "Goal needs external API interaction.",
      confidence: 0.78,
    });
  }
  if (/graphql/.test(normalized)) {
    suggestions.push({
      toolId: "graphql.executeQuery",
      title: "GraphQL Query",
      reason: "Goal explicitly references GraphQL.",
      confidence: 0.78,
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      toolId: "ai.generateContent",
      title: "AI Generate",
      reason: "Default tool for general goal exploration.",
      confidence: 0.64,
    });
  }

  const seen = new Set<string>();
  return suggestions.filter((item) => {
    if (seen.has(item.toolId)) {
      return false;
    }
    seen.add(item.toolId);
    return true;
  });
}

export function runSubAgent(config: Partial<SubAgentConfig> & { goal: string }): SubAgentConfig {
  const normalizedId =
    config.id ||
    `agent_${config.label || config.goal || "sub_agent"}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  return {
    id: normalizedId || "agent_sub",
    label: config.label || "Sub Agent",
    goal: config.goal,
    tools: config.tools && config.tools.length > 0 ? config.tools : ["ai.summarizeText"],
    maxIterations: Math.min(6, Math.max(1, config.maxIterations || 2)),
  };
}

export function passOutputBetweenAgents(previousOutput: string, nextGoal: string): string {
  const safePrevious = previousOutput.trim();
  const safeGoal = nextGoal.trim();
  if (!safePrevious) {
    return `Goal: ${safeGoal}`;
  }
  return `Previous agent output:\n${safePrevious}\n\nNext goal:\n${safeGoal}`;
}

export function generateWorkflowFromGoal(input: {
  goal: string;
  adapters: AdapterMetadata[];
  scope?: SessionScope;
  seed?: number;
}): WorkflowDefinition {
  const seed = input.seed || Date.now();
  const goal = input.goal.trim();
  const suggestions = suggestToolsForGoal(goal);
  const supportedToolIds = suggestions
    .map((item) => item.toolId)
    .filter((toolId) => {
      const [adapterKey, actionKey] = toolId.split(".");
      if (!adapterKey || !actionKey) {
        return false;
      }
      return hasAdapterAction(input.adapters, adapterKey, actionKey);
    });

  const aiTools = supportedToolIds.filter((toolId) => toolId.startsWith("ai."));
  const integrationTools = supportedToolIds.filter((toolId) => !toolId.startsWith("ai."));
  const selectedTools = [...aiTools, ...integrationTools].slice(0, 6);
  const allowedTools = selectedTools.length > 0 ? selectedTools : ["ai.summarizeText"];

  const triggerAdapter =
    input.adapters.find(
      (adapter) =>
        adapter.key === "webhook" &&
        adapter.supportedTriggers.includes("http_post"),
    ) ||
    input.adapters.find((adapter) => adapter.supportedTriggers.length > 0) ||
    input.adapters[0];
  const triggerKey =
    triggerAdapter?.supportedTriggers.includes("http_post")
      ? "http_post"
      : triggerAdapter?.supportedTriggers[0] || "http_post";

  const researchSubAgent = runSubAgent({
    id: "research_agent",
    label: "Research Agent",
    goal: `Collect and summarize context for: ${goal}`,
    tools: allowedTools.filter(
      (toolId) =>
        toolId.startsWith("ai.summarize") ||
        toolId.startsWith("ai.extract") ||
        toolId.startsWith("http-api.") ||
        toolId.startsWith("graphql."),
    ),
    maxIterations: 2,
  });
  const executionSubAgent = runSubAgent({
    id: "execution_agent",
    label: "Execution Agent",
    goal: `Deliver final output for: ${goal}`,
    tools: allowedTools.filter(
      (toolId) =>
        toolId.startsWith("ai.") ||
        toolId.startsWith("slack.") ||
        toolId.startsWith("telegram.") ||
        toolId.startsWith("whatsapp."),
    ),
    maxIterations: 2,
  });

  const steps: WorkflowStep[] = [
    {
      id: "step_agent_1",
      type: "action",
      adapter: "ai",
      action: "runAgent",
      config: {
        goal,
        maxIterations: 3,
        tools: allowedTools,
        agentToolPermissionMode: "allow_list",
        agentAllowedToolIds: allowedTools,
        memoryKey: "agent.last_goal_output",
        memoryScope: "workflow",
        subAgents: [researchSubAgent, executionSubAgent],
        subAgentInputBridge: passOutputBetweenAgents(
          "{{previous_output}}",
          executionSubAgent.goal,
        ),
      },
      input: {
        goal: {
          $literal: goal,
        },
        initialInput: {
          $ref: "trigger.payload.message",
          default: `Goal: ${goal}`,
        },
      },
      onError: "retry",
      retryPolicy: {
        enabled: true,
        maxAttempts: 3,
      },
    },
  ];

  const firstDeliveryTool = integrationTools.find((toolId) =>
    /(slack|telegram|whatsapp)\.sendMessage/.test(toolId),
  );
  if (firstDeliveryTool) {
    const [adapterKey, actionKey] = firstDeliveryTool.split(".");
    if (adapterKey && actionKey && hasAdapterAction(input.adapters, adapterKey, actionKey)) {
      steps.push({
        id: "step_delivery_1",
        type: "action",
        adapter: adapterKey,
        action: actionKey,
        config: {},
        input: {
          text: {
            $ref: "steps.step_agent_1.output.finalOutput",
            default: "Automation completed.",
          },
        },
        onError: "continue",
      });
    }
  }

  return {
    id: `wf_goal_agent_${seed}`,
    name: toWorkflowNameFromGoal(goal),
    workspaceId: input.scope?.workspaceId,
    organizationId: input.scope?.organizationId,
    trigger: {
      adapter: triggerAdapter?.key || "webhook",
      trigger: triggerKey,
      config: {},
    },
    context: {
      builderMode: "goal_first",
      generatedAt: new Date(seed).toISOString(),
      goal,
    },
    steps,
    enabled: true,
    metadata: {
      createdFromGoal: true,
      suggestedTools: allowedTools,
    },
  };
}

export function filterWorkflowTemplates(
  templates: WorkflowTemplateSummary[],
  query: string,
  category: string,
): WorkflowTemplateSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  return templates.filter((template) => {
    if (category !== "all" && template.category !== category) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      template.title,
      template.description,
      template.category,
      template.difficulty,
      template.triggerSummary,
      template.actionSummary,
      ...template.tags,
      ...template.requiredAdapters,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function getTemplateMissingAdapters(
  template: WorkflowTemplateSummary,
  enabledAdapterKeys: string[],
): string[] {
  const enabled = new Set(enabledAdapterKeys);
  return template.requiredAdapters.filter((adapterKey) => !enabled.has(adapterKey));
}

export function getTemplateStatus(
  template: WorkflowTemplateSummary,
  input: {
    enabledAdapterKeys: string[];
    connectedAdapterKeys: string[];
  },
): {
  status: "ready" | "requires_apps" | "requires_connections";
  missingAdapters: string[];
  adaptersNeedingConnection: string[];
  blocked: boolean;
} {
  const missingAdapters = getTemplateMissingAdapters(template, input.enabledAdapterKeys);
  const connected = new Set(input.connectedAdapterKeys);
  const adaptersNeedingConnection = template.requiredAdapters.filter((adapterKey) => {
    if (missingAdapters.includes(adapterKey)) {
      return false;
    }
    return !connected.has(adapterKey);
  });

  if (missingAdapters.length > 0) {
    return {
      status: "requires_apps",
      missingAdapters,
      adaptersNeedingConnection,
      blocked: true,
    };
  }

  if (adaptersNeedingConnection.length > 0) {
    return {
      status: "requires_connections",
      missingAdapters,
      adaptersNeedingConnection,
      blocked: true,
    };
  }

  return {
    status: "ready",
    missingAdapters,
    adaptersNeedingConnection,
    blocked: false,
  };
}

export function buildStepSummary(step: WorkflowStep): string {
  if (isBranchStep(step)) {
    const conditionLabel =
      "operator" in step.condition
        ? step.condition.operator
        : step.condition.mode || "all";
    return `Branch (${conditionLabel}) with ${step.then.length} then / ${(step.else || []).length} else step(s)`;
  }

  if (isDelayStep(step)) {
    const unit = step.delaySeconds ? "seconds" : "milliseconds";
    const value = step.delaySeconds || step.delayMs || 0;
    return `Delay for ${value} ${unit}`;
  }

  if (step.type === "action" || step.type === undefined) {
    if (step.adapter === "ai") {
      const actionLabelByKey: Record<string, string> = {
        generateContent: "AI Generate",
        rewriteContent: "AI Rewrite",
        summarizeText: "AI Summarize",
        summarizeUrl: "AI Summarize URL",
        transformContent: "AI Transform",
        extractKeyPoints: "AI Key Points",
        classifyText: "AI Classify",
        runAgent: "AI Agent",
      };
      return actionLabelByKey[step.action] || `AI ${step.action || "action"}`;
    }
    return `${step.adapter}.${step.action || "run"} action`;
  }
  return "Step";
}

export function validateWorkflowStructure(definition: WorkflowDefinition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!definition.trigger.adapter || !definition.trigger.trigger) {
    errors.push("Trigger adapter and trigger key are required.");
  }

  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    errors.push("At least one workflow step is required.");
  }

  const seen = new Set<string>();
  const stepIds = collectStepIds(definition.steps);
  for (const stepId of stepIds) {
    if (!stepId) {
      errors.push("Step ids cannot be empty.");
      continue;
    }
    if (seen.has(stepId)) {
      errors.push(`Duplicate step id: ${stepId}`);
    }
    seen.add(stepId);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
