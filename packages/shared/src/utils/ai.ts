export type AiProvider = "openai" | "heuristic";

export type AiCallOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type AiTextResult = {
  text: string;
  provider: AiProvider;
  model: string;
  usedFallback: boolean;
};

export type GenerateContentInput = {
  prompt: string;
  style?: string;
  audience?: string;
  tone?: string;
  options?: AiCallOptions;
};

export type SummarizeTextInput = {
  text: string;
  maxSentences?: number;
  tone?: "neutral" | "executive" | "casual";
  options?: AiCallOptions;
};

export type SummarizeUrlInput = {
  url: string;
  maxSentences?: number;
  options?: AiCallOptions;
};

export type RewriteContentInput = {
  text: string;
  instruction: string;
  style?: string;
  options?: AiCallOptions;
};

export type TransformContentInput = {
  text: string;
  targetFormat: "bullet_list" | "tweet_thread" | "email" | "paragraph";
  options?: AiCallOptions;
};

export type ExtractKeyPointsInput = {
  text: string;
  maxPoints?: number;
  options?: AiCallOptions;
};

export type ClassifyTextInput = {
  text: string;
  labels: string[];
  options?: AiCallOptions;
};

export type ClassifyTextResult = {
  label: string;
  confidence: number;
  reasoning: string;
  provider: AiProvider;
  model: string;
  usedFallback: boolean;
};

export type ExtractKeyPointsResult = {
  points: string[];
  provider: AiProvider;
  model: string;
  usedFallback: boolean;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

type ResolvedAiOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number | undefined;
  timeoutMs: number;
  fetchImpl: typeof fetch;
};

function toResolvedOptions(input?: AiCallOptions): ResolvedAiOptions {
  const fetchImpl = input?.fetchImpl || globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("Fetch API is required for AI utilities.");
  }

  const timeoutMsRaw = Number(input?.timeoutMs || DEFAULT_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.min(120_000, Math.max(500, Math.floor(timeoutMsRaw)))
      : DEFAULT_TIMEOUT_MS;

  const temperatureRaw = Number(input?.temperature ?? 0.2);
  const temperature = Number.isFinite(temperatureRaw)
    ? Math.min(1, Math.max(0, temperatureRaw))
    : 0.2;

  const maxTokensRaw = input?.maxTokens;
  const maxTokens =
    typeof maxTokensRaw === "number" && Number.isFinite(maxTokensRaw) && maxTokensRaw > 0
      ? Math.floor(maxTokensRaw)
      : undefined;

  return {
    apiKey:
      input?.apiKey ||
      process.env.OPENAI_API_KEY ||
      process.env.AI_API_KEY ||
      "",
    baseUrl:
      input?.baseUrl ||
      process.env.OPENAI_BASE_URL ||
      process.env.AI_BASE_URL ||
      DEFAULT_OPENAI_BASE_URL,
    model:
      input?.model ||
      process.env.OPENAI_MODEL ||
      process.env.AI_MODEL ||
      DEFAULT_OPENAI_MODEL,
    temperature,
    maxTokens,
    timeoutMs,
    fetchImpl,
  };
}

function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function splitSentences(input: string): string[] {
  return compactWhitespace(input)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function heuristicSummary(input: string, maxSentences = 2): string {
  const sentences = splitSentences(input);
  if (sentences.length === 0) {
    return compactWhitespace(input).slice(0, 180);
  }
  return sentences.slice(0, Math.max(1, maxSentences)).join(" ");
}

function heuristicRewrite(input: {
  text: string;
  instruction: string;
  style?: string;
}): string {
  const normalizedText = compactWhitespace(input.text);
  const normalizedInstruction = compactWhitespace(input.instruction);
  const stylePrefix = input.style ? `${input.style} style: ` : "";
  if (!normalizedText) {
    return `${stylePrefix}${normalizedInstruction}`.trim();
  }
  return `${stylePrefix}${normalizedInstruction}. ${normalizedText}`;
}

function heuristicKeyPoints(text: string, maxPoints = 5): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    const compact = compactWhitespace(text);
    return compact ? [compact] : [];
  }

  const points: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const cleaned = sentence.replace(/^[-*]\s*/, "").trim();
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    points.push(cleaned);
    if (points.length >= maxPoints) {
      break;
    }
  }
  return points;
}

function heuristicClassification(input: ClassifyTextInput): {
  label: string;
  confidence: number;
  reasoning: string;
} {
  const labels = input.labels.filter((label) => label.trim().length > 0);
  if (labels.length === 0) {
    return {
      label: "unclassified",
      confidence: 0,
      reasoning: "No labels provided.",
    };
  }

  const text = compactWhitespace(input.text).toLowerCase();
  const scored = labels.map((label) => {
    const labelWords = label
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    let score = 0;
    for (const word of labelWords) {
      if (text.includes(word)) {
        score += 1;
      }
    }
    return {
      label,
      score,
    };
  });

  scored.sort((left, right) => right.score - left.score);
  const best = scored[0];
  const confidence =
    best.score <= 0 ? 0.35 : Math.min(0.98, 0.55 + best.score * 0.15);
  return {
    label: best.label,
    confidence,
    reasoning:
      best.score > 0
        ? `Matched ${best.score} label keyword(s) from content.`
        : "No strong keyword match; selected first available label.",
  };
}

function stripHtmlContent(html: string): {
  title: string | null;
  text: string;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? compactWhitespace(titleMatch[1]) : null;

  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = compactWhitespace(
    withoutScripts
      .replace(/<\/(p|div|h1|h2|h3|li|br|section|article)>/gi, ". ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">"),
  );
  return {
    title,
    text,
  };
}

async function callOpenAiText(input: {
  systemPrompt: string;
  userPrompt: string;
  options: ResolvedAiOptions;
}): Promise<AiTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.options.timeoutMs);

  try {
    const response = await input.options.fetchImpl(
      `${input.options.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.options.apiKey}`,
        },
        body: JSON.stringify({
          model: input.options.model,
          temperature: input.options.temperature,
          max_tokens: input.options.maxTokens,
          messages: [
            {
              role: "system",
              content: input.systemPrompt,
            },
            {
              role: "user",
              content: input.userPrompt,
            },
          ],
        }),
        signal: controller.signal,
      },
    );

    const body = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    if (!response.ok) {
      throw new Error(body.error?.message || `AI request failed (${response.status}).`);
    }

    const text = compactWhitespace(body.choices?.[0]?.message?.content || "");
    if (!text) {
      throw new Error("AI response did not return content.");
    }

    return {
      text,
      provider: "openai",
      model: input.options.model,
      usedFallback: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function completeText(input: {
  systemPrompt: string;
  userPrompt: string;
  options?: AiCallOptions;
  fallback: () => string;
}): Promise<AiTextResult> {
  const options = toResolvedOptions(input.options);
  if (!options.apiKey) {
    return {
      text: input.fallback(),
      provider: "heuristic",
      model: "heuristic-v1",
      usedFallback: true,
    };
  }

  try {
    return await callOpenAiText({
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      options,
    });
  } catch {
    return {
      text: input.fallback(),
      provider: "heuristic",
      model: "heuristic-v1",
      usedFallback: true,
    };
  }
}

export async function generateContent(
  input: GenerateContentInput,
): Promise<AiTextResult> {
  const prompt = compactWhitespace(input.prompt);
  return completeText({
    systemPrompt:
      "You are an automation content assistant. Produce clear and actionable text.",
    userPrompt: [
      input.audience ? `Audience: ${input.audience}` : "",
      input.style ? `Style: ${input.style}` : "",
      input.tone ? `Tone: ${input.tone}` : "",
      `Prompt: ${prompt}`,
    ]
      .filter(Boolean)
      .join("\n"),
    options: input.options,
    fallback: () =>
      [input.tone ? `${input.tone}:` : "Draft:", prompt]
        .filter(Boolean)
        .join(" "),
  });
}

export async function summarizeText(
  input: SummarizeTextInput,
): Promise<AiTextResult> {
  const maxSentences = Math.min(8, Math.max(1, input.maxSentences || 2));
  const source = compactWhitespace(input.text);
  return completeText({
    systemPrompt: "Summarize text into concise, high-signal output.",
    userPrompt: `Summarize in ${maxSentences} sentence(s). Tone: ${input.tone || "neutral"}.\n\n${source}`,
    options: input.options,
    fallback: () => heuristicSummary(source, maxSentences),
  });
}

export async function summarizeUrl(
  input: SummarizeUrlInput,
): Promise<AiTextResult & { title?: string; url: string }> {
  const options = toResolvedOptions(input.options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(input.url, {
      method: "GET",
      signal: controller.signal,
    });
    const html = await response.text();
    const extracted = stripHtmlContent(html);
    const summary = await summarizeText({
      text: extracted.text || compactWhitespace(html),
      maxSentences: input.maxSentences || 2,
      options: input.options,
    });
    return {
      ...summary,
      title: extracted.title || undefined,
      url: input.url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function rewriteContent(
  input: RewriteContentInput,
): Promise<AiTextResult> {
  return completeText({
    systemPrompt: "Rewrite content according to instruction while preserving intent.",
    userPrompt: `Instruction: ${input.instruction}\nStyle: ${input.style || "clear"}\n\nText:\n${input.text}`,
    options: input.options,
    fallback: () =>
      heuristicRewrite({
        text: input.text,
        instruction: input.instruction,
        style: input.style,
      }),
  });
}

export async function transformContent(
  input: TransformContentInput,
): Promise<AiTextResult> {
  return completeText({
    systemPrompt:
      "Transform content into requested format while keeping facts accurate.",
    userPrompt: `Target format: ${input.targetFormat}\n\nText:\n${input.text}`,
    options: input.options,
    fallback: () => {
      if (input.targetFormat === "bullet_list") {
        return heuristicKeyPoints(input.text, 5).map((point) => `- ${point}`).join("\n");
      }
      if (input.targetFormat === "tweet_thread") {
        const points = heuristicKeyPoints(input.text, 4);
        return points.map((point, index) => `${index + 1}/${points.length} ${point}`).join("\n");
      }
      if (input.targetFormat === "email") {
        return `Subject: Quick update\n\n${heuristicSummary(input.text, 3)}`;
      }
      return heuristicRewrite({
        text: input.text,
        instruction: "Transform into a clean paragraph",
      });
    },
  });
}

export async function extractKeyPoints(
  input: ExtractKeyPointsInput,
): Promise<ExtractKeyPointsResult> {
  const maxPoints = Math.min(12, Math.max(1, input.maxPoints || 5));
  const result = await completeText({
    systemPrompt: "Extract key points from text as concise bullet items.",
    userPrompt: `Extract up to ${maxPoints} key points.\n\n${input.text}`,
    options: input.options,
    fallback: () => heuristicKeyPoints(input.text, maxPoints).join("\n"),
  });

  const points = result.text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*0-9.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, maxPoints);

  return {
    points: points.length > 0 ? points : heuristicKeyPoints(input.text, maxPoints),
    provider: result.provider,
    model: result.model,
    usedFallback: result.usedFallback,
  };
}

export async function classifyText(
  input: ClassifyTextInput,
): Promise<ClassifyTextResult> {
  const sanitizedLabels = input.labels.map((label) => label.trim()).filter(Boolean);
  if (sanitizedLabels.length === 0) {
    return {
      label: "unclassified",
      confidence: 0,
      reasoning: "No labels provided.",
      provider: "heuristic",
      model: "heuristic-v1",
      usedFallback: true,
    };
  }

  const result = await completeText({
    systemPrompt:
      "Classify text into one label from the provided list. Return JSON with label, confidence, reasoning.",
    userPrompt: `Labels: ${sanitizedLabels.join(", ")}\n\nText:\n${input.text}\n\nRespond as JSON.`,
    options: input.options,
    fallback: () => {
      const heuristic = heuristicClassification(input);
      return JSON.stringify(heuristic);
    },
  });

  try {
    const parsed = JSON.parse(result.text) as {
      label?: string;
      confidence?: number;
      reasoning?: string;
    };
    const label = sanitizedLabels.includes(parsed.label || "")
      ? (parsed.label as string)
      : sanitizedLabels[0];
    const confidenceRaw =
      typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    return {
      label,
      confidence: Math.min(1, Math.max(0, confidenceRaw)),
      reasoning: parsed.reasoning || "Classified by AI utility layer.",
      provider: result.provider,
      model: result.model,
      usedFallback: result.usedFallback,
    };
  } catch {
    const heuristic = heuristicClassification(input);
    return {
      ...heuristic,
      provider: "heuristic",
      model: "heuristic-v1",
      usedFallback: true,
    };
  }
}
