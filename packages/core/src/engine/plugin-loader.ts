import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Adapter } from "@integration/shared";
import {
  isManifestCompatible,
  validateAdapterManifest,
  type AdapterManifest,
} from "./plugin-manifest";

const localRequire = createRequire(__filename);

export type AdapterFactory = () => Adapter;

export type PluginLoadStatus = "loaded" | "disabled" | "invalid";

export type PluginLoadResult = {
  status: PluginLoadStatus;
  key?: string;
  manifestPath: string;
  reason?: string;
};

export type PluginDiscoveryOptions = {
  baseDir: string;
  platformVersion: string;
  enabledKeys?: Set<string>;
  disabledKeys?: Set<string>;
  continueOnError?: boolean;
};

export type RegisteredAdapterMetadata = {
  key: string;
  displayName: string;
  version: string;
  description: string;
  authType: AdapterManifest["auth"]["type"];
  supportedTriggers: string[];
  supportedActions: string[];
  enabled: true;
  manifestPath: string;
  entry: string;
  platform: AdapterManifest["platform"];
};

export type InstalledAdapterManifest = {
  key: string;
  manifestPath: string;
  enabled: boolean;
  manifest: AdapterManifest;
};

function sanitizeLogMessage(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, "Bearer [redacted]")
    .replace(/(access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function diffMissing(source: string[], target: string[]): string[] {
  const targetSet = new Set(target);
  return source.filter((item) => !targetSet.has(item));
}

function parseCsvSet(input: string | undefined): Set<string> {
  if (!input) {
    return new Set<string>();
  }
  return new Set(
    input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAdapter(value: unknown): value is Adapter {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Adapter>;
  return (
    typeof candidate.key === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.init === "function" &&
    typeof candidate.authenticate === "function" &&
    typeof candidate.listTriggers === "function" &&
    typeof candidate.listActions === "function" &&
    typeof candidate.runTrigger === "function" &&
    typeof candidate.runAction === "function" &&
    typeof candidate.validateConfig === "function" &&
    typeof candidate.refreshToken === "function"
  );
}

function resolveEntryPath(baseDir: string, manifestEntry: string): string {
  if (manifestEntry.startsWith(".") || manifestEntry.startsWith("/") || manifestEntry.includes("\\")) {
    const resolved = path.resolve(baseDir, manifestEntry);
    const normalizedBase = path.resolve(baseDir);
    if (!resolved.startsWith(normalizedBase)) {
      throw new Error("Manifest entry must resolve inside the adapter directory.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`Entry file not found: ${manifestEntry}`);
    }
    return resolved;
  }

  try {
    return localRequire.resolve(manifestEntry);
  } catch {
    throw new Error(`Module entry could not be resolved: ${manifestEntry}`);
  }
}

function instantiateAdapter(
  moduleExports: Record<string, unknown>,
  exportName?: string,
): Adapter {
  if (exportName) {
    const selected = moduleExports[exportName];
    if (typeof selected === "function") {
      const created = new (selected as new () => unknown)();
      if (isAdapter(created)) {
        return created;
      }
    }
    if (isAdapter(selected)) {
      return selected;
    }
    throw new Error(`Configured export "${exportName}" is not a valid adapter.`);
  }

  if (isAdapter(moduleExports.default)) {
    return moduleExports.default;
  }
  if (typeof moduleExports.default === "function") {
    const created = new (moduleExports.default as new () => unknown)();
    if (isAdapter(created)) {
      return created;
    }
  }

  for (const exported of Object.values(moduleExports)) {
    if (isAdapter(exported)) {
      return exported;
    }
  }
  for (const exported of Object.values(moduleExports)) {
    if (typeof exported === "function") {
      const created = new (exported as new () => unknown)();
      if (isAdapter(created)) {
        return created;
      }
    }
  }

  throw new Error("No valid adapter export found in entry module.");
}

function resolveManifestEnabledState(input: {
  manifest: AdapterManifest;
  enabledKeys?: Set<string>;
  disabledKeys?: Set<string>;
}): boolean {
  const defaultEnabled = input.manifest.defaultEnabled ?? true;
  const explicitEnabled = input.manifest.enabled;
  let enabled = explicitEnabled ?? defaultEnabled;

  if (input.enabledKeys && input.enabledKeys.size > 0) {
    enabled = input.enabledKeys.has(input.manifest.key);
  }
  if (input.disabledKeys?.has(input.manifest.key)) {
    enabled = false;
  }
  return enabled;
}

type LoadedAdapter = {
  adapter: Adapter;
  manifest: AdapterManifest;
  metadata: RegisteredAdapterMetadata;
};

export class PluginLoader {
  private readonly adapters = new Map<string, LoadedAdapter>();
  private readonly installedManifests = new Map<string, InstalledAdapterManifest>();
  private loadResults: PluginLoadResult[] = [];

  register(
    adapter: Adapter,
    manifest?: AdapterManifest,
    manifestPath = "manual://runtime",
  ): void {
    if (this.adapters.has(adapter.key)) {
      throw new Error(`Adapter "${adapter.key}" is already registered.`);
    }

    const normalizedManifest: AdapterManifest =
      manifest ||
      ({
        schemaVersion: "1.0",
        key: adapter.key,
        displayName: adapter.key,
        version: adapter.version,
        description: `Manually registered adapter "${adapter.key}".`,
        entry: "manual://runtime",
        auth: {
          type: "custom",
        },
        supportedTriggers: [],
        supportedActions: [],
        platform: {
          apiVersion: "v1",
          minCoreVersion: "1.0.0",
        },
      } satisfies AdapterManifest);

    this.adapters.set(adapter.key, {
      adapter,
      manifest: normalizedManifest,
      metadata: {
        key: normalizedManifest.key,
        displayName: normalizedManifest.displayName,
        version: normalizedManifest.version,
        description: normalizedManifest.description,
        authType: normalizedManifest.auth.type,
        supportedTriggers: uniqueSorted(normalizedManifest.supportedTriggers),
        supportedActions: uniqueSorted(normalizedManifest.supportedActions),
        enabled: true,
        manifestPath,
        entry: normalizedManifest.entry,
        platform: normalizedManifest.platform,
      },
    });
  }

  list(): Adapter[] {
    return [...this.adapters.values()].map((loaded) => loaded.adapter);
  }

  listMetadata(): RegisteredAdapterMetadata[] {
    return [...this.adapters.values()]
      .map((loaded) => loaded.metadata)
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  listInstalledManifests(): InstalledAdapterManifest[] {
    return [...this.installedManifests.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }

  getLoadResults(): PluginLoadResult[] {
    return [...this.loadResults];
  }

  get(key: string): Adapter {
    const loaded = this.adapters.get(key);
    if (!loaded) {
      throw new Error(`Adapter "${key}" is not registered.`);
    }
    return loaded.adapter;
  }

  async initAll(configByAdapter: Record<string, Record<string, unknown>>): Promise<void> {
    for (const loaded of this.adapters.values()) {
      await loaded.adapter.init(configByAdapter[loaded.adapter.key] || {});
    }
  }

  async loadFromManifests(options: PluginDiscoveryOptions): Promise<PluginLoadResult[]> {
    const continueOnError = options.continueOnError ?? true;
    this.adapters.clear();
    this.installedManifests.clear();
    this.loadResults = [];

    if (!fs.existsSync(options.baseDir)) {
      return [];
    }

    const adapterDirs = fs
      .readdirSync(options.baseDir)
      .map((entry) => path.join(options.baseDir, entry))
      .filter((fullPath) => fs.statSync(fullPath).isDirectory())
      .sort((a, b) => a.localeCompare(b));

    const seenKeys = new Set<string>();
    for (const adapterDir of adapterDirs) {
      const manifestPath = path.join(adapterDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      try {
        const parsedJson = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const manifestValidation = validateAdapterManifest(parsedJson);
        if (!manifestValidation.valid || !manifestValidation.value) {
          this.loadResults.push({
            status: "invalid",
            manifestPath,
            reason: manifestValidation.errors.join("; "),
          });
          if (!continueOnError) {
            throw new Error(manifestValidation.errors.join("; "));
          }
          continue;
        }

        const manifest = manifestValidation.value;
        if (seenKeys.has(manifest.key)) {
          this.loadResults.push({
            status: "invalid",
            key: manifest.key,
            manifestPath,
            reason: `Duplicate adapter key "${manifest.key}".`,
          });
          if (!continueOnError) {
            throw new Error(`Duplicate adapter key "${manifest.key}".`);
          }
          continue;
        }
        seenKeys.add(manifest.key);

        const compatibility = isManifestCompatible(manifest, options.platformVersion);
        if (!compatibility.compatible) {
          this.loadResults.push({
            status: "invalid",
            key: manifest.key,
            manifestPath,
            reason: compatibility.reason || "Incompatible platform version.",
          });
          if (!continueOnError) {
            throw new Error(compatibility.reason || "Incompatible platform version.");
          }
          continue;
        }

        const enabled = resolveManifestEnabledState({
          manifest,
          enabledKeys: options.enabledKeys,
          disabledKeys: options.disabledKeys,
        });

        this.installedManifests.set(manifest.key, {
          key: manifest.key,
          manifestPath,
          enabled,
          manifest,
        });

        if (!enabled) {
          this.loadResults.push({
            status: "disabled",
            key: manifest.key,
            manifestPath,
            reason: "Adapter is disabled by manifest or runtime config.",
          });
          continue;
        }

        const resolvedEntry = resolveEntryPath(adapterDir, manifest.entry);
        const moduleExports = localRequire(resolvedEntry) as Record<string, unknown>;
        const adapter = instantiateAdapter(moduleExports, manifest.exportName);

        if (adapter.key !== manifest.key) {
          throw new Error(
            `Manifest key "${manifest.key}" does not match adapter key "${adapter.key}".`,
          );
        }

        const [declaredTriggers, declaredActions] = [
          uniqueSorted(manifest.supportedTriggers),
          uniqueSorted(manifest.supportedActions),
        ];
        const [implementedTriggers, implementedActions] = [
          uniqueSorted((await adapter.listTriggers()).map((trigger) => trigger.key)),
          uniqueSorted((await adapter.listActions()).map((action) => action.key)),
        ];

        const missingDeclaredTriggers = diffMissing(implementedTriggers, declaredTriggers);
        const missingDeclaredActions = diffMissing(implementedActions, declaredActions);
        const unknownDeclaredTriggers = diffMissing(declaredTriggers, implementedTriggers);
        const unknownDeclaredActions = diffMissing(declaredActions, implementedActions);

        if (
          missingDeclaredTriggers.length > 0 ||
          missingDeclaredActions.length > 0 ||
          unknownDeclaredTriggers.length > 0 ||
          unknownDeclaredActions.length > 0
        ) {
          throw new Error(
            [
              missingDeclaredTriggers.length
                ? `Manifest missing trigger declarations: ${missingDeclaredTriggers.join(", ")}`
                : "",
              missingDeclaredActions.length
                ? `Manifest missing action declarations: ${missingDeclaredActions.join(", ")}`
                : "",
              unknownDeclaredTriggers.length
                ? `Manifest declares unknown triggers: ${unknownDeclaredTriggers.join(", ")}`
                : "",
              unknownDeclaredActions.length
                ? `Manifest declares unknown actions: ${unknownDeclaredActions.join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join("; "),
          );
        }

        this.register(adapter, manifest, manifestPath);
        this.loadResults.push({
          status: "loaded",
          key: manifest.key,
          manifestPath,
        });
      } catch (error) {
        const message = sanitizeLogMessage((error as Error).message);
        this.loadResults.push({
          status: "invalid",
          manifestPath,
          reason: message,
        });
        if (!continueOnError) {
          throw new Error(message);
        }
      }
    }

    return this.getLoadResults();
  }
}

export function parseEnabledAdapterSetFromEnv(
  envValue: string | undefined,
): Set<string> {
  return parseCsvSet(envValue);
}
