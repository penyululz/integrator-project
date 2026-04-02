import { describe, expect, it } from "vitest";
import { PlatformMetrics } from "./metrics";

describe("PlatformMetrics", () => {
  it("tracks required counters and renders prometheus text", () => {
    const metrics = new PlatformMetrics();

    metrics.workflowRunsTotal.inc({ workflow_key: "wf_observe" });
    metrics.workflowRunsSuccessTotal.inc({ workflow_key: "wf_observe" });
    metrics.workflowRunsFailedTotal.inc({ workflow_key: "wf_observe" });
    metrics.workflowRunsDeadLetteredTotal.inc({ workflow_key: "wf_observe" });
    metrics.workflowRetriesTotal.inc({
      workflow_key: "wf_observe",
      adapter_key: "shopify",
    });
    metrics.workflowStepsTotal.inc({
      workflow_key: "wf_observe",
      adapter_key: "shopify",
      step_type: "action",
      status: "failed",
    });
    metrics.workflowStepFailuresTotal.inc({
      workflow_key: "wf_observe",
      adapter_key: "shopify",
    });
    metrics.adapterActionsTotal.inc({
      adapter_key: "shopify",
      action_key: "readOrder",
      status: "failed",
    });
    metrics.adapterActionFailuresTotal.inc({
      adapter_key: "shopify",
      action_key: "readOrder",
    });
    metrics.credentialValidationFailuresTotal.inc({
      adapter_key: "shopify",
      status: "invalid",
    });
    metrics.queueJobsEnqueuedTotal.inc({ queue: "integration:events" });
    metrics.queueJobsProcessedTotal.inc({ queue: "integration:events" });
    metrics.queueJobsFailedTotal.inc({ queue: "integration:events" });
    metrics.workflowDelaysScheduledTotal.inc({ workflow_key: "wf_observe" });
    metrics.workflowDelaysResumedTotal.inc({ workflow_key: "wf_observe" });
    metrics.workflowRunDeferredTotal.inc({ reason: "workspace_active_limit" });
    metrics.workflowThrottledTotal.inc({
      adapter_key: "shopify",
      reason: "provider_rate_limit",
    });
    metrics.quotaViolationsTotal.inc({
      scope: "workspace",
      reason: "queued_jobs",
    });
    metrics.queueFairnessEventsTotal.inc({
      queue: "integration:events",
      reason: "deprioritized_workspace",
    });
    metrics.alertsSentTotal.inc({
      event_type: "workflow.dead_lettered",
      severity: "critical",
    });
    metrics.alertsFailedTotal.inc({
      event_type: "signal.failure_rate",
      severity: "warn",
    });
    metrics.alertsDedupedTotal.inc({
      event_type: "signal.queue_lag",
      severity: "warn",
    });
    metrics.alertsByChannelTotal.inc({
      channel: "slack",
      status: "sent",
    });
    metrics.alertsByChannelTotal.inc({
      channel: "email",
      status: "failed",
    });
    metrics.cleanupRunsTotal.inc({
      domain: "workflow_runs",
      status: "success",
    });
    metrics.cleanupDeletedRecordsTotal.inc(
      {
        domain: "event_logs",
      },
      42,
    );
    metrics.cleanupFailuresTotal.inc({
      domain: "audit_logs",
    });

    const output = metrics.render();
    expect(output).toContain(`workflow_runs_total{workflow_key="wf_observe"} 1`);
    expect(output).toContain(
      `workflow_runs_dead_lettered_total{workflow_key="wf_observe"} 1`,
    );
    expect(output).toContain(
      `workflow_retries_total{workflow_key="wf_observe",adapter_key="shopify"} 1`,
    );
    expect(output).toContain(`queue_jobs_enqueued_total{queue="integration:events"} 1`);
    expect(output).toContain(
      `workflow_delays_scheduled_total{workflow_key="wf_observe"} 1`,
    );
    expect(output).toContain(
      `workflow_delays_resumed_total{workflow_key="wf_observe"} 1`,
    );
    expect(output).toContain(
      `workflow_run_deferred_total{reason="workspace_active_limit"} 1`,
    );
    expect(output).toContain(
      `workflow_throttled_total{adapter_key="shopify",reason="provider_rate_limit"} 1`,
    );
    expect(output).toContain(
      `quota_violations_total{scope="workspace",reason="queued_jobs"} 1`,
    );
    expect(output).toContain(
      `alerts_sent_total{event_type="workflow.dead_lettered",severity="critical"} 1`,
    );
    expect(output).toContain(
      `alerts_failed_total{event_type="signal.failure_rate",severity="warn"} 1`,
    );
    expect(output).toContain(
      `alerts_deduped_total{event_type="signal.queue_lag",severity="warn"} 1`,
    );
    expect(output).toContain(`alerts_by_channel_total{channel="slack",status="sent"} 1`);
    expect(output).toContain(
      `cleanup_runs_total{domain="workflow_runs",status="success"} 1`,
    );
    expect(output).toContain(`cleanup_deleted_records_total{domain="event_logs"} 42`);
    expect(output).toContain(`cleanup_failures_total{domain="audit_logs"} 1`);
    expect(output).toContain(`credential_validation_failures_total`);
  });

  it("records duration histograms for run, step, queue lag, and adapter timing", () => {
    const metrics = new PlatformMetrics();
    metrics.workflowRunDurationSeconds.observe(
      { workflow_key: "wf_a", status: "success" },
      1.2,
    );
    metrics.workflowStepDurationSeconds.observe(
      {
        workflow_key: "wf_a",
        adapter_key: "shopify",
        step_type: "action",
        status: "success",
      },
      0.45,
    );
    metrics.queueWaitTimeSeconds.observe({ queue: "retry_queue" }, 2.5);
    metrics.adapterActionDurationSeconds.observe(
      {
        adapter_key: "shopify",
        action_key: "readOrder",
        status: "success",
      },
      0.21,
    );
    metrics.workflowDelaySchedulerLagSeconds.observe(
      { workflow_key: "wf_a" },
      1.5,
    );
    metrics.workspaceQueueBacklogItems.observe(
      { queue: "integration:events" },
      42,
    );
    metrics.cleanupDurationSeconds.observe(
      { domain: "workflow_runs", status: "success" },
      0.75,
    );

    const output = metrics.render();
    expect(output).toContain(
      `workflow_run_duration_seconds_count{workflow_key="wf_a",status="success"} 1`,
    );
    expect(output).toContain(
      `workflow_step_duration_seconds_count{workflow_key="wf_a",adapter_key="shopify",step_type="action",status="success"} 1`,
    );
    expect(output).toContain(`queue_wait_time_seconds_count{queue="retry_queue"} 1`);
    expect(output).toContain(
      `adapter_action_duration_seconds_count{adapter_key="shopify",action_key="readOrder",status="success"} 1`,
    );
    expect(output).toContain(
      `workflow_delay_scheduler_lag_seconds_count{workflow_key="wf_a"} 1`,
    );
    expect(output).toContain(
      `workspace_queue_backlog_items_count{queue="integration:events"} 1`,
    );
    expect(output).toContain(
      `cleanup_duration_seconds_count{domain="workflow_runs",status="success"} 1`,
    );
  });
});
