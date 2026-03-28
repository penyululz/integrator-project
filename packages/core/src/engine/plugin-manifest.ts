import {
  validateAdapterManifest as validateAdapterManifestWithSdk,
  type AdapterAuthType,
  type AdapterManifest,
} from "@integration/shared";

export type { AdapterManifest, AdapterAuthType };

export function validateAdapterManifest(input: unknown): {
  valid: boolean;
  errors: string[];
  value?: AdapterManifest;
} {
  return validateAdapterManifestWithSdk(input);
}

type ParsedSemver = [number, number, number];

function parseSemver(version: string): ParsedSemver | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a[0] !== b[0]) {
    return a[0] - b[0];
  }
  if (a[1] !== b[1]) {
    return a[1] - b[1];
  }
  return a[2] - b[2];
}

export function isManifestCompatible(
  manifest: AdapterManifest,
  platformVersion: string,
): { compatible: boolean; reason?: string } {
  const platform = parseSemver(platformVersion);
  if (!platform) {
    return {
      compatible: false,
      reason: `Invalid platform version "${platformVersion}".`,
    };
  }

  if (manifest.platform.minCoreVersion) {
    const min = parseSemver(manifest.platform.minCoreVersion);
    if (!min) {
      return {
        compatible: false,
        reason: `Manifest minCoreVersion "${manifest.platform.minCoreVersion}" is invalid semver.`,
      };
    }
    if (compareSemver(platform, min) < 0) {
      return {
        compatible: false,
        reason: `Adapter requires core >= ${manifest.platform.minCoreVersion}.`,
      };
    }
  }

  if (manifest.platform.maxCoreVersion) {
    const max = parseSemver(manifest.platform.maxCoreVersion);
    if (!max) {
      return {
        compatible: false,
        reason: `Manifest maxCoreVersion "${manifest.platform.maxCoreVersion}" is invalid semver.`,
      };
    }
    if (compareSemver(platform, max) > 0) {
      return {
        compatible: false,
        reason: `Adapter supports core <= ${manifest.platform.maxCoreVersion}.`,
      };
    }
  }

  return {
    compatible: true,
  };
}
