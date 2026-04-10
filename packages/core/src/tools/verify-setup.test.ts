import { describe, expect, it } from "vitest";
import { evaluateSetupEnvironment } from "./verify-setup";

describe("evaluateSetupEnvironment", () => {
  it("normalizes legacy prototype mode value to live mode", () => {
    const result = evaluateSetupEnvironment({
      INTEGRATOR_MODE: "Prototype Mode",
      APP_ENV: "development",
      DATABASE_URL: "postgres://integration:integration@localhost:5432/integration",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(result.integratorMode).toBe("Live Mode");
    expect(result.missingRequired).toEqual([]);
    expect(result.warnings).toContain(
      "JWT_SECRET is not set. Configure this before non-local deployments.",
    );
    expect(result.warnings).toContain(
      "MASTER_ENCRYPTION_KEY is not set. Configure this before non-local deployments.",
    );
  });

  it("requires production secrets in production", () => {
    const result = evaluateSetupEnvironment({
      INTEGRATOR_MODE: "Live Mode",
      APP_ENV: "production",
      DATABASE_URL: "postgres://integration:integration@localhost:5432/integration",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(result.integratorMode).toBe("Live Mode");
    expect(result.missingRequired).toEqual(
      expect.arrayContaining(["JWT_SECRET", "MASTER_ENCRYPTION_KEY"]),
    );
  });
});
