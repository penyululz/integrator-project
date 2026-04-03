import { describe, expect, it } from "vitest";
import type { AppConnectionRecord, RunRecord } from "../api";
import {
  formatRelativeTime,
  getRecentWorkspaceRuns,
  getWorkspaceSetupProgress,
  toRunWorkspaceTone,
} from "./workspace-activity-helpers";

function createApp(input: Partial<AppConnectionRecord> & { key: string; name: string }): AppConnectionRecord {
  return {
    key: input.key,
    name: input.name,
    description: "",
    enabled: true,
    authType: "oauth2",
    setupMethod: "oauth2",
    setupLabel: "Connect",
    setupNotes: [],
    oauthScopes: [],
    setupFields: [],
    platformManagedFields: [],
    platformSetupMissingFields: [],
    supportedTriggers: [],
    supportedActions: [],
    status: input.status || "not_connected",
    connected: input.connected || false,
    connection: {
      integrationId: null,
      integrationName: null,
      integrationStatus: null,
      integrationConfig: {},
      credentialMetadata: {},
      hasSensitiveIntegrationConfig: false,
      credentialStatus: null,
      hasSecretData: false,
      validationError: null,
      updatedAt: null,
    },
    actions: {
      canConnect: true,
      canEdit: true,
      canDisconnect: true,
      canTestConnection: true,
    },
    supportModel: "native",
    readinessTier: input.readinessTier || "ready",
    catalogCategory: "automation",
    setupGuide: input.setupGuide,
  };
}

function createRun(input: Partial<RunRecord> & { id: string; workflow_id: string; created_at: string }): RunRecord {
  return {
    id: input.id,
    workflow_id: input.workflow_id,
    status: input.status || "queued",
    attempt_count: input.attempt_count || 1,
    max_attempts: input.max_attempts || 3,
    last_error: input.last_error || null,
    dead_lettered_at: input.dead_lettered_at || null,
    replay_of_run_id: input.replay_of_run_id || null,
    cancellation_requested_at: input.cancellation_requested_at || null,
    cancellation_requested_by: input.cancellation_requested_by || null,
    cancellation_note: input.cancellation_note || null,
    cancelled_at: input.cancelled_at || null,
    cancelled_by: input.cancelled_by || null,
    started_at: input.started_at || null,
    finished_at: input.finished_at || null,
    created_at: input.created_at,
    result_json: input.result_json || {},
  };
}

describe("workspace-activity-helpers", () => {
  it("computes setup progress from ready and connected apps", () => {
    const progress = getWorkspaceSetupProgress([
      createApp({ key: "slack", name: "Slack", readinessTier: "ready", status: "connected", connected: true }),
      createApp({ key: "webhook", name: "Webhook", readinessTier: "ready", status: "not_connected" }),
      createApp({ key: "shopify", name: "Shopify", readinessTier: "advanced", status: "connected", connected: true }),
    ]);

    expect(progress.readyApps).toBe(2);
    expect(progress.connectedReadyApps).toBe(1);
    expect(progress.percent).toBe(50);
  });

  it("returns newest runs first and maps status tone", () => {
    const runs = getRecentWorkspaceRuns([
      createRun({ id: "r1", workflow_id: "wf", created_at: "2026-04-03T10:00:00.000Z", status: "success" }),
      createRun({ id: "r2", workflow_id: "wf", created_at: "2026-04-03T10:01:00.000Z", status: "failed" }),
    ]);

    expect(runs[0].id).toBe("r2");
    expect(toRunWorkspaceTone("success")).toBe("success");
    expect(toRunWorkspaceTone("retrying")).toBe("warning");
    expect(toRunWorkspaceTone("dead_lettered")).toBe("danger");
  });

  it("formats relative timestamps", () => {
    const now = new Date("2026-04-03T12:00:00.000Z");
    expect(formatRelativeTime("2026-04-03T11:59:30.000Z", now)).toBe("30s ago");
    expect(formatRelativeTime("2026-04-03T11:50:00.000Z", now)).toBe("10m ago");
    expect(formatRelativeTime("2026-04-03T09:00:00.000Z", now)).toBe("3h ago");
  });
});
