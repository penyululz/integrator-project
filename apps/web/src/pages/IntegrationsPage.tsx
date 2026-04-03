import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
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
import {
  buildOAuthRedirectUri,
  getOAuthPendingStorageKey,
  parseOAuthCallbackInfo,
  stripOAuthParamsFromSearch,
} from "./integration-oauth-helpers";

type PendingOAuthPayload = {
  integrationId?: string;
  connection?: Record<string, unknown>;
};

function readPendingOAuth(appKey: string): PendingOAuthPayload | null {
  try {
    const raw = window.localStorage.getItem(getOAuthPendingStorageKey(appKey));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PendingOAuthPayload;
  } catch {
    return null;
  }
}

function clearPendingOAuth(appKey: string) {
  window.localStorage.removeItem(getOAuthPendingStorageKey(appKey));
}

export function IntegrationsPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [apps, setApps] = useState<AppConnectionRecord[]>([]);
  const [forms, setForms] = useState<Record<string, ConnectionFormState>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingByApp, setTestingByApp] = useState<Record<string, boolean>>({});
  const [savingByApp, setSavingByApp] = useState<Record<string, boolean>>({});
  const oauthCompletionKeyRef = useRef<string | null>(null);

  const highlightAppKey = searchParams.get("appKey") || "";
  const returnTo = searchParams.get("returnTo") || "";
  const templateId = searchParams.get("templateId") || "";

  const oauthCallbackInfo = useMemo(
    () => parseOAuthCallbackInfo(location.search),
    [location.search],
  );

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

  function cleanupOAuthParamsFromUrl() {
    const cleanedSearch = stripOAuthParamsFromSearch(location.search);
    window.history.replaceState(
      {},
      "",
      `${location.pathname}${cleanedSearch}${location.hash}`,
    );
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!oauthCallbackInfo.hasCallback) {
      return;
    }

    const callbackAppKey =
      oauthCallbackInfo.appKey || oauthCallbackInfo.state || highlightAppKey;
    if (!callbackAppKey) {
      setError("OAuth callback is missing app context. Please reconnect from Apps.");
      cleanupOAuthParamsFromUrl();
      return;
    }

    const completionKey = `${callbackAppKey}:${oauthCallbackInfo.code || oauthCallbackInfo.error || "none"}`;
    if (oauthCompletionKeyRef.current === completionKey) {
      return;
    }
    oauthCompletionKeyRef.current = completionKey;

    if (oauthCallbackInfo.error) {
      setError(
        `Connection was not completed: ${oauthCallbackInfo.errorDescription || oauthCallbackInfo.error}.`,
      );
      clearPendingOAuth(callbackAppKey);
      cleanupOAuthParamsFromUrl();
      return;
    }

    if (!oauthCallbackInfo.code) {
      setError("OAuth callback is missing code. Please reconnect and try again.");
      cleanupOAuthParamsFromUrl();
      return;
    }

    const redirectUri = buildOAuthRedirectUri({
      origin: window.location.origin,
      appKey: callbackAppKey,
      returnTo: returnTo || undefined,
      templateId: templateId || undefined,
    });

    const pending = readPendingOAuth(callbackAppKey);

    void (async () => {
      setError(null);
      setMessage(`Completing ${callbackAppKey} connection...`);
      try {
        await completeAdapterAuth({
          adapterKey: callbackAppKey,
          code: oauthCallbackInfo.code!,
          redirectUri,
          integrationId: pending?.integrationId,
          connection: pending?.connection,
        });

        clearPendingOAuth(callbackAppKey);
        cleanupOAuthParamsFromUrl();
        await load();

        setMessage(
          `${callbackAppKey} is now connected. ${returnTo ? "Use the return link below to continue setup." : "You can now create your automation."}`,
        );
      } catch (authError) {
        setError(
          (authError as Error).message ||
            `Failed to complete ${callbackAppKey} connection.`,
        );
      }
    })();
  }, [oauthCallbackInfo, highlightAppKey, returnTo, templateId]);

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
      const redirectUri = buildOAuthRedirectUri({
        origin: window.location.origin,
        appKey: app.key,
        returnTo: returnTo || undefined,
        templateId: templateId || undefined,
      });
      const pendingPayload: PendingOAuthPayload = {
        integrationId: app.connection.integrationId || undefined,
        connection: buildOauthConnectionParams(app),
      };
      window.localStorage.setItem(
        getOAuthPendingStorageKey(app.key),
        JSON.stringify(pendingPayload),
      );

      const auth = await startAdapterAuth({
        adapterKey: app.key,
        redirectUri,
        state: app.key,
        scopes: app.oauthScopes,
        connection: pendingPayload.connection,
      });

      if (!auth.authUrl) {
        throw new Error("Provider did not return an OAuth URL.");
      }

      setMessage(`Redirecting to ${app.name} for secure sign-in...`);
      window.location.assign(auth.authUrl);
    } catch (authError) {
      setError((authError as Error).message || `Failed to start ${app.name} connection.`);
    }
  }

  async function onDisconnect(app: AppConnectionRecord) {
    setError(null);
    setMessage(null);
    try {
      await disconnectAppConnection(app.key);
      clearPendingOAuth(app.key);
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
        integrationConfig: forms[app.key]
          ? buildConnectionPayload(app, forms[app.key]).integrationConfig
          : undefined,
      });
      if (result.status === "valid") {
        setMessage(`${app.name} test passed.`);
      } else {
        setMessage(
          `${app.name} test returned ${result.status}: ${result.reason || "check settings"}.`,
        );
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
          <div>
            Total Apps: <strong>{appCounts.total}</strong>
          </div>
          <div>
            Connected: <strong>{appCounts.connected}</strong>
          </div>
          <div>
            Needs Attention: <strong>{appCounts.needsAttention}</strong>
          </div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/first-automation">First Automation Wizard</Link>
          <Link to="/workflows">Build Automation</Link>
          <Link to="/runs">View Test Runs</Link>
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
            <Link to="/first-automation">Open First Automation Wizard</Link>
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>{app.name}</h3>
                  <div style={{ fontSize: 13, color: "#555" }}>{app.description}</div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    Setup: <strong>{app.setupLabel}</strong>
                    {" "}
                    ({app.setupMethod})
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: getStatusColor(app.status), fontWeight: 600 }}>
                    {app.status === "connected"
                      ? "Connected"
                      : app.status === "not_connected"
                        ? "Not Connected"
                        : app.status}
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
                    onChange={(event) =>
                      updateFormValue(app.key, "integrationName", event.target.value)
                    }
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
                        type={
                          field.inputType === "password"
                            ? "password"
                            : field.inputType === "number"
                              ? "number"
                              : "text"
                        }
                        value={normalizeTextValue(formState[field.key])}
                        placeholder={field.placeholder}
                        onChange={(event) =>
                          updateFormValue(app.key, field.key, event.target.value)
                        }
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

                  <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
                    OAuth connection completes automatically when you return from the provider.
                  </p>

                  {app.connected ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#0f5132" }}>
                      Connected. Next step: trigger a test run in your first automation.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={saveDisabled}
                    onClick={() => void onSaveConnection(app)}
                  >
                    {savingByApp[app.key]
                      ? "Saving..."
                      : app.connected
                        ? "Update Connection"
                        : "Connect"}
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
