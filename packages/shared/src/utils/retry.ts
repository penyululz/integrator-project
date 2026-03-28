export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
};

export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 4,
    baseDelayMs = 200,
    maxDelayMs = 3_000,
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

      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = jitter ? Math.round(exp * (0.8 + Math.random() * 0.4)) : exp;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry failed.");
}

