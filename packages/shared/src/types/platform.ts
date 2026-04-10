// MODE: Live Mode
// RUNTIME MODE SOURCE OF TRUTH
// KEEP CONTRACT SHAPE IN SYNC
// API: Fastify + Zod
// DATA: PostgreSQL
// QUEUE: Redis + BullMQ
// DEPLOY: Docker Compose + Traefik
// CI/CD: GitHub Actions

export const PLATFORM_MODES = {
  LIVE: "Live Mode",
} as const;

export type PlatformMode = (typeof PLATFORM_MODES)[keyof typeof PLATFORM_MODES];

// Source-of-truth env key for runtime mode selection.
export const ENGINE_MODE_ENV_KEY = "ENGINE_MODE" as const;
export const PLATFORM_MODE_ENV_KEY = "INTEGRATOR_MODE" as const;
export const LEGACY_APP_ENV_KEY = "APP_ENV" as const;

export type PlatformModeSource =
  | "ENGINE_MODE"
  | "INTEGRATOR_MODE"
  | "APP_ENV"
  | "default";

export type PlatformModeResolution = {
  mode: PlatformMode;
  source: PlatformModeSource;
  rawValue: string | null;
};

function normalizeModeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function parsePlatformMode(value: string | null | undefined): PlatformMode | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeModeToken(value);
  if (
    normalized === normalizeModeToken(PLATFORM_MODES.LIVE) ||
    normalized === "live" ||
    normalized === "live mode" ||
    normalized === "live-mode"
  ) {
    return PLATFORM_MODES.LIVE;
  }

  // Legacy compatibility: prototype aliases are treated as Live Mode.
  if (
    normalized === "prototype" ||
    normalized === "prototype mode" ||
    normalized === "prototype-mode"
  ) {
    return PLATFORM_MODES.LIVE;
  }

  return null;
}

export function resolvePlatformModeFromEnv(
  env: Record<string, string | undefined>,
): PlatformModeResolution {
  const engineMode = parsePlatformMode(env[ENGINE_MODE_ENV_KEY]);
  if (engineMode) {
    return {
      mode: engineMode,
      source: "ENGINE_MODE",
      rawValue: env[ENGINE_MODE_ENV_KEY] || null,
    };
  }

  const explicitMode = parsePlatformMode(env[PLATFORM_MODE_ENV_KEY]);
  if (explicitMode) {
    return {
      mode: explicitMode,
      source: "INTEGRATOR_MODE",
      rawValue: env[PLATFORM_MODE_ENV_KEY] || null,
    };
  }

  const appEnv = env[LEGACY_APP_ENV_KEY];
  if (appEnv && appEnv.trim().length > 0) {
    return {
      mode: PLATFORM_MODES.LIVE,
      source: "APP_ENV",
      rawValue: appEnv,
    };
  }

  return {
    mode: PLATFORM_MODES.LIVE,
    source: "default",
    rawValue: null,
  };
}

export function isLiveMode(mode: PlatformMode): boolean {
  return mode === PLATFORM_MODES.LIVE;
}
