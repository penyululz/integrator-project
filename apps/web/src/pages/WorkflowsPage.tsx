import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  createWorkflow,
  getAuthSession,
  getWorkflowTemplate,
  listAdapters,
  listCredentials,
  listIntegrations,
  listRuns,
  listWorkflowTemplates,
  listWorkflows,
  type AdapterMetadata,
  type CredentialRecord,
  type WorkflowRecord,
  type WorkflowTemplate,
  type WorkflowTemplateSummary,
  validateWorkflow,
} from "../api";
import { StepCardEditor } from "../components/StepCardEditor";
import { ValidationErrorPanel } from "../components/ValidationErrorPanel";
import {
  buildDefaultWorkflow,
  buildReferenceHints,
  buildWorkflowFromTemplate,
  filterWorkflowTemplates,
  getTemplateMissingAdapters,
  parseJsonObject,
} from "./workflow-builder-helpers";
import { buildOnboardingSteps, getNextPendingStep } from "./onboarding-helpers";
import {
  collectStepIds,
  createEmptyActionStep,
  createEmptyBranchStep,
  createEmptyDelayStep,
  generateStepId,
  type WorkflowDefinition,
  type WorkflowStep,
} from "../types/workflow";

export function WorkflowsPage() {
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get("templateId");
  const [adapters, setAdapters] = useState<AdapterMetadata[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [integrationsCount, setIntegrationsCount] = useState(0);
  const [runsCount, setRunsCount] = useState(0);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [templateCache, setTemplateCache] = useState<Record<string, WorkflowTemplate>>({});
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    requestedTemplateId,
  );
  const [autoLoadedTemplateId, setAutoLoadedTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("New Workflow");
  const [definition, setDefinition] = useState<WorkflowDefinition>(() =>
    buildDefaultWorkflow([], {
      workspaceId: session?.scope.workspaceId || "",
      organizationId: session?.scope.organizationId || "",
    }),
  );
  const [editorMode, setEditorMode] = useState<"form" | "json">("form");
  const [jsonDraft, setJsonDraft] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [triggerConfigDraft, setTriggerConfigDraft] = useState("{}");
  const [contextDraft, setContextDraft] = useState("{}");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [
        { adapters: adapterMetadata },
        workflowRecords,
        templateRecords,
        credentialRecords,
        integrationRecords,
        runRecords,
      ] = await Promise.all([
        listAdapters(),
        listWorkflows(),
        listWorkflowTemplates(),
        listCredentials(),
        listIntegrations(),
        listRuns(),
      ]);

      setAdapters(adapterMetadata);
      setWorkflows(workflowRecords);
      setTemplates(templateRecords);
      setCredentials(credentialRecords);
      setIntegrationsCount(integrationRecords.length);
      setRunsCount(runRecords.length);

      const defaultAdapterKey = adapterMetadata[0]?.key || "";
      if (!definition.trigger.adapter && defaultAdapterKey) {
        const nextDefault = buildDefaultWorkflow(adapterMetadata, {
          workspaceId: session?.scope.workspaceId || "",
          organizationId: session?.scope.organizationId || "",
        });
        setDefinition(nextDefault);
        setTriggerConfigDraft(JSON.stringify(nextDefault.trigger.config || {}, null, 2));
        setContextDraft(JSON.stringify(nextDefault.context || {}, null, 2));
        setJsonDraft(JSON.stringify(nextDefault, null, 2));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      return;
    }
    void ensureTemplateLoaded(selectedTemplateId);
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!requestedTemplateId) {
      return;
    }
    if (autoLoadedTemplateId === requestedTemplateId) {
      return;
    }
    void onUseTemplate(requestedTemplateId).then(() => {
      setAutoLoadedTemplateId(requestedTemplateId);
    });
  }, [requestedTemplateId, autoLoadedTemplateId]);

  useEffect(() => {
    if (editorMode === "form") {
      setJsonDraft(JSON.stringify(definition, null, 2));
    }
  }, [definition, editorMode]);

  const referenceHints = useMemo(() => buildReferenceHints(definition), [definition]);

  const templateCategories = useMemo(() => {
    return ["all", ...new Set(templates.map((template) => template.category))];
  }, [templates]);

  const filteredTemplates = useMemo(
    () => filterWorkflowTemplates(templates, templateSearch, templateCategory),
    [templates, templateSearch, templateCategory],
  );

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) {
      return null;
    }
    return (
      templateCache[selectedTemplateId] ||
      templates.find((template) => template.id === selectedTemplateId) ||
      null
    );
  }, [selectedTemplateId, templateCache, templates]);

  const enabledAdapterKeys = useMemo(() => adapters.map((adapter) => adapter.key), [adapters]);

  const validCredentialProviders = useMemo(() => {
    return new Set(
      credentials
        .filter((credential) => credential.credential_status === "valid")
        .map((credential) => credential.provider_key),
    );
  }, [credentials]);

  const onboardingSteps = useMemo(
    () =>
      buildOnboardingSteps({
        integrationsCount,
        connectedCredentialProviders: validCredentialProviders.size,
        templatesCount: templates.length,
        workflowsCount: workflows.length,
        runsCount,
      }),
    [
      integrationsCount,
      validCredentialProviders,
      templates.length,
      workflows.length,
      runsCount,
    ],
  );

  const nextStep = useMemo(() => getNextPendingStep(onboardingSteps), [onboardingSteps]);

  function updateDefinition(nextDefinition: WorkflowDefinition) {
    setDefinition(nextDefinition);
    setValidationErrors([]);
    setServerError(null);
    setInfoMessage(null);
  }

  function createStep(type: "action" | "branch" | "delay"): WorkflowStep {
    const nextId = generateStepId(type === "action" ? "step_action" : type, collectStepIds(definition.steps));
    if (type === "branch") {
      return createEmptyBranchStep(nextId);
    }
    if (type === "delay") {
      return createEmptyDelayStep(nextId);
    }

    const adapterWithActions = adapters.find((adapter) => adapter.supportedActions.length > 0);
    const nextStep = createEmptyActionStep(
      nextId,
      adapterWithActions?.key || adapters[0]?.key || "webhook",
    );
    nextStep.action = adapterWithActions?.supportedActions[0] || "";
    return nextStep;
  }

  async function validateCurrentDefinition(candidate?: WorkflowDefinition): Promise<boolean> {
    const subject = candidate || definition;
    const result = await validateWorkflow({
      definition: subject,
    });
    setValidationErrors(result.errors || []);
    return result.valid;
  }

  async function ensureTemplateLoaded(templateId: string): Promise<WorkflowTemplate | null> {
    if (templateCache[templateId]) {
      return templateCache[templateId];
    }

    try {
      const template = await getWorkflowTemplate(templateId);
      setTemplateCache((current) => ({
        ...current,
        [templateId]: template,
      }));
      return template;
    } catch (error) {
      setServerError((error as Error).message || "Failed to load template detail.");
      return null;
    }
  }

  async function onUseTemplate(templateId: string) {
    setServerError(null);
    setInfoMessage(null);
    const template = await ensureTemplateLoaded(templateId);
    if (!template) {
      return;
    }

    const nextDefinition = buildWorkflowFromTemplate(template, {
      workspaceId: session?.scope.workspaceId || "",
      organizationId: session?.scope.organizationId || "",
    });
    updateDefinition(nextDefinition);
    setName(`${template.title} Workflow`);
    setSelectedTemplateId(template.id);
    setTriggerConfigDraft(JSON.stringify(nextDefinition.trigger.config || {}, null, 2));
    setContextDraft(JSON.stringify(nextDefinition.context || {}, null, 2));
    setEditorMode("form");
    setInfoMessage(
      `Loaded template "${template.title}". You can review and edit before creating.`,
    );
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    setInfoMessage(null);

    let candidate = definition;

    if (editorMode === "json") {
      try {
        candidate = JSON.parse(jsonDraft) as WorkflowDefinition;
        setDefinition(candidate);
        setJsonError(null);
      } catch {
        setJsonError("JSON is invalid. Fix JSON before creating the workflow.");
        return;
      }
    }

    const valid = await validateCurrentDefinition(candidate);
    if (!valid) {
      return;
    }

    try {
      await createWorkflow({
        name,
        definition: candidate,
      });
      await load();
      setName("New Workflow");
      const nextDefault = buildDefaultWorkflow(adapters, {
        workspaceId: session?.scope.workspaceId || "",
        organizationId: session?.scope.organizationId || "",
      });
      setDefinition(nextDefault);
      setTriggerConfigDraft(JSON.stringify(nextDefault.trigger.config || {}, null, 2));
      setContextDraft(JSON.stringify(nextDefault.context || {}, null, 2));
      setValidationErrors([]);
      setInfoMessage(
        "Workflow created successfully. Next: trigger it, then confirm the run in Runs.",
      );
    } catch (error) {
      const maybeAxiosError = error as {
        response?: {
          data?: {
            error?: string;
            details?: string[];
          };
        };
        message?: string;
      };

      if (maybeAxiosError.response?.data?.details) {
        setValidationErrors(maybeAxiosError.response.data.details);
      }
      setServerError(
        maybeAxiosError.response?.data?.error ||
          maybeAxiosError.message ||
          "Failed to create workflow.",
      );
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Workflows</h2>
      <p>
        Start from a template for the fastest first success, then refine in Form mode or
        JSON mode.
      </p>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>First Success Progress</h3>
        <div style={{ display: "grid", gap: 6 }}>
          <div>
            Integrations: <strong>{integrationsCount}</strong> | Connected credentials:{" "}
            <strong>{validCredentialProviders.size}</strong> | Workflows:{" "}
            <strong>{workflows.length}</strong> | Runs: <strong>{runsCount}</strong>
          </div>
          <div style={{ fontSize: 14, color: nextStep ? "#1d4ed8" : "#15803d" }}>
            {nextStep
              ? `Next recommended step: ${nextStep.title}`
              : "Great work. First-success flow is complete."}
          </div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/first-automation">First Automation</Link>
          <Link to="/integrations">Integrations</Link>
          <Link to="/runs">Runs</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/onboarding">Onboarding</Link>
          {isOperator ? <Link to="/audit-logs">Audit Logs</Link> : null}
          {isOperator ? <Link to="/alerts">Alert Settings</Link> : null}
        </div>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Template Library</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Search
            <input
              value={templateSearch}
              onChange={(event) => setTemplateSearch(event.target.value)}
              placeholder="Search templates, tags, adapters..."
              style={{ marginLeft: 8, minWidth: 250 }}
            />
          </label>
          <label>
            Category
            <select
              value={templateCategory}
              onChange={(event) => setTemplateCategory(event.target.value)}
              style={{ marginLeft: 8 }}
            >
              {templateCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredTemplates.length === 0 ? (
          <p style={{ marginTop: 12 }}>No templates matched your filters.</p>
        ) : null}

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {filteredTemplates.map((template) => {
            const missingAdapters = getTemplateMissingAdapters(template, enabledAdapterKeys);
            const adaptersNeedingConnection = template.requiredAdapters.filter((adapterKey) => {
              if (missingAdapters.includes(adapterKey)) {
                return false;
              }
              const adapter = adapters.find((item) => item.key === adapterKey);
              if (!adapter || adapter.authType === "none") {
                return false;
              }
              return !validCredentialProviders.has(adapterKey);
            });

            return (
              <article
                key={template.id}
                style={{
                  border: "1px solid #ececec",
                  borderRadius: 8,
                  padding: 10,
                  background: selectedTemplateId === template.id ? "#f7f9fc" : "white",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <strong>{template.title}</strong>
                    <div style={{ fontSize: 12, color: "#555" }}>
                      {template.category} | {template.difficulty} | {template.stepCount} top-level
                      step(s)
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      Inspect
                    </button>
                    <button type="button" onClick={() => void onUseTemplate(template.id)}>
                      Use Template
                    </button>
                  </div>
                </div>

                <p style={{ margin: "8px 0 4px" }}>{template.description}</p>
                <div style={{ fontSize: 12 }}>
                  <div>
                    <strong>Trigger:</strong> {template.triggerSummary}
                  </div>
                  <div>
                    <strong>Actions:</strong> {template.actionSummary}
                  </div>
                  <div>
                    <strong>Required adapters:</strong> {template.requiredAdapters.join(", ")}
                  </div>
                </div>

                {missingAdapters.length > 0 ? (
                  <div style={{ marginTop: 8, color: "#b42318", fontSize: 13 }}>
                    Missing enabled adapters: {missingAdapters.join(", ")}
                  </div>
                ) : null}

                {adaptersNeedingConnection.length > 0 ? (
                  <div style={{ marginTop: 4, color: "#8a5100", fontSize: 13 }}>
                    Adapter credentials needed: {adaptersNeedingConnection.join(", ")}.{" "}
                    <Link
                      to={`/integrations?appKey=${encodeURIComponent(
                        adaptersNeedingConnection[0],
                      )}&templateId=${encodeURIComponent(
                        template.id,
                      )}&returnTo=${encodeURIComponent(
                        `/workflows?templateId=${encodeURIComponent(template.id)}`,
                      )}`}
                    >
                      Connect now
                    </Link>{" "}
                    and return to this template.
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {selectedTemplate ? (
        <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Template Details: {selectedTemplate.title}</h3>
          <p>{selectedTemplate.description}</p>
          <div style={{ fontSize: 13 }}>
            <div>
              <strong>Tags:</strong>{" "}
              {"tags" in selectedTemplate ? selectedTemplate.tags.join(", ") : "none"}
            </div>
            <div>
              <strong>Setup notes:</strong>
            </div>
            <ul style={{ marginTop: 4 }}>
              {"setupNotes" in selectedTemplate
                ? selectedTemplate.setupNotes.map((note) => <li key={note}>{note}</li>)
                : null}
            </ul>
          </div>
        </section>
      ) : null}

      <form onSubmit={onCreate} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Workflow Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>

          <label>
            Definition ID
            <input
              value={definition.id}
              onChange={(event) =>
                updateDefinition({
                  ...definition,
                  id: event.target.value,
                })
              }
              style={{ marginLeft: 8 }}
            />
          </label>

          <label>
            Mode
            <select
              value={editorMode}
              onChange={(event) => {
                const nextMode = event.target.value as "form" | "json";
                if (nextMode === "json") {
                  setJsonDraft(JSON.stringify(definition, null, 2));
                  setEditorMode("json");
                  setJsonError(null);
                  return;
                }

                try {
                  const parsed = JSON.parse(jsonDraft) as WorkflowDefinition;
                  updateDefinition(parsed);
                  setEditorMode("form");
                  setJsonError(null);
                } catch {
                  setJsonError("Cannot switch to form mode until JSON is valid.");
                }
              }}
              style={{ marginLeft: 8 }}
            >
              <option value="form">Form</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </div>

        {editorMode === "form" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Trigger</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label>
                  Adapter
                  <select
                    value={definition.trigger.adapter}
                    onChange={(event) => {
                      const adapterKey = event.target.value;
                      const adapter = adapters.find((item) => item.key === adapterKey);
                      updateDefinition({
                        ...definition,
                        trigger: {
                          ...definition.trigger,
                          adapter: adapterKey,
                          trigger: adapter?.supportedTriggers[0] || definition.trigger.trigger,
                        },
                      });
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    {adapters.map((adapter) => (
                      <option key={adapter.key} value={adapter.key}>
                        {adapter.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Trigger
                  <select
                    value={definition.trigger.trigger}
                    onChange={(event) => {
                      updateDefinition({
                        ...definition,
                        trigger: {
                          ...definition.trigger,
                          trigger: event.target.value,
                        },
                      });
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    {(adapters.find((item) => item.key === definition.trigger.adapter)
                      ?.supportedTriggers || [definition.trigger.trigger]
                    ).map((triggerKey) => (
                      <option key={triggerKey} value={triggerKey}>
                        {triggerKey}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>Trigger Config (JSON object)</div>
                <textarea
                  rows={4}
                  cols={90}
                  value={triggerConfigDraft}
                  onChange={(event) => setTriggerConfigDraft(event.target.value)}
                  onBlur={() => {
                    const parsed = parseJsonObject(triggerConfigDraft);
                    if (!parsed) {
                      setServerError("Trigger config must be valid JSON object.");
                      return;
                    }
                    updateDefinition({
                      ...definition,
                      trigger: {
                        ...definition.trigger,
                        config: parsed,
                      },
                    });
                  }}
                />
              </div>
            </div>

            <div style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Workflow Context (JSON object)</h3>
              <textarea
                rows={4}
                cols={90}
                value={contextDraft}
                onChange={(event) => setContextDraft(event.target.value)}
                onBlur={() => {
                  const parsed = parseJsonObject(contextDraft);
                  if (!parsed) {
                    setServerError("Context must be valid JSON object.");
                    return;
                  }
                  updateDefinition({
                    ...definition,
                    context: parsed,
                  });
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <h3 style={{ marginBottom: 0 }}>Steps</h3>
              {definition.steps.map((step, index) => (
                <StepCardEditor
                  key={`${step.id}-${index}`}
                  step={step}
                  depth={0}
                  adapters={adapters}
                  referenceHints={referenceHints}
                  createStep={createStep}
                  onDelete={() => {
                    updateDefinition({
                      ...definition,
                      steps: definition.steps.filter((_, i) => i !== index),
                    });
                  }}
                  onChange={(updatedStep) => {
                    const nextSteps = [...definition.steps];
                    nextSteps[index] = updatedStep;
                    updateDefinition({
                      ...definition,
                      steps: nextSteps,
                    });
                  }}
                />
              ))}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    updateDefinition({
                      ...definition,
                      steps: [...definition.steps, createStep("action")],
                    });
                  }}
                >
                  Add Action Step
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDefinition({
                      ...definition,
                      steps: [...definition.steps, createStep("branch")],
                    });
                  }}
                >
                  Add Branch Step
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDefinition({
                      ...definition,
                      steps: [...definition.steps, createStep("delay")],
                    });
                  }}
                >
                  Add Delay Step
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 style={{ marginBottom: 8 }}>JSON Editor</h3>
            <textarea
              rows={30}
              cols={110}
              value={jsonDraft}
              onChange={(event) => {
                setJsonDraft(event.target.value);
                setJsonError(null);
                setServerError(null);
              }}
            />
            {jsonError ? <div style={{ color: "#b42318" }}>{jsonError}</div> : null}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={async () => {
              try {
                if (editorMode === "json") {
                  const parsed = JSON.parse(jsonDraft) as WorkflowDefinition;
                  setDefinition(parsed);
                  setJsonError(null);
                  await validateCurrentDefinition(parsed);
                } else {
                  await validateCurrentDefinition();
                }
              } catch {
                setJsonError("JSON is invalid. Fix JSON before validation.");
              }
            }}
          >
            Validate Workflow
          </button>

          <button type="submit">Create Workflow</button>
        </div>
      </form>

      {infoMessage ? <div style={{ color: "#0f5132" }}>{infoMessage}</div> : null}
      {serverError ? (
        <div style={{ color: "#b42318", marginTop: 10 }}>{serverError}</div>
      ) : null}
      <ValidationErrorPanel errors={validationErrors} />

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Existing Workflows</h3>
        {loading ? <p>Loading...</p> : null}
        {!loading && workflows.length === 0 ? (
          <p style={{ marginBottom: 0 }}>
            No workflows yet. Start from a template above or use the{" "}
            <Link to="/onboarding">onboarding guide</Link> for your first workflow run.
          </p>
        ) : null}
        <ul>
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              {workflow.name} ({workflow.status}) - updated {workflow.updated_at}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
