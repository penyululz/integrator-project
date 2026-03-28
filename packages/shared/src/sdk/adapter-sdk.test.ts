import { describe, expect, it } from "vitest";
import type {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "../types/adapter";
import {
  createAdapterTestHarness,
  createConfigValidator,
  defineAction,
  defineAdapterManifest,
  defineTrigger,
  normalizeAdapterKey,
  validateAdapterManifest,
} from "./adapter-sdk";

class SdkTestAdapter implements Adapter {
  readonly key = "sdk-test";
  readonly version = "1.0.0";

  async init(): Promise<void> {}

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {};
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [
      defineTrigger({
        key: "incoming",
        name: "Incoming",
        description: "Incoming trigger",
        inputSchema: {},
      }),
    ];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      defineAction({
        key: "send",
        name: "Send",
        description: "Send action",
        inputSchema: {},
      }),
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

  async runAction(
    _actionKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    return {
      success: true,
    };
  }

  async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
    return {
      valid: true,
    };
  }

  async refreshToken(): Promise<AdapterTokenRefreshResult> {
    return {
      accessToken: "token",
    };
  }
}

describe("adapter SDK", () => {
  it("validates adapter manifests", () => {
    const manifest = defineAdapterManifest({
      schemaVersion: "1.0",
      key: "sdk-test",
      displayName: "SDK Test",
      version: "1.0.0",
      description: "SDK test manifest",
      entry: "./src/index.ts",
      auth: {
        type: "none",
      },
      supportedTriggers: ["incoming"],
      supportedActions: ["send"],
      platform: {
        apiVersion: "v1",
      },
    });
    const validation = validateAdapterManifest(manifest);
    expect(validation.valid).toBe(true);
    expect(validation.value?.key).toBe("sdk-test");

    const invalid = validateAdapterManifest({
      schemaVersion: "1.0",
      displayName: "Missing key",
    });
    expect(invalid.valid).toBe(false);
  });

  it("normalizes adapter keys and validates config rules", async () => {
    expect(normalizeAdapterKey(" My New Adapter ")).toBe("my-new-adapter");

    const validate = createConfigValidator([
      (config) =>
        typeof config.baseUrl === "string" && config.baseUrl.length > 0
          ? undefined
          : "baseUrl is required.",
    ]);
    expect(await validate({})).toEqual({
      valid: false,
      errors: ["baseUrl is required."],
    });
    expect(await validate({ baseUrl: "https://example.com" })).toEqual({
      valid: true,
    });
  });

  it("checks manifest consistency against adapter capabilities", async () => {
    const adapter = new SdkTestAdapter();
    const harness = createAdapterTestHarness(adapter);

    const manifest = defineAdapterManifest({
      schemaVersion: "1.0",
      key: "sdk-test",
      displayName: "SDK Test",
      version: "1.0.0",
      description: "SDK test manifest",
      entry: "./src/index.ts",
      auth: {
        type: "none",
      },
      supportedTriggers: ["incoming"],
      supportedActions: ["send"],
      platform: {
        apiVersion: "v1",
      },
    });

    const result = await harness.validateManifestConsistency(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
