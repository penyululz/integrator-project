import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  completeAdapterAuth,
  disconnectAppConnection,
  listApps,
  listWorkflowTemplates,
  startAdapterAuth,
  testAppConnection,
  upsertAppConnection,
  type AppConnectionRecord,
  type AppSetupField,
  type WorkflowTemplateSummary,
} from "../api";
import {
  ChecklistSteps,
  Callout,
  DemoHint,
  EmptyStatePanel,
  FilterPills,
  PageHeader,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import { AppIcon } from "../components/AppIcon";
import {
  buildConnectionPayload,
  buildInitialFormState,
  normalizeTextValue,
  type ConnectionFormState,
} from "./integration-connection-helpers";
import {
  describeSetupMethod,
  getAppVisual,
  toConnectionStatusLabel,
} from "./integrations-catalog-helpers";
import {
  getAppReadiness,
  getSupportModelLabel,
  getVisibleApps,
  toPrimaryAppActionLabel,
  type AppVisibilityMode,
} from "./app-readiness-helpers";
import {
  buildConnectionChecklist,
  type ConnectionTestState,
} from "./product-pattern-helpers";
import {
  getAppSetupGuideView,
  getGuideSuggestedTemplates,
  getRecommendedTemplatePath,
} from "./app-setup-guide-helpers";
import { getConnectionTrustState } from "./connection-trust-helpers";
import {
  getConnectionStatus,
  getNextWizardStep,
  getPreviousWizardStep,
  getWizardStepOrder,
  saveConnection,
  testConnection,
  validateConnectionInput,
  type ConnectionWizardStep,
} from "./integration-setup-flow-helpers";
import {
  buildOAuthRedirectUri,
  getOAuthPendingStorageKey,
  parseOAuthCallbackInfo,
  stripOAuthParamsFromSearch,
} from "./integration-oauth-helpers";
import { redirectAfterConnection } from "./navigation-flow-helpers";

type ReadinessFilter = "all" | "ready" | "advanced" | "coming_soon" | "developer";

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

function renderField(props: {
  appKey: string;
  field: AppSetupField;
  formState: ConnectionFormState;
  onChange: (appKey: string, fieldKey: string, value: string | boolean) => void;
}) {
  const value = props.formState[props.field.key];
  return (
    <label key={`${props.appKey}-${props.field.key}`}>
      {props.field.label}
      {props.field.required ? " *" : ""}
      {props.field.inputType === "boolean" ? (
        <div style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) =>
              props.onChange(props.appKey, props.field.key, event.target.checked)
            }
          />
        </div>
      ) : (
        <input
          type={
            props.field.inputType === "password"
              ? "password"
              : props.field.inputType === "number"
                ? "number"
                : "text"
          }
          value={normalizeTextValue(value)}
          placeholder={props.field.placeholder}
          onChange={(event) =>
            props.onChange(props.appKey, props.field.key, event.target.value)
          }
          style={{ marginTop: 4, width: "100%" }}
        />
      )}
      {props.field.helpText ? <small>{props.field.helpText}</small> : null}
    </label>
  );
}

export function IntegrationsPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [apps, setApps] = useState<AppConnectionRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [forms, setForms] = useState<Record<string, ConnectionFormState>>({});
  const [selectedAppKey, setSelectedAppKey] = useState("");
  const [showAdvancedCatalog, setShowAdvancedCatalog] = useState(false);
  const [showDeveloperCatalog, setShowDeveloperCatalog] = useState(false);
  const [catalogMode, setCatalogMode] = useState<AppVisibilityMode>("all");
  const [showCategoryFiltersExpanded, setShowCategoryFiltersExpanded] = useState(false);
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("ready");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [activeSetupStep, setActiveSetupStep] = useState<ConnectionWizardStep>("overview");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingByApp, setTestingByApp] = useState<Record<string, boolean>>({});
  const [testStateByApp, setTestStateByApp] = useState<Record<string, ConnectionTestState>>({});
  const [savingByApp, setSavingByApp] = useState<Record<string, boolean>>({});
  const oauthCompletionKeyRef = useRef<string | null>(null);

  const highlightAppKey = searchParams.get("appKey") || "";
  const returnTo = searchParams.get("returnTo") || "";
  const templateId = searchParams.get("templateId") || "";

  const oauthCallbackInfo = useMemo(
    () => parseOAuthCallbackInfo(location.search),
    [location.search],
  );

  async function load(): Promise<{
    appRecords: AppConnectionRecord[];
    templateRecords: WorkflowTemplateSummary[];
  }> {
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

      setSelectedAppKey((current) => {
        const allKeys = new Set(appRecords.map((app) => app.key));
        if (current && allKeys.has(current)) {
          return current;
        }
        if (highlightAppKey && allKeys.has(highlightAppKey)) {
          return highlightAppKey;
        }
        const visible = getVisibleApps("all", appRecords);
        return (
          visible.ready[0]?.key ||
          visible.advanced[0]?.key ||
          appRecords[0]?.key ||
          ""
        );
      });

      return {
        appRecords,
        templateRecords,
      };
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load app catalog.");
      throw loadError;
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
        const { appRecords, templateRecords } = await load();
        const connectedApp =
          appRecords.find((item) => item.key === callbackAppKey) || null;
        const postConnectPath =
          (connectedApp &&
            getRecommendedTemplatePath(connectedApp, templateRecords)) ||
          null;
        const destination = redirectAfterConnection({
          templateId,
          returnTo,
          fallback: postConnectPath || "/first-automation",
        });

        setSelectedAppKey(callbackAppKey);
        setActiveSetupStep("success");
        setMessage(
          `${connectedApp?.name || callbackAppKey} connected. Redirecting to a starter automation...`,
        );

        window.setTimeout(() => {
          navigate(destination);
        }, 800);
      } catch (authError) {
        setError(
          (authError as Error).message ||
            `Failed to complete ${callbackAppKey} connection.`,
        );
      }
    })();
  }, [oauthCallbackInfo, highlightAppKey, returnTo, templateId, navigate]);

  useEffect(() => {
    setActiveSetupStep("overview");
  }, [selectedAppKey]);

  const appCounts = useMemo(() => {
    const connected = apps.filter((app) => app.status === "connected").length;
    const readyNow = apps.filter((app) => getAppReadiness(app).tier === "ready").length;
    return {
      total: apps.length,
      connected,
      readyNow,
    };
  }, [apps]);

  const visibleCatalog = useMemo(() => getVisibleApps(catalogMode, apps), [catalogMode, apps]);

  const readinessCounts = useMemo(() => {
    const counts: Record<ReadinessFilter, number> = {
      all: apps.length,
      ready: 0,
      advanced: 0,
      coming_soon: 0,
      developer: 0,
    };
    for (const app of apps) {
      const readiness = getAppReadiness(app);
      counts[readiness.tier] += 1;
    }
    return counts;
  }, [apps]);

  const readinessFilterOptions = useMemo(
    () => [
      { id: "ready", label: "Ready", count: readinessCounts.ready },
      { id: "advanced", label: "Advanced", count: readinessCounts.advanced },
      { id: "coming_soon", label: "Coming soon", count: readinessCounts.coming_soon },
      { id: "developer", label: "Developer", count: readinessCounts.developer },
      { id: "all", label: "All apps", count: readinessCounts.all },
    ],
    [readinessCounts],
  );

  function matchesCatalogFilters(app: AppConnectionRecord): boolean {
    const readiness = getAppReadiness(app);
    if (readinessFilter !== "all" && readiness.tier !== readinessFilter) {
      return false;
    }
    const query = catalogQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    const haystack = [
      app.name,
      app.description,
      readiness.summary,
      readiness.guidance,
      app.key,
      ...app.supportedActions,
      ...app.supportedTriggers,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  }

  const readyApps = useMemo(
    () => visibleCatalog.ready.filter((app) => matchesCatalogFilters(app)),
    [visibleCatalog.ready, readinessFilter, catalogQuery],
  );
  const advancedApps = useMemo(
    () => visibleCatalog.advanced.filter((app) => matchesCatalogFilters(app)),
    [visibleCatalog.advanced, readinessFilter, catalogQuery],
  );
  const comingSoonApps = useMemo(
    () => visibleCatalog.comingSoon.filter((app) => matchesCatalogFilters(app)),
    [visibleCatalog.comingSoon, readinessFilter, catalogQuery],
  );
  const developerApps = useMemo(
    () => visibleCatalog.developer.filter((app) => matchesCatalogFilters(app)),
    [visibleCatalog.developer, readinessFilter, catalogQuery],
  );

  const selectedApp = useMemo(
    () => apps.find((app) => app.key === selectedAppKey) || null,
    [apps, selectedAppKey],
  );

  const selectedReadiness = useMemo(
    () => (selectedApp ? getAppReadiness(selectedApp) : null),
    [selectedApp],
  );

  const selectedTrustState = useMemo(
    () => (selectedApp ? getConnectionTrustState(selectedApp) : null),
    [selectedApp],
  );

  const selectedFormState = useMemo(() => {
    if (!selectedApp) {
      return null;
    }
    return forms[selectedApp.key] || buildInitialFormState(selectedApp);
  }, [forms, selectedApp]);

  const selectedSetupGuide = useMemo(() => {
    if (!selectedApp) {
      return null;
    }
    return getAppSetupGuideView(selectedApp);
  }, [selectedApp]);

  const selectedSuggestions = useMemo(() => {
    if (!selectedApp) {
      return [] as WorkflowTemplateSummary[];
    }
    return getGuideSuggestedTemplates(selectedApp, templates, 3);
  }, [selectedApp, templates]);

  const selectedRecommendedTemplatePath = useMemo(() => {
    if (!selectedApp) {
      return null;
    }
    return getRecommendedTemplatePath(selectedApp, templates);
  }, [selectedApp, templates]);

  const selectedValidation = useMemo(() => {
    if (!selectedApp || !selectedFormState) {
      return {
        valid: false,
        missingFields: [],
      };
    }
    return validateConnectionInput(selectedApp, selectedFormState);
  }, [selectedApp, selectedFormState]);

  const selectedMissingRequiredFields = !selectedValidation.valid;

  const selectedConnectionStatus = useMemo(() => {
    if (!selectedApp) {
      return "needs_setup";
    }
    return getConnectionStatus({
      app: selectedApp,
      hasValidInput: selectedValidation.valid,
      lastTestState: testStateByApp[selectedApp.key] || "unknown",
    });
  }, [selectedApp, selectedValidation.valid, testStateByApp]);

  const selectedChecklist = useMemo(() => {
    if (!selectedApp || !selectedReadiness) {
      return [];
    }
    return buildConnectionChecklist({
      app: selectedApp,
      readiness: selectedReadiness,
      hasMissingRequiredFields: selectedMissingRequiredFields,
      testState: testStateByApp[selectedApp.key] || "unknown",
    });
  }, [selectedApp, selectedReadiness, selectedMissingRequiredFields, testStateByApp]);

  const setupWizardSteps = getWizardStepOrder();

  function canMoveSetupForward(): boolean {
    if (!selectedApp) {
      return false;
    }
    if (activeSetupStep === "overview" || activeSetupStep === "requirements") {
      return true;
    }
    if (activeSetupStep === "input") {
      return selectedValidation.valid;
    }
    if (activeSetupStep === "test") {
      return selectedConnectionStatus === "connected";
    }
    return false;
  }

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
    const validation = validateConnectionInput(app, formState);
    if (!validation.valid) {
      setError(
        `Missing required setup fields for ${app.name}: ${validation.missingFields.join(", ")}.`,
      );
      setMessage(null);
      setActiveSetupStep("input");
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

      await saveConnection(async () =>
        upsertAppConnection({
          appKey: app.key,
          integrationName: payload.integrationName,
          integrationConfig: payload.integrationConfig,
          credential: credentialPayload,
        }),
      );

      setMessage(`${app.name} connection saved.`);
      setActiveSetupStep("test");
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
      const result = await testConnection(() =>
        testAppConnection({
          appKey: app.key,
          integrationConfig: forms[app.key]
            ? buildConnectionPayload(app, forms[app.key]).integrationConfig
            : undefined,
        }),
      );
      setTestStateByApp((current) => ({
        ...current,
        [app.key]: result.status === "valid" ? "valid" : "invalid",
      }));
      if (result.status === "valid") {
        const { appRecords, templateRecords } = await load();
        const refreshedApp = appRecords.find((item) => item.key === app.key) || app;
        const recommendedPath = getRecommendedTemplatePath(refreshedApp, templateRecords);
        const destination = redirectAfterConnection({
          templateId,
          returnTo,
          fallback: recommendedPath || "/first-automation",
        });

        setMessage(
          `${app.name} test passed. Redirecting to a starter automation so you can run your first workflow.`,
        );
        setActiveSetupStep("success");
        window.setTimeout(() => {
          navigate(destination);
        }, 900);
      } else {
        setMessage(
          `${app.name} test returned ${result.status}: ${result.reason || "check settings"}.`,
        );
        setActiveSetupStep("test");
        await load();
      }
    } catch (testError) {
      setError((testError as Error).message || `Failed to test ${app.name} connection.`);
    } finally {
      setTestingByApp((current) => ({ ...current, [app.key]: false }));
    }
  }

  function renderCatalogCard(app: AppConnectionRecord) {
    const readiness = getAppReadiness(app);
    const status = toConnectionStatusLabel(app.status);
    const trust = getConnectionTrustState(app);
    const visual = getAppVisual(app.key);
    const primaryLabel = toPrimaryAppActionLabel(app, readiness);
    const isSelected = selectedAppKey === app.key;
    const formState = forms[app.key] || buildInitialFormState(app);
    const validation = validateConnectionInput(app, formState);
    const connectionStatus = getConnectionStatus({
      app,
      hasValidInput: validation.valid,
      lastTestState: testStateByApp[app.key] || "unknown",
    });

    return (
      <article
        key={app.key}
        className={`app-card app-primary-card ${isSelected ? "highlight" : ""}`}
      >
        <div className="app-header-row">
          <div>
            <div className="app-title">
              <AppIcon iconKey={visual.iconKey} accent={visual.accent} />
              {app.name}
            </div>
            <p>{readiness.summary}</p>
          </div>
          <div className="stack-sm" style={{ alignItems: "flex-end" }}>
            <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
            <StatusPill tone={trust.tone}>{trust.label}</StatusPill>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <span className="tag">Setup: {connectionStatus.replace(/_/g, " ")}</span>
          </div>
        </div>

        <p>{trust.summary}</p>
        <div className="tag-row">
          <span className="tag">{getSupportModelLabel(readiness.supportModel)}</span>
          <span className="tag">{describeSetupMethod(app.setupMethod)}</span>
          <span className="tag">{app.setupMethod === "oauth2" ? "Guided connect" : "Manual fields"}</span>
          {app.catalogCategory ? <span className="tag">Category: {app.catalogCategory}</span> : null}
          {(app.platformSetupMissingFields || []).length > 0 ? (
            <span className="tag">
              Missing platform config: {(app.platformSetupMissingFields || []).join(", ")}
            </span>
          ) : null}
          <span className="tag">
            Actions: {app.supportedActions.length ? app.supportedActions.join(", ") : "none"}
          </span>
        </div>

        <div className="inline-actions">
          <button
            type="button"
            className="button-primary"
            onClick={() => setSelectedAppKey(app.key)}
            disabled={readiness.tier === "coming_soon"}
          >
            {primaryLabel}
          </button>
          {app.actions.canTestConnection && app.connected ? (
            <button
              type="button"
              onClick={() => void onTestConnection(app)}
              disabled={testingByApp[app.key]}
            >
              {testingByApp[app.key] ? "Testing..." : "Test"}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  const requiredFields = selectedApp
    ? selectedApp.setupFields.filter((field) => field.required)
    : [];
  const optionalFields = selectedApp
    ? selectedApp.setupFields.filter((field) => !field.required)
    : [];
  const guideRequiredFields = selectedSetupGuide?.requiredFields || requiredFields;
  const selectedPlatformMissingFields = selectedApp?.platformSetupMissingFields || [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Apps"
        title="Connect your apps"
        subtitle="Start with ready apps first. Open advanced apps only when you need extra setup."
        actions={
          <>
            <StatusPill tone="success">{appCounts.readyNow} ready now</StatusPill>
            <StatusPill tone="info">{appCounts.connected} connected</StatusPill>
            <Link to="/first-automation">First automation</Link>
            <Link to="/workflows">Starter automations</Link>
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
              <Link to="/first-automation">Open first automation</Link>
            </>
          }
        >
          <p>Connect the required app, then continue your automation setup.</p>
        </Callout>
      ) : null}

      {message ? (
        <Callout tone="success" title="Connection updated">
          <p>{message}</p>
          <div className="inline-actions">
            <Link to="/first-automation">Continue to first automation</Link>
            <Link to="/runs">View runs</Link>
          </div>
        </Callout>
      ) : null}
      {error ? (
        <Callout tone="danger" title="Action failed">
          <p>{error}</p>
        </Callout>
      ) : null}

      <DemoHint>
        Start here: connect one ready app, use a starter automation, then run a live test.
      </DemoHint>

      <div className="template-grid">
        <SurfaceCard
          title="App catalog"
          subtitle="Pick an app category, connect it with guided setup, then launch a starter automation."
          highlight
        >
          <div className="stack-sm">
            <label>
              Search apps
              <input
                type="search"
                value={catalogQuery}
                placeholder="Find by app name or use case"
                onChange={(event) => setCatalogQuery(event.target.value)}
                style={{ marginTop: 4, width: "100%" }}
              />
            </label>
            <FilterPills
              options={
                showCategoryFiltersExpanded
                  ? readinessFilterOptions
                  : readinessFilterOptions.slice(0, 3)
              }
              value={readinessFilter}
              onChange={(next) => setReadinessFilter(next as ReadinessFilter)}
            />
            <div className="inline-actions">
              <button type="button" onClick={() => setShowCategoryFiltersExpanded((current) => !current)}>
                {showCategoryFiltersExpanded ? "Show fewer filters" : "Show all filters"}
              </button>
            </div>
            <div className="inline-actions">
              <span className="tag">View mode</span>
              <button
                type="button"
                onClick={() => setCatalogMode("starter")}
                className={catalogMode === "starter" ? "button-primary" : ""}
              >
                Starter
              </button>
              <button
                type="button"
                onClick={() => setCatalogMode("all")}
                className={catalogMode === "all" ? "button-primary" : ""}
              >
                Full catalog
              </button>
              <button
                type="button"
                onClick={() => setCatalogMode("developer")}
                className={catalogMode === "developer" ? "button-primary" : ""}
              >
                Developer
              </button>
            </div>
          </div>

          {loading ? (
            <div className="app-catalog-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <article key={`skeleton-${index}`} className="app-card app-card-skeleton" />
              ))}
            </div>
          ) : null}
          {!loading ? (
            <div className="stack">
              <div className="section-divider stack-sm">
                <strong>Ready apps</strong>
                <p>Fastest options for first-time success.</p>
                {readyApps.length === 0 ? (
                  <EmptyStatePanel
                    title="No ready apps in this filter"
                    description="Try resetting search/filters or switch to advanced apps."
                    primaryAction={
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => {
                          setCatalogQuery("");
                          setReadinessFilter("ready");
                        }}
                      >
                        Reset filters
                      </button>
                    }
                  />
                ) : (
                  <div className="app-catalog-grid">{readyApps.map((app) => renderCatalogCard(app))}</div>
                )}
              </div>

              <div className="section-divider stack-sm">
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <strong>Advanced apps</strong>
                  <button type="button" onClick={() => setShowAdvancedCatalog((current) => !current)}>
                    {showAdvancedCatalog ? "Hide" : "Show"}
                  </button>
                </div>
                <p>Require additional provider setup or platform configuration.</p>
                {showAdvancedCatalog ? (
                  advancedApps.length === 0 ? (
                    <EmptyStatePanel
                      title="No advanced apps matched"
                      description="Change search terms or pick another readiness filter."
                      primaryAction={
                        <button
                          type="button"
                          onClick={() => {
                            setCatalogQuery("");
                            setReadinessFilter("all");
                          }}
                        >
                          Clear filters
                        </button>
                      }
                    />
                  ) : (
                    <div className="app-catalog-grid">
                      {advancedApps.map((app) => renderCatalogCard(app))}
                    </div>
                  )
                ) : null}
              </div>

              <div className="section-divider stack-sm">
                <strong>Coming soon</strong>
                <p>Planned integrations that are not production-ready yet.</p>
                {comingSoonApps.length === 0 ? (
                  <p>No coming-soon apps in this workspace catalog right now.</p>
                ) : (
                  <div className="app-catalog-grid">
                    {comingSoonApps.map((app) => renderCatalogCard(app))}
                  </div>
                )}
              </div>

              <div className="section-divider stack-sm">
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <strong>Developer adapters</strong>
                  <button type="button" onClick={() => setShowDeveloperCatalog((current) => !current)}>
                    {showDeveloperCatalog ? "Hide" : "Show"}
                  </button>
                </div>
                <p>Internal/testing adapters. Hidden by default for regular users.</p>
                {showDeveloperCatalog ? (
                  developerApps.length === 0 ? (
                    <p>No developer adapters available in this workspace.</p>
                  ) : (
                    <div className="app-catalog-grid">
                      {developerApps.map((app) => renderCatalogCard(app))}
                    </div>
                  )
                ) : null}
              </div>
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard
          title={selectedApp ? `Setup: ${selectedApp.name}` : "Setup panel"}
          subtitle={
            selectedReadiness
              ? selectedReadiness.guidance
              : "Select an app card to start setup."
          }
        >
          {!selectedApp || !selectedReadiness || !selectedFormState ? (
            <div className="empty-state">
              <p>Select an app from the catalog to see guided setup.</p>
            </div>
          ) : (
            <div className="stack-sm">
              <div className="inline-actions">
                <StatusPill tone={selectedReadiness.tone}>{selectedReadiness.label}</StatusPill>
                {selectedTrustState ? (
                  <StatusPill tone={selectedTrustState.tone}>{selectedTrustState.label}</StatusPill>
                ) : null}
                <StatusPill tone={toConnectionStatusLabel(selectedApp.status).tone}>
                  {toConnectionStatusLabel(selectedApp.status).label}
                </StatusPill>
                <span className="tag">Flow status: {selectedConnectionStatus.replace(/_/g, " ")}</span>
              </div>

              {selectedTrustState && selectedTrustState.key !== "connected" ? (
                <Callout tone={selectedTrustState.tone} title={selectedTrustState.label}>
                  <p>{selectedTrustState.summary}</p>
                </Callout>
              ) : null}

              <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <strong>Connection flow</strong>
                <div className="inline-actions" style={{ marginTop: 8 }}>
                  {setupWizardSteps.map((step, index) => (
                    <button
                      key={step}
                      type="button"
                      className={activeSetupStep === step ? "button-primary" : ""}
                      onClick={() => setActiveSetupStep(step)}
                    >
                      {index + 1}. {step}
                    </button>
                  ))}
                </div>
              </div>

              {selectedReadiness.tier === "coming_soon" ? (
                <Callout tone="info" title="Not yet ready for standard setup">
                  <p>
                    This app is not exposed as a normal end-user connection yet. Use ready apps for
                    launch workflows.
                  </p>
                </Callout>
              ) : null}

              {activeSetupStep === "overview" ? (
                <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                  <strong>1) Overview</strong>
                  <p>{selectedSetupGuide?.purpose || selectedReadiness.summary}</p>
                  <p>{selectedReadiness.guidance}</p>
                  {selectedSetupGuide?.steps?.length ? (
                    <div className="stack-sm">
                      <strong>Setup at a glance</strong>
                      <ol className="setup-guide-list">
                        {selectedSetupGuide.steps.slice(0, 3).map((step) => (
                          <li key={`${selectedApp.key}-overview-step-${step}`}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  <ChecklistSteps steps={selectedChecklist} />
                </div>
              ) : null}

              {activeSetupStep === "requirements" ? (
                <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                  <strong>2) Requirements</strong>
                  <ul className="setup-guide-list">
                    {(selectedSetupGuide?.beforeYouStart || selectedReadiness.prerequisites).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {guideRequiredFields.length > 0 ? (
                    <div className="stack-sm">
                      <strong>Required fields</strong>
                      <div className="tag-row">
                        {guideRequiredFields.map((field) => (
                          <span key={`${selectedApp.key}-required-${field.key}`} className="tag">
                            {field.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedPlatformMissingFields.length > 0 ? (
                    <Callout tone="warning" title="Missing platform setup">
                      <p>
                        An operator must configure these runtime values before connect can complete:{" "}
                        {selectedPlatformMissingFields.join(", ")}
                      </p>
                    </Callout>
                  ) : null}
                </div>
              ) : null}

              {activeSetupStep === "input" ? (
                <div className="stack-sm">
                  <strong>3) Input</strong>
                  <label>
                    Connection name
                    <input
                      value={normalizeTextValue(selectedFormState.integrationName)}
                      onChange={(event) =>
                        updateFormValue(selectedApp.key, "integrationName", event.target.value)
                      }
                      style={{ marginTop: 4, width: "100%" }}
                    />
                  </label>

                  {selectedApp.setupMethod === "oauth2" ? (
                    <Callout
                      tone="info"
                      title={`Secure sign-in for ${selectedApp.name}`}
                      actions={
                        <button
                          type="button"
                          className="button-primary"
                          onClick={() => void onStartOAuth(selectedApp)}
                          disabled={!selectedApp.actions.canConnect}
                        >
                          {selectedApp.connected
                            ? `Reconnect ${selectedApp.name}`
                            : `Connect ${selectedApp.name}`}
                        </button>
                      }
                    >
                      <p>
                        We’ll redirect you to {selectedApp.name}, then bring you back automatically to
                        complete setup.
                      </p>
                    </Callout>
                  ) : null}

                  {selectedSetupGuide?.steps?.length ? (
                    <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                      <strong>Exact setup steps</strong>
                      <ol className="setup-guide-list">
                        {selectedSetupGuide.steps.map((step) => (
                          <li key={`${selectedApp.key}-step-${step}`}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  {requiredFields.length > 0 ? (
                    <div className="form-grid two">
                      {requiredFields.map((field) =>
                        renderField({
                          appKey: selectedApp.key,
                          field,
                          formState: selectedFormState,
                          onChange: updateFormValue,
                        }),
                      )}
                    </div>
                  ) : null}

                  {optionalFields.length > 0 ? (
                    <details>
                      <summary>Advanced fields</summary>
                      <div className="form-grid two" style={{ marginTop: 8 }}>
                        {optionalFields.map((field) =>
                          renderField({
                            appKey: selectedApp.key,
                            field,
                            formState: selectedFormState,
                            onChange: updateFormValue,
                          }),
                        )}
                      </div>
                    </details>
                  ) : null}

                  {!selectedValidation.valid ? (
                    <Callout tone="warning" title="Missing required inputs">
                      <p>{selectedValidation.missingFields.join(", ")}</p>
                    </Callout>
                  ) : null}
                </div>
              ) : null}

              {activeSetupStep === "test" ? (
                <div className="stack-sm">
                  <strong>4) Test</strong>
                  <p>Run a connection test before activating templates that depend on this app.</p>
                  {selectedSetupGuide?.testChecklist?.length ? (
                    <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                      <strong>How to test</strong>
                      <ul className="setup-guide-list">
                        {selectedSetupGuide.testChecklist.map((item) => (
                          <li key={`${selectedApp.key}-test-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => void onSaveConnection(selectedApp)}
                      disabled={savingByApp[selectedApp.key] || !selectedApp.actions.canEdit}
                    >
                      {savingByApp[selectedApp.key] ? "Saving..." : "Save connection"}
                    </button>
                    {selectedApp.actions.canTestConnection ? (
                      <button
                        type="button"
                        onClick={() => void onTestConnection(selectedApp)}
                        disabled={testingByApp[selectedApp.key]}
                      >
                        {testingByApp[selectedApp.key] ? "Testing..." : "Test connection"}
                      </button>
                    ) : null}
                    {selectedApp.actions.canDisconnect ? (
                      <button type="button" onClick={() => void onDisconnect(selectedApp)}>
                        Disconnect
                      </button>
                    ) : null}
                  </div>
                  {selectedSetupGuide?.troubleshooting?.length ? (
                    <details>
                      <summary>Troubleshooting tips</summary>
                      <ul className="setup-guide-list" style={{ marginTop: 8 }}>
                        {selectedSetupGuide.troubleshooting.map((tip) => (
                          <li key={`${selectedApp.key}-troubleshoot-${tip}`}>{tip}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {activeSetupStep === "success" ? (
                <div className="stack-sm">
                  <strong>5) Success</strong>
                  <p>
                    Your app connection is ready. Next, create a starter automation and trigger a test
                    run.
                  </p>
                  {selectedTrustState ? (
                    <Callout tone="success" title={selectedTrustState.label}>
                      <p>{selectedTrustState.summary}</p>
                    </Callout>
                  ) : null}
                  <div className="inline-actions">
                    <Link
                      to={redirectAfterConnection({
                        templateId,
                        returnTo,
                        fallback: selectedRecommendedTemplatePath || "/first-automation",
                      })}
                    >
                      Continue with starter automation
                    </Link>
                    <Link to="/runs">Open runs</Link>
                  </div>
                </div>
              ) : null}

              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() => setActiveSetupStep(getPreviousWizardStep(activeSetupStep))}
                  disabled={activeSetupStep === "overview"}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() =>
                    setActiveSetupStep(getNextWizardStep(activeSetupStep, canMoveSetupForward()))
                  }
                  disabled={activeSetupStep === "success" || !canMoveSetupForward()}
                >
                  Next
                </button>
              </div>

              {selectedApp.connection.validationError ? (
                <Callout tone="danger" title="Connection check failed">
                  <p>{selectedApp.connection.validationError}</p>
                </Callout>
              ) : null}

              {selectedSuggestions.length > 0 ? (
                <div className="section-divider stack-sm">
                  <strong>Try this next</strong>
                  <div className="inline-actions">
                    {selectedSuggestions.map((template) => (
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
            </div>
          )}
        </SurfaceCard>
      </div>

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

