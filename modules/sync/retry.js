function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay({
  attempt,
  baseDelayMs,
  maxDelayMs,
  jitter,
  jitterRatio,
}) {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const bounded = Math.min(exponential, maxDelayMs);

  if (!jitter) {
    return bounded;
  }

  const randomFactor = 1 - jitterRatio + Math.random() * jitterRatio * 2;
  return Math.round(bounded * randomFactor);
}

async function retryWithExponentialBackoff(task, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5_000,
    jitter = true,
    jitterRatio = 0.2,
    shouldRetry = () => true,
    onRetry = () => {},
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task({ attempt, maxAttempts });
    } catch (error) {
      const hasAttemptsLeft = attempt < maxAttempts;
      const retryAllowed = shouldRetry(error, attempt);

      if (!hasAttemptsLeft || !retryAllowed) {
        throw error;
      }

      const delayMs = calculateDelay({
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitter,
        jitterRatio,
      });

      onRetry({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw new Error("Unexpected retry loop termination.");
}

module.exports = {
  retryWithExponentialBackoff,
  sleep,
};

