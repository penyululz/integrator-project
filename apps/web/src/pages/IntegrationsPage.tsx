import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  completeAdapterAuth,
  disconnectAppConnection,
  listApps,
  listWorkflowTemplates,
  startAdapterAuth,
  testAppConnection,
  upsertAppConnection,
  type AppConnectionRecord,
  type WorkflowTemplateSummary,
} from "../api";
import { Callout, DemoHint, LoadingInline, PageHeader, StatusPill, SurfaceCard } from "../components/ui-kit";
import { AppIcon } from "../components/AppIcon";
import {
  buildConnectionPayload,
  buildInitialFormState,
  normalizeTextValue,
  type ConnectionFormState,
  validateRequiredFields,
} from "./integration-connection-helpers";
import {
  describeSetupMethod,
  getAppVisual,
  getSuggestedTemplatesForApp,
  toConnectionStatusLabel,
} from "./integrations-catalog-helpers";
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
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
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
      const [appRecords, templateRecords] = await Promise.all([
        listApps(),
        listWorkflowTemplates(),
      ]);

      setApps(appRecords);
      setTemplates(templateRecords);
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
      setError("Connection callback is missing app context. Please reconnect from Apps.");
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
      setError("Connection callback is missing code. Please reconnect and try again.");
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
          `${callbackAppKey} is connected. You can continue creating your automation now.`,
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
    <div className="stack">
      <PageHeader
        eyebrow="Apps"
        title="Connect Your Apps"
        subtitle="Set up connections once, then reuse them across templates and automations. OAuth connections complete automatically when you return from the provider."
        actions={
          <>
            <StatusPill tone="info">{appCounts.total} apps</StatusPill>
            <StatusPill tone="success">{appCounts.connected} connected</StatusPill>
            <StatusPill tone={appCounts.needsAttention > 0 ? "warning" : "info"}>
              {appCounts.needsAttention} need attention
            </StatusPill>
            <Link to="/first-automation">Open First Automation</Link>
            <Link to="/workflows">Browse Templates</Link>
          </>
        }
      />

      {templateId ? (
        <Callout
          tone="info"
          title="Template setup in progress"
          actions={
            <>
              <Link to={`/workflows?templateId=${encodeURIComponent(templateId)}`}>Return to template</Link>
              <Link to="/first-automation">Open wizard</Link>
            </>
          }
        >
          <p>
            Connect the required apps here, then return and continue your automation setup.
          </p>
        </Callout>
      ) : null}

      {message ? (
        <Callout tone="success" title="Connection updated">
          <p>{message}</p>
          <div className="inline-actions">
            <Link to="/first-automation">Continue to first automation</Link>
            <Link to="/runs">View test runs</Link>
          </div>
        </Callout>
      ) : null}
      {error ? (
        <Callout tone="danger" title="Action failed">
          <p>{error}</p>
        </Callout>
      ) : null}

      <DemoHint>
        Demo flow: connect one app here, open <Link to="/workflows">Automations</Link> to create a
        template, then run a test from <Link to="/runs">Runs</Link>.
      </DemoHint>

      <SurfaceCard
        title="App Catalog"
        subtitle="Choose an app, connect it, and test it before using templates."
      >
        {loading ? <LoadingInline label="Loading apps..." /> : null}
        <div className="app-catalog-grid">
          {apps.map((app) => {
            const formState = forms[app.key] || buildInitialFormState(app);
            const isHighlighted = highlightAppKey === app.key;
            const saveDisabled = savingByApp[app.key] || !app.actions.canEdit;
            const testDisabled = testingByApp[app.key] || !app.actions.canTestConnection;
            const status = toConnectionStatusLabel(app.status);
            const visual = getAppVisual(app.key);
            const suggestions = getSuggestedTemplatesForApp(app.key, templates, 2);

            return (
              <article
                key={app.key}
                className={`app-card ${isHighlighted ? "highlight" : ""}`}
              >
                <div className="app-header-row">
                  <div>
                    <div className="app-title">
                      <AppIcon iconKey={visual.iconKey} accent={visual.accent} />
                      {app.name}
                    </div>
                    <p>{app.description}</p>
                  </div>
                  <div className="stack-sm" style={{ alignItems: "flex-end" }}>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    <span className="tag">{describeSetupMethod(app.setupMethod)}</span>
                  </div>
                </div>

                <div className="tag-row">
                  <span className="tag">
                    Triggers: {app.supportedTriggers.length ? app.supportedTriggers.join(", ") : "none"}
                  </span>
                  <span className="tag">
                    Actions: {app.supportedActions.length ? app.supportedActions.join(", ") : "none"}
                  </span>
                </div>

                <div className="stack-sm">
                  {app.setupNotes.map((note) => (
                    <p key={note}>• {note}</p>
                  ))}
                </div>

                {!app.connected ? (
                  <div className="callout info">
                    <strong>Quick start</strong>
                    <p>Connect this app, run a simulator test, then check Runs for results.</p>
                  </div>
                ) : null}

                {app.platformManagedFields.length > 0 ? (
                  <div className="callout warning">
                    <strong>Platform-level settings</strong>
                    <p>Keep these in <code>.env</code>: {app.platformManagedFields.join(", ")}</p>
                  </div>
                ) : null}

                <div className="form-grid two section-divider">
                  <label>
                    Connection name
                    <input
                      value={normalizeTextValue(formState.integrationName)}
                      onChange={(event) =>
                        updateFormValue(app.key, "integrationName", event.target.value)
                      }
                    />
                  </label>

                  {app.setupFields.map((field) => (
                    <label key={`${app.key}-${field.key}`}>
                      {field.label}
                      {field.required ? " *" : ""}
                      {field.inputType === "boolean" ? (
                        <div>
                          <input
                            type="checkbox"
                            checked={Boolean(formState[field.key])}
                            onChange={(event) =>
                              updateFormValue(app.key, field.key, event.target.checked)
                            }
                          />
                        </div>
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
                        />
                      )}
                      {field.helpText ? <small>{field.helpText}</small> : null}
                    </label>
                  ))}
                </div>

                <div className="inline-actions section-divider">
                  {app.setupMethod === "oauth2" ? (
                    <button
                      type="button"
                      className="button-primary"
                      disabled={!app.actions.canConnect}
                      onClick={() => void onStartOAuth(app)}
                    >
                      {app.connected ? "Reconnect" : "Connect"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={saveDisabled}
                    onClick={() => void onSaveConnection(app)}
                  >
                    {savingByApp[app.key]
                      ? "Saving..."
                      : app.connected
                        ? "Save changes"
                        : "Save connection"}
                  </button>

                  <button
                    type="button"
                    disabled={testDisabled}
                    onClick={() => void onTestConnection(app)}
                  >
                    {testingByApp[app.key] ? "Testing..." : "Test connection"}
                  </button>

                  {app.actions.canDisconnect ? (
                    <button type="button" onClick={() => void onDisconnect(app)}>
                      Disconnect
                    </button>
                  ) : null}
                </div>

                {app.connection.validationError ? (
                  <div className="callout danger">
                    <strong>Connection validation failed</strong>
                    <p>{app.connection.validationError}</p>
                  </div>
                ) : null}

                {suggestions.length > 0 ? (
                  <div className="section-divider stack-sm">
                    <strong>Suggested templates</strong>
                    <div className="inline-actions">
                      {suggestions.map((template) => (
                        <Link
                          key={template.id}
                          to={`/workflows?templateId=${encodeURIComponent(template.id)}`}
                        >
                          {template.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </SurfaceCard>

      {returnTo ? (
        <SurfaceCard title="Continue where you left off" muted>
          <div className="inline-actions">
            <Link to={returnTo}>Return to previous step</Link>
            <Link to="/first-automation">Open first automation wizard</Link>
          </div>
        </SurfaceCard>
      ) : null}
    </div>
  );
}

