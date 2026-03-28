import Ajv, { JSONSchemaType } from "ajv";

export type AdapterAuthType =
  | "none"
  | "oauth2"
  | "api_key"
  | "basic"
  | "smtp"
  | "token"
  | "custom";

export type AdapterManifest = {
  schemaVersion: "1.0";
  key: string;
  displayName: string;
  version: string;
  description: string;
  entry: string;
  exportName?: string;
  auth: {
    type: AdapterAuthType;
    scopes?: string[];
  };
  supportedTriggers: string[];
  supportedActions: string[];
  configSchemaRef?: string;
  enabled?: boolean;
  defaultEnabled?: boolean;
  platform: {
    apiVersion: string;
    minCoreVersion?: string;
    maxCoreVersion?: string;
  };
};

const manifestSchema: JSONSchemaType<AdapterManifest> = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["1.0"] },
    key: { type: "string", minLength: 1 },
    displayName: { type: "string", minLength: 1 },
    version: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    entry: { type: "string", minLength: 1 },
    exportName: { type: "string", nullable: true },
    auth: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["none", "oauth2", "api_key", "basic", "smtp", "token", "custom"],
        },
        scopes: {
          type: "array",
          nullable: true,
          items: {
            type: "string",
          },
        },
      },
      required: ["type"],
      additionalProperties: false,
    },
    supportedTriggers: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
    },
    supportedActions: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
    },
    configSchemaRef: {
      type: "string",
      nullable: true,
    },
    enabled: {
      type: "boolean",
      nullable: true,
    },
    defaultEnabled: {
      type: "boolean",
      nullable: true,
    },
    platform: {
      type: "object",
      properties: {
        apiVersion: {
          type: "string",
          minLength: 1,
        },
        minCoreVersion: {
          type: "string",
          nullable: true,
        },
        maxCoreVersion: {
          type: "string",
          nullable: true,
        },
      },
      required: ["apiVersion"],
      additionalProperties: false,
    },
  },
  required: [
    "schemaVersion",
    "key",
    "displayName",
    "version",
    "description",
    "entry",
    "auth",
    "supportedTriggers",
    "supportedActions",
    "platform",
  ],
  additionalProperties: false,
};

const ajv = new Ajv({
  allErrors: true,
});
const validateManifest = ajv.compile(manifestSchema);

export function validateAdapterManifest(input: unknown): {
  valid: boolean;
  errors: string[];
  value?: AdapterManifest;
} {
  const valid = validateManifest(input);
  if (valid) {
    return {
      valid: true,
      errors: [],
      value: input as AdapterManifest,
    };
  }
  return {
    valid: false,
    errors:
      validateManifest.errors?.map(
        (error) => `${error.instancePath || "/"} ${error.message || "invalid"}`,
      ) || ["Invalid manifest."],
  };
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
