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
import {
  ALERT_EVENT_OPTIONS,
  ALERT_SEVERITY_OPTIONS,
  formatHeadersJson,
  formatRecipientsCsv,
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
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Alert Settings</h2>
      <p>
        Configure where operational alerts are delivered. For demos, send a test alert after
        your first run.
      </p>
      <div style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <strong>Demo Tip</strong>
        <div style={{ marginTop: 6, fontSize: 14 }}>
          Trigger a workflow, check status in <Link to="/runs">Runs</Link>, then send a test
          alert here and verify delivery logs below.
        </div>
      </div>
      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
      {message ? <p style={{ color: "#116329" }}>{message}</p> : null}

      {!formState || !config ? (
        <p>Alert configuration is unavailable.</p>
      ) : (
        <>
          <form
            onSubmit={(event) => void onSave(event)}
            style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12, display: "grid", gap: 12 }}
          >
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
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
                  style={{ marginLeft: 8, width: 110 }}
                />
              </label>
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => void onSendTestAlert()}
                disabled={testing}
              >
                {testing ? "Sending..." : "Send Test Alert"}
              </button>
            </div>

            <section style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
              <h3 style={{ marginTop: 0 }}>Event Types</h3>
              <div style={{ display: "grid", gap: 6 }}>
                {ALERT_EVENT_OPTIONS.map((option) => (
                  <label key={option.key}>
                    <input
                      type="checkbox"
                      checked={selectedEventTypes.has(option.key)}
                      onChange={() => toggleEventType(option.key)}
                    />
                    {" "}
                    {option.label}
                  </label>
                ))}
              </div>
            </section>

            <section style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
              <h3 style={{ marginTop: 0 }}>Severity Levels</h3>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {ALERT_SEVERITY_OPTIONS.map((severity) => (
                  <label key={severity}>
                    <input
                      type="checkbox"
                      checked={selectedSeverities.has(severity)}
                      onChange={() => toggleSeverity(severity)}
                    />
                    {" "}
                    {severity}
                  </label>
                ))}
              </div>
            </section>

            <section style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
              <h3 style={{ marginTop: 0 }}>Slack Channel</h3>
              <label>
                <input
                  type="checkbox"
                  checked={formState.slackEnabled}
                  onChange={(event) => updateForm({ slackEnabled: event.target.checked })}
                />
                {" "}
                Enable Slack incoming webhook delivery
              </label>
              <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
                Existing webhook: {toBoolString(config.channels.slack.hasWebhookUrl)}
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                <label>
                  New webhook URL
                  <input
                    type="password"
                    value={formState.slackWebhookUrlInput}
                    onChange={(event) =>
                      updateForm({ slackWebhookUrlInput: event.target.value, clearSlackWebhookUrl: false })
                    }
                    placeholder={config.channels.slack.hasWebhookUrl ? "Leave blank to keep existing" : "https://hooks.slack.com/..."}
                    style={{ marginLeft: 8, minWidth: 320 }}
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
            </section>

            <section style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
              <h3 style={{ marginTop: 0 }}>Email Channel</h3>
              <label>
                <input
                  type="checkbox"
                  checked={formState.emailEnabled}
                  onChange={(event) => updateForm({ emailEnabled: event.target.checked })}
                />
                {" "}
                Enable SMTP email delivery
              </label>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <label>
                  Recipients (comma-separated)
                  <input
                    value={formState.emailRecipientsCsv}
                    onChange={(event) => updateForm({ emailRecipientsCsv: event.target.value })}
                    style={{ marginLeft: 8, minWidth: 360 }}
                  />
                </label>
                <label>
                  From override (optional)
                  <input
                    value={formState.emailFrom}
                    onChange={(event) => updateForm({ emailFrom: event.target.value })}
                    style={{ marginLeft: 8, minWidth: 260 }}
                  />
                </label>
                <label>
                  Subject prefix (optional)
                  <input
                    value={formState.emailSubjectPrefix}
                    onChange={(event) => updateForm({ emailSubjectPrefix: event.target.value })}
                    style={{ marginLeft: 8, minWidth: 260 }}
                  />
                </label>
              </div>
            </section>

            <section style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
              <h3 style={{ marginTop: 0 }}>Outbound Webhook</h3>
              <label>
                <input
                  type="checkbox"
                  checked={formState.webhookEnabled}
                  onChange={(event) => updateForm({ webhookEnabled: event.target.checked })}
                />
                {" "}
                Enable generic webhook delivery
              </label>
              <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
                Existing URL: {toBoolString(config.channels.webhook.hasWebhookUrl)} | Auth header:{" "}
                {toBoolString(config.channels.webhook.hasAuthHeader)}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
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
                    style={{ marginLeft: 8, minWidth: 360 }}
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
                    style={{ marginLeft: 8, minWidth: 300 }}
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
                    style={{ display: "block", width: "100%", marginTop: 4, fontFamily: "monospace" }}
                    placeholder='{"X-Integration-Source":"platform-v1"}'
                  />
                </label>
              </div>
            </section>
          </form>

          <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Delivery Status</h3>
            <div style={{ display: "grid", gap: 4 }}>
              <div>
                <strong>Last Delivery Status:</strong>{" "}
                {config.lastDeliveryStatus || "none"}
              </div>
              <div>
                <strong>Last Delivery At:</strong> {config.lastDeliveryAt || "-"}
              </div>
              <div>
                <strong>Last Tested At:</strong> {config.lastTestedAt || "-"}
              </div>
              <div>
                <strong>Updated At:</strong> {config.updatedAt || "-"}
              </div>
            </div>
          </section>

          <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Recent Alert Delivery Logs</h3>
            {logs.length === 0 ? (
              <p>
                No alert delivery logs yet. Save config, click "Send Test Alert", then refresh
                this page.
              </p>
            ) : null}
            {logs.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th align="left">When</th>
                      <th align="left">Event</th>
                      <th align="left">Channel</th>
                      <th align="left">Status</th>
                      <th align="left">Attempt</th>
                      <th align="left">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((entry) => (
                      <tr key={entry.id} style={{ borderTop: "1px solid #ececec" }}>
                        <td>{entry.createdAt}</td>
                        <td>{entry.eventType}</td>
                        <td>{entry.channel}</td>
                        <td>{entry.status}</td>
                        <td>{entry.attemptCount}</td>
                        <td>{entry.errorMessage || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
