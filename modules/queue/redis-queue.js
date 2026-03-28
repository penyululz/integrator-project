const { randomUUID } = require("node:crypto");

function serializeJob(job) {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    payload: JSON.stringify(job.payload || {}),
    requestedBy: JSON.stringify(job.requestedBy || null),
    queuedAt: job.queuedAt || "",
    startedAt: job.startedAt || "",
    completedAt: job.completedAt || "",
    result: job.result === null ? "" : JSON.stringify(job.result),
    error: job.error === null ? "" : JSON.stringify(job.error),
  };
}

function parseJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseJob(fields) {
  if (!fields || Object.keys(fields).length === 0) {
    return null;
  }

  return {
    id: fields.id,
    name: fields.name,
    status: fields.status,
    payload: parseJson(fields.payload, {}),
    requestedBy: parseJson(fields.requestedBy, null),
    queuedAt: fields.queuedAt || null,
    startedAt: fields.startedAt || null,
    completedAt: fields.completedAt || null,
    result: parseJson(fields.result, null),
    error: parseJson(fields.error, null),
  };
}

class RedisQueue {
  constructor({
    redisClient,
    keyPrefix = "integrator",
    concurrency = 4,
    recentJobsLimit = 500,
  }) {
    this.redisClient = redisClient;
    this.keyPrefix = keyPrefix;
    this.concurrency = concurrency;
    this.recentJobsLimit = recentJobsLimit;
    this.processor = null;
    this.running = false;
    this.workerPromises = [];
  }

  queuePendingKey() {
    return `${this.keyPrefix}:queue:pending`;
  }

  queueProcessingKey() {
    return `${this.keyPrefix}:queue:processing`;
  }

  recentJobsKey() {
    return `${this.keyPrefix}:jobs:recent`;
  }

  jobKey(jobId) {
    return `${this.keyPrefix}:job:${jobId}`;
  }

  setProcessor(processor) {
    this.processor = processor;
  }

  async initialize() {
    if (this.running) {
      return;
    }

    this.running = true;
    await this.requeueInFlightJobs();
    this.workerPromises = Array.from({ length: this.concurrency }).map(() =>
      this.workerLoop(),
    );
  }

  async close() {
    this.running = false;
    await Promise.allSettled(this.workerPromises);
    this.workerPromises = [];
  }

  async requeueInFlightJobs() {
    while (true) {
      const movedJobId = await this.redisClient.lMove(
        this.queueProcessingKey(),
        this.queuePendingKey(),
        "RIGHT",
        "LEFT",
      );

      if (!movedJobId) {
        break;
      }

      const job = await this.getJob(movedJobId);
      if (job) {
        await this.saveJob({
          ...job,
          status: "queued",
          startedAt: null,
          completedAt: null,
          error: null,
        });
      }
    }
  }

  async workerLoop() {
    while (this.running) {
      let jobId = null;
      try {
        jobId = await this.redisClient.brPopLPush(
          this.queuePendingKey(),
          this.queueProcessingKey(),
          1,
        );

        if (!jobId) {
          continue;
        }

        await this.processJob(jobId);
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      } finally {
        if (jobId) {
          await this.redisClient.lRem(this.queueProcessingKey(), 1, jobId);
        }
      }
    }
  }

  async processJob(jobId) {
    if (!this.processor) {
      throw new Error("RedisQueue processor is not configured.");
    }

    const job = await this.getJob(jobId);
    if (!job) {
      return;
    }

    const runningJob = {
      ...job,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    await this.saveJob(runningJob);

    try {
      const result = await this.processor({
        id: runningJob.id,
        name: runningJob.name,
        payload: runningJob.payload,
        requestedBy: runningJob.requestedBy,
      });

      await this.saveJob({
        ...runningJob,
        status: "succeeded",
        completedAt: new Date().toISOString(),
        result,
        error: null,
      });
    } catch (error) {
      await this.saveJob({
        ...runningJob,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: {
          message: error.message,
        },
      });
    }
  }

  async saveJob(job) {
    await this.redisClient.hSet(this.jobKey(job.id), serializeJob(job));
  }

  async enqueue({ name, payload, requestedBy }) {
    const job = {
      id: randomUUID(),
      name,
      payload: payload || {},
      requestedBy: requestedBy || null,
      status: "queued",
      queuedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };

    const multi = this.redisClient.multi();
    multi.hSet(this.jobKey(job.id), serializeJob(job));
    multi.rPush(this.queuePendingKey(), job.id);
    multi.lPush(this.recentJobsKey(), job.id);
    multi.lTrim(this.recentJobsKey(), 0, this.recentJobsLimit - 1);
    await multi.exec();

    return job;
  }

  async getJob(jobId) {
    const fields = await this.redisClient.hGetAll(this.jobKey(jobId));
    return parseJob(fields);
  }

  async listJobs(limit = 100) {
    const normalizedLimit = Math.max(1, limit);
    const jobIds = await this.redisClient.lRange(
      this.recentJobsKey(),
      0,
      normalizedLimit - 1,
    );

    if (!jobIds.length) {
      return [];
    }

    const jobs = await Promise.all(jobIds.map((jobId) => this.getJob(jobId)));
    return jobs.filter(Boolean);
  }
}

module.exports = RedisQueue;

