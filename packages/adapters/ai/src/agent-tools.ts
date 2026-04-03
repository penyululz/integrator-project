import {
  AdapterError,
  type AgentToolDefinition,
  type AgentToolPermissionPolicy,
  type AgentToolSafetyLevel,
  type AgentTraceToolCall,
  classifyText,
  extractKeyPoints,
  generateContent,
  redactSensitiveValue,
  rewriteContent,
  sanitizeSensitiveMessage,
  summarizeText,
  summarizeUrl,
  transformContent,
  type AiCallOptions,
} from "@integration/shared";

type TransformFormat = "bullet_list" | "tweet_thread" | "email" | "paragraph";

export type AiAgentToolId =
  | "ai.generateContent"
  | "ai.rewriteContent"
  | "ai.summarizeText"
  | "ai.summarizeUrl"
  | "ai.transformContent"
  | "ai.extractKeyPoints"
  | "ai.classifyText";

export type NonAiAgentToolId =
  | "http-api.httpRequest"
  | "graphql.executeQuery"
  | "slack.sendMessage"
  | "telegram.sendMessage"
  | "whatsapp.sendMessage"
  | "webhook.forward_payload";

export type AgentToolId = AiAgentToolId | NonAiAgentToolId;

export type RunAgentToolResult = {
  nextText: string;
  trace: AgentTraceToolCall;
  awaitingApproval?: {
    toolId: string;
    reason: string;
  };
};

const DEFAULT_TIMEOUT_MS = 15_000;

const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    id: "ai.generateContent",
    title: "AI Generate Content",
    description: "Generate content from prompts.",
    inputSchema: { type: "object" },
    category: "content",
    safetyLevel: "low",
    adapterKey: "ai",
    actionKey: "generateContent",
  },
  {
    id: "ai.rewriteContent",
    title: "AI Rewrite Content",
    description: "Rewrite text with instruction.",
    inputSchema: { type: "object" },
    category: "content",
    safetyLevel: "low",
    adapterKey: "ai",
    actionKey: "rewriteContent",
  },
  {
    id: "ai.summarizeText",
    title: "AI Summarize Text",
    description: "Summarize text into concise output.",
    inputSchema: { type: "object" },
    category: "research",
    safetyLevel: "low",
    adapterKey: "ai",
    actionKey: "summarizeText",
  },
  {
    id: "ai.summarizeUrl",
    title: "AI Summarize URL",
    description: "Fetch and summarize URL content.",
    inputSchema: { type: "object" },
    category: "research",
    safetyLevel: "low",
    adapterKey: "ai",
    actionKey: "summarizeUrl",
  },
  {
    id: "ai.transformContent",
    title: "AI Transform Content",
    description: "Transform text into target output format.",
    inputSchema: { type: "object" },
    category: "content",
    safetyLevel: "low",
    adapterKey: "ai",
    actionKey: "transformContent",
  },
  {
    id: "ai.extractKeyPoints",
    title: "AI Extract Key Points",
    description: "Extract key points from source text.",
    inputSchema: { type: "object" },
    category: "research",
    safetyLevel: "low",
    adapterKey: "ai",
    actionKey: "extractKeyPoints",
  },
  {
    id: "ai.classifyText",
    title: "AI Classify Text",
    description: "Classify text into provided labels.",
    inputSchema: { type: "object" },
    category: "support",
    safetyLevel: "low",
    adapterKey: "ai",
    actionKey: "classifyText",
  },
  {
    id: "http-api.httpRequest",
    title: "HTTP Request",
    description: "Call an external HTTP API.",
    inputSchema: { type: "object" },
    category: "integration",
    safetyLevel: "high",
    requiresApproval: true,
    adapterKey: "http-api",
    actionKey: "httpRequest",
  },
  {
    id: "graphql.executeQuery",
    title: "GraphQL Query",
    description: "Execute a GraphQL query or mutation.",
    inputSchema: { type: "object" },
    category: "integration",
    safetyLevel: "high",
    requiresApproval: true,
    adapterKey: "graphql",
    actionKey: "executeQuery",
  },
  {
    id: "slack.sendMessage",
    title: "Slack Send Message",
    description: "Send a Slack message.",
    inputSchema: { type: "object" },
    category: "communication",
    safetyLevel: "high",
    requiresApproval: true,
    adapterKey: "slack",
    actionKey: "sendMessage",
  },
  {
    id: "telegram.sendMessage",
    title: "Telegram Send Message",
    description: "Send a Telegram message.",
    inputSchema: { type: "object" },
    category: "communication",
    safetyLevel: "high",
    requiresApproval: true,
    adapterKey: "telegram",
    actionKey: "sendMessage",
  },
  {
    id: "whatsapp.sendMessage",
    title: "WhatsApp Send Message",
    description: "Send a WhatsApp message.",
    inputSchema: { type: "object" },
    category: "communication",
    safetyLevel: "high",
    requiresApproval: true,
    adapterKey: "whatsapp",
    actionKey: "sendMessage",
  },
  {
    id: "webhook.forward_payload",
    title: "Webhook Forward Payload",
    description: "Forward payload to webhook utility target.",
    inputSchema: { type: "object" },
    category: "integration",
    safetyLevel: "guarded",
    adapterKey: "webhook",
    actionKey: "forward_payload",
  },
];

const TOOL_BY_ID = new Map(AGENT_TOOL_DEFINITIONS.map((tool) => [tool.id, tool]));

export const AI_AGENT_TOOL_DEFINITIONS = AGENT_TOOL_DEFINITIONS;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function safePreview(value: unknown, maxLength = 280): string {
  const redacted = redactSensitiveValue(value);
  const serialized =
    typeof redacted === "string"
      ? redacted
      : JSON.stringify(redacted);
  const sanitized = sanitizeSensitiveMessage(serialized || "");
  if (sanitized.length <= maxLength) {
    return sanitized;
  }
  return `${sanitized.slice(0, maxLength)}...`;
}

function parseMaybeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function toHeaders(value: unknown): Record<string, string> {
  const source = asRecord(value);
  return Object.entries(source).reduce<Record<string, string>>((acc, [key, item]) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      acc[key] = String(item);
    }
    return acc;
  }, {});
}

function mergeHeaders(...items: Array<Record<string, string>>): Record<string, string> {
  return items.reduce<Record<string, string>>((acc, item) => ({ ...acc, ...item }), {});
}

function findUrlInText(input: string): string {
  const match = input.match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : "";
}

function resolveToolInput(toolId: string, toolInputs: unknown, fallbackInput: Record<string, unknown>): Record<string, unknown> {
  const map = asRecord(toolInputs);
  const candidate = map[toolId];
  if (typeof candidate === "string") {
    const parsed = parseMaybeJson(candidate);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }

  const keys = ["url", "method", "query", "variables", "endpoint", "text", "channel", "chatId", "to", "body", "headers", "webhookUrl", "phoneNumberId", "apiVersion", "baseUrl", "botToken", "accessToken", "apiKey", "payload"];
  const merged: Record<string, unknown> = {};
  for (const key of keys) {
    if (fallbackInput[key] !== undefined) {
      merged[key] = fallbackInput[key];
    }
  }
  return merged;
}

function chooseNextText(previous: string, output: Record<string, unknown>): string {
  const textCandidate =
    asString(output.text) ||
    asString(output.summary) ||
    asString(output.message) ||
    asString(output.content);
  if (textCandidate) {
    return textCandidate;
  }

  const body = output.body;
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }
  if (body && typeof body === "object") {
    return safePreview(body, 500);
  }

  const fallback = safePreview(output, 500);
  return fallback || previous;
}

function normalizeKnownIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    if (!TOOL_BY_ID.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }
  return next;
}

export function normalizeAgentToolId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes(".")) {
    return trimmed;
  }

  const aiToolId = `ai.${trimmed}`;
  if (TOOL_BY_ID.has(aiToolId)) {
    return aiToolId;
  }

  return trimmed;
}

function isToolApprovalRequired(toolId: string, inputLevels?: AgentToolSafetyLevel[]): boolean {
  const definition = TOOL_BY_ID.get(toolId);
  if (!definition) {
    return false;
  }
  if (definition.requiresApproval) {
    return true;
  }

  const levels = new Set(inputLevels && inputLevels.length > 0 ? inputLevels : ["high"]);
  return levels.has(definition.safetyLevel);
}

export function resolveAiAgentToolIds(input: {
  requested?: unknown;
  permission?: AgentToolPermissionPolicy;
}): string[] {
  const requested = normalizeKnownIds(asStringArray(input.requested).map(normalizeAgentToolId));
  const permission = input.permission;
  const allIds = AGENT_TOOL_DEFINITIONS.map((tool) => tool.id);

  if (!permission || permission.mode === "allow_all") {
    return requested.length > 0 ? requested : allIds;
  }

  const allowedByPolicy = normalizeKnownIds(
    asStringArray(permission.allowedToolIds).map(normalizeAgentToolId),
  );
  if (requested.length === 0) {
    return allowedByPolicy;
  }

  const allowedSet = new Set(allowedByPolicy);
  return requested.filter((toolId) => allowedSet.has(toolId));
}

export function pickAiAgentTool(input: {
  goal: string;
  tools: string[];
  iteration: number;
}): string {
  const available = normalizeKnownIds(input.tools.map(normalizeAgentToolId));
  if (available.length === 0) {
    return "ai.summarizeText";
  }
  if (available.length === 1) {
    return available[0];
  }

  const goal = input.goal.toLowerCase();
  const priorities: Array<{ id: string; score: number }> = available.map((toolId, index) => {
    let score = 0;
    if (/summar|digest|brief|recap/.test(goal) && toolId.includes("summarize")) {
      score += 60;
    }
    if (/rewrite|polish|improv|refine/.test(goal) && toolId.includes("rewrite")) {
      score += 60;
    }
    if (/classif|categor|triage/.test(goal) && toolId.includes("classify")) {
      score += 60;
    }
    if (/extract|key point|bullet/.test(goal) && toolId.includes("extractKeyPoints")) {
      score += 60;
    }
    if (/transform|format|thread|email/.test(goal) && toolId.includes("transform")) {
      score += 60;
    }
    if (/slack|notify|alert|message/.test(goal) && toolId === "slack.sendMessage") {
      score += 80;
    }
    if (/telegram|bot/.test(goal) && toolId === "telegram.sendMessage") {
      score += 80;
    }
    if (/whatsapp/.test(goal) && toolId === "whatsapp.sendMessage") {
      score += 80;
    }
    if (/graphql/.test(goal) && toolId === "graphql.executeQuery") {
      score += 80;
    }
    if (/(http|api|request|post|webhook|endpoint)/.test(goal) && toolId === "http-api.httpRequest") {
      score += 70;
    }
    if (/(webhook|forward)/.test(goal) && toolId === "webhook.forward_payload") {
      score += 70;
    }

    // Stable tie-breaker by preserving requested ordering.
    score += Math.max(0, 10 - index);
    return {
      id: toolId,
      score,
    };
  });

  priorities.sort((left, right) => right.score - left.score);
  const highestScore = priorities[0]?.score ?? 0;
  const bestCandidates = priorities.filter((candidate) => candidate.score === highestScore);
  return bestCandidates[input.iteration % bestCandidates.length].id;
}

async function executeHttpRequest(input: Record<string, unknown>, workingText: string): Promise<Record<string, unknown>> {
  const method = (asString(input.method) || "POST").toUpperCase();
  const url = asString(input.url) || findUrlInText(workingText);
  if (!url) {
    throw new AdapterError("HTTP Request tool requires url.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  const headers = mergeHeaders(toHeaders(input.headers));
  const token = asString(input.accessToken) || asString(input.apiKey) || asString(input.token);
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const timeoutMs = parsePositiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("HTTP request timeout"), timeoutMs);

  try {
    const requestInit: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (method !== "GET" && method !== "HEAD") {
      const body = input.body !== undefined ? input.body : { message: workingText };
      if (typeof body === "string") {
        requestInit.body = body;
      } else {
        if (!headers["Content-Type"] && !headers["content-type"]) {
          headers["Content-Type"] = "application/json";
        }
        requestInit.body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, requestInit);
    const rawBody = await response.text();
    const parsedBody = parseMaybeJson(rawBody);

    if (!response.ok) {
      throw new AdapterError(`HTTP request failed with status ${response.status}.`, {
        code: `HTTP_${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
        details: {
          status: response.status,
          body: parsedBody,
        },
      });
    }

    return {
      status: response.status,
      statusText: response.statusText,
      url,
      body: parsedBody,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeGraphqlQuery(input: Record<string, unknown>, workingText: string): Promise<Record<string, unknown>> {
  const endpoint = asString(input.endpoint);
  if (!endpoint) {
    throw new AdapterError("GraphQL tool requires endpoint.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  const query = asString(input.query);
  if (!query) {
    throw new AdapterError("GraphQL tool requires query.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  const headers = mergeHeaders(
    { "content-type": "application/json" },
    toHeaders(input.headers),
  );
  const token = asString(input.accessToken) || asString(input.apiKey) || asString(input.token);
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const timeoutMs = parsePositiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("GraphQL request timeout"), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables: asRecord(input.variables),
        operationName: asString(input.operationName) || undefined,
        contextText: workingText,
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new AdapterError(`GraphQL request failed with status ${response.status}.`, {
        code: `HTTP_${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
        details: {
          status: response.status,
          body,
        },
      });
    }

    if (Array.isArray(body?.errors) && body.errors.length > 0) {
      throw new AdapterError("GraphQL response contains errors.", {
        code: "GRAPHQL_ERRORS",
        retryable: false,
        details: {
          errors: body.errors,
        },
      });
    }

    return {
      endpoint,
      data: body?.data || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeSlackSendMessage(input: Record<string, unknown>, workingText: string): Promise<Record<string, unknown>> {
  const text = asString(input.text) || workingText;
  if (!text) {
    throw new AdapterError("Slack sendMessage requires text.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  const webhookUrl = asString(input.webhookUrl);
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new AdapterError(`Slack webhook failed with status ${response.status}.`, {
        code: `HTTP_${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    return {
      channel: asString(input.channel) || "webhook",
      postedVia: "incoming_webhook",
      text,
    };
  }

  const token =
    asString(input.accessToken) ||
    asString(input.botToken) ||
    asString(input.apiKey) ||
    asString(input.token);
  const channel = asString(input.channel) || asString(input.defaultChannel);
  if (!token || !channel) {
    throw new AdapterError("Slack sendMessage requires token and channel.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text,
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        channel?: string;
        ts?: string;
      }
    | null;

  if (!response.ok || !body?.ok) {
    throw new AdapterError(`Slack sendMessage failed: ${body?.error || response.status}.`, {
      code: response.ok ? "SLACK_ERROR" : `HTTP_${response.status}`,
      retryable: response.status >= 500 || response.status === 429,
      details: {
        error: body?.error,
      },
    });
  }

  return {
    channel: body.channel || channel,
    ts: body.ts || null,
    text,
  };
}

async function executeTelegramSendMessage(input: Record<string, unknown>, workingText: string): Promise<Record<string, unknown>> {
  const botToken =
    asString(input.botToken) ||
    asString(input.accessToken) ||
    asString(input.apiKey);
  const chatId = asString(input.chatId) || asString(input.chat_id);
  const text = asString(input.text) || workingText;

  if (!botToken || !chatId || !text) {
    throw new AdapterError("Telegram sendMessage requires botToken, chatId, and text.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  const apiBaseUrl = asString(input.apiBaseUrl) || "https://api.telegram.org";
  const response = await fetch(`${apiBaseUrl}/bot${encodeURIComponent(botToken)}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: asString(input.parseMode) || undefined,
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        description?: string;
        error_code?: number;
        result?: {
          message_id?: number;
        };
      }
    | null;

  if (!response.ok || !body?.ok) {
    throw new AdapterError(
      body?.description || `Telegram sendMessage failed (${response.status}).`,
      {
        code: body?.error_code ? `HTTP_${body.error_code}` : `HTTP_${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
      },
    );
  }

  return {
    chatId,
    messageId: body.result?.message_id || null,
    text,
  };
}

async function executeWhatsAppSendMessage(input: Record<string, unknown>, workingText: string): Promise<Record<string, unknown>> {
  const accessToken =
    asString(input.accessToken) ||
    asString(input.apiKey) ||
    asString(input.token);
  const phoneNumberId = asString(input.phoneNumberId);
  const to = asString(input.to);
  const text = asString(input.text) || workingText;

  if (!accessToken || !phoneNumberId || !to || !text) {
    throw new AdapterError("WhatsApp sendMessage requires accessToken, phoneNumberId, to, and text.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  const baseUrl = asString(input.baseUrl) || "https://graph.facebook.com";
  const apiVersion = asString(input.apiVersion) || "v20.0";
  const endpoint = `${baseUrl}/${apiVersion}/${phoneNumberId}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: text,
      },
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | {
        messages?: Array<{ id?: string }>;
        error?: { message?: string; code?: number };
      }
    | null;

  if (!response.ok) {
    throw new AdapterError(
      body?.error?.message || `WhatsApp sendMessage failed (${response.status}).`,
      {
        code: body?.error?.code ? `HTTP_${body.error.code}` : `HTTP_${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
      },
    );
  }

  return {
    to,
    messageId: body?.messages?.[0]?.id || null,
    text,
  };
}

async function executeWebhookForwardPayload(input: Record<string, unknown>, workingText: string): Promise<Record<string, unknown>> {
  const payload =
    typeof input.payload === "object" && input.payload !== null
      ? (input.payload as Record<string, unknown>)
      : {
          message: workingText,
        };

  const endpoint = asString(input.endpoint) || asString(input.url);
  if (!endpoint) {
    return {
      forwarded: true,
      payload,
      mode: "local",
    };
  }

  const response = await fetch(endpoint, {
    method: (asString(input.method) || "POST").toUpperCase(),
    headers: {
      "content-type": "application/json",
      ...toHeaders(input.headers),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new AdapterError(`Webhook forward failed with status ${response.status}.`, {
      code: `HTTP_${response.status}`,
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  const rawBody = await response.text();
  return {
    forwarded: true,
    payload,
    mode: "remote",
    status: response.status,
    response: parseMaybeJson(rawBody),
  };
}

export async function runAiAgentTool(input: {
  toolId: string;
  goal: string;
  workingText: string;
  options: AiCallOptions;
  style: string;
  labels: string[];
  maxPoints: number;
  targetFormat: TransformFormat;
  url: string;
  toolInputs?: unknown;
  fallbackInput?: Record<string, unknown>;
  approvedToolIds?: string[];
  approvalSafetyLevels?: AgentToolSafetyLevel[];
}): Promise<RunAgentToolResult> {
  const normalizedToolId = normalizeAgentToolId(input.toolId);
  const definition = TOOL_BY_ID.get(normalizedToolId);
  if (!definition) {
    throw new AdapterError(`Unknown agent tool "${input.toolId}".`, {
      code: "UNSUPPORTED_ACTION",
      retryable: false,
    });
  }

  const fallbackInput = input.fallbackInput || {};
  const toolInput = resolveToolInput(normalizedToolId, input.toolInputs, fallbackInput);
  const traceBase: Omit<AgentTraceToolCall, "status" | "outputPreview"> = {
    toolId: definition.id,
    title: definition.title,
    category: definition.category,
    safetyLevel: definition.safetyLevel,
    inputPreview: safePreview(toolInput),
  };

  const approvedToolIds = new Set(
    asStringArray(input.approvedToolIds).map(normalizeAgentToolId),
  );
  if (isToolApprovalRequired(definition.id, input.approvalSafetyLevels) && !approvedToolIds.has(definition.id)) {
    return {
      nextText: input.workingText,
      trace: {
        ...traceBase,
        status: "awaiting_approval",
        outputPreview: "Awaiting human approval before this tool can run.",
        errorSummary: "Human approval required for this tool.",
      },
      awaitingApproval: {
        toolId: definition.id,
        reason: "Tool safety policy requires approval before execution.",
      },
    };
  }

  try {
    let output: Record<string, unknown>;
    switch (definition.id as AgentToolId) {
      case "ai.generateContent": {
        const result = await generateContent({
          prompt: asString(toolInput.prompt) || input.workingText,
          style: asString(toolInput.style) || input.style,
          audience: asString(toolInput.audience) || undefined,
          tone: asString(toolInput.tone) || undefined,
          options: input.options,
        });
        output = { ...result };
        break;
      }
      case "ai.rewriteContent": {
        const result = await rewriteContent({
          text: asString(toolInput.text) || input.workingText,
          instruction: asString(toolInput.instruction) || "Rewrite for clarity.",
          style: asString(toolInput.style) || input.style,
          options: input.options,
        });
        output = { ...result };
        break;
      }
      case "ai.summarizeText": {
        const result = await summarizeText({
          text: asString(toolInput.text) || input.workingText,
          maxSentences: parsePositiveInt(toolInput.maxSentences, 2),
          options: input.options,
        });
        output = { ...result };
        break;
      }
      case "ai.summarizeUrl": {
        const url = asString(toolInput.url) || input.url || findUrlInText(input.workingText);
        if (!url) {
          throw new AdapterError("summarizeUrl requires url.", {
            code: "INVALID_CONFIG",
            retryable: false,
          });
        }
        const result = await summarizeUrl({
          url,
          maxSentences: parsePositiveInt(toolInput.maxSentences, 2),
          options: input.options,
        });
        output = { ...result };
        break;
      }
      case "ai.transformContent": {
        const result = await transformContent({
          text: asString(toolInput.text) || input.workingText,
          targetFormat: (asString(toolInput.targetFormat) as TransformFormat) || input.targetFormat,
          options: input.options,
        });
        output = { ...result };
        break;
      }
      case "ai.extractKeyPoints": {
        const result = await extractKeyPoints({
          text: asString(toolInput.text) || input.workingText,
          maxPoints: parsePositiveInt(toolInput.maxPoints, input.maxPoints),
          options: input.options,
        });
        output = { ...result };
        break;
      }
      case "ai.classifyText": {
        const labels = asStringArray(toolInput.labels);
        const result = await classifyText({
          text: asString(toolInput.text) || input.workingText,
          labels: labels.length > 0 ? labels : input.labels,
          options: input.options,
        });
        output = { ...result };
        break;
      }
      case "http-api.httpRequest": {
        output = await executeHttpRequest(toolInput, input.workingText);
        break;
      }
      case "graphql.executeQuery": {
        output = await executeGraphqlQuery(toolInput, input.workingText);
        break;
      }
      case "slack.sendMessage": {
        output = await executeSlackSendMessage(toolInput, input.workingText);
        break;
      }
      case "telegram.sendMessage": {
        output = await executeTelegramSendMessage(toolInput, input.workingText);
        break;
      }
      case "whatsapp.sendMessage": {
        output = await executeWhatsAppSendMessage(toolInput, input.workingText);
        break;
      }
      case "webhook.forward_payload": {
        output = await executeWebhookForwardPayload(toolInput, input.workingText);
        break;
      }
      default: {
        throw new AdapterError(`Agent tool "${definition.id}" is not implemented.`, {
          code: "NOT_SUPPORTED",
          retryable: false,
        });
      }
    }

    return {
      nextText: chooseNextText(input.workingText, output),
      trace: {
        ...traceBase,
        status: "completed",
        outputPreview: safePreview(output),
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? sanitizeSensitiveMessage(error.message) : "Tool execution failed.";
    return {
      nextText: input.workingText,
      trace: {
        ...traceBase,
        status: "failed",
        outputPreview: "Tool execution failed.",
        errorSummary: message,
      },
    };
  }
}
