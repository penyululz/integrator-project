import { describe, expect, it } from "vitest";
import {
  formatHeadersJson,
  formatRecipientsCsv,
  parseHeadersJson,
  parseRecipientsCsv,
} from "./alert-settings-helpers";

describe("alert settings helpers", () => {
  it("parses and formats recipient CSV values", () => {
    expect(parseRecipientsCsv(" a@example.com, b@example.com ,, ")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(formatRecipientsCsv(["a@example.com", "b@example.com"])).toBe(
      "a@example.com, b@example.com",
    );
  });

  it("parses header JSON and strips authorization header", () => {
    expect(
      parseHeadersJson(
        JSON.stringify({
          "X-App": "integrator",
          Authorization: "Bearer secret",
        }),
      ),
    ).toEqual({
      "X-App": "integrator",
    });
  });

  it("returns empty values for empty headers", () => {
    expect(parseHeadersJson("")).toEqual({});
    expect(formatHeadersJson({})).toBe("");
  });

  it("rejects invalid header JSON", () => {
    expect(() => parseHeadersJson("{ invalid }")).toThrow(
      "Webhook headers must be valid JSON.",
    );
    expect(() => parseHeadersJson('["array"]')).toThrow(
      "Webhook headers must be a key/value object.",
    );
  });
});
