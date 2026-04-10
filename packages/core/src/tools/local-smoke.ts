import "dotenv/config";
import {
  PLATFORM_MODES,
  resolvePlatformModeFromEnv,
  type PlatformMode,
} from "@integration/shared";

type SmokeOptions = {
  apiBaseUrl: string;
  expectedMode: PlatformMode;
  organizationSlug: string;
  workspaceSlug: string;
  email: string;
  password: string;
};

type HealthResponse = {
  mode?: PlatformMode;
  modeSource?: string;
  queue?: {
    activeDriver?: string;
    configuredDriver?: string;
    usingFallback?: boolean;
  };
};

type SessionResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  user: {
    email: string;
  };
  scope: {
    organizationSlug: string;
    workspaceSlug: string;
  };
};

function toMode(value: string | undefined): PlatformMode | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "prototype" ||
    normalized === "prototype mode" ||
    normalized === "prototype-mode"
  ) {
    return PLATFORM_MODES.PROTOTYPE;
  }
  if (normalized === "live" || normalized === "live mode" || normalized === "live-mode") {
    return PLATFORM_MODES.LIVE;
  }
  return null;
}

function readArgValue(name: string): string | undefined {
  const token = `--${name}`;
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (part === token) {
      return argv[index + 1];
    }
    if (part.startsWith(`${token}=`)) {
      return part.slice(token.length + 1);
    }
  }
  return undefined;
}

function resolveOptions(): SmokeOptions {
  const modeResolution = resolvePlatformModeFromEnv(
    process.env as Record<string, string | undefined>,
  );
  const expectedMode =
    toMode(readArgValue("mode")) ||
    toMode(process.env.INTEGRATOR_MODE) ||
    modeResolution.mode;
  const apiBaseUrl =
    readArgValue("api-base-url") ||
    process.env.LOCAL_API_BASE_URL ||
    "http://localhost:4000/api/v1";

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
    expectedMode,
    organizationSlug:
      readArgValue("organization") || process.env.LOCAL_ORG_SLUG || "prototype-org",
    workspaceSlug:
      readArgValue("workspace") || process.env.LOCAL_WORKSPACE_SLUG || "default",
    email: readArgValue("email") || process.env.LOCAL_LOGIN_EMAIL || "admin@example.com",
    password:
      readArgValue("password") || process.env.LOCAL_LOGIN_PASSWORD || "dev-password",
  };
}

async function requestJson<T>(input: {
  method?: "GET" | "POST";
  url: string;
  token?: string;
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(input.url, {
    method: input.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `[local:smoke] ${input.method || "GET"} ${input.url} failed with ${response.status}: ${text}`,
    );
  }

  return (await response.json()) as T;
}

function getRowCount(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return 0;
  }
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.rows)) {
    return record.rows.length;
  }
  if (Array.isArray(record.runs)) {
    return record.runs.length;
  }
  if (Array.isArray(record.workflows)) {
    return record.workflows.length;
  }
  if (Array.isArray(record.integrations)) {
    return record.integrations.length;
  }
  return 0;
}

async function runSmoke(): Promise<void> {
  const options = resolveOptions();
  console.log(`[local:smoke] API base: ${options.apiBaseUrl}`);
  console.log(`[local:smoke] expected mode: ${options.expectedMode}`);

  const health = await requestJson<HealthResponse>({
    url: `${options.apiBaseUrl}/health`,
  });

  const detectedMode = health.mode || "unknown";
  console.log(
    `[local:smoke] health mode=${detectedMode} source=${health.modeSource || "unknown"} queue=${health.queue?.activeDriver || "unknown"}`,
  );
  if (health.mode && health.mode !== options.expectedMode) {
    throw new Error(
      `[local:smoke] mode mismatch. expected=${options.expectedMode} actual=${health.mode}`,
    );
  }

  const loginEndpoint =
    options.expectedMode === PLATFORM_MODES.PROTOTYPE ? "/auth/dev-login" : "/auth/login";
  const session =
    options.expectedMode === PLATFORM_MODES.PROTOTYPE
      ? await requestJson<SessionResponse>({
          method: "POST",
          url: `${options.apiBaseUrl}${loginEndpoint}`,
          body: {
            organizationSlug: options.organizationSlug,
            workspaceSlug: options.workspaceSlug,
          },
        })
      : await requestJson<SessionResponse>({
          method: "POST",
          url: `${options.apiBaseUrl}${loginEndpoint}`,
          body: {
            email: options.email,
            password: options.password,
            organizationSlug: options.organizationSlug,
            workspaceSlug: options.workspaceSlug,
          },
        });

  const token = session.accessToken;
  console.log(
    `[local:smoke] login ok as ${session.user.email} (${session.scope.organizationSlug}/${session.scope.workspaceSlug})`,
  );

  const me = await requestJson<Record<string, unknown>>({
    url: `${options.apiBaseUrl}/auth/me`,
    token,
  });
  if (!("user" in me) || !("scope" in me)) {
    throw new Error("[local:smoke] /auth/me did not return expected shape.");
  }

  const workflows = await requestJson<Record<string, unknown>>({
    url: `${options.apiBaseUrl}/workflows?limit=5`,
    token,
  });
  const integrations = await requestJson<Record<string, unknown>>({
    url: `${options.apiBaseUrl}/integrations?limit=5`,
    token,
  });
  const runs = await requestJson<Record<string, unknown>>({
    url: `${options.apiBaseUrl}/runs?limit=5`,
    token,
  });
  await requestJson<Record<string, unknown>>({
    url: `${options.apiBaseUrl}/alerts/config?limit=5`,
    token,
  });
  await requestJson<Record<string, unknown>>({
    url: `${options.apiBaseUrl}/audit-logs?limit=5`,
    token,
  });

  console.log(
    `[local:smoke] workflows=${getRowCount(workflows)} integrations=${getRowCount(integrations)} runs=${getRowCount(runs)}`,
  );
  console.log("[local:smoke] smoke checks passed.");
  if (options.expectedMode === PLATFORM_MODES.LIVE) {
    console.log(
      "[local:smoke] Live Mode note: OAuth callback providers still require valid app registration and (for external providers) callback-reachable host/domain.",
    );
  }
}

runSmoke().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
