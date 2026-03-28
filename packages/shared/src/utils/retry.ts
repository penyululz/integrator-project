export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
};

export function calculateExponentialBackoffMs(
  attempt: number,
  options: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    jitter?: boolean;
  } = {},
): number {
  const {
    baseDelayMs = 200,
    maxDelayMs = 3_000,
    backoffMultiplier = 2,
    jitter = true,
  } = options;

  const exponentialDelay = Math.min(
    maxDelayMs,
    Math.round(baseDelayMs * backoffMultiplier ** Math.max(0, attempt - 1)),
  );

  if (!jitter) {
    return exponentialDelay;
  }

  return Math.max(
    0,
    Math.round(exponentialDelay * (0.8 + Math.random() * 0.4)),
  );
}

export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 4,
    baseDelayMs = 200,
    maxDelayMs = 3_000,
    backoffMultiplier = 2,
    jitter = true,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isRetryable = Boolean(
        (error as Error & { retryable?: boolean }).retryable ?? true,
      );

      if (!isRetryable || attempt === attempts) {
        throw error;
      }

      const delayMs = calculateExponentialBackoffMs(attempt, {
        baseDelayMs,
        maxDelayMs,
        backoffMultiplier,
        jitter,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry failed.");
}
