const { randomUUID } = require("node:crypto");

class InMemoryQueue {
  constructor({ concurrency = 4, processor = null } = {}) {
    this.concurrency = concurrency;
    this.processor = processor;
    this.pending = [];
    this.runningCount = 0;
    this.jobs = new Map();
  }

  setProcessor(processor) {
    this.processor = processor;
  }

  enqueue({ name, payload, handler, requestedBy }) {
    const effectiveHandler =
      handler ||
      (this.processor
        ? (jobPayload, job) =>
            this.processor({
              id: job.id,
              name: job.name,
              payload: jobPayload,
              requestedBy: job.requestedBy,
            })
        : null);

    if (!effectiveHandler) {
      throw new Error("InMemoryQueue processor is not configured.");
    }

    const job = {
      id: randomUUID(),
      name,
      payload,
      status: "queued",
      requestedBy: requestedBy || null,
      queuedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };

    this.pending.push({ job, handler: effectiveHandler });
    this.jobs.set(job.id, job);
    this.drain();

    return job;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  listJobs(limit = 100) {
    return [...this.jobs.values()].slice(-Math.max(1, limit)).reverse();
  }

  async drain() {
    while (this.runningCount < this.concurrency && this.pending.length > 0) {
      const nextItem = this.pending.shift();
      this.runningCount += 1;
      this.execute(nextItem).finally(() => {
        this.runningCount -= 1;
        this.drain();
      });
    }
  }

  async execute({ job, handler }) {
    job.status = "running";
    job.startedAt = new Date().toISOString();

    try {
      job.result = await handler(job.payload, job);
      job.status = "succeeded";
    } catch (error) {
      job.error = {
        message: error.message,
      };
      job.status = "failed";
    } finally {
      job.completedAt = new Date().toISOString();
    }
  }
}

module.exports = InMemoryQueue;
