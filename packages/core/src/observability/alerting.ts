export type AlertSignal = {
  key: string;
  severity: "warn" | "critical";
  message: string;
  value: number;
  threshold: number;
};

export type AlertThresholds = {
  failureRateWarn: number;
  deadLetterRateWarn: number;
  queueLagSecondsWarn: number;
  credentialValidationFailuresWarn: number;
};

export type AnalyticsOverviewSnapshot = {
  totalRuns: number;
  failedRuns: number;
  deadLetterRuns: number;
  queueLagSeconds: number;
  credentialValidationFailures: number;
};

export function getDefaultAlertThresholds(
  env: NodeJS.ProcessEnv = process.env,
): AlertThresholds {
  return {
    failureRateWarn: Number(env.ALERT_FAILURE_RATE_WARN || 0.2),
    deadLetterRateWarn: Number(env.ALERT_DEAD_LETTER_RATE_WARN || 0.05),
    queueLagSecondsWarn: Number(env.ALERT_QUEUE_LAG_SECONDS_WARN || 30),
    credentialValidationFailuresWarn: Number(
      env.ALERT_CREDENTIAL_FAILURES_WARN || 5,
    ),
  };
}

export function evaluateAlertSignals(
  snapshot: AnalyticsOverviewSnapshot,
  thresholds: AlertThresholds = getDefaultAlertThresholds(),
): AlertSignal[] {
  const alerts: AlertSignal[] = [];
  const total = Math.max(snapshot.totalRuns, 1);
  const failureRate = snapshot.failedRuns / total;
  const deadLetterRate = snapshot.deadLetterRuns / total;

  if (failureRate >= thresholds.failureRateWarn) {
    alerts.push({
      key: "failure_rate",
      severity: failureRate >= thresholds.failureRateWarn * 1.5 ? "critical" : "warn",
      message: "Workflow failure rate is elevated.",
      value: failureRate,
      threshold: thresholds.failureRateWarn,
    });
  }

  if (deadLetterRate >= thresholds.deadLetterRateWarn) {
    alerts.push({
      key: "dead_letter_rate",
      severity:
        deadLetterRate >= thresholds.deadLetterRateWarn * 1.5 ? "critical" : "warn",
      message: "Dead-letter rate is elevated.",
      value: deadLetterRate,
      threshold: thresholds.deadLetterRateWarn,
    });
  }

  if (snapshot.queueLagSeconds >= thresholds.queueLagSecondsWarn) {
    alerts.push({
      key: "queue_lag_seconds",
      severity:
        snapshot.queueLagSeconds >= thresholds.queueLagSecondsWarn * 2
          ? "critical"
          : "warn",
      message: "Queue lag is elevated.",
      value: snapshot.queueLagSeconds,
      threshold: thresholds.queueLagSecondsWarn,
    });
  }

  if (
    snapshot.credentialValidationFailures >=
    thresholds.credentialValidationFailuresWarn
  ) {
    alerts.push({
      key: "credential_validation_failures",
      severity:
        snapshot.credentialValidationFailures >=
        thresholds.credentialValidationFailuresWarn * 2
          ? "critical"
          : "warn",
      message: "Credential validation failures are elevated.",
      value: snapshot.credentialValidationFailures,
      threshold: thresholds.credentialValidationFailuresWarn,
    });
  }

  return alerts;
}
