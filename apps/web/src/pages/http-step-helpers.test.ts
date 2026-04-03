import { describe, expect, it } from "vitest";
import { parseCurlCommand, toFormattedJson } from "./http-step-helpers";

describe("http-step-helpers", () => {
  it("parses curl command with method headers and json body", () => {
    const parsed = parseCurlCommand(
      `curl -X POST https://api.example.com/orders -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{"id":123}'`,
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.method).toBe("POST");
    expect(parsed?.url).toBe("https://api.example.com/orders");
    expect(parsed?.headers.Authorization).toBe("Bearer token");
    expect(parsed?.body).toEqual({ id: 123 });
  });

  it("returns null when input is not a curl command", () => {
    expect(parseCurlCommand("POST https://api.example.com")).toBeNull();
  });

  it("formats json safely", () => {
    expect(toFormattedJson({ ok: true })).toContain("ok");
    expect(toFormattedJson(undefined)).toBe("{}");
  });
});
