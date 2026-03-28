const test = require("node:test");
const assert = require("node:assert/strict");
const { retryWithExponentialBackoff } = require("../modules/sync/retry");

test("retryWithExponentialBackoff retries retryable errors", async () => {
  let attempts = 0;

  const result = await retryWithExponentialBackoff(
    async () => {
      attempts += 1;

      if (attempts < 3) {
        const error = new Error("temporary failure");
        error.retryable = true;
        throw error;
      }

      return "ok";
    },
    {
      maxAttempts: 4,
      baseDelayMs: 1,
      jitter: false,
      shouldRetry: (error) => Boolean(error.retryable),
    },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("retryWithExponentialBackoff stops on non-retryable errors", async () => {
  await assert.rejects(
    () =>
      retryWithExponentialBackoff(
        async () => {
          throw new Error("bad request");
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1,
          jitter: false,
          shouldRetry: () => false,
        },
      ),
    /bad request/,
  );
});

