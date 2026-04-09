import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAlertConfig,
  sendTestAlert,
  listAlertDeliveryLogs,
  updateAlertConfig,
  type AlertConfigInput,
  type AlertConfigPublicView,
  type AlertDeliveryLogRecord,
  type AlertEventType,
  type AlertSeverity,
} from "../api";
import {
  Callout,
  DemoHint,
  FilterPills,
  LoadingInline,
  MetricTile,
  PageHeader,
  StatusPill,
} from "../components/ui-kit";
import {
  OperationsAdvancedFilterDrawer,
  OperationsConsoleLayout,
  OperationsFilterBar,
  OperationsListButton,
  OperationsStatusBadge,
} from "../features/operations/operations-console";
import { getAlertStatusDescriptor } from "../features/operations/operations-status";
import {
  ALERT_EVENT_GROUPS,
  ALERT_SEVERITY_OPTIONS,
  formatAlertMessage,
  formatHeadersJson,
  formatRecipientsCsv,
  getAlertCooldownCopy,
  parseHeadersJson,
  parseRecipientsCsv,
  shouldTriggerAlert,
  toBoolString,
} from "./alert-settings-helpers";
import {
  getLiveRefreshIntervalMs,
  type LiveRefreshMode,
  type ViewDensity,
} from "./workspace-view-helpers";

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

type AlertStreamFilterState = {
  eventType: string;
  severity: string;
  channel: string;
  status: string;
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

function deriveAlertLifecycleState(config: AlertConfigPublicView | null): "active" | "suppressed" {
  if (!config?.enabled) {
    return "suppressed";
  }
  const channelsEnabled =
    config.channels.slack.enabled ||
    config.channels.email.enabled ||
    config.channels.webhook.enabled;
  return channelsEnabled ? "active" : "suppressed";
}

function mapLogStatusToTaxonomy(status: AlertDeliveryLogRecord["status"]): "delivered" | "delivery_failed" | "deduped" {
  if (status === "sent") {
    return "delivered";
  }
  if (status === "failed") {
    return "delivery_failed";
  }
  return "deduped";
}

function extractRelatedRunId(entry: AlertDeliveryLogRecord | null): string | null {
  if (!entry) {
    return null;
  }
  const workflowRunId =
    (typeof entry.metadata.workflowRunId === "string" && entry.metadata.workflowRunId) ||
    (typeof entry.metadata.runId === "string" && entry.metadata.runId) ||
    (typeof entry.metadata.workflow_run_id === "string" && entry.metadata.workflow_run_id);
  return workflowRunId || null;
}

export function AlertSettingsPage() {
  const [config, setConfig] = useState<AlertConfigPublicView | null>(null);
  const [logs, setLogs] = useState<AlertDeliveryLogRecord[]>([]);
  const [formState, setFormState] = useState<AlertSettingsFormState | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [showPolicyDrawer, setShowPolicyDrawer] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [viewDensity, setViewDensity] = useState<ViewDensity>("comfortable");
  const [liveRefreshMode, setLiveRefreshMode] = useState<LiveRefreshMode>("30s");
  const [searchValue, setSearchValue] = useState("");
  const [streamFilters, setStreamFilters] = useState<AlertStreamFilterState>({
    eventType: "",
    severity: "",
    channel: "",
    status: "all",
  });
  const [filterForm, setFilterForm] = useState<AlertStreamFilterState>({
    eventType: "",
    severity: "",
    channel: "",
    status: "all",
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEventTypes = useMemo(() => new Set(formState?.eventTypes || []), [formState]);
  const selectedSeverities = useMemo(
    () => new Set(formState?.severities || []),
    [formState],
  );
  const previewEventType = (formState?.eventTypes[0] || "alert.test") as AlertEventType;
  const previewSeverity = formState?.severities[0] || "warn";

  const selectedLog = useMemo(
    () => logs.find((entry) => entry.id === selectedLogId) || null,
    [logs, selectedLogId],
  );
  const relatedRunId = useMemo(() => extractRelatedRunId(selectedLog), [selectedLog]);
  const derivedLifecycle = useMemo(() => deriveAlertLifecycleState(config), [config]);

  async function loadDeliveryLogs(filters: AlertStreamFilterState = streamFilters) {
    const apiStatus =
      filters.status === "delivered"
        ? "sent"
        : filters.status === "delivery_failed"
          ? "failed"
          : filters.status === "deduped"
            ? "deduped"
            : undefined;

    const response = await listAlertDeliveryLogs({
      eventType: filters.eventType || undefined,
      severity: filters.severity || undefined,
      status: apiStatus,
      channel: filters.channel || undefined,
      limit: 200,
      sort: [{ field: "created_at", direction: "desc" }],
    });
    setLogs(response.rows);
    setSelectedLogId((current) => {
      if (current && response.rows.some((entry) => entry.id === current)) {
        return current;
      }
      return response.rows[0]?.id || null;
    });
    setLastSyncedAt(new Date().toISOString());
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAlertConfig();
      setConfig(payload.config);
      setFormState(toFormState(payload.config));
      setLogs(payload.deliveryLogs || []);
      setSelectedLogId((current) => {
        if (current && (payload.deliveryLogs || []).some((entry) => entry.id === current)) {
          return current;
        }
        return payload.deliveryLogs?.[0]?.id || null;
      });
      setLastSyncedAt(new Date().toISOString());
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load alert settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const intervalMs = getLiveRefreshIntervalMs(liveRefreshMode);
    if (!intervalMs) {
      return;
    }

    const intervalHandle = window.setInterval(() => {
      void load();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalHandle);
    };
  }, [liveRefreshMode]);

  useEffect(() => {
    if (!config) {
      return;
    }
    void loadDeliveryLogs(streamFilters).catch((loadError: unknown) => {
      setError((loadError as Error).message || "Failed to load alert delivery logs.");
    });
  }, [config, streamFilters]);

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
      setShowPolicyDrawer(false);
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

  const statusCounts = useMemo(() => {
    const delivered = logs.filter((entry) => entry.status === "sent").length;
    const deliveryFailed = logs.filter((entry) => entry.status === "failed").length;
    const deduped = logs.filter((entry) => entry.status === "deduped").length;
    return {
      delivered,
      deliveryFailed,
      deduped,
      active: derivedLifecycle === "active" ? 1 : 0,
      suppressed: derivedLifecycle === "suppressed" ? 1 : 0,
    };
  }, [logs, derivedLifecycle]);

  const visibleLogs = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return logs.filter((entry) => {
      const taxonomyStatus = mapLogStatusToTaxonomy(entry.status);
      if (streamFilters.status !== "all" && streamFilters.status !== taxonomyStatus) {
        return false;
      }
      if (streamFilters.eventType && entry.eventType !== streamFilters.eventType) {
        return false;
      }
      if (streamFilters.severity && entry.severity !== streamFilters.severity) {
        return false;
      }
      if (streamFilters.channel && entry.channel !== streamFilters.channel) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        entry.eventType,
        entry.channel,
        entry.severity,
        entry.errorMessage || "",
        String(entry.responseCode || ""),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [logs, searchValue, streamFilters]);

  useEffect(() => {
    if (!visibleLogs.length) {
      setSelectedLogId(null);
      return;
    }
    if (selectedLogId && visibleLogs.some((entry) => entry.id === selectedLogId)) {
      return;
    }
    setSelectedLogId(visibleLogs[0].id);
  }, [visibleLogs, selectedLogId]);

  const streamStatusPills = useMemo(
    () => [
      { id: "all", label: "All stream events", count: logs.length },
      { id: "delivered", label: "Delivered", count: statusCounts.delivered },
      { id: "delivery_failed", label: "Delivery failed", count: statusCounts.deliveryFailed },
      { id: "deduped", label: "Deduped", count: statusCounts.deduped },
    ],
    [logs.length, statusCounts],
  );

  const availableEventTypes = useMemo(
    () => Array.from(new Set(logs.map((entry) => entry.eventType))).sort(),
    [logs],
  );
  const availableChannels = useMemo(
    () => Array.from(new Set(logs.map((entry) => entry.channel))).sort(),
    [logs],
  );
  const availableSeverities = useMemo(
    () => Array.from(new Set(logs.map((entry) => entry.severity))).sort(),
    [logs],
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Alerts"
        title="Alert Operations Console"
        subtitle="Monitor alert delivery outcomes, inspect failures, and maintain escalation policy from one console."
      />

      <div className="metric-grid">
        <MetricTile label="Lifecycle" value={derivedLifecycle === "active" ? "Active" : "Suppressed"} />
        <MetricTile label="Delivered" value={String(statusCounts.delivered)} />
        <MetricTile label="Delivery failed" value={String(statusCounts.deliveryFailed)} />
        <MetricTile label="Deduped" value={String(statusCounts.deduped)} />
      </div>

      <OperationsConsoleLayout
        toolbar={
          <OperationsFilterBar
            searchValue={searchValue}
            searchPlaceholder="Search by event, channel, severity, error"
            onSearchValueChange={setSearchValue}
            primaryFilters={
              <FilterPills
                options={streamStatusPills}
                value={streamFilters.status}
                onChange={(next) =>
                  setStreamFilters((current) => ({
                    ...current,
                    status: next,
                  }))
                }
              />
            }
            actions={
              <>
                <span className="tag">Lifecycle: {derivedLifecycle}</span>
                <span className="tag">
                  Last synced {lastSyncedAt ? formatDateTime(lastSyncedAt) : "not yet"}
                </span>
                <button type="button" onClick={() => setShowFilterDrawer(true)}>
                  Advanced filters
                </button>
                <button type="button" className="button-ghost" onClick={() => setShowPolicyDrawer(true)}>
                  Alert policy
                </button>
                <button type="button" onClick={() => void load()}>
                  Refresh
                </button>
              </>
            }
          />
        }
        leftTitle="Alert stream"
        leftSubtitle="Recent delivery attempts and dedupe outcomes."
        leftMeta={
          <div className="inline-actions">
            <StatusPill tone={liveRefreshMode === "off" ? "warning" : "success"}>
              {liveRefreshMode === "off" ? "Live refresh off" : `Auto-refresh ${liveRefreshMode}`}
            </StatusPill>
            <label>
              View
              <select
                value={viewDensity}
                onChange={(event) => setViewDensity(event.target.value as ViewDensity)}
                style={{ marginLeft: 8 }}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label>
              Live
              <select
                value={liveRefreshMode}
                onChange={(event) => setLiveRefreshMode(event.target.value as LiveRefreshMode)}
                style={{ marginLeft: 8 }}
              >
                <option value="off">Off</option>
                <option value="15s">15s</option>
                <option value="30s">30s</option>
                <option value="60s">60s</option>
              </select>
            </label>
          </div>
        }
        leftPane={
          <>
            {loading ? <LoadingInline label="Loading alert stream..." /> : null}
            {error ? <Callout tone="danger" title={error} /> : null}
            {message ? <Callout tone="success" title={message} /> : null}

            {visibleLogs.length === 0 ? (
              <Callout tone="info" title="No delivery events yet">
                <p>Send a test alert or wait for the next triggered event.</p>
                <div className="inline-actions">
                  <button type="button" onClick={() => void onSendTestAlert()} disabled={testing}>
                    {testing ? "Sending..." : "Send test alert"}
                  </button>
                  <Link to="/runs">Open runs</Link>
                </div>
              </Callout>
            ) : (
              <div className="stack-sm">
                {visibleLogs.map((entry) => {
                  const descriptor = getAlertStatusDescriptor(mapLogStatusToTaxonomy(entry.status));
                  return (
                    <OperationsListButton
                      key={entry.id}
                      title={entry.eventType}
                      subtitle={`${entry.channel} | ${entry.severity}`}
                      selected={selectedLogId === entry.id}
                      status={<OperationsStatusBadge tone={descriptor.tone} label={descriptor.label} />}
                      meta={
                        <>
                          <span className="tag">Attempt {entry.attemptCount}</span>
                          <span className="tag">{formatDateTime(entry.createdAt)}</span>
                        </>
                      }
                      onClick={() => setSelectedLogId(entry.id)}
                    />
                  );
                })}
              </div>
            )}
          </>
        }
        rightTitle="Delivery detail"
        rightSubtitle="Channel diagnostics, payload metadata, and related run links."
        rightMeta={
          <div className="inline-actions">
            <Link to="/runs">Runs</Link>
            <Link to="/audit-logs">Audit</Link>
            <button type="button" onClick={() => void onSendTestAlert()} disabled={testing}>
              {testing ? "Sending..." : "Send test"}
            </button>
          </div>
        }
        rightPane={
          <>
            <DemoHint>
              Alert lifecycle contract: active/suppressed policy + delivered/deduped/delivery_failed stream outcomes.
            </DemoHint>

            {config ? (
              <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <strong>Policy state</strong>
                  <OperationsStatusBadge
                    tone={getAlertStatusDescriptor(derivedLifecycle).tone}
                    label={getAlertStatusDescriptor(derivedLifecycle).label}
                  />
                </div>
                <p style={{ marginTop: 6 }}>
                  Cooldown: {getAlertCooldownCopy(config.cooldownSeconds)} | Last delivery:{" "}
                  {formatDateTime(config.lastDeliveryAt)}
                </p>
                <div className="tag-row" style={{ marginTop: 8 }}>
                  <span className="tag">Slack {toBoolString(config.channels.slack.enabled)}</span>
                  <span className="tag">Email {toBoolString(config.channels.email.enabled)}</span>
                  <span className="tag">Webhook {toBoolString(config.channels.webhook.enabled)}</span>
                </div>
              </div>
            ) : null}

            {!selectedLog ? (
              <Callout tone="info" title="Select an alert stream item to inspect details." />
            ) : (
              <div className="stack-sm">
                <Callout
                  tone={getAlertStatusDescriptor(mapLogStatusToTaxonomy(selectedLog.status)).tone}
                  title={`Delivery status: ${getAlertStatusDescriptor(mapLogStatusToTaxonomy(selectedLog.status)).label}`}
                >
                  <p>
                    {selectedLog.errorMessage
                      ? selectedLog.errorMessage
                      : "Delivery recorded successfully."}
                  </p>
                </Callout>

                <div className="inline-actions">
                  <span className="tag">{selectedLog.channel}</span>
                  <span className="tag">{selectedLog.severity}</span>
                  <span className="tag">Response {selectedLog.responseCode || "-"}</span>
                </div>

                <div><strong>Event type:</strong> {selectedLog.eventType}</div>
                <div><strong>Occurred:</strong> {formatDateTime(selectedLog.createdAt)}</div>
                <div><strong>Dispatch ID:</strong> {selectedLog.dispatchId || "-"}</div>
                <div><strong>Attempt count:</strong> {selectedLog.attemptCount}</div>
                <div><strong>Error:</strong> {selectedLog.errorMessage || "-"}</div>

                <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                  <strong>Metadata</strong>
                  <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                    {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                  </pre>
                </div>

                <div className="inline-actions">
                  {relatedRunId ? (
                    <Link to={`/runs?runId=${encodeURIComponent(relatedRunId)}`}>Open related run</Link>
                  ) : null}
                  {selectedLog.dispatchId ? (
                    <Link
                      to={`/audit-logs?targetType=alert_dispatch&targetId=${encodeURIComponent(selectedLog.dispatchId)}`}
                    >
                      Related audit events
                    </Link>
                  ) : (
                    <Link to="/audit-logs">Open audit console</Link>
                  )}
                </div>
              </div>
            )}
          </>
        }
      />

      <OperationsAdvancedFilterDrawer
        open={showFilterDrawer}
        title="Alert stream filters"
        description="Filter stream entries by event type, severity, channel, and status."
        onClose={() => setShowFilterDrawer(false)}
        onApply={(event) => {
          event.preventDefault();
          setStreamFilters(filterForm);
          setShowFilterDrawer(false);
        }}
        onReset={() => {
          const reset = {
            eventType: "",
            severity: "",
            channel: "",
            status: "all",
          };
          setFilterForm(reset);
          setStreamFilters(reset);
          setShowFilterDrawer(false);
        }}
      >
        <FilterPills
          options={streamStatusPills}
          value={filterForm.status}
          onChange={(next) => setFilterForm((current) => ({ ...current, status: next }))}
        />
        <label>
          Event type
          <select
            value={filterForm.eventType}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, eventType: event.target.value }))
            }
          >
            <option value="">All event types</option>
            {availableEventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select
            value={filterForm.severity}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, severity: event.target.value }))
            }
          >
            <option value="">All severities</option>
            {availableSeverities.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label>
          Channel
          <select
            value={filterForm.channel}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, channel: event.target.value }))
            }
          >
            <option value="">All channels</option>
            {availableChannels.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </label>
      </OperationsAdvancedFilterDrawer>

      <OperationsAdvancedFilterDrawer
        open={showPolicyDrawer}
        title="Alert policy"
        description="Configure channels, event groups, and cooldown behavior."
        onClose={() => setShowPolicyDrawer(false)}
        onApply={onSave}
        applyLabel={saving ? "Saving..." : "Save policy"}
      >
        {!formState || !config ? (
          <LoadingInline label="Loading policy..." />
        ) : (
          <>
            <DemoHint>
              Configure escalation policy once, then validate with test alerts and monitor delivery stream outcomes.
            </DemoHint>

            <label>
              <input
                type="checkbox"
                checked={formState.enabled}
                onChange={(event) => updateForm({ enabled: event.target.checked })}
              />
              {" "}
              Enable alerts for this workspace
            </label>

            <label>
              Cooldown / dedupe (seconds)
              <input
                type="number"
                min={0}
                step={5}
                value={formState.cooldownSeconds}
                onChange={(event) =>
                  updateForm({
                    cooldownSeconds: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </label>

            <Callout tone="info" title="Preview message">
              <p>
                {formatAlertMessage({
                  eventType: previewEventType,
                  severity: previewSeverity,
                  details: "Sample from settings preview",
                })}
              </p>
              <p style={{ marginTop: 6 }}>
                Trigger now:{" "}
                {shouldTriggerAlert({
                  enabled: formState.enabled,
                  selectedEventTypes: formState.eventTypes as AlertEventType[],
                  selectedSeverities: formState.severities,
                  eventType: previewEventType,
                  severity: previewSeverity,
                })
                  ? "yes"
                  : "no"}
              </p>
            </Callout>

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
                <strong>Severities:</strong>
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

            <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
              <strong>Slack channel</strong>
              <div className="stack-sm" style={{ marginTop: 8 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.slackEnabled}
                    onChange={(event) => updateForm({ slackEnabled: event.target.checked })}
                  />
                  {" "}
                  Enable Slack delivery
                </label>
                <p>Existing webhook: <strong>{toBoolString(config.channels.slack.hasWebhookUrl)}</strong></p>
                <label>
                  New webhook URL
                  <input
                    type="password"
                    value={formState.slackWebhookUrlInput}
                    onChange={(event) =>
                      updateForm({ slackWebhookUrlInput: event.target.value, clearSlackWebhookUrl: false })
                    }
                    placeholder={config.channels.slack.hasWebhookUrl ? "Leave blank to keep existing" : "https://hooks.slack.com/..."}
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
                          slackWebhookUrlInput: event.target.checked ? "" : formState.slackWebhookUrlInput,
                        })
                      }
                    />
                    {" "}
                    Clear existing webhook URL
                  </label>
                ) : null}
              </div>
            </div>

            <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
              <strong>Email channel</strong>
              <div className="stack-sm" style={{ marginTop: 8 }}>
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
                  />
                </label>
                <label>
                  From override (optional)
                  <input
                    value={formState.emailFrom}
                    onChange={(event) => updateForm({ emailFrom: event.target.value })}
                  />
                </label>
                <label>
                  Subject prefix (optional)
                  <input
                    value={formState.emailSubjectPrefix}
                    onChange={(event) => updateForm({ emailSubjectPrefix: event.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
              <strong>Webhook channel</strong>
              <div className="stack-sm" style={{ marginTop: 8 }}>
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
                          webhookAuthHeaderInput: event.target.checked ? "" : formState.webhookAuthHeaderInput,
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
                    style={{ fontFamily: "monospace" }}
                    placeholder='{"X-Integration-Source":"platform-v1"}'
                  />
                </label>
              </div>
            </div>
          </>
        )}
      </OperationsAdvancedFilterDrawer>
    </div>
  );
}
