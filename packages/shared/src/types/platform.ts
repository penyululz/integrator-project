// MODE: Prototype Mode | Live Mode
// SHARED BETWEEN PROTOTYPE AND LIVE
// KEEP CONTRACT SHAPE IN SYNC
// STACK: React + TypeScript + Vite
// STATE: TanStack Query for server state, Zustand for local UI state
// BUILDER: React Flow / XYFlow
// API: Fastify + Zod
// DATA: PostgreSQL
// QUEUE: Redis + BullMQ
// DEPLOY: Docker Compose + Traefik
// CI/CD: GitHub Actions

export const PLATFORM_MODES = {
  PROTOTYPE: "Prototype Mode",
  LIVE: "Live Mode",
} as const;

export type PlatformMode = (typeof PLATFORM_MODES)[keyof typeof PLATFORM_MODES];

// SHARED BETWEEN PROTOTYPE AND LIVE
// Source-of-truth env key for runtime mode selection.
export const PLATFORM_MODE_ENV_KEY = "INTEGRATOR_MODE" as const;
export const WEB_PLATFORM_MODE_ENV_KEY = "VITE_INTEGRATOR_MODE" as const;
export const LEGACY_APP_ENV_KEY = "APP_ENV" as const;

export type PlatformModeSource =
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
    normalized === normalizeModeToken(PLATFORM_MODES.PROTOTYPE) ||
    normalized === "prototype"
  ) {
    return PLATFORM_MODES.PROTOTYPE;
  }

  if (normalized === normalizeModeToken(PLATFORM_MODES.LIVE) || normalized === "live") {
    return PLATFORM_MODES.LIVE;
  }

  return null;
}

export function resolvePlatformModeFromEnv(
  env: Record<string, string | undefined>,
): PlatformModeResolution {
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
    const normalizedAppEnv = normalizeModeToken(appEnv);
    return {
      mode:
        normalizedAppEnv === "production" || normalizedAppEnv === "test"
          ? PLATFORM_MODES.LIVE
          : PLATFORM_MODES.PROTOTYPE,
      source: "APP_ENV",
      rawValue: appEnv,
    };
  }

  return {
    mode: PLATFORM_MODES.PROTOTYPE,
    source: "default",
    rawValue: null,
  };
}

export function isLiveMode(mode: PlatformMode): boolean {
  // LIVE MODE ONLY
  return mode === PLATFORM_MODES.LIVE;
}

export function isPrototypeMode(mode: PlatformMode): boolean {
  // PROTOTYPE MODE ONLY
  // USED FOR LOCAL DEMO / UI ITERATION
  return mode === PLATFORM_MODES.PROTOTYPE;
}
