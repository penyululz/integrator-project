import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  completeAdapterAuth,
  disconnectAppConnection,
  listApps,
  startAdapterAuth,
  testAppConnection,
  upsertAppConnection,
  type AppConnectionRecord,
} from "../api";
import {
  buildConnectionPayload,
  buildInitialFormState,
  getStatusColor,
  normalizeTextValue,
  type ConnectionFormState,
  validateRequiredFields,
} from "./integration-connection-helpers";

export function IntegrationsPage() {
  const [searchParams] = useSearchParams();
  const [apps, setApps] = useState<AppConnectionRecord[]>([]);
  const [forms, setForms] = useState<Record<string, ConnectionFormState>>({});
  const [oauthCodes, setOauthCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingByApp, setTestingByApp] = useState<Record<string, boolean>>({});
  const [savingByApp, setSavingByApp] = useState<Record<string, boolean>>({});

  const highlightAppKey = searchParams.get("appKey") || "";
  const returnTo = searchParams.get("returnTo") || "";
  const templateId = searchParams.get("templateId") || "";

  const redirectUri = `${window.location.origin}/integrations`;

  async function load() {
    setLoading(true);
    try {
      const appRecords = await listApps();
      setApps(appRecords);
      setForms((current) => {
        const next: Record<string, ConnectionFormState> = { ...current };
        for (const app of appRecords) {
          if (!next[app.key]) {
            next[app.key] = buildInitialFormState(app);
          }
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const appCounts = useMemo(() => {
    const connected = apps.filter((app) => app.status === "connected").length;
    const needsAttention = apps.filter(
      (app) => app.status === "expired" || app.status === "invalid",
    ).length;
    return {
      total: apps.length,
      connected,
      needsAttention,
    };
  }, [apps]);

  function updateFormValue(appKey: string, fieldKey: string, value: string | boolean) {
    setForms((current) => ({
      ...current,
      [appKey]: {
        ...(current[appKey] || {}),
        [fieldKey]: value,
      },
    }));
  }

  async function onSaveConnection(app: AppConnectionRecord) {
    const formState = forms[app.key] || buildInitialFormState(app);
    const missingRequired = validateRequiredFields(app, formState);
    if (missingRequired.length > 0) {
      setError(`Missing required setup fields for ${app.name}: ${missingRequired.join(", ")}.`);
      setMessage(null);
      return;
    }

    const payload = buildConnectionPayload(app, formState);

    setSavingByApp((current) => ({ ...current, [app.key]: true }));
    setError(null);
    setMessage(null);

    try {
      const credentialPayload =
        Object.keys(payload.credentialMetadata).length > 0 ||
        Object.keys(payload.credentialSensitiveConfig).length > 0 ||
        payload.credentialApiKey ||
        payload.credentialAccessToken
          ? {
              authType: app.authType,
              apiKey: payload.credentialApiKey,
              accessToken: payload.credentialAccessToken,
              metadata: payload.credentialMetadata,
              sensitiveConfig: payload.credentialSensitiveConfig,
            }
          : undefined;

      await upsertAppConnection({
        appKey: app.key,
        integrationName: payload.integrationName,
        integrationConfig: payload.integrationConfig,
        credential: credentialPayload,
      });

      setMessage(`${app.name} connection saved.`);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message || `Failed to save ${app.name} connection.`);
    } finally {
      setSavingByApp((current) => ({ ...current, [app.key]: false }));
    }
  }

  function buildOauthConnectionParams(app: AppConnectionRecord): Record<string, unknown> {
    const formState = forms[app.key] || buildInitialFormState(app);
    const payload = buildConnectionPayload(app, formState);
    return {
      ...payload.integrationConfig,
      ...payload.credentialMetadata,
    };
  }

  async function onStartOAuth(app: AppConnectionRecord) {
    setError(null);
    setMessage(null);

    try {
      const auth = await startAdapterAuth({
        adapterKey: app.key,
        redirectUri,
        scopes: app.oauthScopes,
        connection: buildOauthConnectionParams(app),
      });
      if (auth.authUrl) {
        window.open(auth.authUrl, "_blank", "noopener,noreferrer");
      }
      setMessage(
        `Opened ${app.name} login. Complete consent, then paste callback code below to finish connection.`,
      );
    } catch (authError) {
      setError((authError as Error).message || `Failed to start ${app.name} connection.`);
    }
  }

  async function onCompleteOAuth(event: FormEvent, app: AppConnectionRecord) {
    event.preventDefault();
    const code = (oauthCodes[app.key] || "").trim();
    if (!code) {
      setError(`Callback code is required to complete ${app.name} connection.`);
      setMessage(null);
      return;
    }

    setError(null);
    setMessage(null);

    try {
      await completeAdapterAuth({
        adapterKey: app.key,
        code,
        redirectUri,
        integrationId: app.connection.integrationId || undefined,
        connection: buildOauthConnectionParams(app),
      });
      setOauthCodes((current) => ({ ...current, [app.key]: "" }));
      setMessage(`${app.name} is now connected.`);
      await load();
    } catch (authError) {
      setError((authError as Error).message || `Failed to complete ${app.name} connection.`);
    }
  }

  async function onDisconnect(app: AppConnectionRecord) {
    setError(null);
    setMessage(null);
    try {
      await disconnectAppConnection(app.key);
      setMessage(`${app.name} disconnected.`);
      await load();
    } catch (disconnectError) {
      setError((disconnectError as Error).message || `Failed to disconnect ${app.name}.`);
    }
  }

  async function onTestConnection(app: AppConnectionRecord) {
    setTestingByApp((current) => ({ ...current, [app.key]: true }));
    setError(null);
    setMessage(null);

    try {
      const result = await testAppConnection({
        appKey: app.key,
        integrationConfig: forms[app.key] ? buildConnectionPayload(app, forms[app.key]).integrationConfig : undefined,
      });
      if (result.status === "valid") {
        setMessage(`${app.name} test passed.`);
      } else {
        setMessage(`${app.name} test returned ${result.status}: ${result.reason || "check settings"}.`);
      }
      await load();
    } catch (testError) {
      setError((testError as Error).message || `Failed to test ${app.name} connection.`);
    } finally {
      setTestingByApp((current) => ({ ...current, [app.key]: false }));
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Apps and Connections</h2>
      <p>
        Configure app connections in the web UI. Use <code>.env</code> only for platform runtime
        settings like database, Redis, JWT, and encryption keys.
      </p>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Connection Summary</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>Total Apps: <strong>{appCounts.total}</strong></div>
          <div>Connected: <strong>{appCounts.connected}</strong></div>
          <div>Needs Attention: <strong>{appCounts.needsAttention}</strong></div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/workflows">Build Workflow</Link>
          <Link to="/runs">View Runs</Link>
          <Link to="/onboarding">Onboarding</Link>
          {returnTo ? <Link to={returnTo}>Return to previous step</Link> : null}
        </div>
      </section>

      {templateId ? (
        <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Template Setup</h3>
          <p style={{ marginBottom: 6 }}>
            This setup came from a template workflow. Connect missing apps here, then return to continue.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to={`/workflows?templateId=${encodeURIComponent(templateId)}`}>Back to Template</Link>
            <Link to="/workflows">Browse Templates</Link>
          </div>
        </section>
      ) : null}

      {loading ? <p>Loading apps...</p> : null}
      {message ? <p style={{ color: "#0f5132" }}>{message}</p> : null}
      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}

      <div style={{ display: "grid", gap: 12 }}>
        {apps.map((app) => {
          const formState = forms[app.key] || buildInitialFormState(app);
          const isHighlighted = highlightAppKey === app.key;
          const saveDisabled = savingByApp[app.key] || !app.actions.canEdit;
          const testDisabled = testingByApp[app.key] || !app.actions.canTestConnection;

          return (
            <section
              key={app.key}
              style={{
                border: isHighlighted ? "2px solid #2563eb" : "1px solid #d0d0d0",
                borderRadius: 10,
                padding: 12,
                background: isHighlighted ? "#f8fbff" : "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0 }}>{app.name}</h3>
                  <div style={{ fontSize: 13, color: "#555" }}>{app.description}</div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    Setup: <strong>{app.setupLabel}</strong> ({app.setupMethod})
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: getStatusColor(app.status), fontWeight: 600 }}>
                    {app.status === "connected" ? "Connected" : app.status === "not_connected" ? "Not Connected" : app.status}
                  </div>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    Triggers: {app.supportedTriggers.length ? app.supportedTriggers.join(", ") : "none"}
                  </div>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    Actions: {app.supportedActions.length ? app.supportedActions.join(", ") : "none"}
                  </div>
                </div>
              </div>

              <ul style={{ marginTop: 8 }}>
                {app.setupNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>

              {app.platformManagedFields.length > 0 ? (
                <p style={{ marginTop: 0, fontSize: 12, color: "#555" }}>
                  Platform-level settings (keep in <code>.env</code>): {app.platformManagedFields.join(", ")}
                </p>
              ) : null}

              <div style={{ display: "grid", gap: 8 }}>
                <label>
                  Connection Name
                  <input
                    value={normalizeTextValue(formState.integrationName)}
                    onChange={(event) => updateFormValue(app.key, "integrationName", event.target.value)}
                    style={{ marginLeft: 8, minWidth: 260 }}
                  />
                </label>

                {app.setupFields.map((field) => (
                  <label key={`${app.key}-${field.key}`}>
                    {field.label}
                    {field.required ? " *" : ""}
                    {field.inputType === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={Boolean(formState[field.key])}
                        onChange={(event) =>
                          updateFormValue(app.key, field.key, event.target.checked)
                        }
                        style={{ marginLeft: 8 }}
                      />
                    ) : (
                      <input
                        type={field.inputType === "password" ? "password" : field.inputType === "number" ? "number" : "text"}
                        value={normalizeTextValue(formState[field.key])}
                        placeholder={field.placeholder}
                        onChange={(event) => updateFormValue(app.key, field.key, event.target.value)}
                        style={{ marginLeft: 8, minWidth: 280 }}
                      />
                    )}
                    {field.helpText ? (
                      <div style={{ fontSize: 12, color: "#555" }}>{field.helpText}</div>
                    ) : null}
                  </label>
                ))}
              </div>

              {app.setupMethod === "oauth2" ? (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={!app.actions.canConnect}
                      onClick={() => void onStartOAuth(app)}
                    >
                      {app.connected ? "Reconnect" : "Connect"}
                    </button>
                    <button
                      type="button"
                      disabled={saveDisabled}
                      onClick={() => void onSaveConnection(app)}
                    >
                      Save Setup
                    </button>
                    <button
                      type="button"
                      disabled={testDisabled}
                      onClick={() => void onTestConnection(app)}
                    >
                      {testingByApp[app.key] ? "Testing..." : "Test Connection"}
                    </button>
                    {app.actions.canDisconnect ? (
                      <button type="button" onClick={() => void onDisconnect(app)}>
                        Disconnect
                      </button>
                    ) : null}
                  </div>

                  <form onSubmit={(event) => void onCompleteOAuth(event, app)}>
                    <label>
                      Callback Code
                      <input
                        value={oauthCodes[app.key] || ""}
                        onChange={(event) =>
                          setOauthCodes((current) => ({
                            ...current,
                            [app.key]: event.target.value,
                          }))
                        }
                        style={{ marginLeft: 8, minWidth: 280 }}
                        placeholder="Paste code from provider callback"
                      />
                    </label>
                    <button type="submit" style={{ marginLeft: 8 }}>
                      Finish Connection
                    </button>
                  </form>
                </div>
              ) : (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={saveDisabled}
                    onClick={() => void onSaveConnection(app)}
                  >
                    {savingByApp[app.key] ? "Saving..." : app.connected ? "Update Connection" : "Connect"}
                  </button>
                  <button
                    type="button"
                    disabled={testDisabled}
                    onClick={() => void onTestConnection(app)}
                  >
                    {testingByApp[app.key] ? "Testing..." : "Test Connection"}
                  </button>
                  {app.actions.canDisconnect ? (
                    <button type="button" onClick={() => void onDisconnect(app)}>
                      Disconnect
                    </button>
                  ) : null}
                </div>
              )}

              {app.connection.validationError ? (
                <p style={{ marginTop: 8, color: "#b42318" }}>{app.connection.validationError}</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
