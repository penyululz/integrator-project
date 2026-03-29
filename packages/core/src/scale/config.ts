type AdapterScaleOverrideInput = {
  maxActionsPerWindow?: unknown;
  windowMs?: unknown;
  maxConcurrency?: unknown;
};

export type AdapterScaleOverride = {
  maxActionsPerWindow: number;
  windowMs: number;
  maxConcurrency: number;
};

export type ScaleLimits = {
  maxActiveWorkflowRunsPerWorkspace: number;
  maxQueuedJobsPerWorkspace: number;
  maxScheduledWaitsPerWorkspace: number;
  maxWorkflowsPerWorkspace: number;
  maxActiveRunsPerWorkflow: number;
  fairnessMaxConsecutiveWorkspaceClaims: number;
  maxDeferAttempts: number;
  adapterDefaultRateLimitPerWindow: number;
  adapterRateLimitWindowMs: number;
  adapterDefaultConcurrency: number;
  queueBackpressureWarningThreshold: number;
};

const DEFAULT_SCALE_LIMITS: ScaleLimits = {
  maxActiveWorkflowRunsPerWorkspace: 50,
  maxQueuedJobsPerWorkspace: 500,
  maxScheduledWaitsPerWorkspace: 1_000,
  maxWorkflowsPerWorkspace: 250,
  maxActiveRunsPerWorkflow: 10,
  fairnessMaxConsecutiveWorkspaceClaims: 5,
  maxDeferAttempts: 20,
  adapterDefaultRateLimitPerWindow: 120,
  adapterRateLimitWindowMs: 60_000,
  adapterDefaultConcurrency: 10,
  queueBackpressureWarningThreshold: 0.8,
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function readIntEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampInt(parsed, min, max);
}

function readRatioEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(parsed, 1));
}

function parseAdapterScaleOverrides(
  raw: string | undefined,
  defaults: ScaleLimits,
): Record<string, AdapterScaleOverride> {
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const result: Record<string, AdapterScaleOverride> = {};
  for (const [adapterKey, override] of Object.entries(parsed)) {
    if (!adapterKey) {
      continue;
    }
    if (typeof override !== "object" || override === null || Array.isArray(override)) {
      continue;
    }

    const input = override as AdapterScaleOverrideInput;
    const maxActionsPerWindow = clampInt(
      typeof input.maxActionsPerWindow === "number"
        ? input.maxActionsPerWindow
        : defaults.adapterDefaultRateLimitPerWindow,
      1,
      100_000,
    );
    const windowMs = clampInt(
      typeof input.windowMs === "number"
        ? input.windowMs
        : defaults.adapterRateLimitWindowMs,
      1_000,
      3_600_000,
    );
    const maxConcurrency = clampInt(
      typeof input.maxConcurrency === "number"
        ? input.maxConcurrency
        : defaults.adapterDefaultConcurrency,
      1,
      1_000,
    );

    result[adapterKey] = {
      maxActionsPerWindow,
      windowMs,
      maxConcurrency,
    };
  }

  return result;
}

export function getScaleLimitsFromEnv(): ScaleLimits {
  return {
    maxActiveWorkflowRunsPerWorkspace: readIntEnv(
      "SCALE_MAX_ACTIVE_WORKFLOW_RUNS_PER_WORKSPACE",
      DEFAULT_SCALE_LIMITS.maxActiveWorkflowRunsPerWorkspace,
      1,
      1_000_000,
    ),
    maxQueuedJobsPerWorkspace: readIntEnv(
      "SCALE_MAX_QUEUED_JOBS_PER_WORKSPACE",
      DEFAULT_SCALE_LIMITS.maxQueuedJobsPerWorkspace,
      1,
      1_000_000,
    ),
    maxScheduledWaitsPerWorkspace: readIntEnv(
      "SCALE_MAX_SCHEDULED_WAITS_PER_WORKSPACE",
      DEFAULT_SCALE_LIMITS.maxScheduledWaitsPerWorkspace,
      1,
      1_000_000,
    ),
    maxWorkflowsPerWorkspace: readIntEnv(
      "SCALE_MAX_WORKFLOWS_PER_WORKSPACE",
      DEFAULT_SCALE_LIMITS.maxWorkflowsPerWorkspace,
      1,
      1_000_000,
    ),
    maxActiveRunsPerWorkflow: readIntEnv(
      "SCALE_MAX_ACTIVE_RUNS_PER_WORKFLOW",
      DEFAULT_SCALE_LIMITS.maxActiveRunsPerWorkflow,
      1,
      100_000,
    ),
    fairnessMaxConsecutiveWorkspaceClaims: readIntEnv(
      "SCALE_FAIRNESS_MAX_CONSECUTIVE_WORKSPACE_CLAIMS",
      DEFAULT_SCALE_LIMITS.fairnessMaxConsecutiveWorkspaceClaims,
      1,
      1_000,
    ),
    maxDeferAttempts: readIntEnv(
      "SCALE_MAX_DEFER_ATTEMPTS",
      DEFAULT_SCALE_LIMITS.maxDeferAttempts,
      1,
      1_000,
    ),
    adapterDefaultRateLimitPerWindow: readIntEnv(
      "SCALE_ADAPTER_DEFAULT_RATE_LIMIT_PER_WINDOW",
      DEFAULT_SCALE_LIMITS.adapterDefaultRateLimitPerWindow,
      1,
      1_000_000,
    ),
    adapterRateLimitWindowMs: readIntEnv(
      "SCALE_ADAPTER_RATE_LIMIT_WINDOW_MS",
      DEFAULT_SCALE_LIMITS.adapterRateLimitWindowMs,
      1_000,
      3_600_000,
    ),
    adapterDefaultConcurrency: readIntEnv(
      "SCALE_ADAPTER_DEFAULT_CONCURRENCY",
      DEFAULT_SCALE_LIMITS.adapterDefaultConcurrency,
      1,
      1_000,
    ),
    queueBackpressureWarningThreshold: readRatioEnv(
      "SCALE_QUEUE_BACKPRESSURE_WARNING_THRESHOLD",
      DEFAULT_SCALE_LIMITS.queueBackpressureWarningThreshold,
    ),
  };
}

export function getAdapterScaleOverridesFromEnv(
  limits = getScaleLimitsFromEnv(),
): Record<string, AdapterScaleOverride> {
  return parseAdapterScaleOverrides(
    process.env.SCALE_ADAPTER_LIMIT_OVERRIDES,
    limits,
  );
}

export function resolveAdapterScaleLimits(
  adapterKey: string,
  limits = getScaleLimitsFromEnv(),
  overrides = getAdapterScaleOverridesFromEnv(limits),
): AdapterScaleOverride {
  return (
    overrides[adapterKey] || {
      maxActionsPerWindow: limits.adapterDefaultRateLimitPerWindow,
      windowMs: limits.adapterRateLimitWindowMs,
      maxConcurrency: limits.adapterDefaultConcurrency,
    }
  );
}

export type WorkspaceQuotaUsage = {
  activeWorkflowRuns: number;
  queuedJobs: number;
  scheduledWaits: number;
  workflows: number;
};

export type WorkspaceQuotaEvaluation = {
  warnings: string[];
  violations: string[];
};

export function evaluateWorkspaceQuotaState(input: {
  limits: ScaleLimits;
  usage: WorkspaceQuotaUsage;
}): WorkspaceQuotaEvaluation {
  const { limits, usage } = input;
  const warnings: string[] = [];
  const violations: string[] = [];

  const checks: Array<{
    key: keyof WorkspaceQuotaUsage;
    label: string;
    max: number;
  }> = [
    {
      key: "activeWorkflowRuns",
      label: "active workflow runs",
      max: limits.maxActiveWorkflowRunsPerWorkspace,
    },
    {
      key: "queuedJobs",
      label: "queued jobs",
      max: limits.maxQueuedJobsPerWorkspace,
    },
    {
      key: "scheduledWaits",
      label: "scheduled waits",
      max: limits.maxScheduledWaitsPerWorkspace,
    },
    {
      key: "workflows",
      label: "workflows",
      max: limits.maxWorkflowsPerWorkspace,
    },
  ];

  for (const check of checks) {
    const value = input.usage[check.key];
    if (value >= check.max) {
      violations.push(`${check.label} quota exceeded (${value}/${check.max})`);
      continue;
    }

    if (check.max <= 0) {
      continue;
    }
    const ratio = value / check.max;
    if (ratio >= limits.queueBackpressureWarningThreshold) {
      warnings.push(`${check.label} approaching quota (${value}/${check.max})`);
    }
  }

  return {
    warnings,
    violations,
  };
}

