import fs from "node:fs";
import path from "node:path";
import type { Adapter } from "@integration/shared";

export type AdapterFactory = () => Adapter;

export class PluginLoader {
  private readonly adapters = new Map<string, Adapter>();

  register(adapter: Adapter): void {
    this.adapters.set(adapter.key, adapter);
  }

  list(): Adapter[] {
    return [...this.adapters.values()];
  }

  get(key: string): Adapter {
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(`Adapter "${key}" is not registered.`);
    }
    return adapter;
  }

  async initAll(configByAdapter: Record<string, Record<string, unknown>>): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.init(configByAdapter[adapter.key] || {});
    }
  }

  async loadFromManifests(baseDir: string): Promise<void> {
    if (!fs.existsSync(baseDir)) {
      return;
    }

    const adapterDirs = fs
      .readdirSync(baseDir)
      .map((entry) => path.join(baseDir, entry))
      .filter((fullPath) => fs.statSync(fullPath).isDirectory());

    for (const adapterDir of adapterDirs) {
      const manifestPath = path.join(adapterDir, "manifest.json");
      const entryPath = path.join(adapterDir, "src", "index.ts");
      if (!fs.existsSync(manifestPath) || !fs.existsSync(entryPath)) {
        continue;
      }
    }
  }
}

