type LabelSet = Record<string, string>;

type CounterSeries = {
  labels: LabelSet;
  value: number;
};

type HistogramSeries = {
  labels: LabelSet;
  bucketValues: number[];
  sum: number;
  count: number;
};

function buildSeriesKey(labels: LabelSet, labelNames: string[]): string {
  return labelNames.map((name) => `${name}:${labels[name] || ""}`).join("|");
}

function sanitizeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatLabels(labels: LabelSet): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }

  return `{${entries
    .map(([key, value]) => `${key}="${sanitizeLabelValue(value)}"`)
    .join(",")}}`;
}

class CounterMetric {
  private readonly series = new Map<string, CounterSeries>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[],
  ) {}

  inc(labels: LabelSet = {}, value = 1): void {
    const key = buildSeriesKey(labels, this.labelNames);
    const existing = this.series.get(key) || {
      labels: this.normalizeLabels(labels),
      value: 0,
    };
    existing.value += value;
    this.series.set(key, existing);
  }

  private normalizeLabels(labels: LabelSet): LabelSet {
    return this.labelNames.reduce<LabelSet>((acc, labelName) => {
      acc[labelName] = labels[labelName] || "";
      return acc;
    }, {});
  }

  toPrometheusText(): string {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];

    if (this.series.size === 0) {
      lines.push(`${this.name} 0`);
      return lines.join("\n");
    }

    for (const series of this.series.values()) {
      lines.push(`${this.name}${formatLabels(series.labels)} ${series.value}`);
    }

    return lines.join("\n");
  }
}

class HistogramMetric {
  private readonly series = new Map<string, HistogramSeries>();
  private readonly sortedBuckets: number[];

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[],
    buckets: number[],
  ) {
    this.sortedBuckets = [...buckets].sort((a, b) => a - b);
  }

  observe(labels: LabelSet = {}, value: number): void {
    const key = buildSeriesKey(labels, this.labelNames);
    const existing = this.series.get(key) || {
      labels: this.normalizeLabels(labels),
      bucketValues: new Array(this.sortedBuckets.length).fill(0),
      sum: 0,
      count: 0,
    };

    for (let index = 0; index < this.sortedBuckets.length; index += 1) {
      if (value <= this.sortedBuckets[index]) {
        existing.bucketValues[index] += 1;
      }
    }
    existing.count += 1;
    existing.sum += value;
    this.series.set(key, existing);
  }

  private normalizeLabels(labels: LabelSet): LabelSet {
    return this.labelNames.reduce<LabelSet>((acc, labelName) => {
      acc[labelName] = labels[labelName] || "";
      return acc;
    }, {});
  }

  toPrometheusText(): string {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];

    if (this.series.size === 0) {
      for (const bucket of this.sortedBuckets) {
        lines.push(`${this.name}_bucket{le="${bucket}"} 0`);
      }
      lines.push(`${this.name}_bucket{le="+Inf"} 0`);
      lines.push(`${this.name}_sum 0`);
      lines.push(`${this.name}_count 0`);
      return lines.join("\n");
    }

    for (const series of this.series.values()) {
      let cumulative = 0;
      for (let index = 0; index < this.sortedBuckets.length; index += 1) {
        cumulative += series.bucketValues[index];
        lines.push(
          `${this.name}_bucket${formatLabels({
            ...series.labels,
            le: String(this.sortedBuckets[index]),
          })} ${cumulative}`,
        );
      }
      lines.push(
        `${this.name}_bucket${formatLabels({ ...series.labels, le: "+Inf" })} ${series.count}`,
      );
      lines.push(`${this.name}_sum${formatLabels(series.labels)} ${series.sum}`);
      lines.push(`${this.name}_count${formatLabels(series.labels)} ${series.count}`);
    }

    return lines.join("\n");
  }
}

export class PlatformMetrics {
  private readonly counters: CounterMetric[] = [];
  private readonly histograms: HistogramMetric[] = [];

  readonly workflowRunsTotal = this.counter(
    "workflow_runs_total",
    "Total workflow runs started.",
    ["workflow_key"],
  );
  readonly workflowRunsSuccessTotal = this.counter(
    "workflow_runs_success_total",
    "Total successful workflow runs.",
    ["workflow_key"],
  );
  readonly workflowRunsFailedTotal = this.counter(
    "workflow_runs_failed_total",
    "Total failed workflow runs.",
    ["workflow_key"],
  );
  readonly workflowRunsDeadLetteredTotal = this.counter(
    "workflow_runs_dead_lettered_total",
    "Total dead-lettered workflow runs.",
    ["workflow_key"],
  );
  readonly workflowRetriesTotal = this.counter(
    "workflow_retries_total",
    "Total workflow retry attempts scheduled.",
    ["workflow_key", "adapter_key"],
  );
  readonly workflowStepsTotal = this.counter(
    "workflow_steps_total",
    "Total workflow steps executed.",
    ["workflow_key", "adapter_key", "step_type", "status"],
  );
  readonly workflowStepFailuresTotal = this.counter(
    "workflow_step_failures_total",
    "Total failed workflow steps.",
    ["workflow_key", "adapter_key"],
  );
  readonly adapterActionsTotal = this.counter(
    "adapter_actions_total",
    "Total adapter actions attempted.",
    ["adapter_key", "action_key", "status"],
  );
  readonly adapterActionFailuresTotal = this.counter(
    "adapter_action_failures_total",
    "Total adapter action failures.",
    ["adapter_key", "action_key"],
  );
  readonly credentialValidationFailuresTotal = this.counter(
    "credential_validation_failures_total",
    "Total credential validation failures.",
    ["adapter_key", "status"],
  );
  readonly queueJobsEnqueuedTotal = this.counter(
    "queue_jobs_enqueued_total",
    "Total queue jobs enqueued.",
    ["queue"],
  );
  readonly queueJobsProcessedTotal = this.counter(
    "queue_jobs_processed_total",
    "Total queue jobs processed.",
    ["queue"],
  );
  readonly queueJobsFailedTotal = this.counter(
    "queue_jobs_failed_total",
    "Total queue jobs failed to process.",
    ["queue"],
  );

  readonly workflowRunDurationSeconds = this.histogram(
    "workflow_run_duration_seconds",
    "Workflow run duration in seconds.",
    ["workflow_key", "status"],
    [0.1, 0.5, 1, 3, 5, 10, 30, 60, 120, 300],
  );
  readonly workflowStepDurationSeconds = this.histogram(
    "workflow_step_duration_seconds",
    "Workflow step duration in seconds.",
    ["workflow_key", "adapter_key", "step_type", "status"],
    [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30],
  );
  readonly queueWaitTimeSeconds = this.histogram(
    "queue_wait_time_seconds",
    "Queue wait time (lag) in seconds.",
    ["queue"],
    [0.001, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30],
  );
  readonly adapterActionDurationSeconds = this.histogram(
    "adapter_action_duration_seconds",
    "Adapter action execution duration in seconds.",
    ["adapter_key", "action_key", "status"],
    [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30],
  );

  get contentType(): string {
    return "text/plain; version=0.0.4; charset=utf-8";
  }

  render(): string {
    const parts: string[] = [];
    for (const metric of this.counters) {
      parts.push(metric.toPrometheusText());
    }
    for (const metric of this.histograms) {
      parts.push(metric.toPrometheusText());
    }
    return `${parts.join("\n\n")}\n`;
  }

  private counter(name: string, help: string, labelNames: string[]): CounterMetric {
    const metric = new CounterMetric(name, help, labelNames);
    this.counters.push(metric);
    return metric;
  }

  private histogram(
    name: string,
    help: string,
    labelNames: string[],
    buckets: number[],
  ): HistogramMetric {
    const metric = new HistogramMetric(name, help, labelNames, buckets);
    this.histograms.push(metric);
    return metric;
  }
}
