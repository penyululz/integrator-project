import {
  sanitizeSensitiveMessage,
  redactSensitiveRecord,
} from "@integration/shared";
import { AiEngineError } from "./errors";
import type {
  AiProviderType,
  ResolvedAiProviderConfig,
} from "./types";

export type AiProviderGenerateInput = {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
};

export type AiProviderGenerateResult = {
  text: string;
  model: string;
  raw?: Record<string, unknown>;
};

export interface AiProvider {
  readonly type: AiProviderType;
  generate(
    config: ResolvedAiProviderConfig,
    input: AiProviderGenerateInput,
  ): Promise<AiProviderGenerateResult>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function resolveFetch(): typeof fetch {
  if (typeof globalThis.fetch !== "function") {
    throw new AiEngineError({
      code: "provider_error",
      statusCode: 500,
      message: "Fetch API is required for AI provider calls.",
    });
  }
  return globalThis.fetch.bind(globalThis);
}

function clampTemperature(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.2;
  }
  return Math.min(1, Math.max(0, value));
}

function toBoundedTokens(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.min(16_000, Math.max(1, Math.floor(value)));
}

function toBoundedTimeout(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(120_000, Math.max(500, Math.floor(value)));
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function joinPrompt(input: AiProviderGenerateInput): string {
  return [input.systemPrompt ? `System:\n${input.systemPrompt}` : "", `User:\n${input.userPrompt}`]
    .filter(Boolean)
    .join("\n\n");
}

function parseOpenAiText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const asRecord = body as {
    choices?: Array<{
      message?:
        | {
            content?: string | Array<{ type?: string; text?: string }>;
          }
        | null;
    }>;
  };
  const content = asRecord.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return compactWhitespace(content);
  }
  if (Array.isArray(content)) {
    const combined = content
      .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
      .filter(Boolean)
      .join("\n");
    return compactWhitespace(combined);
  }
  return "";
}

function parseOllamaText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const asRecord = body as { response?: unknown; message?: { content?: unknown } };
  if (typeof asRecord.response === "string") {
    return compactWhitespace(asRecord.response);
  }
  if (typeof asRecord.message?.content === "string") {
    return compactWhitespace(asRecord.message.content);
  }
  return "";
}

async function fetchWithTimeout(input: {
  url: string;
  init: RequestInit;
  timeoutMs: number;
}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("AI provider timeout"), input.timeoutMs);
  try {
    const fetchImpl = resolveFetch();
    return await fetchImpl(input.url, {
      ...input.init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

class HeuristicProvider implements AiProvider {
  readonly type: AiProviderType = "heuristic";

  async generate(
    config: ResolvedAiProviderConfig,
    input: AiProviderGenerateInput,
  ): Promise<AiProviderGenerateResult> {
    const prompt = compactWhitespace(input.userPrompt);
    const hint = compactWhitespace(input.systemPrompt || "");
    const text = hint
      ? `${hint.slice(0, 120)}. ${prompt.slice(0, 1000)}`
      : prompt.slice(0, 1000);
    return {
      text,
      model: config.model || "heuristic-v1",
      raw: {
        heuristic: true,
      },
    };
  }
}

class OpenAiCompatibleProvider implements AiProvider {
  readonly type: AiProviderType = "openai_compatible";

  async generate(
    config: ResolvedAiProviderConfig,
    input: AiProviderGenerateInput,
  ): Promise<AiProviderGenerateResult> {
    if (!config.endpoint) {
      throw new AiEngineError({
        code: "provider_error",
        statusCode: 400,
        message: "OpenAI-compatible provider requires endpoint.",
      });
    }
    const endpoint = config.endpoint.trim();
    const url = endpoint.endsWith("/chat/completions")
      ? endpoint
      : `${endpoint.replace(/\/$/, "")}/chat/completions`;

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...config.headers,
    };
    if (config.apiKey) {
      headers.authorization = `Bearer ${config.apiKey}`;
    }

    const response = await fetchWithTimeout({
      url,
      timeoutMs: toBoundedTimeout(config.timeoutMs),
      init: {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model || "gpt-4o-mini",
          temperature: clampTemperature(input.temperature),
          max_tokens: toBoundedTokens(input.maxTokens),
          response_format:
            input.responseFormat === "json"
              ? { type: "json_object" }
              : undefined,
          messages: [
            {
              role: "system",
              content:
                input.systemPrompt ||
                "You are a backend automation assistant. Respond clearly and accurately.",
            },
            {
              role: "user",
              content: input.userPrompt,
            },
          ],
        }),
      },
    });

    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    } & Record<string, unknown>;
    if (!response.ok) {
      throw new AiEngineError({
        code: "provider_error",
        statusCode: response.status,
        retryable: response.status >= 500 || response.status === 429,
        message:
          body.error?.message ||
          `AI provider request failed (${response.status}).`,
        details: {
          providerKey: config.providerKey,
          providerType: config.providerType,
        },
      });
    }

    const text = parseOpenAiText(body);
    if (!text) {
      throw new AiEngineError({
        code: "provider_error",
        statusCode: 502,
        message: "AI provider returned empty content.",
      });
    }
    return {
      text,
      model: config.model || "gpt-4o-mini",
      raw: redactSensitiveRecord(body),
    };
  }
}

class OllamaProvider implements AiProvider {
  readonly type: AiProviderType = "ollama";

  async generate(
    config: ResolvedAiProviderConfig,
    input: AiProviderGenerateInput,
  ): Promise<AiProviderGenerateResult> {
    const endpoint =
      config.endpoint?.trim() || "http://127.0.0.1:11434";
    const url = endpoint.endsWith("/api/generate")
      ? endpoint
      : `${endpoint.replace(/\/$/, "")}/api/generate`;

    const response = await fetchWithTimeout({
      url,
      timeoutMs: toBoundedTimeout(config.timeoutMs),
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...config.headers,
        },
        body: JSON.stringify({
          model: config.model || "llama3.1",
          prompt: joinPrompt(input),
          stream: false,
          format: input.responseFormat === "json" ? "json" : undefined,
          options: {
            temperature: clampTemperature(input.temperature),
            num_predict: toBoundedTokens(input.maxTokens),
          },
        }),
      },
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new AiEngineError({
        code: "provider_error",
        statusCode: response.status,
        retryable: response.status >= 500 || response.status === 429,
        message: `Ollama provider request failed (${response.status}).`,
      });
    }
    const text = parseOllamaText(body);
    if (!text) {
      throw new AiEngineError({
        code: "provider_error",
        statusCode: 502,
        message: "Ollama provider returned empty content.",
      });
    }
    return {
      text,
      model: config.model || "llama3.1",
      raw: redactSensitiveRecord(body),
    };
  }
}

export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  constructor() {
    this.registerProvider(new HeuristicProvider());
    this.registerProvider(new OpenAiCompatibleProvider());
    this.registerProvider(new OllamaProvider());
    this.providers.set("custom", this.providers.get("openai_compatible") as AiProvider);
  }

  registerProvider(provider: AiProvider): void {
    this.providers.set(provider.type, provider);
  }

  hasProvider(providerType: string): boolean {
    return this.providers.has(providerType);
  }

  async generate(input: {
    config: ResolvedAiProviderConfig;
    request: AiProviderGenerateInput;
  }): Promise<AiProviderGenerateResult> {
    const provider = this.providers.get(input.config.providerType);
    if (!provider) {
      throw new AiEngineError({
        code: "provider_error",
        statusCode: 400,
        message: `Unsupported AI provider type "${sanitizeSensitiveMessage(input.config.providerType)}".`,
      });
    }
    return provider.generate(input.config, input.request);
  }
}

