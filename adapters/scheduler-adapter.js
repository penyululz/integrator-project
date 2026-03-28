const cron = require("node-cron");
const PluginAdapterInterface = require("../core/plugin-interface");

class SchedulerAdapter extends PluginAdapterInterface {
  constructor() {
    super({
      name: "scheduler",
      category: "trigger",
    });

    this.jobs = new Map();
  }

  capabilities() {
    return {
      trigger: true,
      action: true,
      cron: true,
    };
  }

  async trigger({ jobId, payload = {}, callback }) {
    if (typeof callback !== "function") {
      throw new Error("Scheduler trigger requires a callback function.");
    }

    await callback(payload, {
      jobId,
      triggeredAt: new Date().toISOString(),
    });
  }

  async action({ jobId, cronExpression, payload = {}, callback }) {
    if (!jobId || !cronExpression || typeof callback !== "function") {
      throw new Error("jobId, cronExpression and callback are required.");
    }

    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression "${cronExpression}".`);
    }

    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId).stop();
      this.jobs.delete(jobId);
    }

    const task = cron.schedule(cronExpression, async () => {
      try {
        await this.trigger({
          jobId,
          payload,
          callback,
        });
      } catch (error) {
        // Scheduler failures are isolated per tick.
      }
    });

    this.jobs.set(jobId, task);

    return {
      jobId,
      cronExpression,
      status: "scheduled",
    };
  }

  listJobs() {
    return [...this.jobs.keys()];
  }

  async removeJob(jobId) {
    const task = this.jobs.get(jobId);
    if (!task) {
      return false;
    }

    task.stop();
    this.jobs.delete(jobId);
    return true;
  }
}

module.exports = SchedulerAdapter;

