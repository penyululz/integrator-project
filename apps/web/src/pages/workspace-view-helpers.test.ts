import { describe, expect, it } from "vitest";
import {
  getLiveRefreshIntervalMs,
  toLiveRefreshLabel,
  toTableDensityClass,
} from "./workspace-view-helpers";

describe("workspace-view-helpers", () => {
  it("maps live refresh modes to stable intervals", () => {
    expect(getLiveRefreshIntervalMs("off")).toBeNull();
    expect(getLiveRefreshIntervalMs("15s")).toBe(15000);
    expect(getLiveRefreshIntervalMs("30s")).toBe(30000);
    expect(getLiveRefreshIntervalMs("60s")).toBe(60000);
  });

  it("returns table density classes and readable labels", () => {
    expect(toTableDensityClass("comfortable")).toBe("comfortable");
    expect(toTableDensityClass("compact")).toBe("compact");
    expect(toLiveRefreshLabel("off")).toBe("Live refresh off");
    expect(toLiveRefreshLabel("30s")).toBe("Auto-refresh 30s");
  });
});
