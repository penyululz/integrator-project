import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginLoader } from "./plugin-loader";

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeAdapterModule(
  adapterDir: string,
  exportName: string,
  adapterKey: string,
  triggers: string[],
  actions: string[],
): void {
  const srcDir = path.join(adapterDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const code = `
class ${exportName} {
  constructor() {
    this.key = ${JSON.stringify(adapterKey)};
    this.version = "1.0.0";
  }
  async init() {}
  async authenticate() { return {}; }
  async listTriggers() {
    return ${JSON.stringify(triggers)}.map((key) => ({
      key,
      name: key,
      description: key,
      inputSchema: {},
    }));
  }
  async listActions() {
    return ${JSON.stringify(actions)}.map((key) => ({
      key,
      name: key,
      description: key,
      inputSchema: {},
    }));
  }
  async runTrigger() { return { events: [] }; }
  async runAction() { return { success: true, output: {} }; }
  async validateConfig() { return { valid: true }; }
  async refreshToken() { return { accessToken: "x" }; }
}
module.exports = { ${exportName} };
`.trim();
  fs.writeFileSync(path.join(srcDir, "index.js"), code, "utf8");
}

function writeManifest(
  adapterDir: string,
  input: Record<string, unknown>,
): void {
  fs.writeFileSync(
    path.join(adapterDir, "manifest.json"),
    JSON.stringify(input, null, 2),
    "utf8",
  );
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("PluginLoader manifest discovery", () => {
  it("loads a valid manifest and registers adapter metadata", async () => {
    const tempDir = createTempDir("plugin-loader-valid-");
    tempDirs.push(tempDir);
    const adapterDir = path.join(tempDir, "sample");
    fs.mkdirSync(adapterDir, { recursive: true });

    writeAdapterModule(adapterDir, "SampleAdapter", "sample", ["incoming"], ["act"]);
    writeManifest(adapterDir, {
      schemaVersion: "1.0",
      key: "sample",
      displayName: "Sample Adapter",
      version: "1.0.0",
      description: "Sample adapter for tests.",
      entry: "./src/index.js",
      exportName: "SampleAdapter",
      auth: { type: "none" },
      supportedTriggers: ["incoming"],
      supportedActions: ["act"],
      defaultEnabled: true,
      platform: {
        apiVersion: "v1",
        minCoreVersion: "1.0.0",
      },
    });

    const loader = new PluginLoader();
    const results = await loader.loadFromManifests({
      baseDir: tempDir,
      platformVersion: "1.0.0",
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("loaded");
    expect(loader.list()).toHaveLength(1);
    expect(loader.listMetadata()).toEqual([
      expect.objectContaining({
        key: "sample",
        displayName: "Sample Adapter",
        authType: "none",
        supportedTriggers: ["incoming"],
        supportedActions: ["act"],
      }),
    ]);
  });

  it("rejects an invalid manifest", async () => {
    const tempDir = createTempDir("plugin-loader-invalid-");
    tempDirs.push(tempDir);
    const adapterDir = path.join(tempDir, "invalid");
    fs.mkdirSync(adapterDir, { recursive: true });

    writeAdapterModule(adapterDir, "InvalidAdapter", "invalid", [], []);
    writeManifest(adapterDir, {
      schemaVersion: "1.0",
      displayName: "Missing key field",
      version: "1.0.0",
      description: "Invalid manifest missing key.",
      entry: "./src/index.js",
      auth: { type: "none" },
      supportedTriggers: [],
      supportedActions: [],
      platform: { apiVersion: "v1" },
    });

    const loader = new PluginLoader();
    const results = await loader.loadFromManifests({
      baseDir: tempDir,
      platformVersion: "1.0.0",
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("invalid");
    expect(loader.list()).toHaveLength(0);
  });

  it("rejects duplicate adapter keys", async () => {
    const tempDir = createTempDir("plugin-loader-duplicate-");
    tempDirs.push(tempDir);
    const firstDir = path.join(tempDir, "first");
    const secondDir = path.join(tempDir, "second");
    fs.mkdirSync(firstDir, { recursive: true });
    fs.mkdirSync(secondDir, { recursive: true });

    writeAdapterModule(firstDir, "FirstAdapter", "dup", [], ["a1"]);
    writeManifest(firstDir, {
      schemaVersion: "1.0",
      key: "dup",
      displayName: "First Duplicate",
      version: "1.0.0",
      description: "first",
      entry: "./src/index.js",
      exportName: "FirstAdapter",
      auth: { type: "none" },
      supportedTriggers: [],
      supportedActions: ["a1"],
      platform: { apiVersion: "v1", minCoreVersion: "1.0.0" },
    });

    writeAdapterModule(secondDir, "SecondAdapter", "dup", [], ["a1"]);
    writeManifest(secondDir, {
      schemaVersion: "1.0",
      key: "dup",
      displayName: "Second Duplicate",
      version: "1.0.0",
      description: "second",
      entry: "./src/index.js",
      exportName: "SecondAdapter",
      auth: { type: "none" },
      supportedTriggers: [],
      supportedActions: ["a1"],
      platform: { apiVersion: "v1", minCoreVersion: "1.0.0" },
    });

    const loader = new PluginLoader();
    const results = await loader.loadFromManifests({
      baseDir: tempDir,
      platformVersion: "1.0.0",
    });

    expect(results.filter((entry) => entry.status === "loaded")).toHaveLength(1);
    expect(results.filter((entry) => entry.status === "invalid")).toHaveLength(1);
    expect(loader.list()).toHaveLength(1);
  });

  it("does not load disabled plugins", async () => {
    const tempDir = createTempDir("plugin-loader-disabled-");
    tempDirs.push(tempDir);
    const adapterDir = path.join(tempDir, "disabled");
    fs.mkdirSync(adapterDir, { recursive: true });

    writeAdapterModule(adapterDir, "DisabledAdapter", "disabled", [], ["noop"]);
    writeManifest(adapterDir, {
      schemaVersion: "1.0",
      key: "disabled",
      displayName: "Disabled Adapter",
      version: "1.0.0",
      description: "disabled adapter",
      entry: "./src/index.js",
      exportName: "DisabledAdapter",
      auth: { type: "none" },
      supportedTriggers: [],
      supportedActions: ["noop"],
      enabled: false,
      platform: { apiVersion: "v1", minCoreVersion: "1.0.0" },
    });

    const loader = new PluginLoader();
    const results = await loader.loadFromManifests({
      baseDir: tempDir,
      platformVersion: "1.0.0",
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("disabled");
    expect(loader.list()).toHaveLength(0);
    expect(loader.listInstalledManifests()).toHaveLength(1);
    expect(loader.listInstalledManifests()[0].enabled).toBe(false);
  });
});
