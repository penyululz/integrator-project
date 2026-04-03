import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAlertConfig,
  sendTestAlert,
  updateAlertConfig,
  type AlertConfigInput,
  type AlertConfigPublicView,
  type AlertDeliveryLogRecord,
  type AlertSeverity,
} from "../api";
import { Callout, PageHeader, StatusPill, SurfaceCard } from "../components/ui-kit";
import {
  ALERT_EVENT_GROUPS,
  ALERT_SEVERITY_OPTIONS,
  formatHeadersJson,
  formatRecipientsCsv,
  getAlertCooldownCopy,
  parseHeadersJson,
  parseRecipientsCsv,
  toBoolString,
} from "./alert-settings-helpers";

type AlertSettingsFormState = {
  enabled: boolean;
  eventTypes: string[];
  severities: AlertSeverity[];
  cooldownSeconds: number;
  slackEnabled: boolean;
  emailEnabled: boolean;
  emailRecipientsCsv: string;
  emailFrom: string;
  emailSubjectPrefix: string;
  webhookEnabled: boolean;
  webhookMethod: "POST" | "PUT";
  webhookHeadersJson: string;
  slackWebhookUrlInput: string;
  webhookUrlInput: string;
  webhookAuthHeaderInput: string;
  clearSlackWebhookUrl: boolean;
  clearWebhookUrl: boolean;
  clearWebhookAuthHeader: boolean;
};

function toFormState(config: AlertConfigPublicView): AlertSettingsFormState {
  return {
    enabled: config.enabled,
    eventTypes: config.eventTypes,
    severities: config.severities,
    cooldownSeconds: config.cooldownSeconds,
    slackEnabled: config.channels.slack.enabled,
    emailEnabled: config.channels.email.enabled,
    emailRecipientsCsv: formatRecipientsCsv(config.channels.email.recipients),
    emailFrom: config.channels.email.from || "",
    emailSubjectPrefix: config.channels.email.subjectPrefix || "",
    webhookEnabled: config.channels.webhook.enabled,
    webhookMethod: config.channels.webhook.method,
    webhookHeadersJson: formatHeadersJson(config.channels.webhook.headers),
    slackWebhookUrlInput: "",
    webhookUrlInput: "",
    webhookAuthHeaderInput: "",
    clearSlackWebhookUrl: false,
    clearWebhookUrl: false,
    clearWebhookAuthHeader: false,
  };
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

export function AlertSettingsPage() {
  const [config, setConfig] = useState<AlertConfigPublicView | null>(null);
  const [logs, setLogs] = useState<AlertDeliveryLogRecord[]>([]);
  const [formState, setFormState] = useState<AlertSettingsFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEventTypes = useMemo(() => new Set(formState?.eventTypes || []), [formState]);
  const selectedSeverities = useMemo(
    () => new Set(formState?.severities || []),
    [formState],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAlertConfig();
      setConfig(payload.config);
      setLogs(payload.deliveryLogs);
      setFormState(toFormState(payload.config));
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load alert settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateForm(patch: Partial<AlertSettingsFormState>) {
    setFormState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        ...patch,
      };
    });
  }

  function toggleEventType(eventType: string) {
    if (!formState) {
      return;
    }
    const next = new Set(formState.eventTypes);
    if (next.has(eventType)) {
      next.delete(eventType);
    } else {
      next.add(eventType);
    }
    updateForm({
      eventTypes: Array.from(next),
    });
  }

  function toggleSeverity(severity: AlertSeverity) {
    if (!formState) {
      return;
    }
    const next = new Set(formState.severities);
    if (next.has(severity)) {
      next.delete(severity);
    } else {
      next.add(severity);
    }
    updateForm({
      severities: Array.from(next) as AlertSeverity[],
    });
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!formState) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const webhookHeaders = parseHeadersJson(formState.webhookHeadersJson);
      const payload: AlertConfigInput = {
        enabled: formState.enabled,
        eventTypes: formState.eventTypes,
        severities: formState.severities,
        cooldownSeconds: formState.cooldownSeconds,
        channels: {
          slack: {
            enabled: formState.slackEnabled,
          },
          email: {
            enabled: formState.emailEnabled,
            recipients: parseRecipientsCsv(formState.emailRecipientsCsv),
            from: formState.emailFrom.trim() || undefined,
            subjectPrefix: formState.emailSubjectPrefix.trim() || undefined,
          },
          webhook: {
            enabled: formState.webhookEnabled,
            method: formState.webhookMethod,
            headers: webhookHeaders,
          },
        },
        secrets: {
          slackWebhookUrl: formState.clearSlackWebhookUrl
            ? null
            : formState.slackWebhookUrlInput.trim() || undefined,
          webhookUrl: formState.clearWebhookUrl
            ? null
            : formState.webhookUrlInput.trim() || undefined,
          webhookAuthHeader: formState.clearWebhookAuthHeader
            ? null
            : formState.webhookAuthHeaderInput.trim() || undefined,
        },
      };
      const nextConfig = await updateAlertConfig(payload);
      setConfig(nextConfig);
      setFormState(toFormState(nextConfig));
      setMessage("Alert settings saved.");
      await load();
    } catch (saveError) {
      setError((saveError as Error).message || "Failed to save alert settings.");
    } finally {
      setSaving(false);
    }
  }

  async function onSendTestAlert() {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await sendTestAlert({
        severity: "warn",
      });
      setMessage(
        result.deduped
          ? "Test alert deduped by cooldown window."
          : "Test alert queued.",
      );
      await load();
    } catch (testError) {
      setError((testError as Error).message || "Failed to send test alert.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Alerts"
        title="Alert Delivery Settings"
        subtitle="Choose channels, event types, and dedupe behavior so critical automation issues reach the right people."
        actions={
          <>
            <button type="button" onClick={() => void load()}>Refresh</button>
            <Link to="/runs">Runs</Link>
            <Link to="/audit-logs">Audit</Link>
          </>
        }
      />

      <Callout
        tone="info"
        title="Recommended first-success check"
        actions={
          <>
            <Link to="/runs">Open runs</Link>
            <button type="button" onClick={() => void onSendTestAlert()} disabled={testing}>
              {testing ? "Sending test..." : "Send test alert"}
            </button>
          </>
        }
      >
        <p>
          After a workflow test run, send one test alert and confirm delivery logs on this page.
          Cooldown prevents repeated duplicate notifications.
        </p>
      </Callout>

      {loading ? <p>Loading...</p> : null}
      {error ? (
        <Callout tone="danger" title="Unable to update alert settings">
          <p>{error}</p>
        </Callout>
      ) : null}
      {message ? (
        <Callout tone="success" title="Alert update">
          <p>{message}</p>
        </Callout>
      ) : null}

      {!formState || !config ? (
        <SurfaceCard title="Alert settings unavailable">
          <p>Alert configuration is currently unavailable for this workspace.</p>
        </SurfaceCard>
      ) : (
        <>
          <form onSubmit={(event) => void onSave(event)} className="stack">
            <SurfaceCard title="Global delivery" subtitle="Enable alerts and set dedupe behavior.">
              <div className="inline-actions" style={{ alignItems: "center" }}>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.enabled}
                    onChange={(event) => updateForm({ enabled: event.target.checked })}
                  />
                  {" "}
                  Enable alert delivery
                </label>

                <label>
                  Cooldown (seconds)
                  <input
                    type="number"
                    min={30}
                    max={86400}
                    value={formState.cooldownSeconds}
                    onChange={(event) =>
                      updateForm({
                        cooldownSeconds: Number(event.target.value || 300),
                      })
                    }
                    style={{ marginLeft: 8, width: 120 }}
                  />
                </label>

                <StatusPill tone="info">{getAlertCooldownCopy(formState.cooldownSeconds)}</StatusPill>
                <button type="submit" className="button-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save settings"}
                </button>
              </div>
            </SurfaceCard>

            <SurfaceCard title="Event types and severity" subtitle="Choose which events should trigger notifications.">
              <div className="stack-sm">
                {ALERT_EVENT_GROUPS.map((group) => (
                  <div key={group.key} className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                    <strong>{group.label}</strong>
                    <p>{group.description}</p>
                    <div className="tag-row" style={{ marginTop: 8 }}>
                      {group.events.map((option) => (
                        <label className="tag" key={option.key} style={{ cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={selectedEventTypes.has(option.key)}
                            onChange={() => toggleEventType(option.key)}
                            style={{ marginRight: 6 }}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="inline-actions">
                  <strong>Severity levels:</strong>
                  {ALERT_SEVERITY_OPTIONS.map((severity) => (
                    <label key={severity} className="tag" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selectedSeverities.has(severity)}
                        onChange={() => toggleSeverity(severity)}
                        style={{ marginRight: 6 }}
                      />
                      {severity}
                    </label>
                  ))}
                </div>
              </div>
            </SurfaceCard>

            <div className="template-grid">
              <SurfaceCard title="Slack channel" subtitle="Fast team notifications via incoming webhook." highlight>
                <div className="stack-sm">
                  <label>
                    <input
                      type="checkbox"
                      checked={formState.slackEnabled}
                      onChange={(event) => updateForm({ slackEnabled: event.target.checked })}
                    />
                    {" "}
                    Enable Slack delivery
                  </label>
                  <p>
                    Existing webhook: <strong>{toBoolString(config.channels.slack.hasWebhookUrl)}</strong>
                  </p>
                  <label>
                    New webhook URL
                    <input
                      type="password"
                      value={formState.slackWebhookUrlInput}
                      onChange={(event) =>
                        updateForm({ slackWebhookUrlInput: event.target.value, clearSlackWebhookUrl: false })
                      }
                      placeholder={config.channels.slack.hasWebhookUrl ? "Leave blank to keep existing" : "https://hooks.slack.com/..."}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  {config.channels.slack.hasWebhookUrl ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={formState.clearSlackWebhookUrl}
                        onChange={(event) =>
                          updateForm({
                            clearSlackWebhookUrl: event.target.checked,
                            slackWebhookUrlInput: event.target.checked
                              ? ""
                              : formState.slackWebhookUrlInput,
                          })
                        }
                      />
                      {" "}
                      Clear existing webhook URL
                    </label>
                  ) : null}
                </div>
              </SurfaceCard>

              <SurfaceCard title="Email channel" subtitle="SMTP delivery for operator inboxes.">
                <div className="stack-sm">
                  <label>
                    <input
                      type="checkbox"
                      checked={formState.emailEnabled}
                      onChange={(event) => updateForm({ emailEnabled: event.target.checked })}
                    />
                    {" "}
                    Enable email delivery
                  </label>
                  <label>
                    Recipients (comma-separated)
                    <input
                      value={formState.emailRecipientsCsv}
                      onChange={(event) => updateForm({ emailRecipientsCsv: event.target.value })}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label>
                    From override (optional)
                    <input
                      value={formState.emailFrom}
                      onChange={(event) => updateForm({ emailFrom: event.target.value })}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label>
                    Subject prefix (optional)
                    <input
                      value={formState.emailSubjectPrefix}
                      onChange={(event) => updateForm({ emailSubjectPrefix: event.target.value })}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                </div>
              </SurfaceCard>

              <SurfaceCard title="Outbound webhook" subtitle="Send structured alert payloads to external systems.">
                <div className="stack-sm">
                  <label>
                    <input
                      type="checkbox"
                      checked={formState.webhookEnabled}
                      onChange={(event) => updateForm({ webhookEnabled: event.target.checked })}
                    />
                    {" "}
                    Enable webhook delivery
                  </label>
                  <p>
                    Existing URL: <strong>{toBoolString(config.channels.webhook.hasWebhookUrl)}</strong>
                    {" | "}
                    Auth header: <strong>{toBoolString(config.channels.webhook.hasAuthHeader)}</strong>
                  </p>
                  <label>
                    Method
                    <select
                      value={formState.webhookMethod}
                      onChange={(event) =>
                        updateForm({ webhookMethod: event.target.value as "POST" | "PUT" })
                      }
                      style={{ marginLeft: 8 }}
                    >
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                    </select>
                  </label>
                  <label>
                    New webhook URL
                    <input
                      type="password"
                      value={formState.webhookUrlInput}
                      onChange={(event) =>
                        updateForm({ webhookUrlInput: event.target.value, clearWebhookUrl: false })
                      }
                      placeholder={config.channels.webhook.hasWebhookUrl ? "Leave blank to keep existing" : "https://example.com/alerts"}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  {config.channels.webhook.hasWebhookUrl ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={formState.clearWebhookUrl}
                        onChange={(event) =>
                          updateForm({
                            clearWebhookUrl: event.target.checked,
                            webhookUrlInput: event.target.checked ? "" : formState.webhookUrlInput,
                          })
                        }
                      />
                      {" "}
                      Clear existing webhook URL
                    </label>
                  ) : null}
                  <label>
                    New auth header value (optional)
                    <input
                      type="password"
                      value={formState.webhookAuthHeaderInput}
                      onChange={(event) =>
                        updateForm({
                          webhookAuthHeaderInput: event.target.value,
                          clearWebhookAuthHeader: false,
                        })
                      }
                      placeholder="Bearer ..."
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  {config.channels.webhook.hasAuthHeader ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={formState.clearWebhookAuthHeader}
                        onChange={(event) =>
                          updateForm({
                            clearWebhookAuthHeader: event.target.checked,
                            webhookAuthHeaderInput: event.target.checked
                              ? ""
                              : formState.webhookAuthHeaderInput,
                          })
                        }
                      />
                      {" "}
                      Clear existing webhook auth header
                    </label>
                  ) : null}
                  <label>
                    Extra headers JSON
                    <textarea
                      value={formState.webhookHeadersJson}
                      onChange={(event) => updateForm({ webhookHeadersJson: event.target.value })}
                      rows={4}
                      style={{ width: "100%", marginTop: 4, fontFamily: "monospace" }}
                      placeholder='{"X-Integration-Source":"platform-v1"}'
                    />
                  </label>
                </div>
              </SurfaceCard>
            </div>
          </form>

          <div className="template-grid">
            <SurfaceCard title="Delivery status" subtitle="Most recent delivery and test state.">
              <div className="stack-sm">
                <p><strong>Last delivery status:</strong> {config.lastDeliveryStatus || "none"}</p>
                <p><strong>Last delivery at:</strong> {formatDateTime(config.lastDeliveryAt)}</p>
                <p><strong>Last tested at:</strong> {formatDateTime(config.lastTestedAt)}</p>
                <p><strong>Updated at:</strong> {formatDateTime(config.updatedAt)}</p>
              </div>
            </SurfaceCard>

            <SurfaceCard title="Recent delivery logs" subtitle="Per-channel outcomes for recent alert events." highlight>
              {logs.length === 0 ? (
                <div className="empty-state">
                  <p>No alert delivery logs yet.</p>
                  <p>Save settings, click "Send test alert", and check this table again.</p>
                </div>
              ) : null}
              {logs.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Event</th>
                        <th>Channel</th>
                        <th>Status</th>
                        <th>Attempt</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDateTime(entry.createdAt)}</td>
                          <td>{entry.eventType}</td>
                          <td>{entry.channel}</td>
                          <td>
                            <StatusPill
                              tone={
                                entry.status === "sent"
                                  ? "success"
                                  : entry.status === "deduped"
                                    ? "warning"
                                    : "danger"
                              }
                            >
                              {entry.status}
                            </StatusPill>
                          </td>
                          <td>{entry.attemptCount}</td>
                          <td>{entry.errorMessage || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </SurfaceCard>
          </div>
        </>
      )}
    </div>
  );
}
