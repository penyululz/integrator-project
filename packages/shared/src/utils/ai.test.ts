import { describe, expect, it, vi } from "vitest";
import {
  classifyText,
  extractKeyPoints,
  generateContent,
  rewriteContent,
  summarizeText,
  summarizeUrl,
  transformContent,
} from "./ai";

describe("ai utilities", () => {
  it("generates fallback content without API key", async () => {
    const result = await generateContent({
      prompt: "Write a short launch update for creators",
      tone: "confident",
      options: {
        apiKey: "",
      },
    });

    expect(result.usedFallback).toBe(true);
    expect(result.provider).toBe("heuristic");
    expect(result.text.toLowerCase()).toContain("launch");
  });

  it("summarizes text and rewrites content", async () => {
    const summary = await summarizeText({
      text: "Integrator helps teams connect apps. It runs workflows reliably. It supports retries and audit visibility.",
      maxSentences: 2,
      options: {
        apiKey: "",
      },
    });
    const rewrite = await rewriteContent({
      text: summary.text,
      instruction: "Rewrite for non-technical users",
      style: "simple",
      options: {
        apiKey: "",
      },
    });

    expect(summary.text.length).toBeGreaterThan(10);
    expect(rewrite.text.toLowerCase()).toContain("rewrite");
  });

  it("summarizes URL content with mocked fetch", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        "<html><head><title>Launch Notes</title></head><body><h1>Integrator release</h1><p>New AI creator tools and smoother onboarding.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    ) as unknown as typeof fetch;

    const result = await summarizeUrl({
      url: "https://example.com/post",
      options: {
        fetchImpl: mockFetch,
        apiKey: "",
      },
    });

    expect(result.url).toBe("https://example.com/post");
    expect(result.title).toBe("Launch Notes");
    expect(result.text.length).toBeGreaterThan(8);
  });

  it("extracts key points and classifies text", async () => {
    const points = await extractKeyPoints({
      text: "Users connect Slack quickly. They run templates. They inspect runs and alerts.",
      maxPoints: 3,
      options: { apiKey: "" },
    });
    const classification = await classifyText({
      text: "This flow sends chat notifications to Slack channels.",
      labels: ["support", "marketing", "operations"],
      options: { apiKey: "" },
    });

    expect(points.points.length).toBeGreaterThan(0);
    expect(points.points.length).toBeLessThanOrEqual(3);
    expect(["support", "marketing", "operations"]).toContain(classification.label);
    expect(classification.confidence).toBeGreaterThan(0);
  });

  it("supports transform formatting helpers", async () => {
    const result = await transformContent({
      text: "Webhook trigger receives event data. AI summarizes details. Slack message is posted.",
      targetFormat: "bullet_list",
      options: {
        apiKey: "",
      },
    });

    expect(result.text).toContain("-");
  });

  it("uses OpenAI provider when API key is available", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "AI generated response.",
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const result = await generateContent({
      prompt: "Write one line",
      options: {
        apiKey: "test-key",
        fetchImpl: mockFetch,
      },
    });

    expect(result.provider).toBe("openai");
    expect(result.usedFallback).toBe(false);
    expect(result.text).toBe("AI generated response.");
  });
});
