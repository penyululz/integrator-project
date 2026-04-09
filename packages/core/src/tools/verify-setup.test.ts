import { describe, expect, it } from "vitest";
import { evaluateSetupEnvironment } from "./verify-setup";

describe("evaluateSetupEnvironment", () => {
  it("accepts minimal development setup with warnings", () => {
    const result = evaluateSetupEnvironment({
      INTEGRATOR_MODE: "Prototype Mode",
      APP_ENV: "development",
      DATABASE_URL: "postgres://integration:integration@localhost:5432/integration",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(result.integratorMode).toBe("Prototype Mode");
    expect(result.missingRequired).toEqual([]);
    expect(result.warnings).toContain(
      "JWT_SECRET is not set. Prototype Mode fallback behavior may be used.",
    );
    expect(result.warnings).toContain(
      "MASTER_ENCRYPTION_KEY is not set. Prototype Mode fallback behavior may be used.",
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
