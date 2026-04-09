// MODE: Prototype Mode | Live Mode
// SHARED BETWEEN PROTOTYPE AND LIVE
// DO NOT MIX PROTOTYPE STATUS WITH LIVE RUNTIME STATUS
// KEEP CONTRACT SHAPE IN SYNC

export const PLATFORM_MODES = {
  PROTOTYPE: "Prototype Mode",
  LIVE: "Live Mode",
} as const;

export type PlatformMode = (typeof PLATFORM_MODES)[keyof typeof PLATFORM_MODES];

export type WebPlatformModeSource =
  | "VITE_INTEGRATOR_MODE"
  | "VITE_APP_ENV"
  | "default"
  | "api_health";

export type PlatformModeResolution = {
  mode: PlatformMode;
  source: WebPlatformModeSource;
  rawValue: string | null;
};

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

export function parsePlatformMode(value: string | null | undefined): PlatformMode | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeValue(value);
  if (
    normalized === normalizeValue(PLATFORM_MODES.PROTOTYPE) ||
    normalized === "prototype"
  ) {
    return PLATFORM_MODES.PROTOTYPE;
  }
  if (normalized === normalizeValue(PLATFORM_MODES.LIVE) || normalized === "live") {
    return PLATFORM_MODES.LIVE;
  }
  return null;
}

export function resolvePlatformModeFromWebEnv(
  env: ImportMetaEnv,
): PlatformModeResolution {
  const explicit = parsePlatformMode(env.VITE_INTEGRATOR_MODE);
  if (explicit) {
    return {
      mode: explicit,
      source: "VITE_INTEGRATOR_MODE",
      rawValue: env.VITE_INTEGRATOR_MODE || null,
    };
  }

  if (env.VITE_APP_ENV && env.VITE_APP_ENV.trim().length > 0) {
    const normalizedAppEnv = normalizeValue(env.VITE_APP_ENV);
    return {
      mode:
        normalizedAppEnv === "production"
          ? PLATFORM_MODES.LIVE
          : PLATFORM_MODES.PROTOTYPE,
      source: "VITE_APP_ENV",
      rawValue: env.VITE_APP_ENV,
    };
  }

  return {
    mode: PLATFORM_MODES.PROTOTYPE,
    source: "default",
    rawValue: null,
  };
}
