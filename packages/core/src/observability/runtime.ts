import { PlatformMetrics } from "./metrics";
import { StructuredLogger } from "./logger";

export type ObservabilityRuntime = {
  metrics: PlatformMetrics;
  logger: StructuredLogger;
};

let globalRuntime: ObservabilityRuntime | null = null;

export function createObservabilityRuntime(): ObservabilityRuntime {
  return {
    metrics: new PlatformMetrics(),
    logger: new StructuredLogger(),
  };
}

export function getGlobalObservabilityRuntime(): ObservabilityRuntime {
  if (!globalRuntime) {
    globalRuntime = createObservabilityRuntime();
  }
  return globalRuntime;
}
