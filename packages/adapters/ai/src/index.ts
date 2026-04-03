import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AgentTrace,
  AgentTraceStep,
  AgentToolPermissionPolicy,
  AdapterCredentialValidationResult,
  AdapterCredentials,
  AdapterContext,
  AdapterError,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
  classifyText,
  extractKeyPoints,
  generateContent,
  rewriteContent,
  summarizeText,
  summarizeUrl,
  transformContent,
  type AiCallOptions,
} from "@integration/shared";
import {
  AI_AGENT_TOOL_DEFINITIONS,
  normalizeAgentToolId,
  pickAiAgentTool,
  resolveAiAgentToolIds,
  runAiAgentTool,
} from "./agent-tools";

type AiAdapterConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function compactText(value: unknown): string {
  return asString(value).replace(/\s+/g, " ").trim();
}

function toAiCallOptions(input: {
  adapterConfig: AiAdapterConfig;
  actionInput: Record<string, unknown>;
  context: AdapterContext;
}): AiCallOptions {
  const metadata = asRecord(input.context.credentials?.metadata);
  const apiKey =
    compactText(input.actionInput.apiKey) ||
    compactText(input.context.credentials?.apiKey) ||
    compactText(input.context.credentials?.accessToken) ||
    compactText(input.adapterConfig.apiKey);

  const baseUrl =
    compactText(input.actionInput.baseUrl) ||
    compactText(metadata.baseUrl) ||
    compactText(input.adapterConfig.baseUrl) ||
    undefined;
  const model =
    compactText(input.actionInput.model) ||
    compactText(metadata.model) ||
    compactText(input.adapterConfig.model) ||
    undefined;

  return {
    apiKey,
    baseUrl,
    model,
    timeoutMs:
      toPositiveInteger(input.actionInput.timeoutMs, input.adapterConfig.timeoutMs) ||
      DEFAULT_TIMEOUT_MS,
  };
}

export class AiAdapter implements Adapter {
  readonly key = "ai";
  readonly version = "1.0.0";

  private config: AiAdapterConfig = {
    apiKey: "",
    baseUrl: "",
    model: "gpt-4o-mini",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      apiKey: asString(config.apiKey),
      baseUrl: asString(config.baseUrl),
      model: asString(config.model) || "gpt-4o-mini",
      timeoutMs: toPositiveInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS),
    };
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {
      metadata: {
        mode: "api_key",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "generateContent",
        name: "AI Generate",
        description: "Generate AI-assisted content from prompts.",
        inputSchema: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string" },
            tone: { type: "string" },
            style: { type: "string" },
            audience: { type: "string" },
          },
        },
      },
      {
        key: "rewriteContent",
        name: "AI Rewrite",
        description: "Rewrite text according to instruction and style.",
        inputSchema: {
          type: "object",
          required: ["text", "instruction"],
          properties: {
            text: { type: "string" },
            instruction: { type: "string" },
            style: { type: "string" },
          },
        },
      },
      {
        key: "summarizeText",
        name: "AI Summarize",
        description: "Summarize text into concise output.",
        inputSchema: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string" },
            maxSentences: { type: "number" },
          },
        },
      },
      {
        key: "summarizeUrl",
        name: "AI Summarize URL",
        description: "Fetch a URL and summarize its content.",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string" },
            maxSentences: { type: "number" },
          },
        },
      },
      {
        key: "transformContent",
        name: "AI Transform",
        description: "Transform text into email, bullet, thread, or paragraph format.",
        inputSchema: {
          type: "object",
          required: ["text", "targetFormat"],
          properties: {
            text: { type: "string" },
            targetFormat: {
              type: "string",
              enum: ["bullet_list", "tweet_thread", "email", "paragraph"],
            },
          },
        },
      },
      {
        key: "extractKeyPoints",
        name: "Extract Key Points",
        description: "Extract key bullet points from input text.",
        inputSchema: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string" },
            maxPoints: { type: "number" },
          },
        },
      },
      {
        key: "classifyText",
        name: "Classify Text",
        description: "Classify text into one of the provided labels.",
        inputSchema: {
          type: "object",
          required: ["text", "labels"],
          properties: {
            text: { type: "string" },
            labels: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
      {
        key: "runAgent",
        name: "AI Agent",
        description:
          "Run a lightweight goal-driven agent loop with selected AI and integration tools.",
        inputSchema: {
          type: "object",
          required: ["goal"],
          properties: {
            goal: { type: "string" },
            initialInput: { type: "string" },
            tools: {
              type: "array",
              items: { type: "string" },
            },
            toolInputs: {
              type: "object",
              additionalProperties: { type: "object" },
            },
            approvedToolIds: {
              type: "array",
              items: { type: "string" },
            },
            approvalSafetyLevels: {
              type: "array",
              items: {
                type: "string",
                enum: ["low", "guarded", "high"],
              },
            },
            maxIterations: { type: "number" },
          },
        },
      },
      {
        key: "listAgentTools",
        name: "List Agent Tools",
        description: "Return typed AI tool metadata for permission and trust UX.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ];
  }

  async runTrigger(
    _triggerKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    return {
      events: [],
    };
  }

  private async runAgentAction(
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    const goal = compactText(input.goal);
    if (!goal) {
      throw new AdapterError("AI Agent requires a goal.", {
        code: "INVALID_CONFIG",
        retryable: false,
      });
    }

    const maxIterations = Math.min(8, Math.max(1, toPositiveInteger(input.maxIterations, 3)));
    const permission = asRecord(input.toolPermissions) as AgentToolPermissionPolicy;
    const tools = resolveAiAgentToolIds({
      requested: input.tools,
      permission: permission.mode ? permission : undefined,
    });
    const requestedTools = Array.isArray(input.tools)
      ? input.tools.filter((item): item is string => typeof item === "string")
      : [];
    const normalizedRequestedTools = requestedTools
      .map(normalizeAgentToolId)
      .filter(Boolean);
    const blockedRequestedTools =
      permission.mode === "allow_list"
        ? normalizedRequestedTools.filter((toolId) => !tools.includes(toolId))
        : [];

    if (tools.length === 0) {
      throw new AdapterError("AI Agent has no permitted tools. Update tool permissions.", {
        code: "INVALID_CONFIG",
        retryable: false,
      });
    }

    const actionOptions = toAiCallOptions({
      adapterConfig: this.config,
      actionInput: input,
      context,
    });

    const labels = Array.isArray(input.labels)
      ? input.labels.filter((label): label is string => typeof label === "string")
      : ["research", "marketing", "support", "operations"];

    const stepLog: AgentTraceStep[] = blockedRequestedTools.map((toolId, index) => ({
      iteration: index + 1,
      decision: `Blocked ${toolId} because it is outside the configured tool permission boundary.`,
      toolCall: {
        toolId,
        title: toolId,
        category: "operations",
        safetyLevel: "guarded",
        inputPreview: "{}",
        outputPreview: "Tool blocked by allow-list policy.",
        status: "blocked",
        errorSummary: "Tool is outside configured agent permissions.",
      },
    }));
    const pendingApprovals: Array<{
      toolId: string;
      title: string;
      safetyLevel: "low" | "guarded" | "high";
      reason: string;
    }> = [];

    let workingText =
      compactText(input.initialInput) || `Goal: ${goal}`;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const toolId = pickAiAgentTool({
        goal,
        tools,
        iteration,
      });

      const runResult = await runAiAgentTool({
        toolId,
        goal,
        workingText,
        options: actionOptions,
        style: compactText(input.style) || "clear",
        labels,
        maxPoints: toPositiveInteger(input.maxPoints, 5),
        targetFormat:
          (input.targetFormat as "bullet_list" | "tweet_thread" | "email" | "paragraph") ||
          "bullet_list",
        url: compactText(input.url),
        toolInputs: input.toolInputs,
        fallbackInput: input,
        approvedToolIds: Array.isArray(input.approvedToolIds)
          ? input.approvedToolIds.filter((item): item is string => typeof item === "string")
          : [],
        approvalSafetyLevels: Array.isArray(input.approvalSafetyLevels)
          ? input.approvalSafetyLevels.filter(
              (item): item is "low" | "guarded" | "high" =>
                item === "low" || item === "guarded" || item === "high",
            )
          : undefined,
      });
      stepLog.push({
        iteration: stepLog.length + 1,
        decision:
          runResult.trace.status === "awaiting_approval"
            ? `Paused on ${toolId} while waiting for human approval.`
            : `Selected ${toolId} based on goal and available permissions.`,
        toolCall: runResult.trace,
      });

      if (runResult.awaitingApproval) {
        pendingApprovals.push({
          toolId: runResult.trace.toolId,
          title: runResult.trace.title,
          safetyLevel: runResult.trace.safetyLevel,
          reason: runResult.awaitingApproval.reason,
        });
        break;
      }

      workingText = runResult.nextText;
      if (runResult.trace.status === "failed") {
        break;
      }
    }

    const trace: AgentTrace = {
      goal,
      allowedToolIds: tools,
      iterations: Math.max(0, stepLog.length - blockedRequestedTools.length),
      steps: stepLog,
      finalOutput: workingText,
      awaitingApproval: pendingApprovals.length > 0,
      pendingApprovals: pendingApprovals.length > 0 ? pendingApprovals : undefined,
    };

    return {
      success: true,
      output: {
        goal,
        usedTools: tools.map((toolId) => toolId.replace(/^ai\./, "")),
        usedToolIds: tools,
        iterations: stepLog.length,
        steps: stepLog.map((step) => ({
          iteration: step.iteration,
          tool: step.toolCall.toolId.replace(/^ai\./, ""),
          toolId: step.toolCall.toolId,
          outputPreview: step.toolCall.outputPreview,
          decision: step.decision,
          toolCall: step.toolCall,
        })),
        trace,
        finalOutput: workingText,
        blockedTools: blockedRequestedTools,
        awaitingApproval: pendingApprovals.length > 0,
        pendingApprovals,
      },
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    const options = toAiCallOptions({
      adapterConfig: this.config,
      actionInput: input,
      context,
    });

    if (actionKey === "generateContent") {
      const prompt = compactText(input.prompt);
      if (!prompt) {
        throw new AdapterError("generateContent requires prompt.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }
      const generated = await generateContent({
        prompt,
        style: compactText(input.style) || undefined,
        audience: compactText(input.audience) || undefined,
        tone: compactText(input.tone) || undefined,
        options,
      });
      return {
        success: true,
        output: generated,
      };
    }

    if (actionKey === "rewriteContent") {
      const text = asString(input.text);
      const instruction = compactText(input.instruction);
      if (!text || !instruction) {
        throw new AdapterError("rewriteContent requires text and instruction.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }
      const rewritten = await rewriteContent({
        text,
        instruction,
        style: compactText(input.style) || undefined,
        options,
      });
      return {
        success: true,
        output: rewritten,
      };
    }

    if (actionKey === "summarizeText") {
      const text = asString(input.text);
      if (!text) {
        throw new AdapterError("summarizeText requires text.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }
      const summarized = await summarizeText({
        text,
        maxSentences: toPositiveInteger(input.maxSentences, 2),
        options,
      });
      return {
        success: true,
        output: summarized,
      };
    }

    if (actionKey === "summarizeUrl") {
      const url = compactText(input.url);
      if (!url) {
        throw new AdapterError("summarizeUrl requires url.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }
      const summarized = await summarizeUrl({
        url,
        maxSentences: toPositiveInteger(input.maxSentences, 2),
        options,
      });
      return {
        success: true,
        output: summarized,
      };
    }

    if (actionKey === "transformContent") {
      const text = asString(input.text);
      if (!text) {
        throw new AdapterError("transformContent requires text.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }
      const targetFormat =
        (input.targetFormat as "bullet_list" | "tweet_thread" | "email" | "paragraph") ||
        "paragraph";
      const transformed = await transformContent({
        text,
        targetFormat,
        options,
      });
      return {
        success: true,
        output: transformed,
      };
    }

    if (actionKey === "extractKeyPoints") {
      const text = asString(input.text);
      if (!text) {
        throw new AdapterError("extractKeyPoints requires text.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }
      const extracted = await extractKeyPoints({
        text,
        maxPoints: toPositiveInteger(input.maxPoints, 5),
        options,
      });
      return {
        success: true,
        output: extracted,
      };
    }

    if (actionKey === "classifyText") {
      const text = asString(input.text);
      const labels = Array.isArray(input.labels)
        ? input.labels.filter((label): label is string => typeof label === "string")
        : [];
      if (!text || labels.length === 0) {
        throw new AdapterError("classifyText requires text and labels.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }
      const classified = await classifyText({
        text,
        labels,
        options,
      });
      return {
        success: true,
        output: classified,
      };
    }

    if (actionKey === "runAgent") {
      return this.runAgentAction(input, context);
    }

    if (actionKey === "listAgentTools") {
      return {
        success: true,
        output: {
          tools: AI_AGENT_TOOL_DEFINITIONS,
        },
      };
    }

    throw new AdapterError(`Unsupported action "${actionKey}".`, {
      code: "UNSUPPORTED_ACTION",
      retryable: false,
    });
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (config.baseUrl !== undefined && !asString(config.baseUrl).startsWith("http")) {
      errors.push("baseUrl must be an absolute URL when provided.");
    }
    if (config.timeoutMs !== undefined) {
      const timeout = Number(config.timeoutMs);
      if (!Number.isFinite(timeout) || timeout <= 0) {
        errors.push("timeoutMs must be a positive integer.");
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("AI adapter does not support token refresh.", {
      code: "NOT_SUPPORTED",
      retryable: false,
    });
  }

  async validateCredentials(
    credentials: AdapterCredentials,
  ): Promise<AdapterCredentialValidationResult> {
    const token = compactText(credentials.apiKey || credentials.accessToken || "");
    if (!token) {
      return {
        status: "valid",
        reason: "No API key configured. Heuristic fallback mode will be used.",
      };
    }
    if (credentials.expiresAt) {
      const expiresAt = Date.parse(credentials.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return {
          status: "expired",
          reason: "AI credential is expired.",
        };
      }
    }
    return {
      status: "valid",
    };
  }
}
