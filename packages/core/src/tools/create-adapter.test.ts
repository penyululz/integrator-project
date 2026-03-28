import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validateAdapterManifest } from "@integration/shared";
import {
  parseCreateAdapterArgs,
  scaffoldAdapter,
} from "./create-adapter";

const tempDirs: string[] = [];

function createTempAdaptersRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  }
});

describe("create-adapter generator", () => {
  it("parses required args", () => {
    const parsed = parseCreateAdapterArgs([
      "--name",
      "My Adapter",
      "--force",
    ]);
    expect(parsed.name).toBe("My Adapter");
    expect(parsed.force).toBe(true);
  });

  it("creates expected scaffold files and a valid manifest", () => {
    const adaptersRoot = createTempAdaptersRoot("tmp-adapter-gen-");
    const result = scaffoldAdapter({
      name: "My Adapter",
      adaptersRootDir: adaptersRoot,
    });

    expect(result.adapterKey).toBe("my-adapter");
    expect(fs.existsSync(path.join(result.adapterDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.adapterDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.adapterDir, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(result.adapterDir, "src", "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(result.adapterDir, "src", "index.test.ts"))).toBe(
      true,
    );

    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.adapterDir, "manifest.json"), "utf8"),
    );
    const validation = validateAdapterManifest(manifest);
    expect(validation.valid).toBe(true);
    expect(validation.value?.supportedTriggers).toContain("sample_trigger");
    expect(validation.value?.displayName).toBe("My Adapter");
    expect(validation.value?.exportName).toBe("MyAdapter");
  });

  it("safely rejects duplicate adapter keys without --force", () => {
    const adaptersRoot = createTempAdaptersRoot("tmp-adapter-duplicate-");
    scaffoldAdapter({
      name: "duplicate",
      adaptersRootDir: adaptersRoot,
    });

    expect(() =>
      scaffoldAdapter({
        name: "duplicate",
        adaptersRootDir: adaptersRoot,
      }),
    ).toThrow(/already exists/i);
  });

  it("loads generated adapter module and exposes clear TODO behavior", async () => {
    const adaptersRoot = path.resolve(
      __dirname,
      "../../../adapters",
    );
    const adapterName = `loadable-adapter-${Date.now()}`;
    const result = scaffoldAdapter({
      name: adapterName,
      adaptersRootDir: adaptersRoot,
    });
    tempDirs.push(result.adapterDir);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.adapterDir, "manifest.json"), "utf8"),
    ) as {
      entry: string;
      exportName: string;
    };
    const modulePath = path.join(
      result.adapterDir,
      manifest.entry.replace(/^\.\//, ""),
    );
    const adapterModule = await import(pathToFileURL(modulePath).href);
    const AdapterCtor = adapterModule[manifest.exportName] as new () => {
      init: (config: Record<string, unknown>) => Promise<void>;
      listTriggers: () => Promise<Array<{ key: string }>>;
      listActions: () => Promise<Array<{ key: string }>>;
      refreshToken: (
        currentCredentials: Record<string, unknown>,
        context: {
          tenantId: string;
          workspaceId: string;
          organizationId: string;
          requestId?: string;
        },
      ) => Promise<unknown>;
    };
    expect(typeof AdapterCtor).toBe("function");

    const adapter = new AdapterCtor();
    await adapter.init({});
    const triggers = await adapter.listTriggers();
    const actions = await adapter.listActions();
    expect(triggers.map((trigger) => trigger.key)).toContain("sample_trigger");
    expect(actions.map((action) => action.key)).toContain("sample_action");

    await expect(
      adapter.refreshToken({}, {
        tenantId: "tenant-test",
        workspaceId: "workspace-test",
        organizationId: "organization-test",
        requestId: "req-test",
      }),
    ).rejects.toThrow(/not implemented/i);
  });

  it("avoids duplicate adapter suffixes in generated naming", () => {
    const adaptersRoot = createTempAdaptersRoot("tmp-adapter-suffix-");
    const result = scaffoldAdapter({
      name: "sample-generated-adapter",
      adaptersRootDir: adaptersRoot,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.adapterDir, "manifest.json"), "utf8"),
    );
    expect(manifest.displayName).toBe("Sample Generated Adapter");
    expect(manifest.exportName).toBe("SampleGeneratedAdapter");
  });
});
