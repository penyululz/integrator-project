import { describe, expect, it } from "vitest";
import { evaluateAlertSignals } from "./alerting";

describe("evaluateAlertSignals", () => {
  it("returns alert signals when thresholds are exceeded", () => {
    const alerts = evaluateAlertSignals(
      {
        totalRuns: 10,
        failedRuns: 4,
        deadLetterRuns: 2,
        queueLagSeconds: 45,
        credentialValidationFailures: 8,
      },
      {
        failureRateWarn: 0.2,
        deadLetterRateWarn: 0.05,
        queueLagSecondsWarn: 30,
        credentialValidationFailuresWarn: 5,
      },
    );

    const keys = alerts.map((alert) => alert.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "failure_rate",
        "dead_letter_rate",
        "queue_lag_seconds",
        "credential_validation_failures",
      ]),
    );
  });
});
