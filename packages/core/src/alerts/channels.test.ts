import { describe, expect, it, vi } from "vitest";
import { EmailChannel, OutboundWebhookChannel, SlackWebhookChannel } from "./channels";

describe("alert delivery channels", () => {
  it("sends slack webhook payload", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
    }));
    const channel = new SlackWebhookChannel(fetchSpy as unknown as typeof fetch);

    const result = await channel.send({
      scope: {
        tenantId: "tenant-1",
        organizationId: "org-1",
        workspaceId: "ws-1",
      },
      message: {
        dispatchId: "dispatch-1",
        eventType: "workflow.dead_lettered",
        severity: "critical",
        title: "Dead letter",
        message: "A run was dead-lettered.",
        payload: {},
        attemptCount: 1,
        maxAttempts: 5,
      },
      config: {
        channels: {
          slack: {
            enabled: true,
          },
          email: {
            enabled: false,
            recipients: [],
          },
          webhook: {
            enabled: false,
            method: "POST",
            headers: {},
          },
        },
        destinationSecrets: {
          slackWebhookUrl: "https://hooks.slack.com/services/test",
        },
      },
    });

    expect(result.responseCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("marks slack 5xx responses retryable", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 503,
    }));
    const channel = new SlackWebhookChannel(fetchSpy as unknown as typeof fetch);

    await expect(
      channel.send({
        scope: {
          tenantId: "tenant-1",
          organizationId: "org-1",
          workspaceId: "ws-1",
        },
        message: {
          dispatchId: "dispatch-1",
          eventType: "workflow.dead_lettered",
          severity: "critical",
          title: "Dead letter",
          message: "A run was dead-lettered.",
          payload: {},
          attemptCount: 1,
          maxAttempts: 5,
        },
        config: {
          channels: {
            slack: {
              enabled: true,
            },
            email: {
              enabled: false,
              recipients: [],
            },
            webhook: {
              enabled: false,
              method: "POST",
              headers: {},
            },
          },
          destinationSecrets: {
            slackWebhookUrl: "https://hooks.slack.com/services/test",
          },
        },
      }),
    ).rejects.toMatchObject({
      retryable: true,
      responseCode: 503,
    });
  });

  it("sends outbound webhook payload with auth header", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 202,
    }));
    const channel = new OutboundWebhookChannel(fetchSpy as unknown as typeof fetch);

    await channel.send({
      scope: {
        tenantId: "tenant-1",
        organizationId: "org-1",
        workspaceId: "ws-1",
      },
      message: {
        dispatchId: "dispatch-1",
        eventType: "signal.queue_lag",
        severity: "warn",
        title: "Queue lag",
        message: "Queue lag elevated",
        payload: {
          lag: 42,
        },
        attemptCount: 1,
        maxAttempts: 5,
      },
      config: {
        channels: {
          slack: {
            enabled: false,
          },
          email: {
            enabled: false,
            recipients: [],
          },
          webhook: {
            enabled: true,
            method: "PUT",
            headers: {
              "x-source": "tests",
            },
          },
        },
        destinationSecrets: {
          webhookUrl: "https://example.com/inbound",
          webhookAuthHeader: "Bearer test-token",
        },
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/inbound",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          authorization: "Bearer test-token",
          "x-source": "tests",
        }),
      }),
    );
  });

  it("sends email notifications via email adapter", async () => {
    const runAction = vi.fn(async () => ({
      success: true,
      output: {},
    }));
    const pluginLoader = {
      get: vi.fn(() => ({
        runAction,
      })),
    } as never;

    const channel = new EmailChannel(pluginLoader);

    await channel.send({
      scope: {
        tenantId: "tenant-1",
        organizationId: "org-1",
        workspaceId: "ws-1",
        correlationId: "corr-1",
      },
      message: {
        dispatchId: "dispatch-1",
        eventType: "workflow.dead_lettered",
        severity: "critical",
        title: "Dead letter",
        message: "A run was dead-lettered.",
        payload: {
          runId: "run-1",
        },
        attemptCount: 1,
        maxAttempts: 5,
      },
      config: {
        channels: {
          slack: {
            enabled: false,
          },
          email: {
            enabled: true,
            recipients: ["ops@example.com", "oncall@example.com"],
            subjectPrefix: "[Alerts]",
            from: "alerts@example.com",
          },
          webhook: {
            enabled: false,
            method: "POST",
            headers: {},
          },
        },
        destinationSecrets: {},
      },
    });

    expect(runAction).toHaveBeenCalledTimes(1);
    expect(runAction).toHaveBeenCalledWith(
      "sendEmail",
      expect.objectContaining({
        to: "ops@example.com,oncall@example.com",
        subject: expect.stringContaining("[Alerts]"),
      }),
      expect.objectContaining({
        tenantId: "tenant-1",
        workspaceId: "ws-1",
      }),
    );
  });
});
