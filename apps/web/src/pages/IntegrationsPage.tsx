import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  completeAdapterAuth,
  disconnectAppConnection,
  disconnectCredential,
  listApps,
  listCredentials,
  listIntegrations,
  listWorkflowTemplates,
  startAdapterAuth,
  testAppConnection,
  upsertAppConnection,
  type AppConnectionRecord,
  type AppSetupField,
  type CredentialRecord,
  type IntegrationRecord,
  type WorkflowTemplateSummary,
} from "../api";
import { AppIcon } from "../components/AppIcon";
import {
  DataGridPagination,
  DataGridToolbar,
  DenseDataTable,
  type DataGridColumn,
} from "../components/DataGrid";
import {
  Callout,
  ChecklistSteps,
  DemoHint,
  EmptyStatePanel,
  FilterPills,
  InsightChip,
  LoadingInline,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
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
  toWizardStepDescription,
  toWizardStepLabel,
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
import {
  filterConnectionRows,
  filterCredentialRows,
  filterIntegrationRows,
  getConnectionFilterCount,
  getCredentialFilterCount,
  paginateRows,
  sortConnectionRows,
  sortCredentialRows,
  sortIntegrationRows,
  toQueryPreview,
  type ConnectionInventoryFilter,
  type ConnectionInventorySort,
  type CredentialInventoryFilter,
  type CredentialInventorySort,
  type IntegrationInventorySort,
} from "./integrations-table-helpers";
import { toTableDensityClass, type ViewDensity } from "./workspace-view-helpers";

type ReadinessFilter = "all" | "ready" | "advanced" | "coming_soon" | "developer";

type PendingOAuthPayload = {
  integrationId?: string;
  connection?: Record<string, unknown>;
};

type ConnectionQueryState = {
  search: string;
  filter: ConnectionInventoryFilter;
  sort: ConnectionInventorySort;
  page: number;
  pageSize: number;
};

type IntegrationQueryState = {
  search: string;
  status: string;
  sort: IntegrationInventorySort;
  page: number;
  pageSize: number;
};

type CredentialQueryState = {
  search: string;
  filter: CredentialInventoryFilter;
  sort: CredentialInventorySort;
  page: number;
  pageSize: number;
};

const CONNECTION_SORT_OPTIONS: Array<{ value: ConnectionInventorySort; label: string }> = [
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
  { value: "status", label: "Status" },
  { value: "updated_desc", label: "Recently updated" },
];

const INTEGRATION_SORT_OPTIONS: Array<{ value: IntegrationInventorySort; label: string }> = [
  { value: "created_desc", label: "Newest first" },
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
  { value: "adapter_asc", label: "Adapter key" },
];

const CREDENTIAL_SORT_OPTIONS: Array<{ value: CredentialInventorySort; label: string }> = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "provider_asc", label: "Provider A-Z" },
  { value: "provider_desc", label: "Provider Z-A" },
  { value: "status", label: "Status" },
];

const CONNECTION_FILTER_LABELS: Record<ConnectionInventoryFilter, string> = {
  all: "All",
  connected: "Connected",
  not_connected: "Not connected",
  needs_attention: "Needs attention",
  missing_setup: "Missing setup",
};

const CREDENTIAL_FILTER_LABELS: Record<CredentialInventoryFilter, string> = {
  all: "All",
  valid: "Valid",
  expired: "Expired",
  invalid: "Invalid",
};

const DEFAULT_CONNECTION_QUERY: ConnectionQueryState = {
  search: "",
  filter: "all",
  sort: "name_asc",
  page: 1,
  pageSize: 10,
};

const DEFAULT_INTEGRATION_QUERY: IntegrationQueryState = {
  search: "",
  status: "all",
  sort: "created_desc",
  page: 1,
  pageSize: 10,
};

const DEFAULT_CREDENTIAL_QUERY: CredentialQueryState = {
  search: "",
  filter: "all",
  sort: "updated_desc",
  page: 1,
  pageSize: 10,
};

type IntegrationsPageData = {
  appRecords: AppConnectionRecord[];
  templateRecords: WorkflowTemplateSummary[];
  integrationRecords: IntegrationRecord[];
  credentialRecords: CredentialRecord[];
};

async function fetchIntegrationsPageData(): Promise<IntegrationsPageData> {
  const [appRecords, templateRecords, integrationRecords, credentialRecords] =
    await Promise.all([
      listApps(),
      listWorkflowTemplates(),
      listIntegrations(),
      listCredentials(),
    ]);
  return {
    appRecords,
    templateRecords,
    integrationRecords,
    credentialRecords,
  };
}

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

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
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
  const queryClient = useQueryClient();
  const catalogDataQuery = useQuery({
    // STATE: TanStack Query server-state source for app/integration inventories.
    queryKey: ["integrations-page-data"],
    queryFn: fetchIntegrationsPageData,
  });

  const [apps, setApps] = useState<AppConnectionRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [integrationRows, setIntegrationRows] = useState<IntegrationRecord[]>([]);
  const [credentialRows, setCredentialRows] = useState<CredentialRecord[]>([]);
  const [forms, setForms] = useState<Record<string, ConnectionFormState>>({});

  const [selectedAppKey, setSelectedAppKey] = useState("");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | null>(null);

  const [catalogMode, setCatalogMode] = useState<AppVisibilityMode>("all");
  const [showAdvancedCatalog, setShowAdvancedCatalog] = useState(false);
  const [showDeveloperCatalog, setShowDeveloperCatalog] = useState(false);
  const [showCategoryFiltersExpanded, setShowCategoryFiltersExpanded] = useState(false);
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("ready");
  const [catalogQuery, setCatalogQuery] = useState("");

  const [connectionQuery, setConnectionQuery] =
    useState<ConnectionQueryState>(DEFAULT_CONNECTION_QUERY);
  const [integrationQuery, setIntegrationQuery] =
    useState<IntegrationQueryState>(DEFAULT_INTEGRATION_QUERY);
  const [credentialQuery, setCredentialQuery] =
    useState<CredentialQueryState>(DEFAULT_CREDENTIAL_QUERY);

  const [activeSetupStep, setActiveSetupStep] = useState<ConnectionWizardStep>("overview");
  const [setupDrawerOpen, setSetupDrawerOpen] = useState(false);
  const [viewDensity, setViewDensity] = useState<ViewDensity>("comfortable");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingByApp, setTestingByApp] = useState<Record<string, boolean>>({});
  const [testStateByApp, setTestStateByApp] = useState<Record<string, ConnectionTestState>>({});
  const [savingByApp, setSavingByApp] = useState<Record<string, boolean>>({});
  const [disconnectingCredentialProvider, setDisconnectingCredentialProvider] = useState<
    string | null
  >(null);
  const loading = catalogDataQuery.isLoading || catalogDataQuery.isFetching;
  const oauthCompletionKeyRef = useRef<string | null>(null);

  const highlightAppKey = searchParams.get("appKey") || "";
  const returnTo = searchParams.get("returnTo") || "";
  const templateId = searchParams.get("templateId") || "";

  const oauthCallbackInfo = useMemo(
    () => parseOAuthCallbackInfo(location.search),
    [location.search],
  );

  const appByKey = useMemo(() => new Map(apps.map((app) => [app.key, app])), [apps]);

  function openSetupDrawer(appKey: string, step: ConnectionWizardStep = "overview") {
    setSelectedAppKey(appKey);
    setActiveSetupStep(step);
    setSetupDrawerOpen(true);
  }

  function closeSetupDrawer() {
    setSetupDrawerOpen(false);
  }

  function updateConnectionQuery(patch: Partial<ConnectionQueryState>) {
    setConnectionQuery((current) => {
      const shouldResetPage =
        patch.search !== undefined ||
        patch.filter !== undefined ||
        patch.sort !== undefined ||
        patch.pageSize !== undefined;
      return {
        ...current,
        ...patch,
        page: patch.page !== undefined ? patch.page : shouldResetPage ? 1 : current.page,
      };
    });
  }

  function updateIntegrationQuery(patch: Partial<IntegrationQueryState>) {
    setIntegrationQuery((current) => {
      const shouldResetPage =
        patch.search !== undefined ||
        patch.status !== undefined ||
        patch.sort !== undefined ||
        patch.pageSize !== undefined;
      return {
        ...current,
        ...patch,
        page: patch.page !== undefined ? patch.page : shouldResetPage ? 1 : current.page,
      };
    });
  }

  function updateCredentialQuery(patch: Partial<CredentialQueryState>) {
    setCredentialQuery((current) => {
      const shouldResetPage =
        patch.search !== undefined ||
        patch.filter !== undefined ||
        patch.sort !== undefined ||
        patch.pageSize !== undefined;
      return {
        ...current,
        ...patch,
        page: patch.page !== undefined ? patch.page : shouldResetPage ? 1 : current.page,
      };
    });
  }

  function applyCatalogData(payload: IntegrationsPageData) {
    const { appRecords, templateRecords, integrationRecords, credentialRecords } = payload;
    setApps(appRecords);
    setTemplates(templateRecords);
    setIntegrationRows(integrationRecords);
    setCredentialRows(credentialRecords);

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
      return visible.ready[0]?.key || visible.advanced[0]?.key || appRecords[0]?.key || "";
    });

    setSelectedIntegrationId((current) => {
      if (current && integrationRecords.some((row) => row.id === current)) {
        return current;
      }
      return integrationRecords[0]?.id || null;
    });

    setSelectedCredentialId((current) => {
      if (current && credentialRecords.some((row) => row.id === current)) {
        return current;
      }
      return credentialRecords[0]?.id || null;
    });
  }

  async function load(): Promise<IntegrationsPageData> {
    try {
      const payload = await queryClient.fetchQuery({
        queryKey: ["integrations-page-data"],
        queryFn: fetchIntegrationsPageData,
      });
      applyCatalogData(payload);
      return payload;
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load app catalog.");
      throw loadError;
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
    if (catalogDataQuery.data) {
      applyCatalogData(catalogDataQuery.data);
    }
  }, [catalogDataQuery.data, highlightAppKey]);

  useEffect(() => {
    if (catalogDataQuery.error) {
      setError((catalogDataQuery.error as Error).message || "Failed to load app catalog.");
    }
  }, [catalogDataQuery.error]);

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
        const connectedApp = appRecords.find((item) => item.key === callbackAppKey) || null;
        const postConnectPath =
          (connectedApp && getRecommendedTemplatePath(connectedApp, templateRecords)) || null;
        const destination = redirectAfterConnection({
          templateId,
          returnTo,
          fallback: postConnectPath || "/first-automation",
        });

        setSelectedAppKey(callbackAppKey);
        setSetupDrawerOpen(true);
        setActiveSetupStep("success");
        setMessage(
          `${connectedApp?.name || callbackAppKey} connected. Redirecting to a starter automation...`,
        );

        window.setTimeout(() => {
          navigate(destination);
        }, 800);
      } catch (authError) {
        setError((authError as Error).message || `Failed to complete ${callbackAppKey} connection.`);
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
      hasMissingRequiredFields: !selectedValidation.valid,
      testState: testStateByApp[selectedApp.key] || "unknown",
    });
  }, [selectedApp, selectedReadiness, selectedValidation.valid, testStateByApp]);

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

  async function onDisconnectCredential(providerKey: string) {
    setDisconnectingCredentialProvider(providerKey);
    setError(null);
    setMessage(null);
    try {
      await disconnectCredential(providerKey);
      setMessage(`${providerKey} credentials removed.`);
      await load();
    } catch (disconnectError) {
      setError(
        (disconnectError as Error).message ||
          `Failed to disconnect credentials for ${providerKey}.`,
      );
    } finally {
      setDisconnectingCredentialProvider(null);
    }
  }

  async function onTestConnection(app: AppConnectionRecord) {
    setTestingByApp((current) => ({ ...current, [app.key]: true }));
    setError(null);
    setMessage(null);

    try {
      const formState = forms[app.key] || buildInitialFormState(app);
      const result = await testConnection(() =>
        testAppConnection({
          appKey: app.key,
          integrationConfig: buildConnectionPayload(app, formState).integrationConfig,
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
        setSetupDrawerOpen(true);
        window.setTimeout(() => {
          navigate(destination);
        }, 900);
      } else {
        setMessage(`${app.name} test returned ${result.status}: ${result.reason || "check settings"}.`);
        setActiveSetupStep("test");
        await load();
      }
    } catch (testError) {
      setError((testError as Error).message || `Failed to test ${app.name} connection.`);
    } finally {
      setTestingByApp((current) => ({ ...current, [app.key]: false }));
    }
  }

  const connectionCounts = useMemo(() => getConnectionFilterCount(apps), [apps]);
  const filteredConnections = useMemo(
    () =>
      sortConnectionRows(
        filterConnectionRows(apps, {
          search: connectionQuery.search,
          filter: connectionQuery.filter,
        }),
        connectionQuery.sort,
      ),
    [apps, connectionQuery],
  );
  const pagedConnections = useMemo(
    () => paginateRows(filteredConnections, connectionQuery.page, connectionQuery.pageSize),
    [filteredConnections, connectionQuery.page, connectionQuery.pageSize],
  );

  const integrationStatusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of integrationRows) {
      const key = row.status || "unknown";
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const options = [...counts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([status, count]) => ({
        value: status,
        label: status,
        count,
      }));

    return [{ value: "all", label: "All statuses", count: integrationRows.length }, ...options];
  }, [integrationRows]);

  const filteredIntegrations = useMemo(
    () =>
      sortIntegrationRows(
        filterIntegrationRows(integrationRows, {
          search: integrationQuery.search,
          status: integrationQuery.status,
        }),
        integrationQuery.sort,
      ),
    [integrationRows, integrationQuery],
  );
  const pagedIntegrations = useMemo(
    () => paginateRows(filteredIntegrations, integrationQuery.page, integrationQuery.pageSize),
    [filteredIntegrations, integrationQuery.page, integrationQuery.pageSize],
  );

  const credentialCounts = useMemo(
    () => getCredentialFilterCount(credentialRows),
    [credentialRows],
  );
  const filteredCredentials = useMemo(
    () =>
      sortCredentialRows(
        filterCredentialRows(credentialRows, {
          search: credentialQuery.search,
          filter: credentialQuery.filter,
        }),
        credentialQuery.sort,
      ),
    [credentialRows, credentialQuery],
  );
  const pagedCredentials = useMemo(
    () => paginateRows(filteredCredentials, credentialQuery.page, credentialQuery.pageSize),
    [filteredCredentials, credentialQuery.page, credentialQuery.pageSize],
  );

  const selectedIntegration = useMemo(
    () => integrationRows.find((row) => row.id === selectedIntegrationId) || null,
    [integrationRows, selectedIntegrationId],
  );
  const selectedCredential = useMemo(
    () => credentialRows.find((row) => row.id === selectedCredentialId) || null,
    [credentialRows, selectedCredentialId],
  );

  useEffect(() => {
    if (selectedIntegrationId && integrationRows.some((row) => row.id === selectedIntegrationId)) {
      return;
    }
    setSelectedIntegrationId(integrationRows[0]?.id || null);
  }, [integrationRows, selectedIntegrationId]);

  useEffect(() => {
    if (selectedCredentialId && credentialRows.some((row) => row.id === selectedCredentialId)) {
      return;
    }
    setSelectedCredentialId(credentialRows[0]?.id || null);
  }, [credentialRows, selectedCredentialId]);

  useEffect(() => {
    if (connectionQuery.page === pagedConnections.page) {
      return;
    }
    setConnectionQuery((current) => ({ ...current, page: pagedConnections.page }));
  }, [connectionQuery.page, pagedConnections.page]);

  useEffect(() => {
    if (integrationQuery.page === pagedIntegrations.page) {
      return;
    }
    setIntegrationQuery((current) => ({ ...current, page: pagedIntegrations.page }));
  }, [integrationQuery.page, pagedIntegrations.page]);

  useEffect(() => {
    if (credentialQuery.page === pagedCredentials.page) {
      return;
    }
    setCredentialQuery((current) => ({ ...current, page: pagedCredentials.page }));
  }, [credentialQuery.page, pagedCredentials.page]);

  const connectionColumns: DataGridColumn<AppConnectionRecord>[] = useMemo(
    () => [
      {
        key: "app",
        header: "App",
        width: "30%",
        render: (app) => {
          const visual = getAppVisual(app.key);
          return (
            <div className="data-grid-app-cell">
              <AppIcon iconKey={visual.iconKey} accent={visual.accent} />
              <div className="stack-sm">
                <strong>{app.name}</strong>
                <span className="data-grid-subtle">
                  <code>{app.key}</code>
                </span>
              </div>
            </div>
          );
        },
      },
      {
        key: "readiness",
        header: "Readiness",
        render: (app) => {
          const readiness = getAppReadiness(app);
          return (
            <div className="stack-sm">
              <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
              <span className="data-grid-subtle">{getSupportModelLabel(readiness.supportModel)}</span>
            </div>
          );
        },
      },
      {
        key: "status",
        header: "Connection",
        render: (app) => {
          const trust = getConnectionTrustState(app);
          const status = toConnectionStatusLabel(app.status);
          return (
            <div className="stack-sm">
              <StatusPill tone={trust.tone}>{trust.label}</StatusPill>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </div>
          );
        },
      },
      {
        key: "updated",
        header: "Updated",
        render: (app) => (
          <span className="data-grid-subtle">{formatDateTime(app.connection.updatedAt)}</span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "data-grid-actions",
        render: (app) => (
          <div className="inline-actions">
            <button
              type="button"
              className="button-primary"
              onClick={(event) => {
                event.stopPropagation();
                openSetupDrawer(app.key, "overview");
              }}
              disabled={getAppReadiness(app).tier === "coming_soon"}
            >
              {app.connected ? "Edit" : "Connect"}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onTestConnection(app);
              }}
              disabled={!app.actions.canTestConnection || Boolean(testingByApp[app.key])}
            >
              {testingByApp[app.key] ? "Testing..." : "Test"}
            </button>
          </div>
        ),
      },
    ],
    [testingByApp],
  );

  const integrationColumns: DataGridColumn<IntegrationRecord>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Integration",
        width: "32%",
        render: (row) => (
          <div className="stack-sm">
            <strong>{row.name}</strong>
            <span className="data-grid-subtle">
              <code>{row.id}</code>
            </span>
          </div>
        ),
      },
      {
        key: "adapter",
        header: "Adapter",
        render: (row) => <span className="tag">{row.adapter_key}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <StatusPill tone={row.status === "active" ? "success" : "warning"}>{row.status}</StatusPill>
        ),
      },
      {
        key: "created",
        header: "Created",
        render: (row) => <span className="data-grid-subtle">{formatDateTime(row.created_at)}</span>,
      },
      {
        key: "sensitive",
        header: "Sensitive config",
        render: (row) => <span className="tag">{row.has_sensitive_config ? "Yes" : "No"}</span>,
      },
      {
        key: "actions",
        header: "Action",
        className: "data-grid-actions",
        render: (row) => (
          <div className="inline-actions">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (appByKey.has(row.adapter_key)) {
                  openSetupDrawer(row.adapter_key, "overview");
                }
              }}
              disabled={!appByKey.has(row.adapter_key)}
            >
              Open app
            </button>
          </div>
        ),
      },
    ],
    [appByKey],
  );

  const credentialColumns: DataGridColumn<CredentialRecord>[] = useMemo(
    () => [
      {
        key: "provider",
        header: "Provider",
        width: "24%",
        render: (row) => (
          <div className="stack-sm">
            <strong>{row.provider_key}</strong>
            <span className="data-grid-subtle">
              <code>{row.id}</code>
            </span>
          </div>
        ),
      },
      {
        key: "auth",
        header: "Auth",
        render: (row) => <span className="tag">{row.auth_type}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <StatusPill
            tone={
              row.credential_status === "valid"
                ? "success"
                : row.credential_status === "expired"
                  ? "warning"
                  : "danger"
            }
          >
            {row.credential_status}
          </StatusPill>
        ),
      },
      {
        key: "expires",
        header: "Expires",
        render: (row) => <span className="data-grid-subtle">{formatDateTime(row.expires_at)}</span>,
      },
      {
        key: "updated",
        header: "Updated",
        render: (row) => <span className="data-grid-subtle">{formatDateTime(row.updated_at)}</span>,
      },
      {
        key: "actions",
        header: "Action",
        className: "data-grid-actions",
        render: (row) => (
          <div className="inline-actions">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (appByKey.has(row.provider_key)) {
                  openSetupDrawer(row.provider_key, "test");
                }
              }}
              disabled={!appByKey.has(row.provider_key)}
            >
              Open app
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onDisconnectCredential(row.provider_key);
              }}
              disabled={disconnectingCredentialProvider === row.provider_key}
            >
              {disconnectingCredentialProvider === row.provider_key ? "Removing..." : "Remove"}
            </button>
          </div>
        ),
      },
    ],
    [appByKey, disconnectingCredentialProvider],
  );

  function renderCatalogCard(app: AppConnectionRecord) {
    const readiness = getAppReadiness(app);
    const trust = getConnectionTrustState(app);
    const status = toConnectionStatusLabel(app.status);
    const visual = getAppVisual(app.key);
    const primaryLabel = toPrimaryAppActionLabel(app, readiness);

    return (
      <article key={app.key} className="app-card app-primary-card">
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
          </div>
        </div>

        <p>{trust.summary}</p>
        <div className="tag-row">
          <span className="tag">{getSupportModelLabel(readiness.supportModel)}</span>
          <span className="tag">{describeSetupMethod(app.setupMethod)}</span>
          {app.catalogCategory ? <span className="tag">Category: {app.catalogCategory}</span> : null}
        </div>

        <div className="inline-actions">
          <button
            type="button"
            className="button-primary"
            onClick={() => openSetupDrawer(app.key, "overview")}
            disabled={readiness.tier === "coming_soon"}
          >
            {primaryLabel}
          </button>
          {app.actions.canTestConnection && app.connected ? (
            <button
              type="button"
              onClick={() => void onTestConnection(app)}
              disabled={Boolean(testingByApp[app.key])}
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
        title="Apps and connections"
        subtitle="Browse ready apps first, then manage connection health through dense inventories for integrations and credentials."
        actions={
          <>
            <StatusPill tone="success">{appCounts.readyNow} ready now</StatusPill>
            <StatusPill tone="info">{appCounts.connected} connected</StatusPill>
            <span className="tag">{appCounts.total} total apps</span>
            <Link to="/first-automation">First automation</Link>
            <Link to="/workflows">Starter automations</Link>
          </>
        }
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Ready apps" value={appCounts.readyNow} />
            <InsightChip label="Connected" value={appCounts.connected} />
            <InsightChip label="Catalog mode" value={catalogMode} />
          </>
        }
        right={
          <>
            <button
              type="button"
              onClick={() => setCatalogMode("starter")}
              className={catalogMode === "starter" ? "button-primary" : ""}
            >
              Starter catalog
            </button>
            <button
              type="button"
              onClick={() => setCatalogMode("all")}
              className={catalogMode === "all" ? "button-primary" : ""}
            >
              Full catalog
            </button>
            <Link to="/first-automation">First success</Link>
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
          <p>Connect required apps, then continue the selected starter automation.</p>
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
        Recommended path: connect one ready app, pick a starter template, trigger a test run, then inspect Runs/Audit/Alerts.
      </DemoHint>

      <SurfaceCard
        title="App catalog"
        subtitle="Discovery first. Setup happens in a focused drawer so catalog scanning stays fast."
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
            <button
              type="button"
              onClick={() => setShowCategoryFiltersExpanded((current) => !current)}
            >
              {showCategoryFiltersExpanded ? "Show fewer filters" : "Show all filters"}
            </button>
            <span className="tag">Catalog mode</span>
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
              Full
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
        ) : (
          <div className="stack">
            <div className="section-divider stack-sm">
              <strong>Ready apps</strong>
              <p>Fastest options for first-time success.</p>
              {readyApps.length === 0 ? (
                <EmptyStatePanel
                  title="No ready apps in this filter"
                  description="Reset filters or switch to advanced apps."
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
              <p>Require additional provider setup or platform values.</p>
              {showAdvancedCatalog ? (
                advancedApps.length === 0 ? (
                  <p>No advanced apps matched this filter.</p>
                ) : (
                  <div className="app-catalog-grid">{advancedApps.map((app) => renderCatalogCard(app))}</div>
                )
              ) : null}
            </div>

            <div className="section-divider stack-sm">
              <strong>Coming soon</strong>
              <p>Planned integrations that are not production-ready yet.</p>
              {comingSoonApps.length === 0 ? (
                <p>No coming-soon apps currently.</p>
              ) : (
                <div className="app-catalog-grid">{comingSoonApps.map((app) => renderCatalogCard(app))}</div>
              )}
            </div>

            <div className="section-divider stack-sm">
              <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                <strong>Developer adapters</strong>
                <button type="button" onClick={() => setShowDeveloperCatalog((current) => !current)}>
                  {showDeveloperCatalog ? "Hide" : "Show"}
                </button>
              </div>
              <p>Internal/testing adapters. Hidden by default for end users.</p>
              {showDeveloperCatalog ? (
                developerApps.length === 0 ? (
                  <p>No developer adapters available.</p>
                ) : (
                  <div className="app-catalog-grid">{developerApps.map((app) => renderCatalogCard(app))}</div>
                )
              ) : null}
            </div>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard
        title="Connections inventory"
        subtitle="Dense table for scanning status, readiness, and setup actions."
      >
        <DataGridToolbar
          searchValue={connectionQuery.search}
          searchPlaceholder="Search app, status, adapter key"
          onSearchChange={(next) => updateConnectionQuery({ search: next })}
          filterLabel="Connection state"
          filterValue={connectionQuery.filter}
          filterOptions={(Object.keys(CONNECTION_FILTER_LABELS) as ConnectionInventoryFilter[]).map(
            (key) => ({
              value: key,
              label: CONNECTION_FILTER_LABELS[key],
              count: connectionCounts[key],
            }),
          )}
          onFilterChange={(next) =>
            updateConnectionQuery({ filter: next as ConnectionInventoryFilter })
          }
          sortLabel="Sort"
          sortValue={connectionQuery.sort}
          sortOptions={CONNECTION_SORT_OPTIONS}
          onSortChange={(next) => updateConnectionQuery({ sort: next as ConnectionInventorySort })}
          pageSize={connectionQuery.pageSize}
          onPageSizeChange={(next) => updateConnectionQuery({ pageSize: next })}
          actions={
            <>
              <label>
                Density
                <select
                  value={viewDensity}
                  onChange={(event) => setViewDensity(event.target.value as ViewDensity)}
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <span className="tag">query: {toQueryPreview(connectionQuery)}</span>
            </>
          }
        />

        <DenseDataTable
          columns={connectionColumns}
          rows={pagedConnections.items}
          rowKey={(row) => row.key}
          selectedRowKey={selectedApp?.key || null}
          onRowSelect={(row) => setSelectedAppKey(row.key)}
          loading={loading}
          density={toTableDensityClass(viewDensity)}
          emptyState={
            <div className="data-grid-empty">
              {filteredConnections.length === 0 ? "No connections match this filter." : "No records"}
            </div>
          }
        />

        <DataGridPagination
          page={pagedConnections.page}
          totalPages={pagedConnections.totalPages}
          totalRecords={pagedConnections.total}
          pageSize={pagedConnections.pageSize}
          onPageChange={(next) => updateConnectionQuery({ page: next })}
        />

        {selectedApp && selectedReadiness && selectedTrustState ? (
          <div className="data-grid-detail-card">
            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
              <strong>{selectedApp.name}</strong>
              <div className="inline-actions">
                <StatusPill tone={selectedReadiness.tone}>{selectedReadiness.label}</StatusPill>
                <StatusPill tone={selectedTrustState.tone}>{selectedTrustState.label}</StatusPill>
              </div>
            </div>
            <p>{selectedTrustState.summary}</p>
            <div className="tag-row">
              <span className="tag">{describeSetupMethod(selectedApp.setupMethod)}</span>
              <span className="tag">
                Updated: {formatDateTime(selectedApp.connection.updatedAt)}
              </span>
              {(selectedApp.platformSetupMissingFields || []).length > 0 ? (
                <span className="tag">
                  Missing platform fields: {selectedApp.platformSetupMissingFields?.join(", ")}
                </span>
              ) : null}
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => openSetupDrawer(selectedApp.key, "overview")}
              >
                Open setup drawer
              </button>
              <button
                type="button"
                onClick={() => void onTestConnection(selectedApp)}
                disabled={Boolean(testingByApp[selectedApp.key])}
              >
                {testingByApp[selectedApp.key] ? "Testing..." : "Test connection"}
              </button>
              {selectedApp.actions.canDisconnect ? (
                <button type="button" onClick={() => void onDisconnect(selectedApp)}>
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SurfaceCard>

      <div className="template-grid">
        <SurfaceCard
          title="Integration records"
          subtitle="Table-first inventory of integration resources and adapter mapping."
        >
          <DataGridToolbar
            searchValue={integrationQuery.search}
            searchPlaceholder="Search integration name, adapter, ID"
            onSearchChange={(next) => updateIntegrationQuery({ search: next })}
            filterLabel="Status"
            filterValue={integrationQuery.status}
            filterOptions={integrationStatusOptions}
            onFilterChange={(next) => updateIntegrationQuery({ status: next })}
            sortLabel="Sort"
            sortValue={integrationQuery.sort}
            sortOptions={INTEGRATION_SORT_OPTIONS}
            onSortChange={(next) =>
              updateIntegrationQuery({ sort: next as IntegrationInventorySort })
            }
            pageSize={integrationQuery.pageSize}
            onPageSizeChange={(next) => updateIntegrationQuery({ pageSize: next })}
            actions={<span className="tag">query: {toQueryPreview(integrationQuery)}</span>}
          />

          <DenseDataTable
            columns={integrationColumns}
            rows={pagedIntegrations.items}
            rowKey={(row) => row.id}
            selectedRowKey={selectedIntegrationId}
            onRowSelect={(row) => setSelectedIntegrationId(row.id)}
            loading={loading}
            density={toTableDensityClass(viewDensity)}
            emptyState={<div className="data-grid-empty">No integration records found.</div>}
          />

          <DataGridPagination
            page={pagedIntegrations.page}
            totalPages={pagedIntegrations.totalPages}
            totalRecords={pagedIntegrations.total}
            pageSize={pagedIntegrations.pageSize}
            onPageChange={(next) => updateIntegrationQuery({ page: next })}
          />

          {selectedIntegration ? (
            <div className="data-grid-detail-card">
              <strong>{selectedIntegration.name}</strong>
              <p>
                Adapter <code>{selectedIntegration.adapter_key}</code> with status{" "}
                <strong>{selectedIntegration.status}</strong>.
              </p>
              <div className="tag-row">
                <span className="tag">
                  Sensitive config: {selectedIntegration.has_sensitive_config ? "Yes" : "No"}
                </span>
                <span className="tag">
                  Created: {formatDateTime(selectedIntegration.created_at)}
                </span>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() => {
                    if (appByKey.has(selectedIntegration.adapter_key)) {
                      openSetupDrawer(selectedIntegration.adapter_key, "overview");
                    }
                  }}
                  disabled={!appByKey.has(selectedIntegration.adapter_key)}
                >
                  Open app setup
                </button>
                <Link to="/runs">Inspect related runs</Link>
              </div>
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard
          title="Credential records"
          subtitle="Secure credential inventory with status and provider-level actions."
        >
          <DataGridToolbar
            searchValue={credentialQuery.search}
            searchPlaceholder="Search provider, status, auth type"
            onSearchChange={(next) => updateCredentialQuery({ search: next })}
            filterLabel="Credential state"
            filterValue={credentialQuery.filter}
            filterOptions={(Object.keys(CREDENTIAL_FILTER_LABELS) as CredentialInventoryFilter[]).map(
              (key) => ({
                value: key,
                label: CREDENTIAL_FILTER_LABELS[key],
                count: credentialCounts[key],
              }),
            )}
            onFilterChange={(next) =>
              updateCredentialQuery({ filter: next as CredentialInventoryFilter })
            }
            sortLabel="Sort"
            sortValue={credentialQuery.sort}
            sortOptions={CREDENTIAL_SORT_OPTIONS}
            onSortChange={(next) =>
              updateCredentialQuery({ sort: next as CredentialInventorySort })
            }
            pageSize={credentialQuery.pageSize}
            onPageSizeChange={(next) => updateCredentialQuery({ pageSize: next })}
            actions={<span className="tag">query: {toQueryPreview(credentialQuery)}</span>}
          />

          <DenseDataTable
            columns={credentialColumns}
            rows={pagedCredentials.items}
            rowKey={(row) => row.id}
            selectedRowKey={selectedCredentialId}
            onRowSelect={(row) => setSelectedCredentialId(row.id)}
            loading={loading}
            density={toTableDensityClass(viewDensity)}
            emptyState={<div className="data-grid-empty">No credential records found.</div>}
          />

          <DataGridPagination
            page={pagedCredentials.page}
            totalPages={pagedCredentials.totalPages}
            totalRecords={pagedCredentials.total}
            pageSize={pagedCredentials.pageSize}
            onPageChange={(next) => updateCredentialQuery({ page: next })}
          />

          {selectedCredential ? (
            <div className="data-grid-detail-card">
              <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                <strong>{selectedCredential.provider_key}</strong>
                <StatusPill
                  tone={
                    selectedCredential.credential_status === "valid"
                      ? "success"
                      : selectedCredential.credential_status === "expired"
                        ? "warning"
                        : "danger"
                  }
                >
                  {selectedCredential.credential_status}
                </StatusPill>
              </div>
              <p>
                Auth type <code>{selectedCredential.auth_type}</code>. Key version{" "}
                <strong>{selectedCredential.key_version}</strong>.
              </p>
              <div className="tag-row">
                <span className="tag">
                  Expires: {formatDateTime(selectedCredential.expires_at)}
                </span>
                <span className="tag">
                  Updated: {formatDateTime(selectedCredential.updated_at)}
                </span>
                <span className="tag">
                  Secrets stored: {selectedCredential.has_secret_data ? "Yes" : "No"}
                </span>
              </div>
              {selectedCredential.validation_error ? (
                <Callout tone="warning" title="Validation warning">
                  <p>{selectedCredential.validation_error}</p>
                </Callout>
              ) : null}
              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() => {
                    if (appByKey.has(selectedCredential.provider_key)) {
                      openSetupDrawer(selectedCredential.provider_key, "test");
                    }
                  }}
                  disabled={!appByKey.has(selectedCredential.provider_key)}
                >
                  Open app setup
                </button>
                <button
                  type="button"
                  onClick={() => void onDisconnectCredential(selectedCredential.provider_key)}
                  disabled={disconnectingCredentialProvider === selectedCredential.provider_key}
                >
                  {disconnectingCredentialProvider === selectedCredential.provider_key
                    ? "Removing..."
                    : "Remove credential"}
                </button>
              </div>
            </div>
          ) : null}
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

      {setupDrawerOpen && selectedApp && selectedReadiness && selectedFormState ? (
        <div className="setup-drawer-backdrop" role="presentation" onClick={closeSetupDrawer}>
          <aside
            className="setup-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Setup ${selectedApp.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="setup-drawer-header">
              <div className="stack-sm">
                <strong>Setup {selectedApp.name}</strong>
                <p>{selectedReadiness.guidance}</p>
              </div>
              <div className="inline-actions">
                <StatusPill tone={selectedReadiness.tone}>{selectedReadiness.label}</StatusPill>
                {selectedTrustState ? (
                  <StatusPill tone={selectedTrustState.tone}>{selectedTrustState.label}</StatusPill>
                ) : null}
                <button type="button" onClick={closeSetupDrawer}>
                  Close
                </button>
              </div>
            </header>

            <div className="setup-drawer-steps">
              {setupWizardSteps.map((step) => (
                <button
                  key={step}
                  type="button"
                  className={activeSetupStep === step ? "button-primary" : ""}
                  onClick={() => setActiveSetupStep(step)}
                >
                  {toWizardStepLabel(step)}
                </button>
              ))}
            </div>

            <div className="setup-drawer-body">
              <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <strong>{toWizardStepLabel(activeSetupStep)}</strong>
                <p>{toWizardStepDescription(activeSetupStep)}</p>
              </div>

              {activeSetupStep === "overview" ? (
                <div className="stack-sm">
                  <p>{selectedSetupGuide?.purpose || selectedReadiness.summary}</p>
                  <ChecklistSteps steps={selectedChecklist} />
                </div>
              ) : null}

              {activeSetupStep === "requirements" ? (
                <div className="stack-sm">
                  <ul className="setup-guide-list">
                    {(selectedSetupGuide?.beforeYouStart || selectedReadiness.prerequisites).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {guideRequiredFields.length > 0 ? (
                    <div className="tag-row">
                      {guideRequiredFields.map((field) => (
                        <span key={`${selectedApp.key}-required-${field.key}`} className="tag">
                          {field.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {selectedPlatformMissingFields.length > 0 ? (
                    <Callout tone="warning" title="Missing platform setup">
                      <p>
                        An operator must configure these runtime values first:{" "}
                        {selectedPlatformMissingFields.join(", ")}
                      </p>
                    </Callout>
                  ) : null}
                </div>
              ) : null}

              {activeSetupStep === "input" ? (
                <div className="stack-sm">
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
                        You will be redirected to {selectedApp.name}, then returned automatically.
                      </p>
                    </Callout>
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
                  <p>Run a connection test before activating templates that depend on this app.</p>
                  {selectedSetupGuide?.testChecklist?.length ? (
                    <ul className="setup-guide-list">
                      {selectedSetupGuide.testChecklist.map((item) => (
                        <li key={`${selectedApp.key}-test-${item}`}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => void onSaveConnection(selectedApp)}
                      disabled={Boolean(savingByApp[selectedApp.key]) || !selectedApp.actions.canEdit}
                    >
                      {savingByApp[selectedApp.key] ? "Saving..." : "Save connection"}
                    </button>
                    {selectedApp.actions.canTestConnection ? (
                      <button
                        type="button"
                        onClick={() => void onTestConnection(selectedApp)}
                        disabled={Boolean(testingByApp[selectedApp.key])}
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
                </div>
              ) : null}

              {activeSetupStep === "success" ? (
                <div className="stack-sm">
                  <Callout tone="success" title="Connection ready">
                    <p>
                      {selectedApp.name} is ready. Continue with a starter automation and run a test event.
                    </p>
                  </Callout>
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

              {selectedApp.connection.validationError ? (
                <Callout tone="danger" title="Connection check failed">
                  <p>{selectedApp.connection.validationError}</p>
                </Callout>
              ) : null}

              {selectedSuggestions.length > 0 ? (
                <div className="section-divider stack-sm">
                  <strong>Suggested next templates</strong>
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

            <footer className="setup-drawer-footer">
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
            </footer>
          </aside>
        </div>
      ) : null}

      {loading ? <LoadingInline label="Refreshing integration inventory..." /> : null}
    </div>
  );
}
