export type ViewDensity = "comfortable" | "compact";
export type LiveRefreshMode = "off" | "15s" | "30s" | "60s";

const LIVE_REFRESH_INTERVAL_MS: Record<LiveRefreshMode, number | null> = {
  off: null,
  "15s": 15_000,
  "30s": 30_000,
  "60s": 60_000,
};

export function getLiveRefreshIntervalMs(mode: LiveRefreshMode): number | null {
  return LIVE_REFRESH_INTERVAL_MS[mode];
}

export function toTableDensityClass(mode: ViewDensity): ViewDensity {
  return mode === "compact" ? "compact" : "comfortable";
}

export function toLiveRefreshLabel(mode: LiveRefreshMode): string {
  if (mode === "off") {
    return "Live refresh off";
  }
  return `Auto-refresh ${mode}`;
}
